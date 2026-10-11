import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, str } from "@/lib/api";
import { requireFeature } from "@/lib/entitlements";
import { PROPERTY_MARKETS, marketByKey, getPropertySeries, computeMarketStats, valueProperty } from "@/lib/property";
import { orNull } from "@/lib/log";

export const maxDuration = 60;

// GET: the property tracker — every market's real index stats, the member's
// properties valued against their market index (index-implied, never an
// appraisal), and the latest saved outlook per market. Ungated: a member who
// downgrades can still see, and remove, what they saved.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb } = auth;

  const [seriesList, propsRes, outlooksRes] = await Promise.all([
    Promise.all(PROPERTY_MARKETS.map(async (m) => ({ m, series: await getPropertySeries(sb, m.key).catch(orNull(`property series ${m.key}`)) }))),
    sb.from("properties").select("id,label,market_key,purchase_price,purchase_date,notes,created_at").order("created_at", { ascending: true }),
    sb.from("property_outlooks").select("market_key,body,created_at"),
  ]);

  const barsByKey = new Map(seriesList.map(({ m, series }) => [m.key, series?.bars ?? []]));
  const markets = seriesList.map(({ m, series }) => {
    const stats = series ? computeMarketStats(series.bars) : null;
    return { ...m, stats }; // stats null → the UI says the source is unavailable
  });

  const portfolio = (propsRes.data ?? []).map((p) => {
    const bars = barsByKey.get(p.market_key) ?? [];
    return { ...p, valuation: valueProperty(bars, Number(p.purchase_price), String(p.purchase_date)) };
  });

  const outlooks: Record<string, { body: Record<string, string>; created_at: string }> = {};
  for (const o of outlooksRes.data ?? []) outlooks[o.market_key] = { body: o.body as Record<string, string>, created_at: o.created_at };

  return NextResponse.json({ markets, portfolio, outlooks });
}

// POST: add a property to the portfolio. The tracker is a paid feature, so a
// plan without it gets the 402 that opens the paywall.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const feat = await requireFeature(sb, user, "property");
  if (!feat.ok) return feat.response;

  const body = await readJson<{ label?: unknown; market_key?: unknown; purchase_price?: unknown; purchase_date?: unknown; notes?: unknown }>(req);
  if (!body) return fail(400, "Bad request", { code: "bad_request" });

  const label = str(body.label, 80);
  const market_key = str(body.market_key, 40);
  const price = Number(body.purchase_price);
  const date = str(body.purchase_date, 10);
  if (!label) return fail(400, "Give the property a name.", { code: "bad_request", field: "label" });
  if (!marketByKey(market_key)) return fail(400, "Pick a market.", { code: "bad_request", field: "market_key" });
  if (!Number.isFinite(price) || price <= 0 || price > 1e10) return fail(400, "Purchase price must be a positive number.", { code: "bad_request", field: "purchase_price" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) return fail(400, "Purchase date must be in the past.", { code: "bad_request", field: "purchase_date" });

  const { data, error } = await sb.from("properties")
    .insert({ user_id: user.id, label, market_key, purchase_price: price, purchase_date: date, notes: str(body.notes, 500) })
    .select("id").single();
  if (error) return fail(500, "Couldn't save that property — try again.", { code: "db_error" });
  return NextResponse.json({ ok: true, id: data.id });
}
