import { NextResponse } from "next/server";
import { ask } from "@/lib/anthropic";

// Health + configuration diagnostic. Reports which providers are wired (presence
// only — never the keys) and pings Anthropic. Handy for verifying env vars on a
// fresh deploy without exposing secrets.
export const maxDuration = 30;

export async function GET() {
  const providers = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabase_service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    market_data: !!process.env.MARKET_DATA_API_KEY,
    fred: !!process.env.FRED_API_KEY,
    cron_secret: !!process.env.CRON_SECRET,
    site_url: process.env.NEXT_PUBLIC_SITE_URL || null,
  };
  const model = process.env.BACON_MODEL ?? "claude-sonnet-4-6";

  let anthropicOk = false;
  let anthropicError: string | null = null;
  try {
    await ask("You are a health check.", [{ role: "user", content: "reply OK" }], false, 16);
    anthropicOk = true;
  } catch (err) {
    anthropicError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({ ok: anthropicOk, model, providers, anthropicError });
}
