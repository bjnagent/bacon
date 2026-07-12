import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ask } from "@/lib/anthropic";
import { chainMapPrompt } from "@/lib/prompts";
import { parseDebate } from "@/lib/parsers";

export const maxDuration = 300;

// Chain map: second/third-degree winners & losers around an industry, trend or
// asset — 10 non-obvious names, signal-checked, with the 2-3 real setups called.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { asset?: string; assetClass?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const asset = String(body.asset || "").trim().slice(0, 120);
  const assetClass = String(body.assetClass || "").trim().slice(0, 60);
  if (!asset) return NextResponse.json({ error: "Missing asset" }, { status: 400 });

  try {
    const text = await ask(
      chainMapPrompt(),
      [{ role: "user", content: `Industry / trend / asset: ${asset}${assetClass ? ` (${assetClass})` : ""}\n\nMap the second- and third-degree winners and losers, give me the names I wouldn't think of, and call the real setups.` }],
      true,
      1600,
      6
    );
    return NextResponse.json({ chain: parseDebate(text) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Chain map failed" }, { status: 500 });
  }
}
