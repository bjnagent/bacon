// Real insider-filing activity from SEC EDGAR (free, official, no API key).
// Like lib/market.ts and lib/macro.ts this is a real-provider source — Bacon
// only ever feeds the model numbers that came from a provider or a search.
//
// Method: EDGAR's daily form index lists every Form 4 (insider transaction)
// filing. Several filings for the same issuer inside a few trading days is a
// cluster — the classic "insiders are acting together" signal. For the top
// clusters we sample the actual filings to confirm the issuer, pull the
// ticker, and count open-market buys (transaction code P) vs sales (S).
// SEC fair-use asks for an identifying User-Agent and <10 req/s; a sweep does
// ~15 requests, market-wide, behind a 1h in-process cache.

export const INSIDER_SOURCE = "SEC EDGAR";

export interface InsiderCluster {
  company: string;
  ticker: string;   // "—" when the issuer has no listed symbol
  filings: number;  // distinct Form 4 filings in the window
  buys: number;     // open-market purchases across sampled filings
  sells: number;    // sales across sampled filings
}

export interface IdxRow { form: string; company: string; cik: string; path: string }

const SEC_HEADERS = {
  // SEC requires requesters to identify themselves (fair-use policy).
  "User-Agent": `bacon-research-app/1.0 (${process.env.SEC_CONTACT_EMAIL || "contact@bacon.app"})`,
};

// One line per filer per filing: "Form Type  Company Name  CIK  Date  File Name".
// Columns are padded with 2+ spaces; company names only use single spaces.
export function parseFormIdx(text: string): IdxRow[] {
  const rows: IdxRow[] = [];
  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s{2,}/);
    if (parts.length !== 5) continue;
    const [form, company, cik, , path] = parts;
    if (!/^\d+$/.test(cik) || !path.startsWith("edgar/")) continue;
    rows.push({ form, company, cik, path });
  }
  return rows;
}

// Group Form 4 rows by filer. A filing lists both the issuer and each insider,
// so the issuer accumulates one row per filing while individual insiders stay
// at one or two — a minimum filing count keeps the issuers (clusters) only.
// Which filers really are issuers is confirmed later against the filing XML.
export function clusterForm4(rows: IdxRow[], minFilings = 3): { company: string; cik: string; paths: string[] }[] {
  const byFiler = new Map<string, { company: string; cik: string; paths: Set<string> }>();
  for (const r of rows) {
    if (r.form !== "4") continue;
    const cur = byFiler.get(r.cik) ?? { company: r.company, cik: r.cik, paths: new Set<string>() };
    cur.paths.add(r.path);
    byFiler.set(r.cik, cur);
  }
  return [...byFiler.values()]
    .filter((c) => c.paths.size >= minFilings)
    .sort((a, b) => b.paths.size - a.paths.size)
    .map((c) => ({ company: c.company, cik: c.cik, paths: [...c.paths] }));
}

// The full-submission .txt embeds the Form 4 XML. Transaction code P is an
// open-market purchase, S a sale (both tables count — it's a signal, not
// accounting). Regex keeps this dependency-free.
export function parseForm4Txt(txt: string): { issuerCik: string; issuerName: string; ticker: string; buys: number; sells: number } | null {
  const cik = txt.match(/<issuerCik>\s*(\d+)\s*<\/issuerCik>/)?.[1];
  if (!cik) return null;
  const name = txt.match(/<issuerName>\s*([^<]*?)\s*<\/issuerName>/)?.[1] ?? "";
  const ticker = (txt.match(/<issuerTradingSymbol>\s*([^<]*?)\s*<\/issuerTradingSymbol>/)?.[1] ?? "").toUpperCase();
  const buys = (txt.match(/<transactionCode>\s*P\s*<\/transactionCode>/g) ?? []).length;
  const sells = (txt.match(/<transactionCode>\s*S\s*<\/transactionCode>/g) ?? []).length;
  return { issuerCik: cik, issuerName: name, ticker: ticker && ticker !== "NONE" && ticker !== "N/A" ? ticker : "—", buys, sells };
}

function recentWeekdays(count: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < count) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function idxUrl(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const q = Math.floor((m - 1) / 3) + 1;
  const ymd = `${y}${String(m).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${q}/form.${ymd}.idx`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: SEC_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`SEC ${res.status}`);
  return res.text();
}

let cache: { at: number; data: InsiderCluster[] } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h — the daily index changes slowly intraday

export async function getInsiderClusters(max = 6): Promise<InsiderCluster[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    // Last few trading days of Form 4 filings (holiday gaps just 404 and skip).
    const idxTexts = await Promise.all(recentWeekdays(4).map((d) => fetchText(idxUrl(d)).catch(() => "")));
    const rows = idxTexts.flatMap(parseFormIdx);
    const candidates = clusterForm4(rows).slice(0, 10);

    const out: InsiderCluster[] = [];
    await Promise.all(candidates.map(async (c) => {
      const samples = (await Promise.all(
        c.paths.slice(0, 2).map((p) => fetchText(`https://www.sec.gov/Archives/${p}`).then(parseForm4Txt).catch(() => null))
      )).filter((s): s is NonNullable<typeof s> => !!s && Number(s.issuerCik) === Number(c.cik)); // issuer check drops filers that are owners, not companies
      if (!samples.length) return;
      out.push({
        company: samples[0].issuerName || c.company,
        ticker: samples[0].ticker,
        filings: c.paths.length,
        buys: samples.reduce((n, s) => n + s.buys, 0),
        sells: samples.reduce((n, s) => n + s.sells, 0),
      });
    }));

    const data = out.sort((a, b) => b.buys - a.buys || b.filings - a.filings).slice(0, max);
    if (data.length) cache = { at: Date.now(), data };
    return data;
  } catch {
    return []; // degrade exactly like market/macro: the brief just loses one section
  }
}
