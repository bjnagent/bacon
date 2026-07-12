import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROPERTY_MARKETS, marketByKey, getPropertySeries, computeMarketStats, valueProperty } from "@/lib/property";

export const maxDuration = 60;

// GET: the property cockpit — every market's real index stats + the user's
// portfolio valued against its market index (index-implied, not an appraisal),
// plus the latest saved outlook per market.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [seriesList, propsRes, outlooksRes] = await Promise.all([
    Promise.all(PROPERTY_MARKETS.map(async (m) => ({ m, series: await getPropertySeries(sb, m.key).catch(() => null) }))),
    sb.from("properties").select("id,label,market_key,purchase_price,purchase_date,notes,created_at").order("created_at", { ascending: true }),
    sb.from("property_outlooks").select("market_key,body,created_at"),
  ]);

  const barsByKey = new Map(seriesList.map(({ m, series }) => [m.key, series?.bars ?? []]));
  const markets = seriesList.map(({ m, series }) => {
    const stats = series ? computeMarketStats(series.bars) : null;
    return { ...m, stats }; // stats null → the UI shows "awaiting source"
  });

  const portfolio = (propsRes.data ?? []).map((p) => {
    const bars = barsByKey.get(p.market_key) ?? [];
    return { ...p, valuation: valueProperty(bars, Number(p.purchase_price), String(p.purchase_date)) };
  });

  const outlooks: Record<string, { body: Record<string, string>; created_at: string }> = {};
  for (const o of outlooksRes.data ?? []) outlooks[o.market_key] = { body: o.body as Record<string, string>, created_at: o.created_at };

  return NextResponse.json({ markets, portfolio, outlooks });
}

// POST: add a property to the portfolio.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { label?: string; market_key?: string; purchase_price?: number; purchase_date?: string; notes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const label = String(body.label || "").trim().slice(0, 80);
  const market_key = String(body.market_key || "");
  const price = Number(body.purchase_price);
  const date = String(body.purchase_date || "");
  if (!label) return NextResponse.json({ error: "Give the property a label" }, { status: 400 });
  if (!marketByKey(market_key)) return NextResponse.json({ error: "Unknown market" }, { status: 400 });
  if (!Number.isFinite(price) || price <= 0 || price > 1e10) return NextResponse.json({ error: "Purchase price must be a positive number" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: "Purchase date must be a past date (YYYY-MM-DD)" }, { status: 400 });

  const { data, error } = await sb.from("properties")
    .insert({ user_id: user.id, label, market_key, purchase_price: price, purchase_date: date, notes: String(body.notes || "").slice(0, 500) })
    .select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
