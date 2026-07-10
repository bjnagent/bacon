import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ask } from "@/lib/anthropic";
import { killWatchPrompt } from "@/lib/prompts";
import { parseKillWatch } from "@/lib/parsers";
import type { StoredBriefItem } from "@/lib/brief";
import { sendKillAlertEmail, emailEnabled } from "@/lib/email";

export const maxDuration = 300;

// Kill-condition watcher (daily cron, protected by CRON_SECRET). For each user
// who opted in, re-checks their most recent brief's still-open ideas against
// their KILL conditions using live web search, and writes any triggers back onto
// the brief (surfaced in-app on the Record tab) + optionally emails them. This
// operationalizes the falsification discipline: a flagged kill isn't just a note,
// it comes and finds you.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  const { data: users } = await admin.from("settings").select("user_id,brief_email_enabled").eq("watch_enabled", true);
  if (!users?.length) return NextResponse.json({ ok: true, watched: 0, alerts: 0 });

  let watched = 0, alertCount = 0;
  for (const u of users) {
    try {
      const { data: brief } = await admin
        .from("daily_briefs")
        .select("id,brief_date,items")
        .eq("user_id", u.user_id)
        .order("brief_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!brief) continue;
      const items = (brief.items ?? []) as StoredBriefItem[];
      // Only watch ideas that carry a kill condition and aren't already closed out.
      const openIdeas = items.filter((o) => o.checks && /kill:/i.test(o.checks) && o.verdict !== "invalidated" && o.verdict !== "played-out");
      if (!openIdeas.length) continue;
      watched++;

      const listing = openIdeas.map((o, i) => `${i + 1}. ${o.name} (${o.ticker || "—"}) — thesis: ${o.thesis} — ${o.checks}`).join("\n");
      const text = await ask(
        killWatchPrompt(String(brief.brief_date)),
        [{ role: "user", content: `Opportunities & their kill conditions:\n${listing}\n\nCheck whether any kill condition has triggered.` }],
        true, 1000, 5,
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
      await admin.from("daily_briefs").update({ kill_alert }).eq("id", brief.id);

      if (enriched.length) {
        alertCount += enriched.length;
        if (u.brief_email_enabled && emailEnabled()) {
          try {
            const { data: au } = await admin.auth.admin.getUserById(u.user_id);
            const to = au?.user?.email;
            if (to) await sendKillAlertEmail(to, enriched, new Date().toUTCString().slice(0, 16));
          } catch { /* email is best-effort */ }
        }
      }
    } catch { /* per-user best-effort */ }
  }
  return NextResponse.json({ ok: true, watched, alerts: alertCount });
}
