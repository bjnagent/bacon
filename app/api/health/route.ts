import { NextResponse } from "next/server";
import { ask } from "@/lib/anthropic";

export async function GET() {
  try {
    const result = await ask("You are a health check.", [{ role: "user", content: "reply OK" }], false, 16);
    return NextResponse.json({
      ok: true,
      model: process.env.BACON_MODEL ?? "claude-sonnet-4-20250514",
      response: result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
