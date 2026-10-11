import { NextResponse, type NextRequest } from "next/server";
import { ask, MODEL, BULK_MODEL } from "@/lib/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripePrices } from "@/lib/billing";
import { retrievePrice, stripeConfigured } from "@/lib/stripe";

// Liveness + configuration diagnostic.
//
// Public: `{ ok: true, version }` and nothing else — no provider map, no
// upstream call. Anyone can hit this, so it must neither enumerate the stack
// nor spend Anthropic quota.
//
// With `Authorization: Bearer $CRON_SECRET`: which providers are wired
// (presence only, never values) plus live probes — Anthropic, the database
// (including whether the billing schema is applied), and Stripe (each
// configured price exists, is active and bills on the interval its env var
// claims). A signed-in session is deliberately NOT enough: the detailed body is
// an operator tool, and every probe costs something.
export const maxDuration = 30;

const version = () => process.env.NEXT_PUBLIC_APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const authorized = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!authorized) return NextResponse.json({ ok: true, version: version() }, { headers: { "Cache-Control": "no-store" } });

  const prices = stripePrices();
  const providers = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    market_data: !!process.env.MARKET_DATA_API_KEY,
    fred: !!process.env.FRED_API_KEY,
    cron_secret: true,
    resend_email: !!process.env.RESEND_API_KEY,
    house_account: !!process.env.HOUSE_USER_ID,
    stripe: stripeConfigured(),
    stripe_webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    stripe_prices: {
      pro_monthly: !!prices.pro.month, pro_yearly: !!prices.pro.year,
      desk_monthly: !!prices.desk.month, desk_yearly: !!prices.desk.year,
    },
    revenuecat_webhook: !!process.env.REVENUECAT_WEBHOOK_AUTH,
    apns: !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID),
    site_url: process.env.NEXT_PUBLIC_SITE_URL || null,
  };
  // Cheap tier for background bulk work (sweep scouts/news/tracking); null when unset.
  const cheapModel = process.env.GEMINI_API_KEY ? (process.env.GEMINI_MODEL ?? "gemini-2.5-flash") : null;

  const [anthropic, database, stripe] = await Promise.all([probeAnthropic(), probeDatabase(), probeStripe(prices)]);

  return NextResponse.json(
    { ok: anthropic.ok, version: version(), model: MODEL, bulkModel: BULK_MODEL, cheapModel, providers, anthropicError: anthropic.error, checks: { database, stripe } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function probeAnthropic(): Promise<{ ok: boolean; error: string | null }> {
  try {
    await ask("You are a health check.", [{ role: "user", content: "reply OK" }], false, 16, undefined, { route: "health" });
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function probeDatabase(): Promise<Record<string, string>> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { status: "skipped: no service role key" };
  const out: Record<string, string> = {};
  try {
    const db = createAdminClient();
    const probe = async (name: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
      try {
        const { error } = await run();
        out[name] = error ? `error: ${error.message}` : "ok";
      } catch (e) {
        out[name] = `error: ${(e as Error).message}`;
      }
    };
    await Promise.all([
      probe("settings", () => db.from("settings").select("user_id", { head: true }).limit(1)),
      probe("subscriptions", () => db.from("subscriptions").select("user_id", { head: true }).limit(1)),
      probe("billing_events", () => db.from("billing_events").select("id", { head: true }).limit(1)),
      probe("cron_accounts", () => db.rpc("cron_accounts", { p_ids: [] })),
    ]);
  } catch (e) {
    out.status = `error: ${(e as Error).message}`;
  }
  return out;
}

async function probeStripe(prices: ReturnType<typeof stripePrices>): Promise<Record<string, string>> {
  if (!stripeConfigured()) return { status: "skipped: STRIPE_SECRET_KEY unset" };
  const out: Record<string, string> = {};
  const wanted: [string, string | undefined, string][] = [
    ["pro_monthly", prices.pro.month, "month"], ["pro_yearly", prices.pro.year, "year"],
    ["desk_monthly", prices.desk.month, "month"], ["desk_yearly", prices.desk.year, "year"],
  ];
  await Promise.all(wanted.map(async ([name, id, interval]) => {
    if (!id) { out[name] = "unset"; return; }
    try {
      const p = await retrievePrice(id, { timeoutMs: 8000 });
      const got = p.recurring?.interval ?? "one-off";
      out[name] = !p.active ? "error: price is archived" : got !== interval ? `error: bills per ${got}, expected ${interval}` : "ok";
    } catch (e) {
      out[name] = `error: ${(e as Error).message}`;
    }
  }));
  return out;
}
