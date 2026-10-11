import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { askCheap } from "@/lib/ai";
import { swallowed } from "@/lib/log";
import { killWatchPrompt } from "@/lib/prompts";
import { parseKillWatch } from "@/lib/parsers";
import { gradeCalls } from "@/lib/calls";
import { gradeForecasts } from "@/lib/forecastRecord";
import type { StoredBriefItem } from "@/lib/brief";
import { sendKillAlertEmail, emailEnabled } from "@/lib/email";
import { notifyUser } from "@/lib/push";
import { emailFor, entitled, hasFeature, houseUserId, killPushMessage, loadCronAccounts, mapPool, type CronAccount } from "../_lib/accounts";

export const maxDuration = 300;

// Behaviour events older than this are deleted nightly. Comfortably past the
// console's widest range (365 days is its ceiling, 90 its default view), so
// pruning never removes something the operator can still ask for.
const RETENTION_DAYS = 400;
// The billing-webhook idempotency ledger only has to outlive the providers'
// retry windows (Stripe: 3 days; RevenueCat: hours).
const BILLING_EVENTS_RETENTION_DAYS = 90;

// Kill-condition watcher (daily cron, protected by CRON_SECRET). For each user
// who opted in AND whose plan includes `kill_watch`, re-checks their most recent
// brief's still-open ideas against their KILL conditions using live web search,
// and writes any triggers back onto the brief (surfaced in-app on the Record
// tab) + optionally emails / pushes them. This operationalizes the
// falsification discipline: a flagged kill isn't just a note, it comes and
// finds you. The house account is watched too (its brief is the free tier's).
//
// Grading runs first and for EVERY account, whatever the plan: it is
// deterministic arithmetic (no model), and the public record depends on it.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const house = houseUserId();

  // Calibration grading rides the daily watch cron: deterministic math against
  // real prices + SPY — no model grades its own homework.
  const grading = await gradeCalls(admin).catch((e) => { swallowed("watch: grade calls", e); return { graded: 0, finalized: 0 }; });
  // Same discipline, applied to the mechanical price bands: every forecast whose
  // horizon has lapsed is scored against the realised close and against the
  // "no change" benchmark it has to beat. Reported so the run says how much of
  // the ledger it settled.
  const { graded: forecastsGraded } = await gradeForecasts(admin).catch((e) => { swallowed("watch: grade forecasts", e); return { graded: 0 }; });

  // Behaviour-ledger retention. `user_events` gains a row per view and is the
  // highest-volume table in the schema by design, with nothing else pruning it.
  // The console never looks past a 365-day window, so anything older is dead
  // weight. Rides this cron rather than the sweep because the sweep returns
  // early when no user is due, and housekeeping shouldn't depend on that.
  // `count` rather than `.select()`: the point of a prune is that the row set
  // can be large, and returning every deleted id would be the one query that
  // scales with exactly the thing being cleaned up.
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  let pruned = 0;
  try {
    const { count } = await admin.from("user_events").delete({ count: "exact" }).lt("created_at", cutoff);
    pruned = count ?? 0;
  } catch { /* housekeeping is best-effort; never fail the watch run over it */ }
  try {
    const billingCutoff = new Date(Date.now() - BILLING_EVENTS_RETENTION_DAYS * 86_400_000).toISOString();
    await admin.from("billing_events").delete().lt("received_at", billingCutoff);
  } catch { /* table may not exist yet */ }

  // select("*"): push_enabled is read optionally and may not exist on an older schema.
  const { data: rows, error: settingsErr } = await admin.from("settings").select("*").eq("watch_enabled", true);
  if (settingsErr) swallowed("watch: settings", settingsErr);
  const optedIn = (rows ?? []) as WatchSettings[];
  if (!optedIn.length) return NextResponse.json({ ok: true, watched: 0, alerts: 0, pruned, forecastsGraded, ...grading });

  const { accounts, via } = await loadCronAccounts(admin, optedIn.map((u) => u.user_id));
  const users = optedIn.filter((u) => entitled(accounts.get(u.user_id), "kill_watch", house));
  const unentitled = optedIn.length - users.length;
  if (!users.length) return NextResponse.json({ ok: true, watched: 0, alerts: 0, unentitled, pruned, forecastsGraded, ...grading, via });

  // Per-user kill-condition check. Isolated + returns counts so it can run with
  // bounded concurrency instead of serializing every user's web-search ask()
  // under the 300s ceiling (which dropped the tail's checks — the whole point of
  // the watcher is that a triggered kill comes and finds you).
  const watchUser = async (u: WatchSettings): Promise<{ watched: number; alerts: number; pushed: number }> => {
    const none = { watched: 0, alerts: 0, pushed: 0 };
    const acct = accounts.get(u.user_id) as CronAccount;
    try {
      const { data: brief } = await admin
        .from("daily_briefs")
        .select("id,brief_date,items,kill_alert")
        .eq("user_id", u.user_id)
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!brief) return none;
      const items = (brief.items ?? []) as StoredBriefItem[];
      // Only watch ideas that carry a kill condition and aren't already closed out.
      const openIdeas = items.filter((o) => o.checks && /kill:/i.test(o.checks) && o.verdict !== "invalidated" && o.verdict !== "played-out");
      if (!openIdeas.length) return none;

      const listing = openIdeas.map((o, i) => `${i + 1}. ${o.name} (${o.ticker || "—"}) — thesis: ${o.thesis} — ${o.checks}`).join("\n");
      // askCheap, not ask. This is the same shape of job as sweep:track — read
      // current public information about a named position and report whether a
      // stated condition has triggered — and that runs on Gemini for $0.0006.
      // This route was running the identical judgement on Sonnet at $0.208, 350x
      // more, and had quietly become 35% of the entire bill on 7 calls a week.
      // askCheap keeps the quality floor: a short or degenerate reply falls
      // through to Claude, now on the bulk model rather than the frontier one.
      const text = await askCheap(
        killWatchPrompt(String(brief.brief_date)),
        [{ role: "user", content: `Opportunities & their kill conditions:\n${listing}\n\nCheck whether any kill condition has triggered.` }],
        // Governs the Claude fallback only — askGemini takes no search cap. 2,
        // matching the brief: turns drive output, and output is 5x input.
        true, 1000, 2,
        { route: "watch", userId: u.user_id },
      );
      const { items: alerts, note } = parseKillWatch(text);
      const enriched = alerts.map((a) => {
        const m = openIdeas.find((o) => {
          const key = (o.ticker && o.ticker !== "—" ? o.ticker : o.name).toUpperCase();
          const at = a.ticker.toUpperCase();
          return key.includes(at) || at.includes(key);
        });
        return { ticker: a.ticker, name: m?.name || a.ticker, why: a.why };
      });

      // Write (or clear) the alert so stale triggers don't linger.
      const kill_alert = enriched.length ? { at: new Date().toISOString(), note, items: enriched } : null;
      const { error: saveErr } = await admin.from("daily_briefs").update({ kill_alert }).eq("id", brief.id);
      if (saveErr) {
        // Nothing to point a notification at — report and stop here.
        swallowed(`watch: save kill_alert ${u.user_id}`, saveErr);
        return { watched: 1, alerts: 0, pushed: 0 };
      }

      if (enriched.length && u.brief_email_enabled && hasFeature(acct.plan, "email_brief") && emailEnabled()) {
        try {
          const to = await emailFor(admin, acct);
          if (to) await sendKillAlertEmail(to, enriched, new Date().toUTCString().slice(0, 16));
        } catch (e) { swallowed(`watch: kill email ${u.user_id}`, e); }
      }

      // Push only what is NEW since the last alert on this brief — the watcher
      // re-runs daily and a standing trigger shouldn't buzz a phone every morning.
      let pushed = 0;
      const before = new Set(
        (((brief.kill_alert as { items?: { ticker?: string }[] } | null)?.items) ?? []).map((a) => String(a.ticker ?? "").toUpperCase()),
      );
      const fresh = enriched.filter((a) => !before.has(a.ticker.toUpperCase()));
      if (fresh.length && u.push_enabled !== false && hasFeature(acct.plan, "push_alerts")) {
        try {
          const { title, body } = killPushMessage(fresh);
          pushed = (await notifyUser(u.user_id, { title, body, path: "/track-record", kind: "kill" })) > 0 ? 1 : 0;
        } catch (e) { swallowed(`watch: kill push ${u.user_id}`, e); }
      }
      return { watched: 1, alerts: enriched.length, pushed };
    } catch (err) {
      // Reported, not swallowed: this route just changed providers, so a new
      // failure mode here should not look like "no ideas had a kill condition".
      swallowed(`watch: user ${u.user_id}`, err);
      return none;
    }
  };

  let watched = 0, alertCount = 0, pushed = 0;
  const results = await mapPool(users, 3, watchUser);
  for (const r of results) { watched += r.watched; alertCount += r.alerts; pushed += r.pushed; }
  return NextResponse.json({ ok: true, watched, alerts: alertCount, pushed, unentitled, pruned, forecastsGraded, ...grading, via });
}

interface WatchSettings {
  user_id: string;
  brief_email_enabled: boolean | null;
  push_enabled?: boolean | null;
}
