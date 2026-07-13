import { NextResponse, type NextRequest } from "next/server";
import { ask } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";

// Health + configuration diagnostic. The DETAILED body — which providers are
// wired (presence only, never the keys) plus an Anthropic probe — is GATED: it's
// returned only to a CRON_SECRET bearer or a signed-in user. Unauthenticated
// callers get a bare liveness `{ ok: true }`. That stops the open web from
// enumerating the stack (which providers are on) and from burning Anthropic
// quota by hammering this route.
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  let authorized = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!authorized) {
    try {
      const sb = await createClient();
      const { data: { user } } = await sb.auth.getUser();
      authorized = !!user;
    } catch { /* treat as unauthenticated */ }
  }
  // Public liveness ping only — no infra details, no upstream call.
  if (!authorized) return NextResponse.json({ ok: true });

  const providers = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    market_data: !!process.env.MARKET_DATA_API_KEY,
    fred: !!process.env.FRED_API_KEY,
    cron_secret: !!process.env.CRON_SECRET,
    resend_email: !!process.env.RESEND_API_KEY,
    site_url: process.env.NEXT_PUBLIC_SITE_URL || null,
  };
  const model = process.env.BACON_MODEL ?? "claude-sonnet-4-6";
  // Cheap tier for background bulk work (sweep scouts/news/tracking); null when unset.
  const cheapModel = process.env.GEMINI_API_KEY ? (process.env.GEMINI_MODEL ?? "gemini-2.5-flash") : null;

  let anthropicOk = false;
  let anthropicError: string | null = null;
  try {
    await ask("You are a health check.", [{ role: "user", content: "reply OK" }], false, 16);
    anthropicOk = true;
  } catch (err) {
    anthropicError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ok: anthropicOk, model, cheapModel, providers, anthropicError });
}
