import React, { useState, useEffect, useRef } from "react";
import {
  Search, Compass, BookOpen, Bookmark, Calculator, ChevronDown, ChevronRight, Plus, Trash2, X,
  ArrowRight, ArrowUpRight, Loader2, AlertTriangle, Scale, LayoutGrid, RefreshCw, Radar, Newspaper, MessageCircle, LineChart
} from "lucide-react";

/* =========================================================================
   BACON — research radar. It scouts and tracks; you decide.
   The home is a Scout (auto picker, theme-based) + a Tracking dashboard.
   NO live prices, quotes, or signals — faking market data is the failure
   mode it exists to avoid. Scouting and tracking run on the PUBLIC RECORD
   via live web search (news, filings, catalysts), and stay qualitative.
   ========================================================================= */

const LENSES = [
  { key: "FUNDAMENTAL", name: "Fundamental", short: "FND", hue: "#E0A33E", blurb: "Value vs price — cash flows, multiples, moat." },
  { key: "TECHNICAL",   name: "Technical",   short: "TEC", hue: "#38B6C4", blurb: "Trend, momentum, volume, volatility." },
  { key: "FACTOR",      name: "Factor",      short: "FAC", hue: "#9B86E0", blurb: "Value, momentum, quality, size, low-vol." },
  { key: "MACRO",       name: "Macro / Reg", short: "MAC", hue: "#E2685C", blurb: "Rates, policy, regulation, supply chain." },
  { key: "SIGNALS",     name: "Smart-money", short: "FLW", hue: "#5FB97E", blurb: "Insider, 13F, COT, congressional, alt-data." },
  { key: "RISK",        name: "Risk",        short: "RSK", hue: "#6FA1CE", blurb: "What breaks the thesis, and sizing." },
];

const ASSET_CLASSES = ["Equity / Stock", "ETF / Fund", "FX / Currency pair", "Crypto", "Commodity", "Bond / Rates"];
const SUGGESTED_THEMES = ["AI infrastructure", "Defense & aerospace", "Energy transition", "GLP-1 / biotech", "EM carry (FX)", "Uranium & nuclear", "Semiconductors", "Gold & miners"];

const STANCES = {
  "constructive": { label: "Constructive", frac: 1.0,  tone: "#4ED88A" },
  "mixed":        { label: "Mixed",        frac: 0.6,  tone: "#E6B24A" },
  "cautious":     { label: "Cautious",     frac: 0.32, tone: "#F0584B" },
  "limited-data": { label: "Limited data", frac: 0.16, tone: "#73837C" },
};
function normStance(s) {
  if (!s) return "mixed";
  const k = s.toLowerCase();
  if (k.includes("construct") || k.includes("bull") || k.includes("favor") || k.includes("positive")) return "constructive";
  if (k.includes("caution") || k.includes("bear") || k.includes("negativ") || k.includes("unfavor")) return "cautious";
  if (k.includes("limit") || k.includes("insufficient") || k.includes("unclear") || k.includes("n/a")) return "limited-data";
  return "mixed";
}
function overallLean(stances) {
  const c = LENSES.filter((l) => stances[l.key] === "constructive").length;
  const x = LENSES.filter((l) => stances[l.key] === "cautious").length;
  if (c >= 3 && c > x) return { label: "Constructive lean", tone: STANCES.constructive.tone };
  if (x >= 3 && x > c) return { label: "Cautious lean", tone: STANCES.cautious.tone };
  if (c > x) return { label: "Tilts constructive", tone: STANCES.constructive.tone };
  if (x > c) return { label: "Tilts cautious", tone: STANCES.cautious.tone };
  return { label: "Mixed · no clear lean", tone: STANCES.mixed.tone };
}
function mapClass(c) {
  const k = (c || "").toLowerCase();
  if (k.includes("etf") || k.includes("fund")) return "ETF / Fund";
  if (k.includes("fx") || k.includes("curr")) return "FX / Currency pair";
  if (k.includes("crypto")) return "Crypto";
  if (k.includes("commod")) return "Commodity";
  if (k.includes("bond") || k.includes("rate")) return "Bond / Rates";
  return "Equity / Stock";
}
function splitSymCls(s) {
  let parts = s.trim().split(/\s+/);
  const hints = { fx: "FX / Currency pair", currency: "FX / Currency pair", etf: "ETF / Fund", fund: "ETF / Fund", crypto: "Crypto", commodity: "Commodity", commod: "Commodity", bond: "Bond / Rates", rates: "Bond / Rates", equity: "Equity / Stock", stock: "Equity / Stock" };
  let cls = null;
  const last = (parts[parts.length - 1] || "").toLowerCase();
  if (parts.length > 1 && hints[last]) { cls = hints[last]; parts = parts.slice(0, -1); }
  const sym = parts.join(" ");
  if (!cls) cls = sym.includes("/") ? "FX / Currency pair" : "Equity / Stock";
  return { sym: sym.toUpperCase(), cls };
}
function relTime(iso) {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24); return d + "d ago";
}

const PHILOSOPHY = "No serious desk relies on one method. They build a latticework — independent lenses that, when they agree, create conviction. Convergence across lenses is the signal; a single lens rarely is. And every public edge decays as it gets crowded, so process and risk control matter more than any one indicator.";

const FRAMEWORKS = [
  { key: "FUNDAMENTAL", name: "Fundamental", hue: "#E0A33E", summary: "Estimate what a business is worth, then compare to price.",
    playbook: [
      { h: "Understand the engine first", p: "Before any number: how does it make money, which segments carry the margin, what's the moat, who runs it. Read the 10-K business section and MD&A." },
      { h: "Discounted cash flow (DCF)", p: "Present value of future free cash flows discounted at WACC. Powerful but sensitive to growth and discount-rate assumptions — stress-test them." },
      { h: "Multiples as a cross-check", p: "Trailing vs forward P/E, P/B, PEG, EV/EBITDA. Compare to the company's own 5-year history and to peers, never in isolation." },
      { h: "Quality & solvency", p: "ROE, gross/operating margins, debt-to-equity, free-cash-flow conversion. Strong balance sheets defend in downturns." },
      { h: "Triangulate, don't trust one", p: "Pros average several independent value estimates rather than betting on a single output." },
    ], terms: ["DCF", "WACC", "P/E (trailing & forward)", "PEG", "ROE", "Free cash flow", "Moat"],
    caveat: "Fundamentals win long-term, but markets can stay irrational far longer than expected. Valuation tells you what, not when." },
  { key: "FACTOR", name: "Factor / Quant", hue: "#9B86E0", summary: "Tilt systematically toward persistent, rules-based return drivers.",
    playbook: [
      { h: "Value", p: "Cheap on P/E, P/B or P/CF. ~2–4% annualized historical premium; lags hard in growth-led bull runs." },
      { h: "Momentum", p: "Recent winners (≈3–12 months) tend to keep winning near-term. Strong in trends, prone to sharp reversals." },
      { h: "Quality", p: "High profitability, low leverage, stable earnings. Defensive — shines when growth decelerates." },
      { h: "Size & Low-volatility", p: "Small-caps carry a regime-dependent premium; low-vol stocks have beaten on a risk-adjusted basis." },
      { h: "Blend, don't time", p: "Factors are cyclical and lowly correlated to each other. Combine and rebalance; timing one factor is very hard." },
    ], terms: ["Value", "Momentum", "Quality", "Size", "Low-volatility", "Multi-factor", "Smart beta"],
    caveat: "Any single factor can underperform for years. Crowding into popular factor ETFs can compress the premium." },
  { key: "TECHNICAL", name: "Technical", hue: "#38B6C4", summary: "Read price, momentum and participation for timing and crowd behavior.",
    playbook: [
      { h: "Trend (moving averages)", p: "Price above the 50/200-day = uptrend bias; below = downtrend. The crossover marks regime shifts. Lagging by design." },
      { h: "Momentum (RSI, MACD, Stochastic)", p: "RSI >70 overbought / <30 oversold; MACD 12/26/9 crossovers; watch divergences where price and momentum disagree." },
      { h: "Volume (OBV, VWAP)", p: "Is the move backed by participation? Volume confirms whether institutional flow supports a breakout." },
      { h: "Volatility (Bollinger, ATR)", p: "Bollinger 20±2σ frames over-extension; ATR sizes stops to current volatility, not a fixed number." },
      { h: "Confluence over clutter", p: "Use 2–4 complementary indicators (one per family) and seek agreement across timeframes." },
    ], terms: ["50/200-day MA", "RSI (14)", "MACD (12/26/9)", "OBV / VWAP", "Bollinger Bands", "ATR", "Divergence"],
    caveat: "No indicator predicts. They confirm or contradict a thesis. Over-fitting to history produces setups that fail live." },
  { key: "MACRO", name: "FX / Macro / Regulatory", hue: "#E2685C", summary: "Currencies and rate-sensitive assets trade on relative macro and policy.",
    playbook: [
      { h: "Carry trade", p: "Borrow a low-yield currency, hold a higher-yield one, earn the differential. Works in calm, risk-on regimes." },
      { h: "Rate differentials & policy divergence", p: "The gap between two central banks' paths sets the bias. But markets price expectations ahead — forwards show what's in." },
      { h: "Valuation overlay (PPP)", p: "High carry on an overvalued currency is a warning of downside skew, not free yield." },
      { h: "Regulatory & policy catalysts", p: "Legislation, tariffs, antitrust, approvals and subsidies move whole sectors. Track agendas and rule-making calendars." },
      { h: "Supply chain & commodities", p: "Upstream input costs and downstream demand, shipping/inventory flows, and weather drive real cash flows." },
    ], terms: ["Carry trade", "Rate differential", "Covered interest parity", "PPP / fair value", "Policy divergence", "Forward points"],
    caveat: "Carry doesn't fail slowly — a risk-off shock can unwind months of gains in hours. Cap single positions tightly." },
  { key: "SIGNALS", name: "Smart-money & Alt-data", hue: "#5FB97E", summary: "Independent evidence of what's happening before it hits the filings.",
    playbook: [
      { h: "Insider buys (SEC Form 4)", p: "Free on EDGAR within ~2 business days. Executives buying with personal money is among the cleanest bullish tells." },
      { h: "13F & whale convergence", p: "Quarterly institutional holdings (free on EDGAR). Several respected funds buying the same name matters more than one." },
      { h: "13D/G, COT & congressional trades", p: "Activist stakes, CFTC weekly futures positioning, and committee-aligned lawmaker buys as policy-momentum signals." },
      { h: "Paid alt-data (institutional)", p: "Satellite/foot-traffic, credit-card panels, job-posting velocity — bought for lead time. Costly and increasingly crowded." },
      { h: "Government contracts & lobbying", p: "Public award and lobbying databases reveal demand and regulatory positioning before guidance catches up." },
    ], terms: ["SEC EDGAR", "Form 4", "13F", "13D/13G", "COT report", "Congressional trades", "Channel checks"],
    caveat: "Data informs, it never decides. Any edge that becomes public gets crowded — value migrates to how you combine signals." },
  { key: "RISK", name: "Risk & Position Sizing", hue: "#6FA1CE", summary: "Survival first. Sizing and correlation control outcomes more than entries.",
    playbook: [
      { h: "Fixed-fractional risk", p: "Risk a small fixed % per position (often 0.5–2%), sized from entry-to-stop distance. What most desks use day to day." },
      { h: "Kelly as a ceiling", p: "f* = (bp − q)/b is growth-optimal but over-bets brutally. Use ½- or ¼-Kelly; treat full Kelly as a hard upper bound." },
      { h: "Correlation is the hidden risk", p: "Sizing correlated positions each at Kelly creates concealed concentration. Apply a portfolio-wide risk budget." },
      { h: "Drawdown discipline", p: "Define max drawdown and per-trade loss limits in advance. A string of losses at aggressive size is ruinous." },
      { h: "Costs, taxes, slippage", p: "Spreads, commissions, financing and taxes quietly erode edge. A strategy must clear these before it's worth running." },
    ], terms: ["Fixed-fractional", "Kelly criterion", "Fractional Kelly", "Risk budget", "Max drawdown", "Correlation"],
    caveat: "The edge that matters most is not blowing up. Most edges are small and decay; risk control is what compounds." },
];

const HELP_TEXT = `COMMAND                ACTION
  SCOUT [theme]        auto-pick fresh ideas     SCOUT uranium miners
  NEWS [topic]         business headlines        NEWS semiconductors
  ASK [question]       discuss what you're viewing  ASK is NVDA priced in?
  TRACK <ticker>       add to your radar         TRACK NVDA
  UNTRACK <ticker>     remove from radar
  <ticker>             deep-dive six lenses      NVDA   USD/JPY   BTC
  ANL <ticker>         deep-dive six lenses
  DEBATE               bull vs bear (loaded asset)
  RADAR                tracking dashboard
  FRMK                 lens reference
  SIZE                 position calc
  CLS                  clear console
  HELP  ?              this reference

KEYS
  /  focus cmd     1-5  modules     ?  help     ESC  close`;

const BOOT_LINES = [
  "> init lens array ............ 6 OK",
  "> link live web search ....... OK",
  "> arm scout daemon ........... OK",
  "> restore radar watchlist .... OK",
  "> calibrate convergence gauge  OK",
];

async function callClaude(system, user, useSearch = true, maxTokens = 1100) {
  const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("Empty response");
  return text;
}
async function chatClaude(system, messages, useSearch = true, maxTokens = 1100) {
  const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, system, messages };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("Empty response");
  return text;
}
function chatSystemPrompt(ctx) {
  let focus = "Open discussion about markets, investing methodology, or whatever the user is researching.";
  if (ctx) {
    if (ctx.kind === "asset") focus = `The user is analyzing ${ctx.asset}${ctx.cls ? ` (${ctx.cls})` : ""} through BACON's six lenses. Center the discussion on this asset unless they steer elsewhere.`;
    else if (ctx.kind === "tracked") focus = `The user is tracking ${ctx.asset} on their radar.${ctx.thesis ? ` Their own thesis note: "${ctx.thesis}".` : ""}${ctx.update ? ` Latest development they've seen: "${ctx.update}".` : ""} Help them pressure-test this name.`;
    else if (ctx.kind === "radar") focus = `The user is looking at their watchlist: ${(ctx.assets || []).join(", ")}. Help them think across these names — concentration, shared catalysts, what to prioritize.`;
    else if (ctx.kind === "news") focus = `The user wants to discuss a news item: "${ctx.headline}"${ctx.ticker ? ` (most-implicated: ${ctx.ticker})` : ""}. Help them assess what it actually means and what to verify.`;
    else if (ctx.kind === "news-feed") focus = `The user is browsing current market headlines. Help them connect the news to opportunities and to what they should verify.`;
    else if (ctx.kind === "frameworks") focus = `The user is studying the six analytical lenses (fundamental, technical, factor, macro, smart-money, risk). Help them understand and apply the methodology.`;
    else if (ctx.kind === "sizing") focus = `The user is thinking about position sizing and risk. Reason about sizing, fractional Kelly, correlation and risk budgets — always as math on their own inputs, never a specific bet recommendation.`;
  }
  return `You are BACON, a sharp, honest research partner for a serious individual investor — like a thoughtful colleague on a multi-strategy desk. You are having a conversation. ${focus}

Principles you never break:
- You are NOT a financial advisor. Never say "buy" or "sell", never state price targets as fact, never guarantee outcomes. Help the user THINK: surface what each lens looks at, steelman both sides, name what would confirm or break a thesis, and flag what to verify independently.
- BACON has NO live price feed and you must NEVER fabricate prices, quotes, levels, or specific figures. When current facts matter (news, filings, catalysts, numbers), use the web_search tool to ground yourself and point to where to verify. If you can't verify something, say so plainly.
- Be conversational and genuinely concise — a few tight paragraphs at most, not an essay. Plain language. Asking a clarifying question is fine.
- Stay balanced and care about the user's decision quality and risk, not hyping any trade. If they're getting one-sided, gently surface the other side.`;
}
function deriveContext(view, target, items) {
  if (view === "analyze" && target && target.asset) return { kind: "asset", asset: target.asset, cls: target.cls, title: String(target.asset).toUpperCase(), sub: `six-lens analysis${target.cls ? " · " + target.cls : ""}` };
  if (view === "news") return { kind: "news-feed", title: "Market headlines", sub: "news discussion" };
  if (view === "frameworks") return { kind: "frameworks", title: "The six lenses", sub: "methodology" };
  if (view === "sizer") return { kind: "sizing", title: "Position sizing", sub: "risk & sizing" };
  if (view === "radar" && items && items.length) return { kind: "radar", title: "Your radar", sub: `${items.length} tracked`, assets: items.map((i) => i.asset) };
  return { kind: "general", title: "Markets & research", sub: "open discussion" };
}
function chatStarters(ctx) {
  switch (ctx && ctx.kind) {
    case "asset": return ["What's the strongest bull and bear case?", "What would break this thesis?", "What should I verify first?", "How do the six lenses line up here?"];
    case "tracked": return ["What's changed recently that matters?", "What's the next catalyst to watch?", "What would make me wrong?", "Give me the bull vs bear in brief."];
    case "radar": return ["Where might I be over-concentrated?", "Which name has the most event risk soon?", "What themes connect these?", "Which deserves a deeper look first?"];
    case "news": return ["What does this actually mean for the stock?", "Is this likely already priced in?", "What should I verify before acting?", "Who else does this affect?"];
    case "news-feed": return ["What's the most important headline right now?", "Anything today worth a deep dive?", "What's been the market reaction?"];
    case "frameworks": return ["How do I combine these lenses in practice?", "Which lens matters most for FX?", "When lenses disagree, what then?"];
    case "sizing": return ["How should I size a moderate-conviction idea?", "Why use fractional Kelly?", "How does correlation change my sizing?"];
    default: return ["What should I be watching in markets now?", "Help me build a research process.", "Explain convergence across the lenses."];
  }
}
function analysisPrompt() {
  return `You are BACON, a disciplined multi-strategy research desk. You synthesize PUBLIC information into a balanced, multi-lens briefing for a serious individual investor. You are NOT a financial advisor. Never guarantee outcomes, never present price targets as fact, never say "buy" or "sell". Surface what each professional lens looks at, what current evidence suggests, and what the reader must independently verify.

Use the web_search tool to ground the briefing in CURRENT facts. Prefer the most recent information.

Adapt each lens to the asset class. For FX: "Fundamental" = rate differentials / PPP fair value, "Factor" = carry/momentum/value FX factors, "Signals" = COT positioning. For commodities: supply/demand, inventories, weather. For crypto: on-chain/adoption/regulation. For funds/ETFs: holdings, factor exposure, flows.

For EACH lens, begin the body with a stance tag in square brackets, chosen from EXACTLY one of: [Constructive] [Mixed] [Cautious] [Limited-data]. Then write at most 2 sentences. Then a line "Verify: <where to confirm>".

Be concise. Output ONLY in this exact delimited format:
===SUMMARY===
<2 sentence neutral synthesis>
===FUNDAMENTAL===
[Stance] <read>
Verify: <pointer>
===TECHNICAL===
[Stance] <read>
Verify: <pointer>
===FACTOR===
[Stance] <read>
Verify: <pointer>
===MACRO===
[Stance] <read>
Verify: <pointer>
===SIGNALS===
[Stance] <read>
Verify: <pointer>
===RISK===
[Stance] <what could break the thesis + a position-sizing consideration>
Verify: <pointer>
===BOTTOMLINE===
<2 sentences; remind the reader this is a synthesis of public info, not advice, and lenses can disagree>`;
}
function debatePrompt() {
  return `You are BACON running a structured bull-vs-bear debate on one asset, for a serious individual investor. Steelman BOTH sides using current public information (use web_search). This is NOT a recommendation — expose the real disagreement, don't pick a winner.

Be concise. Output ONLY in this exact format:
===BULL===
- <strong bull argument>
- <another>
- <another>
===BEAR===
- <strong bear argument>
- <another>
- <another>
===SYNTHESIS===
<2-3 sentences: where the disagreement hinges and the observable things that would tip it either way. Note this steelmans both sides and is not advice.>`;
}
function scoutPrompt(themes) {
  const t = themes && themes.length ? themes.join("; ") : "(no themes set — scan broadly for notable cross-asset opportunities right now)";
  return `You are BACON, a research SCOUT for a serious individual investor. Using web_search, surface CURRENTLY-RELEVANT candidate assets to research that fit the investor's themes below. Emphasize TIMELINESS: strongly prefer names with a recent catalyst, development, filing, earnings move, regulatory action, or news in roughly the past few weeks. These are STARTING POINTS for the investor's own lens analysis — NOT recommendations, NOT guarantees of quality or return. Do NOT state live prices or price targets.

Investor themes / interests: ${t}

Surface 5 to 7 specific, real, current candidates across whatever asset classes fit. Output ONLY in this exact format:
===INTRO===
<one sentence: what this scan looked for>
@@PICK@@
name: <company / asset name>
ticker: <ticker or symbol; "—" if none>
class: <Equity / ETF / FX / Crypto / Commodity / Bond>
why: <one line: how it fits the theme>
now: <one line: the recent catalyst / why it is timely right now>
check: <one line: the first thing to verify>
@@PICK@@
name: ...
ticker: ...
class: ...
why: ...
now: ...
check: ...
===CAVEAT===
<one line: surfaced from public sources as research starting points, not recommendations; run each through the lenses and verify>`;
}
function trackingUpdatePrompt() {
  return `You are BACON monitoring an asset the investor is TRACKING on their radar. Using web_search, report ONLY what is NOTABLE and RECENT (roughly the past few weeks): news, filings, earnings, catalysts, insider/institutional activity, regulatory or macro moves relevant to this asset. Do NOT report live prices or price targets — this is a qualitative monitoring update, not advice.

Output ONLY in this exact format:
===UPDATE===
<1-2 sentences on the most notable recent developments. If nothing notable, say so plainly.>
===WATCH===
<one line: the specific next catalyst or thing to watch>
===LEAN===
<one of exactly: Constructive | Mixed | Cautious | Limited-data> — <3 to 6 word reason grounded in the update>`;
}
function parseBriefing(text) {
  const out = { lenses: {} };
  const parts = text.split(/===\s*([A-Z]+)\s*===/g);
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].trim().toUpperCase();
    let body = (parts[i + 1] || "").trim();
    if (key === "SUMMARY") { out.SUMMARY = body; continue; }
    if (key === "BOTTOMLINE") { out.BOTTOMLINE = body; continue; }
    let stance = null;
    const sm = body.match(/^\s*\[([^\]]+)\]/);
    if (sm) { stance = sm[1]; body = body.slice(sm[0].length).trim(); }
    let verify = null;
    const vm = body.split(/verify\s*:/i);
    if (vm.length > 1) { body = vm[0].trim(); verify = vm.slice(1).join("Verify:").trim(); }
    out.lenses[key] = { stance: normStance(stance), body, verify };
  }
  return out;
}
function parseDebate(text) {
  const out = {};
  const parts = text.split(/===\s*([A-Z]+)\s*===/g);
  for (let i = 1; i < parts.length; i += 2) out[parts[i].trim().toUpperCase()] = (parts[i + 1] || "").trim();
  return out;
}
function parseScout(text) {
  let intro = null, caveat = null;
  const im = text.match(/===\s*INTRO\s*===([\s\S]*?)(?:@@PICK@@|===\s*CAVEAT|$)/i);
  if (im) intro = im[1].trim();
  const cm = text.match(/===\s*CAVEAT\s*===([\s\S]*)$/i);
  if (cm) caveat = cm[1].trim();
  const blocks = text.split(/@@PICK@@/i).slice(1);
  const picks = blocks.map((raw) => {
    const b = raw.split(/===\s*CAVEAT/i)[0];
    const get = (k) => { const m = b.match(new RegExp(k + "\\s*:\\s*(.+)", "i")); return m ? m[1].trim() : ""; };
    return { name: get("name"), ticker: get("ticker"), cls: get("class"), why: get("why"), now: get("now"), check: get("check") };
  }).filter((p) => p.name || (p.ticker && p.ticker !== "—"));
  return { intro, picks, caveat };
}
function parseTrackingUpdate(text) {
  const out = { update: "", watch: "", lean: null, leanReason: "" };
  const parts = text.split(/===\s*([A-Z]+)\s*===/g);
  for (let i = 1; i < parts.length; i += 2) {
    const k = parts[i].trim().toUpperCase();
    const v = (parts[i + 1] || "").trim();
    if (k === "UPDATE") out.update = v;
    else if (k === "WATCH") out.watch = v;
    else if (k === "LEAN") { const head = v.split(/[—-]/)[0]; out.lean = normStance(head); out.leanReason = v.replace(/^[^—-]*[—-]\s*/, "").trim(); }
  }
  return out;
}
function newsPrompt(source, focus) {
  const src = source && source !== "All" ? `Prioritize headlines from ${source}.` : "Draw from major financial outlets (CNBC, Bloomberg, Yahoo Finance, Reuters, WSJ, Financial Times, MarketWatch, Barron's).";
  const foc = focus ? `Focus on this topic/sector where possible: ${focus}.` : "Cover the most market-moving items across the market.";
  return `You are BACON's market news desk for a serious individual investor. Using web_search, surface the most important CURRENT business & markets headlines. ${src} ${foc}

CRITICAL: Paraphrase every headline in your OWN neutral words — do NOT reproduce any outlet's exact headline text or any article sentences. Keep any direct quotation under a few words and rare. Always attribute the outlet. This is information, NOT advice; the reader verifies at the source.

Prioritize market-moving items: earnings/guidance, M&A, regulation/policy, macro & central banks, analyst upgrades/downgrades, major product/supply news, notable insider or institutional moves. For each item, identify the single most directly implicated ticker/asset if there is a clear one (else "—").

Surface 8 to 12 items, most recent and most material first. Output ONLY in this exact format:
===INTRO===
<one line: what was scanned and roughly how fresh>
@@ITEM@@
head: <paraphrased headline in your own words>
source: <outlet>
why: <one line: why it matters to an investor>
ticker: <single most-implicated symbol, or —>
class: <Equity / ETF / FX / Crypto / Commodity / Bond, or —>
signal: <short tag: Earnings / Guidance / M&A / Macro / Regulatory / Upgrade / Downgrade / Product / Flows / Insider>
when: <relative recency if known, e.g. "2h", "today", or —>
@@ITEM@@
...
===NOTE===
<one line: headlines are paraphrased from public reporting and attributed to outlets; verify at the source; not financial advice>`;
}
function parseNews(text) {
  let intro = null, note = null;
  const im = text.match(/===\s*INTRO\s*===([\s\S]*?)(?:@@ITEM@@|===\s*NOTE|$)/i);
  if (im) intro = im[1].trim();
  const nm = text.match(/===\s*NOTE\s*===([\s\S]*)$/i);
  if (nm) note = nm[1].trim();
  const blocks = text.split(/@@ITEM@@/i).slice(1);
  const items = blocks.map((raw) => {
    const b = raw.split(/===\s*NOTE/i)[0];
    const get = (k) => { const m = b.match(new RegExp(k + "\\s*:\\s*(.+)", "i")); return m ? m[1].trim() : ""; };
    return { head: get("head"), source: get("source"), why: get("why"), ticker: get("ticker"), cls: get("class"), signal: get("signal"), when: get("when") };
  }).filter((n) => n.head);
  return { intro, items, note };
}
function toPoints(text) { return (text || "").split(/\n+/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean); }

/* ============================== chrome ============================== */
function Spectrum({ height = 4, className = "" }) {
  return <div className={`pr-spectrum ${className}`} style={{ height }}>{LENSES.map((l) => <span key={l.key} style={{ background: l.hue }} />)}</div>;
}
function BaconMark({ size = 40 }) {
  const wave = (y) => `M6 ${y} C 16 ${y - 5}, 24 ${y + 5}, 32 ${y} C 40 ${y - 5}, 48 ${y + 5}, 58 ${y}`;
  const rows = LENSES.map((l, i) => ({ hue: l.hue, y: 18 + i * 5.6 }));
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className="pr-prism" aria-hidden="true">
      <g transform="rotate(-14 32 32)" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {rows.map((r, i) => <path key={"e" + i} d={wave(r.y)} stroke="#1A1712" strokeOpacity="0.26" strokeWidth="5.8" />)}
        {rows.map((r, i) => <path key={"s" + i} d={wave(r.y)} stroke={r.hue} strokeWidth="4.2" />)}
      </g>
    </svg>
  );
}
function TVLink({ sym, label, square }) {
  const s = String(sym || "").trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, "");
  if (!s) return null;
  const url = "https://www.tradingview.com/symbols/" + encodeURIComponent(s) + "/";
  if (square) return <a className="pr-readout-tv" href={url} target="_blank" rel="noopener noreferrer" title="Open chart on TradingView"><LineChart size={16} /></a>;
  return <a className="pr-tv" href={url} target="_blank" rel="noopener noreferrer" title="Open chart on TradingView"><LineChart size={13} />{label !== false && <span>Chart</span>}</a>;
}
function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const p = (n) => String(n).padStart(2, "0");
  let tz = "LOCAL";
  try { tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL").split("/").pop().replace("_", " "); } catch (e) {}
  return <span className="pr-clock">{p(t.getHours())}:{p(t.getMinutes())}:{p(t.getSeconds())}<em>{tz}</em></span>;
}
function Uptime() {
  const [s, setS] = useState(0);
  useEffect(() => { const id = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  const p = (n) => String(n).padStart(2, "0");
  return <span className="pr-status-tag">SES {p(Math.floor(s / 60))}:{p(s % 60)}</span>;
}
function StatusBar({ module }) {
  return (
    <div className="pr-status">
      <div className="pr-status-mod"><span className="pr-status-live" />{module}</div>
      <div className="pr-status-right">
        <span className="pr-status-tag">CONN ●</span>
        <span className="pr-status-tag">DATA · LIVE WEB</span>
        <Uptime />
        <span className="pr-status-tag is-warn">NOT ADVICE</span>
        <Clock />
      </div>
    </div>
  );
}
function Console({ value, setValue, onRun, inputRef, log, onHistory }) {
  const endRef = useRef(null);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [log]);
  const handleKey = (e) => {
    if (e.key === "Enter") { e.preventDefault(); onRun(value); setValue(""); }
    else if (e.key === "ArrowUp") { e.preventDefault(); onHistory(-1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onHistory(1); }
    else if (e.key === "Escape") { if (inputRef.current) inputRef.current.blur(); }
  };
  return (
    <div className="pr-console">
      <div className="pr-cmd" onClick={() => inputRef.current && inputRef.current.focus()}>
        <span className="pr-cmd-prompt">BACON</span><span className="pr-cmd-arrow">:~$</span>
        <span className="pr-cmd-text">{value}</span><span className="pr-cmd-cursor">█</span>
        {!value && <span className="pr-cmd-hint">SCOUT · TRACK &lt;sym&gt; · type a ticker · HELP</span>}
        <input ref={inputRef} className="pr-cmd-input" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={handleKey} spellCheck={false} autoComplete="off" aria-label="Command line" />
      </div>
      {log.length > 0 && (
        <div className="pr-log">
          {log.map((l) => <div key={l.id} className={`pr-log-line is-${l.kind}`}>{l.text}</div>)}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
function HelpOverlay({ onClose }) {
  return (
    <div className="pr-help-wrap" onClick={onClose}>
      <div className="pr-help" onClick={(e) => e.stopPropagation()}>
        <div className="pr-help-head"><span>BACON // COMMAND REFERENCE</span><button onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <pre className="pr-help-body">{HELP_TEXT}</pre>
        <div className="pr-help-foot">ESC to close</div>
      </div>
    </div>
  );
}
function Boot({ onDone }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= BOOT_LINES.length) { const t = setTimeout(onDone, 650); return () => clearTimeout(t); }
    const t = setTimeout(() => setN(n + 1), n === 0 ? 220 : 150);
    return () => clearTimeout(t);
  }, [n]);
  useEffect(() => {
    const skip = () => onDone();
    window.addEventListener("keydown", skip); window.addEventListener("click", skip);
    return () => { window.removeEventListener("keydown", skip); window.removeEventListener("click", skip); };
  }, []);
  return (
    <div className="pr-boot">
      <div className="pr-boot-inner">
        <div className="pr-boot-prism"><BaconMark size={88} /></div>
        <div className="pr-boot-title">BACON RESEARCH RADAR</div>
        <div className="pr-boot-ver">v3.0 · scout · track · analyze</div>
        <div className="pr-boot-log">
          {BOOT_LINES.slice(0, n).map((l, i) => <div key={i} className="pr-boot-line">{l}</div>)}
          {n < BOOT_LINES.length && <span className="pr-boot-cursor">█</span>}
        </div>
        {n >= BOOT_LINES.length && <div className="pr-boot-ready">READY ▸ press any key</div>}
      </div>
    </div>
  );
}
function ConvictionRadar({ stances }) {
  const cx = 170, cy = 138, R = 86;
  const ang = (i) => (-90 + i * 60) * Math.PI / 180;
  const pt = (i, frac) => [cx + R * frac * Math.cos(ang(i)), cy + R * frac * Math.sin(ang(i))];
  const rings = [0.34, 0.67, 1];
  const dataPts = LENSES.map((l, i) => pt(i, STANCES[stances[l.key] || "mixed"].frac));
  const dataPath = dataPts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ") + " Z";
  return (
    <svg viewBox="0 0 340 285" className="pr-radar" role="img" aria-label="Lens stance map">
      {rings.map((r, ri) => <polygon key={ri} points={LENSES.map((_, i) => pt(i, r).join(",")).join(" ")} className="pr-radar-ring" />)}
      {LENSES.map((l, i) => { const p = pt(i, 1); return <line key={l.key} x1={cx} y1={cy} x2={p[0]} y2={p[1]} className="pr-radar-axis" />; })}
      <path d={dataPath} className="pr-radar-poly" />
      {dataPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4.5" style={{ fill: LENSES[i].hue }} />)}
      {LENSES.map((l, i) => { const p = pt(i, 1.22), a = ang(i); const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : (Math.cos(a) > 0 ? "start" : "end"); return <text key={l.key} x={p[0]} y={p[1]} textAnchor={anchor} dominantBaseline="middle" style={{ fill: l.hue }} className="pr-radar-label">{l.name}</text>; })}
    </svg>
  );
}

/* ============================== RADAR (home: scout + tracking) ============================== */
function RadarView({ items, setItems, addTracked, themes, setThemes, onAnalyze, onLog, scoutSignal, ready, scoutEvery, setScoutEvery, scoutAt, onScouted, onDiscuss, onAutoSweep }) {
  const [scout, setScout] = useState(null);
  const [scoutLoading, setScoutLoading] = useState(false);
  const [scoutError, setScoutError] = useState(null);
  const [themeInput, setThemeInput] = useState("");
  const [newSym, setNewSym] = useState("");
  const [newCls, setNewCls] = useState(ASSET_CLASSES[0]);
  const [expanded, setExpanded] = useState(null);
  const [scanTick, setScanTick] = useState(0);
  const [nowTs, setNowTs] = useState(Date.now());
  const scanningRef = useRef(null);
  const autoBusy = useRef(false);
  const ranOnce = useRef(false);
  const log = (t, k) => onLog && onLog(t, k);

  const runScout = async (override, isAuto) => {
    const ts = override || themes;
    if (scoutLoading || autoBusy.current) return;
    autoBusy.current = true;
    if (isAuto && onAutoSweep) onAutoSweep();
    setScoutLoading(true); setScoutError(null);
    log(ts.length ? `scouting: ${ts.join(", ")}…` : "scouting broad market…", "sys");
    try {
      const text = await callClaude(scoutPrompt(ts), `Themes: ${ts.join("; ") || "(none — scan broadly)"}\n\nScout current candidates to research, emphasizing recent catalysts.`);
      const r = parseScout(text); setScout(r);
      log(`${r.picks.length} picks surfaced`, "ok");
    } catch (err) { setScoutError(err.message || "Something went wrong"); log(`scout failed — ${err.message}`, "err"); }
    finally { setScoutLoading(false); autoBusy.current = false; if (onScouted) onScouted(); }
  };

  useEffect(() => { if (!ready || ranOnce.current) return; ranOnce.current = true; if (themes.length > 0) runScout(); /* eslint-disable-next-line */ }, [ready]);
  useEffect(() => { if (scoutSignal) runScout(); /* eslint-disable-next-line */ }, [scoutSignal]);
  useEffect(() => { const id = setInterval(() => setNowTs(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!ready || !scoutEvery) return;
    const due = !scoutAt || (nowTs - scoutAt) >= scoutEvery * 60000;
    if (due) runScout(undefined, true);
    /* eslint-disable-next-line */
  }, [nowTs, scoutEvery, ready]);

  useEffect(() => {
    if (scanningRef.current) return;
    const next = items.find((it) => it.pending);
    if (!next) return;
    scanningRef.current = next.id;
    (async () => {
      try {
        const text = await callClaude(trackingUpdatePrompt(), `Asset: ${next.asset}\nAsset class: ${next.assetClass}\n\nGive the monitoring update from current public information.`);
        const u = parseTrackingUpdate(text);
        setItems((prev) => prev.map((it) => it.id === next.id ? { ...it, pending: false, scanError: false, update: u.update, watch: u.watch, lean: u.lean, leanReason: u.leanReason, lastScanAt: new Date().toISOString() } : it));
        log(`radar · ${next.asset.toUpperCase()} ${u.lean ? "· " + u.lean : "updated"}`, "ok");
      } catch (err) {
        setItems((prev) => prev.map((it) => it.id === next.id ? { ...it, pending: false, scanError: true } : it));
        log(`scan failed — ${next.asset.toUpperCase()}`, "err");
      } finally { scanningRef.current = null; setScanTick((t) => t + 1); }
    })();
    /* eslint-disable-next-line */
  }, [items, scanTick]);

  const addTheme = (t) => { const v = (t || "").trim(); if (!v) return; if (themes.some((x) => x.toLowerCase() === v.toLowerCase())) return; setThemes([...themes, v]); };
  const removeTheme = (t) => setThemes(themes.filter((x) => x !== t));
  const rescan = (id) => setItems(items.map((it) => it.id === id ? { ...it, pending: true } : it));
  const rescanAll = () => setItems(items.map((it) => ({ ...it, pending: true })));
  const remove = (id) => setItems(items.filter((it) => it.id !== id));
  const patch = (id, p) => setItems(items.map((it) => it.id === id ? { ...it, ...p } : it));
  const manualAdd = () => { if (!newSym.trim()) return; addTracked(newSym.trim().toUpperCase(), newCls); setNewSym(""); };
  const isTracked = (asset) => items.some((it) => it.asset.toUpperCase() === (asset || "").toUpperCase());
  const scanning = (id) => scanningRef.current === id || items.find((it) => it.id === id)?.pending;
  const pendingCount = items.filter((it) => it.pending).length;
  const dueIn = scoutEvery && scoutAt ? Math.max(0, scoutAt + scoutEvery * 60000 - nowTs) : null;
  const fmtDur = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

  return (
    <div className="pr-view">
      <div className="pr-rdr-head pr-rdr-head--split">
        <div className="pr-rdr-head-text">
          <div className="pr-hero-eyebrow">Scout · Track · Verify</div>
          <h1 className="pr-rdr-title">Your radar finds and watches. You decide.</h1>
          <p className="pr-rdr-honest">BACON scouts the public record — news, filings, catalysts — via live web search, and tracks how each name's story evolves. It carries no live price feed: updates are qualitative reads, not signals. Verify before acting. Not financial advice.</p>
        </div>
        <div className="pr-hero-prism"><BaconMark size={132} /></div>
      </div>

      <div className="pr-sec">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Tracking</h2>
          <div className="pr-sec-actions">
            {items.length > 0 && <button className="pr-btn-sm" onClick={rescanAll} disabled={pendingCount > 0}>{pendingCount > 0 ? <><Loader2 size={13} className="pr-spin" /> {pendingCount} scanning</> : <><RefreshCw size={13} /> Rescan all</>}</button>}
          </div>
        </div>

        <div className="pr-add">
          <span className="pr-add-prompt">+</span>
          <input className="pr-input" placeholder="ADD A TICKER TO TRACK — e.g. NVDA, USD/JPY, GOLD" value={newSym} onChange={(e) => setNewSym(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") manualAdd(); }} aria-label="Add ticker" />
          <select className="pr-select" value={newCls} onChange={(e) => setNewCls(e.target.value)} aria-label="Asset class">{ASSET_CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="pr-btn" onClick={manualAdd} disabled={!newSym.trim()}>TRACK <Plus size={14} /></button>
        </div>

        {items.length === 0 && (
          <div className="pr-empty"><Radar size={26} /><div>Your radar is empty. Scout picks below and tap <strong>+ Track</strong>, or add a ticker above. BACON then watches each name for new developments.</div></div>
        )}

        <div className="pr-trk-list">
          {items.map((it) => {
            const st = it.lean ? STANCES[it.lean] : null;
            const rel = relTime(it.lastScanAt);
            const isScan = scanning(it.id);
            return (
              <div key={it.id} className="pr-trk" style={{ "--h": st ? st.tone : "var(--muted2)" }}>
                <div className="pr-trk-top">
                  <span className="pr-trk-name">{it.asset.toUpperCase()}</span>
                  <span className="pr-trk-class">{it.assetClass}</span>
                  <span className="pr-trk-lean" style={st ? { color: st.tone, borderColor: st.tone } : {}}>{st ? st.label : "unscanned"}</span>
                </div>

                {isScan ? (
                  <div className="pr-trk-update is-scan"><Loader2 size={12} className="pr-spin" /> scanning the public record…</div>
                ) : it.scanError ? (
                  <div className="pr-trk-update is-err">scan failed — tap rescan to retry.</div>
                ) : it.update ? (
                  <div className="pr-trk-update">{it.update}{it.leanReason && <span className="pr-trk-reason"> — {it.leanReason}</span>}</div>
                ) : (
                  <div className="pr-trk-update is-muted">Not scanned yet — rescan to fetch the latest developments.</div>
                )}
                {it.watch && !isScan && <div className="pr-trk-watch"><span>WATCH ▸</span> {it.watch}</div>}

                <div className="pr-trk-meta">
                  <span className="pr-trk-when">{rel ? `scanned ${rel}` : "never scanned"}</span>
                  <div className="pr-trk-btns">
                    <button onClick={() => rescan(it.id)} disabled={isScan} title="Rescan"><RefreshCw size={13} /> rescan</button>
                    <button onClick={() => onAnalyze({ asset: it.asset, cls: it.assetClass })} title="Open six-lens cockpit"><LayoutGrid size={13} /> lenses</button>
                    <button onClick={() => onDiscuss({ kind: "tracked", asset: it.asset, cls: it.assetClass, thesis: it.thesis, update: it.update, watch: it.watch, title: it.asset.toUpperCase(), sub: "tracked name" })} title="Discuss this name"><MessageCircle size={13} /> discuss</button>
                    <TVLink sym={it.asset} />
                    <button onClick={() => setExpanded(expanded === it.id ? null : it.id)} title="Thesis"><ChevronRight size={13} className={expanded === it.id ? "pr-rot" : ""} /> thesis</button>
                    <button onClick={() => remove(it.id)} className="is-danger" title="Remove"><Trash2 size={13} /></button>
                  </div>
                </div>

                {expanded === it.id && (
                  <div className="pr-trk-expand">
                    <label className="pr-wl-label">Your thesis</label>
                    <textarea className="pr-textarea" placeholder="Why might this work? Which lenses agree? What would prove you wrong?" value={it.thesis || ""} onChange={(e) => patch(it.id, { thesis: e.target.value })} rows={3} />
                    <div className="pr-wl-conviction">
                      <label className="pr-wl-label">Conviction</label>
                      <div className="pr-conviction-dots">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={`pr-conviction-dot ${(it.conviction || 0) >= n ? "is-on" : ""}`} onClick={() => patch(it.id, { conviction: n })} aria-label={`Conviction ${n}`} />)}</div>
                      <span className="pr-conviction-val">{["—", "Watching", "Tentative", "Building", "Strong", "High"][it.conviction || 0]}</span>
                    </div>
                    <input className="pr-wl-note" placeholder="Position note — size, entry zone, stop, review date…" value={it.note || ""} onChange={(e) => patch(it.id, { note: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="pr-sec">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Scout</h2>
          <div className="pr-sec-actions">
            <div className="pr-auto">
              <span className={`pr-auto-lbl ${scoutEvery ? "is-on" : ""}`}>{scoutEvery ? (scoutLoading ? "● sweeping…" : (dueIn != null ? `● next sweep ${fmtDur(dueIn)}` : "● armed")) : "auto off"}</span>
              <select className="pr-auto-sel" value={scoutEvery} onChange={(e) => setScoutEvery(parseInt(e.target.value, 10))} aria-label="Auto-scout interval">
                <option value={0}>AUTO: OFF</option>
                <option value={15}>AUTO: 15M</option>
                <option value={30}>AUTO: 30M</option>
                <option value={60}>AUTO: 1H</option>
                <option value={240}>AUTO: 4H</option>
              </select>
            </div>
            <button className="pr-btn" onClick={() => runScout()} disabled={scoutLoading}>{scoutLoading ? <><Loader2 size={14} className="pr-spin" /> SCOUTING</> : <><Radar size={14} /> SCOUT NOW</>}</button>
          </div>
        </div>
        {scoutEvery > 0 && <div className="pr-auto-note"># auto-sweep scouts fresh ideas and refreshes your news feed on this cadence — only while this tab stays open (no background server). each sweep is a live web search.</div>}

        <div className="pr-scout-themes">
          <span className="pr-scout-lbl">themes</span>
          {themes.map((t) => <span key={t} className="pr-theme">{t}<button onClick={() => removeTheme(t)} aria-label={`Remove ${t}`}><X size={11} /></button></span>)}
          <span className="pr-theme-add">
            <input value={themeInput} onChange={(e) => setThemeInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addTheme(themeInput); setThemeInput(""); } }} placeholder="+ add theme" aria-label="Add theme" />
          </span>
        </div>
        {themes.length === 0 && (
          <div className="pr-theme-sugg">
            <span className="pr-scout-lbl">try</span>
            {SUGGESTED_THEMES.map((t) => <button key={t} className="pr-chip" onClick={() => addTheme(t)}>{t}</button>)}
          </div>
        )}

        {scoutLoading && <div className="pr-loading"><div className="pr-loading-text">Scanning public sources for timely candidates…</div></div>}
        {scoutError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Scout couldn't run.</strong><div className="pr-error-detail">{scoutError}. Try again.</div></div></div>}

        {!scoutLoading && !scout && themes.length === 0 && (
          <div className="pr-empty"><Compass size={26} /><div>Add a theme or two above, then hit <strong>Scout now</strong>. BACON surfaces real, timely candidates with the catalyst behind each. Or scout the broad market with no themes set.</div></div>
        )}

        {scout && (
          <>
            {scout.intro && <div className="pr-summary">{scout.intro}</div>}
            <div className="pr-pick-grid">
              {scout.picks.map((p, i) => {
                const sym = (p.ticker && p.ticker !== "—") ? p.ticker : p.name;
                const tracked = isTracked(sym);
                return (
                  <div key={i} className="pr-pick">
                    <div className="pr-pick-head">
                      <div className="pr-pick-name">{p.name}{p.ticker && p.ticker !== "—" && <span className="pr-pick-ticker">{p.ticker}</span>}</div>
                      <span className="pr-pick-class">{p.cls}</span>
                    </div>
                    <div className="pr-pick-why">{p.why}</div>
                    {p.now && <div className="pr-pick-now"><span>NOW ▸</span> {p.now}</div>}
                    {p.check && <div className="pr-pick-check"><span>CHECK</span> {p.check}</div>}
                    <div className="pr-pick-actions">
                      <button className={`pr-pick-track ${tracked ? "is-on" : ""}`} onClick={() => addTracked(sym, mapClass(p.cls))} disabled={tracked}>{tracked ? <>✓ Tracking</> : <><Plus size={13} /> Track</>}</button>
                      <button className="pr-pick-lenses" onClick={() => onAnalyze({ asset: sym, cls: mapClass(p.cls) })}>Run lenses <ArrowRight size={13} /></button>
                      {p.ticker && p.ticker !== "—" && <TVLink sym={p.ticker} label={false} />}
                    </div>
                  </div>
                );
              })}
            </div>
            {scout.caveat && <div className="pr-disclaimer">{scout.caveat}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================== NEWS (headlines as signals) ============================== */
function NewsView({ active, signal, onAnalyze, addTracked, items, onLog, onDiscuss }) {
  const SOURCES = ["All", "CNBC", "Bloomberg", "Yahoo Finance", "Reuters", "WSJ", "FT", "MarketWatch"];
  const [source, setSource] = useState("All");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [at, setAt] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const ranOnce = useRef(false);
  const busy = useRef(false);
  const log = (t, k) => onLog && onLog(t, k);

  const load = async (src, foc) => {
    if (busy.current) return;
    busy.current = true; ranOnce.current = true; setLoading(true); setError(null);
    const s = src ?? source, f = (foc ?? focus).trim();
    log(`fetching headlines${s !== "All" ? " · " + s : ""}${f ? " · " + f : ""}…`, "sys");
    try {
      const text = await callClaude(newsPrompt(s, f), `Source focus: ${s}\nTopic focus: ${f || "(general markets)"}\n\nSurface the latest market-moving business headlines now.`, true, 1500);
      const r = parseNews(text); setResult(r); setAt(new Date());
      log(`${r.items.length} headlines`, "ok");
    } catch (err) { setError(err.message || "Something went wrong"); log(`news failed — ${err.message}`, "err"); }
    finally { setLoading(false); busy.current = false; }
  };

  useEffect(() => { if (active && !ranOnce.current) { ranOnce.current = true; load(); } /* eslint-disable-next-line */ }, [active]);
  useEffect(() => {
    if (!signal || !signal.token) return;
    if (signal.auto && !ranOnce.current) return;
    if (signal.q) setFocus(signal.q);
    load(source, signal.q || focus);
    /* eslint-disable-next-line */
  }, [signal && signal.token]);
  useEffect(() => { const id = setInterval(() => setNowTs(Date.now()), 30000); return () => clearInterval(id); }, []);

  const isTracked = (a) => items.some((it) => it.asset.toUpperCase() === (a || "").toUpperCase());

  return (
    <div className="pr-view">
      <div className="pr-rdr-head">
        <div className="pr-hero-eyebrow">Signals · Headlines</div>
        <h1 className="pr-rdr-title">The tape, read for opportunities.</h1>
        <p className="pr-rdr-honest">BACON pulls current business headlines from major outlets via live web search, paraphrased and attributed — then turns any with a tradable angle into a one-tap deep-dive or a tracked name. Headlines are summaries of public reporting; verify at the source. Not advice.</p>
      </div>

      <div className="pr-sec pr-sec-flush">
        <div className="pr-sec-head">
          <h2 className="pr-section-title">Headlines</h2>
          <div className="pr-sec-actions">
            {at && <span className="pr-auto-lbl">{nowTs ? `pulled ${relTime(at.toISOString())}` : ""}</span>}
            <button className="pr-btn" onClick={() => load()} disabled={loading}>{loading ? <><Loader2 size={14} className="pr-spin" /> PULLING</> : <><RefreshCw size={14} /> REFRESH</>}</button>
          </div>
        </div>

        <div className="pr-src-row">
          {SOURCES.map((s) => <button key={s} className={`pr-src ${source === s ? "is-on" : ""}`} onClick={() => { setSource(s); load(s, focus); }}>{s}</button>)}
        </div>
        <div className="pr-add pr-add-news">
          <span className="pr-add-prompt">/</span>
          <input className="pr-input" placeholder="FOCUS — e.g. semiconductors, fed, energy (optional)" value={focus} onChange={(e) => setFocus(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(source, focus); }} aria-label="News focus" />
          <button className="pr-btn-sm" onClick={() => load(source, focus)} disabled={loading}>Apply</button>
        </div>

        {loading && <div className="pr-loading"><div className="pr-loading-text">Scanning the wires for market-moving headlines…</div></div>}
        {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn't fetch headlines.</strong><div className="pr-error-detail">{error}. Try again.</div></div></div>}

        {!loading && !result && !error && <div className="pr-empty"><Newspaper size={26} /><div>Hit <strong>Refresh</strong> to pull the latest business headlines. Anything with a clear ticker becomes a one-tap deep-dive.</div></div>}

        {result && (
          <>
            {result.intro && <div className="pr-summary">{result.intro}</div>}
            <div className="pr-news-list">
              {result.items.map((n, i) => {
                const hasTk = n.ticker && n.ticker !== "—";
                const tracked = hasTk && isTracked(n.ticker);
                return (
                  <div key={i} className="pr-news">
                    <div className="pr-news-meta">
                      <span className="pr-news-src">{n.source || "WIRE"}</span>
                      {n.signal && <span className="pr-news-sig">{n.signal}</span>}
                      {n.when && n.when !== "—" && <span className="pr-news-when">{n.when}</span>}
                    </div>
                    <div className="pr-news-head">{n.head}</div>
                    {n.why && <div className="pr-news-why">{n.why}</div>}
                    <div className="pr-news-actions">
                      {hasTk ? (
                        <>
                          <span className="pr-news-tk">{n.ticker}</span>
                          <button className="pr-news-dd" onClick={() => onAnalyze({ asset: n.ticker, cls: mapClass(n.cls) })}>Deep dive <ArrowRight size={13} /></button>
                          <button className={`pr-news-tr ${tracked ? "is-on" : ""}`} onClick={() => addTracked(n.ticker, mapClass(n.cls))} disabled={tracked} title={tracked ? "Tracking" : "Track"}>{tracked ? "✓" : <Plus size={13} />}</button>
                          <TVLink sym={n.ticker} label={false} />
                        </>
                      ) : (
                        <span className="pr-news-macro">macro / no single ticker</span>
                      )}
                      <button className="pr-news-discuss" onClick={() => onDiscuss({ kind: "news", headline: n.head, ticker: hasTk ? n.ticker : null, cls: n.cls, title: hasTk ? n.ticker : "Headline", sub: "news item" })} title="Discuss this headline"><MessageCircle size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            {result.note && <div className="pr-disclaimer">{result.note}</div>}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================== ANALYZE COCKPIT (deep dive) ============================== */
function AnalyzeView({ target, onSave, onLog, debateSignal, onDiscuss }) {
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState(ASSET_CLASSES[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [rawFallback, setRawFallback] = useState(null);
  const [analyzed, setAnalyzed] = useState("");
  const [ranAt, setRanAt] = useState("");
  const [subView, setSubView] = useState("lenses");
  const [saved, setSaved] = useState(false);
  const [debate, setDebate] = useState(null);
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateError, setDebateError] = useState(null);
  const prevDebate = useRef(0);
  const prevTarget = useRef(0);
  const log = (t, k) => onLog && onLog(t, k);

  const run = async (q, cls) => {
    const asset = (q ?? query).trim();
    const klass = cls ?? assetClass;
    if (!asset || loading) return;
    setLoading(true); setError(null); setBriefing(null); setRawFallback(null);
    setSaved(false); setSubView("lenses"); setDebate(null); setDebateError(null);
    log(`analyzing ${asset.toUpperCase()}…`, "sys");
    try {
      const text = await callClaude(analysisPrompt(), `Asset: ${asset}\nAsset class: ${klass}\n\nProduce the six-lens BACON briefing using current public information.`);
      const parsed = parseBriefing(text);
      if (parsed.SUMMARY || Object.keys(parsed.lenses).length >= 3) {
        setBriefing(parsed);
        const st = {}; LENSES.forEach((l) => { st[l.key] = parsed.lenses[l.key]?.stance || "mixed"; });
        log(`${asset.toUpperCase()} ready · ${overallLean(st).label}`, "ok");
      } else { setRawFallback(text); log(`${asset.toUpperCase()} · partial parse`, "sys"); }
      setAnalyzed(asset);
      setRanAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) { setError(err.message || "Something went wrong"); log(`analysis failed — ${err.message}`, "err"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (target && target.token && target.token !== prevTarget.current) {
      prevTarget.current = target.token;
      setQuery(target.asset); setAssetClass(target.cls || ASSET_CLASSES[0]);
      run(target.asset, target.cls || ASSET_CLASSES[0]);
    }
    // eslint-disable-next-line
  }, [target?.token]);

  const openDebate = async () => {
    setSubView("debate");
    if (debate || debateLoading || !analyzed) return;
    setDebateLoading(true); setDebateError(null);
    log(`debate: ${analyzed.toUpperCase()}…`, "sys");
    try { const text = await callClaude(debatePrompt(), `Asset: ${analyzed}\nAsset class: ${assetClass}\n\nRun the bull-vs-bear debate using current public information.`); setDebate(parseDebate(text)); log(`debate ready · ${analyzed.toUpperCase()}`, "ok"); }
    catch (err) { setDebateError(err.message || "Something went wrong"); log(`debate failed — ${err.message}`, "err"); }
    finally { setDebateLoading(false); }
  };

  useEffect(() => {
    if (debateSignal && debateSignal !== prevDebate.current) {
      prevDebate.current = debateSignal;
      if (analyzed) openDebate(); else log("no asset loaded — run a ticker first", "err");
    }
    // eslint-disable-next-line
  }, [debateSignal]);

  const save = () => { onSave(analyzed, assetClass); setSaved(true); log(`tracking ${analyzed.toUpperCase()}`, "ok"); };

  const hasBriefing = !!briefing;
  const stances = {}; if (hasBriefing) LENSES.forEach((l) => { stances[l.key] = briefing.lenses[l.key]?.stance || "mixed"; });
  const lean = hasBriefing ? overallLean(stances) : null;

  return (
    <div className="pr-view">
      {!hasBriefing && !rawFallback && !loading && (
        <div className="pr-hero">
          <div className="pr-hero-eyebrow">Deep-dive · six-lens cockpit</div>
          <h1 className="pr-hero-title">Run any asset through six professional lenses.</h1>
          <Spectrum height={6} className="pr-hero-spectrum" />
          <p className="pr-hero-sub">For when you want the full read on one name. BACON pulls live public data to show what each lens sees, where they converge, and what you must verify — then save it to your radar to keep tracking it.</p>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="pr-command">
        <div className="pr-command-row">
          <span className="pr-command-prompt">›</span>
          <input className="pr-input" placeholder="TICKER OR ASSET — e.g. NVDA, USD/JPY, GOLD, VOO, BTC" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Asset to analyze" />
          <select className="pr-select" value={assetClass} onChange={(e) => setAssetClass(e.target.value)} aria-label="Asset class">{ASSET_CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
          <button className="pr-btn" type="submit" disabled={!query.trim() || loading}>{loading ? <Loader2 size={16} className="pr-spin" /> : <>RUN <ArrowRight size={15} /></>}</button>
        </div>
        <div className="pr-command-hint">Live web search · typically 20–40s · no live price feed by design</div>
      </form>

      {loading && (
        <div className="pr-loading">
          <div className="pr-loading-lenses">{LENSES.map((l, i) => <div key={l.key} className="pr-loading-lens" style={{ animationDelay: `${i * 0.18}s` }}><span className="pr-loading-dot" style={{ background: l.hue }} />{l.short}</div>)}</div>
          <div className="pr-loading-text">Fetching current data and reading through each lens…</div>
        </div>
      )}
      {error && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn't complete the analysis.</strong><div className="pr-error-detail">{error}. Check your connection and try again — the live search occasionally times out.</div></div></div>}
      {rawFallback && <div className="pr-result"><div className="pr-raw">{rawFallback}</div></div>}

      {hasBriefing && (
        <div className="pr-result">
          <div className="pr-readout">
            <div className="pr-readout-id">
              <div className="pr-readout-ticker">{analyzed.toUpperCase()}</div>
              <div className="pr-readout-sub">{assetClass}<span className="pr-readout-sep">·</span>analyzed {ranAt}</div>
            </div>
            <div className="pr-readout-lean">
              <div className="pr-readout-leanlabel">Aggregate lens lean</div>
              <div className="pr-readout-leanval" style={{ color: lean.tone }}>{lean.label}</div>
              <div className="pr-readout-leannote">synthesis of the six stances — not a rating or signal</div>
            </div>
            <TVLink sym={analyzed} square />
            <button className="pr-readout-discuss" onClick={() => onDiscuss({ kind: "asset", asset: analyzed, cls: assetClass, title: analyzed.toUpperCase(), sub: "six-lens analysis" })} title="Discuss this asset"><MessageCircle size={16} /></button>
            <button className={`pr-readout-save ${saved ? "is-saved" : ""}`} onClick={save} disabled={saved} title={saved ? "On radar" : "Track on radar"}><Bookmark size={16} /></button>
          </div>

          <div className="pr-subnav">
            <button className={`pr-subnav-btn ${subView === "lenses" ? "is-active" : ""}`} onClick={() => setSubView("lenses")}><LayoutGrid size={14} /> Lens cockpit</button>
            <button className={`pr-subnav-btn ${subView === "debate" ? "is-active" : ""}`} onClick={openDebate}><Scale size={14} /> Bull vs Bear</button>
          </div>

          {subView === "lenses" && (
            <>
              {briefing.SUMMARY && <div className="pr-summary">{briefing.SUMMARY}</div>}
              <div className="pr-cluster">
                <div className="pr-cluster-gauge">
                  <div className="pr-cluster-cap">Convergence gauge</div>
                  <ConvictionRadar stances={stances} />
                </div>
                <div className="pr-cluster-bank">
                  <div className="pr-cluster-cap">Lens stance bank</div>
                  <div className="pr-led-list">
                    {LENSES.map((l) => { const st = STANCES[stances[l.key]]; return (
                      <div key={l.key} className="pr-led-row">
                        <span className="pr-led" style={{ background: st.tone, boxShadow: `0 0 7px ${st.tone}` }} />
                        <span className="pr-led-name">{l.name}</span>
                        <span className="pr-led-stance" style={{ color: st.tone }}>{st.label}</span>
                      </div>); })}
                  </div>
                  <div className="pr-cluster-note">Where each lens leans in BACON's reading. The gauge shape shows convergence — not a score, rating, or forecast.</div>
                </div>
              </div>
              <div className="pr-grid">
                {LENSES.map((l, i) => { const sec = briefing.lenses[l.key]; const st = STANCES[sec?.stance || "mixed"]; return (
                  <div key={l.key} className="pr-panel" style={{ "--h": l.hue }}>
                    <div className="pr-panel-top">
                      <span className="pr-panel-idx">L{String(i + 1).padStart(2, "0")}</span>
                      <span className="pr-panel-name" style={{ color: l.hue }}>{l.name}</span>
                      <span className="pr-panel-stance" style={{ color: st.tone, borderColor: st.tone }}>{st.label}</span>
                    </div>
                    <p className="pr-panel-body">{sec?.body || "No read returned."}</p>
                    {sec?.verify && <div className="pr-panel-verify"><span style={{ color: l.hue }}>VERIFY ▸</span> {sec.verify}</div>}
                  </div>); })}
              </div>
              {briefing.BOTTOMLINE && <div className="pr-bottomline"><div className="pr-bottomline-label">Bottom line</div>{briefing.BOTTOMLINE}</div>}
              <div className="pr-disclaimer">BACON synthesizes public information and may be incomplete or out of date. It carries no live price feed and is not financial advice. The lenses can disagree — confirm every figure independently and decide for yourself.</div>
            </>
          )}

          {subView === "debate" && (
            <div className="pr-debate">
              {debateLoading && <div className="pr-loading"><div className="pr-loading-text"><Loader2 size={16} className="pr-spin" style={{ verticalAlign: "-3px", marginRight: 8 }} />Steelmanning both sides from current sources…</div></div>}
              {debateError && <div className="pr-error"><AlertTriangle size={18} /><div><strong>Couldn't run the debate.</strong><div className="pr-error-detail">{debateError}. Try again.</div></div></div>}
              {debate && (
                <>
                  <div className="pr-debate-cols">
                    <div className="pr-debate-card is-bull"><div className="pr-debate-head"><ArrowUpRight size={16} /> The bull case</div><ul>{toPoints(debate.BULL).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                    <div className="pr-debate-card is-bear"><div className="pr-debate-head"><ArrowRight size={16} style={{ transform: "rotate(45deg)" }} /> The bear case</div><ul>{toPoints(debate.BEAR).map((p, i) => <li key={i}>{p}</li>)}</ul></div>
                  </div>
                  {debate.SYNTHESIS && <div className="pr-bottomline"><div className="pr-bottomline-label">Where it hinges</div>{debate.SYNTHESIS}</div>}
                  <div className="pr-disclaimer">This steelmans both sides from public information to expose the real disagreement. It is not a recommendation — a convincing argument is not the same as a correct one.</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================== FRAMEWORKS ============================== */
function FrameworksView() {
  const [open, setOpen] = useState("FUNDAMENTAL");
  return (
    <div className="pr-view">
      <div className="pr-fw-intro"><h2 className="pr-section-title">The latticework</h2><Spectrum height={5} className="pr-fw-spectrum" /><p className="pr-fw-philosophy">{PHILOSOPHY}</p></div>
      <div className="pr-fw-list">
        {FRAMEWORKS.map((f) => { const isOpen = open === f.key; return (
          <div key={f.key} className={`pr-fw-card ${isOpen ? "is-open" : ""}`} style={{ "--h": f.hue }}>
            <button className="pr-fw-card-head" onClick={() => setOpen(isOpen ? null : f.key)} aria-expanded={isOpen}>
              <span className="pr-fw-dot" style={{ background: f.hue }} /><span className="pr-fw-name">{f.name}</span><span className="pr-fw-summary">{f.summary}</span><ChevronDown size={18} className={`pr-fw-chev ${isOpen ? "is-open" : ""}`} />
            </button>
            {isOpen && (
              <div className="pr-fw-body">
                <div className="pr-fw-plays">{f.playbook.map((pl, i) => <div key={i} className="pr-fw-play"><div className="pr-fw-play-h">{pl.h}</div><div className="pr-fw-play-p">{pl.p}</div></div>)}</div>
                <div className="pr-fw-terms">{f.terms.map((t) => <span key={t} className="pr-fw-term">{t}</span>)}</div>
                <div className="pr-fw-caveat" style={{ "--h": f.hue }}><AlertTriangle size={14} /> {f.caveat}</div>
              </div>
            )}
          </div>); })}
      </div>
    </div>
  );
}

/* ============================== SIZER ============================== */
function SizerView() {
  const [mode, setMode] = useState("risk");
  const [account, setAccount] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(100);
  const [stop, setStop] = useState(92);
  const [winProb, setWinProb] = useState(55);
  const [payoff, setPayoff] = useState(1.8);
  const num = (v) => (isFinite(v) ? v : 0);
  const riskDollars = num(account * (riskPct / 100));
  const perUnit = Math.abs(num(entry) - num(stop));
  const units = perUnit > 0 ? riskDollars / perUnit : 0;
  const posValue = units * num(entry);
  const posPct = account > 0 ? (posValue / account) * 100 : 0;
  const p = winProb / 100, q = 1 - p, b = num(payoff);
  const fullKelly = b > 0 ? (b * p - q) / b : 0;
  const kPct = Math.max(fullKelly, 0) * 100;
  const fmt = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const money = (v) => "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <div className="pr-view">
      <div className="pr-sz-head"><h2 className="pr-section-title">Position calc</h2><p className="pr-wl-sub">Sizing decides outcomes more than entries. This is plain math on your own inputs — no market data, no guarantees.</p></div>
      <div className="pr-sz-modes">
        <button className={`pr-sz-mode ${mode === "risk" ? "is-active" : ""}`} onClick={() => setMode("risk")}>Risk-based <span>what most desks use</span></button>
        <button className={`pr-sz-mode ${mode === "kelly" ? "is-active" : ""}`} onClick={() => setMode("kelly")}>Kelly edge <span>growth-optimal ceiling</span></button>
      </div>
      {mode === "risk" && (
        <div className="pr-sz-panel">
          <div className="pr-sz-fields">
            <Field label="Account size" suffix="$" value={account} onChange={setAccount} />
            <Field label="Risk per trade" suffix="%" value={riskPct} onChange={setRiskPct} step="0.1" hint="0.5–2% is typical" />
            <Field label="Entry price" suffix="$" value={entry} onChange={setEntry} />
            <Field label="Stop price" suffix="$" value={stop} onChange={setStop} />
          </div>
          <div className="pr-sz-out">
            <Out label="Capital at risk" value={money(riskDollars)} accent />
            <Out label="Risk per unit" value={money(perUnit)} />
            <Out label="Position size" value={`${fmt(units)} u`} />
            <Out label="Position value" value={money(posValue)} />
            <Out label="% of account" value={`${fmt(posPct)}%`} warn={posPct > 100} />
          </div>
          {posPct > 100 && <div className="pr-sz-warn"><AlertTriangle size={14} /> This position exceeds your account — it implies leverage. Widen your stop or cut risk %.</div>}
          <div className="pr-sz-note">You risk a fixed slice of capital, and the entry-to-stop distance sets how many units that buys. Tighter stops allow larger size; wider stops, smaller. Loss is capped at your risk % only if the stop actually fills — gaps and slippage can exceed it.</div>
        </div>
      )}
      {mode === "kelly" && (
        <div className="pr-sz-panel">
          <div className="pr-sz-fields">
            <Field label="Account size" suffix="$" value={account} onChange={setAccount} />
            <Field label="Win probability" suffix="%" value={winProb} onChange={setWinProb} hint="be honest — and conservative" />
            <Field label="Payoff ratio (avg win ÷ avg loss)" suffix="×" value={payoff} onChange={setPayoff} step="0.1" />
          </div>
          {fullKelly <= 0 ? (
            <div className="pr-sz-out"><Out label="Kelly says" value="No edge — don't bet" warn /></div>
          ) : (
            <div className="pr-sz-out">
              <Out label="Full Kelly" value={`${fmt(kPct)}%`} warn />
              <Out label="Half Kelly" value={`${fmt(kPct / 2)}%`} accent />
              <Out label="Quarter Kelly" value={`${fmt(kPct / 4)}%`} />
              <Out label="Half-Kelly $" value={money(account * (kPct / 2) / 100)} />
            </div>
          )}
          <div className="pr-sz-note">Full Kelly is the growth-optimal ceiling — and it over-bets viciously: a few losing trades at full size can erase most of an account. Practitioners use half- or quarter-Kelly. Kelly also ignores correlation, so don't size several related positions each at Kelly — apply an overall risk budget across the book.</div>
        </div>
      )}
    </div>
  );
}
function Field({ label, suffix, value, onChange, step = "1", hint }) {
  return (<label className="pr-field"><span className="pr-field-label">{label}{hint && <em>{hint}</em>}</span><span className="pr-field-input"><input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} /><span className="pr-field-suffix">{suffix}</span></span></label>);
}
function Out({ label, value, accent, warn }) {
  return <div className={`pr-out ${accent ? "is-accent" : ""} ${warn ? "is-warn" : ""}`}><div className="pr-out-label">{label}</div><div className="pr-out-value">{value}</div></div>;
}

/* ============================== DISCUSS (contextual chat) ============================== */
function ChatPanel({ open, context, messages, loading, error, onSend, onClose, onClear }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [messages, loading]);
  if (!open) return null;
  const submit = () => { const t = text.trim(); if (!t || loading) return; onSend(t); setText(""); };
  const starters = chatStarters(context || { kind: "general" });
  return (
    <div className="pr-chat-wrap" onClick={onClose}>
      <div className="pr-chat" onClick={(e) => e.stopPropagation()}>
        <div className="pr-chat-head">
          <div className="pr-chat-ctx">
            <span className="pr-chat-ctx-dot" />
            <div className="pr-chat-ctx-text">
              <div className="pr-chat-ctx-title">{context ? context.title : "Discussion"}</div>
              <div className="pr-chat-ctx-sub">{context ? context.sub : ""}</div>
            </div>
          </div>
          <div className="pr-chat-head-btns">
            {messages.length > 0 && <button onClick={onClear} title="New chat" className="pr-chat-clear"><Plus size={13} /> New</button>}
            <button onClick={onClose} title="Close" className="pr-chat-x"><X size={16} /></button>
          </div>
        </div>
        <div className="pr-chat-body">
          {messages.length === 0 && (
            <div className="pr-chat-intro">
              <BaconMark size={46} />
              <div className="pr-chat-intro-title">Let's talk it through.</div>
              <div className="pr-chat-intro-sub">Ask anything about {context && context.kind !== "general" ? context.title : "what you're researching"}. I'll reason through the lenses, weigh both sides, and flag what to verify — grounded in live search, never advice.</div>
              <div className="pr-chat-starters">
                {starters.map((s, i) => <button key={i} className="pr-chat-starter" onClick={() => onSend(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`pr-msg is-${m.role}`}>
              {m.role === "assistant" && <span className="pr-msg-who">BACON</span>}
              <div className="pr-msg-body">{m.content}</div>
            </div>
          ))}
          {loading && <div className="pr-msg is-assistant"><span className="pr-msg-who">BACON</span><div className="pr-msg-body pr-msg-typing"><span /><span /><span /></div></div>}
          {error && <div className="pr-chat-err"><AlertTriangle size={14} /> {error}</div>}
          <div ref={endRef} />
        </div>
        <div className="pr-chat-input">
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} placeholder="Ask about what you're viewing…" rows={1} aria-label="Chat message" />
          <button onClick={submit} disabled={!text.trim() || loading} className="pr-chat-send" aria-label="Send"><ArrowRight size={16} /></button>
        </div>
        <div className="pr-chat-foot">Live web search · qualitative · not financial advice</div>
      </div>
    </div>
  );
}
function ChatFab({ onClick, hidden }) {
  if (hidden) return null;
  return <button className="pr-fab" onClick={onClick} aria-label="Discuss what you're viewing"><MessageCircle size={19} /><span>Discuss</span></button>;
}

/* ============================== APP ============================== */
const NAV = [
  { key: "radar", name: "Radar", icon: Radar, mod: "RADAR · SCOUT + TRACKING" },
  { key: "news", name: "News", icon: Newspaper, mod: "NEWS · MARKET HEADLINES" },
  { key: "analyze", name: "Analyze", icon: Search, mod: "ANALYZE · SIX-LENS COCKPIT" },
  { key: "frameworks", name: "Frameworks", icon: BookOpen, mod: "FRAMEWORKS · LENS REFERENCE" },
  { key: "sizer", name: "Sizer", icon: Calculator, mod: "SIZER · POSITION CALC" },
];

export default function App() {
  const [view, setView] = useState("radar");
  const [items, setItems] = useState([]);
  const [themes, setThemes] = useState([]);
  const [scoutEvery, setScoutEvery] = useState(0);
  const [scoutAt, setScoutAt] = useState(0);
  const [ready, setReady] = useState(false);
  const [analyzeTarget, setAnalyzeTarget] = useState(null);
  const [debateSignal, setDebateSignal] = useState(0);
  const [scoutSignal, setScoutSignal] = useState(0);
  const [newsSignal, setNewsSignal] = useState({ q: "", token: 0 });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const chatBusy = useRef(false);
  const [cmd, setCmd] = useState("");
  const [log, setLog] = useState([]);
  const [history, setHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const cmdRef = useRef(null);
  const loaded = useRef(false);

  useEffect(() => { (async () => {
    try { if (typeof window !== "undefined" && window.storage) {
      const r = await window.storage.get("wm_watchlist"); if (r && r.value) setItems(JSON.parse(r.value));
      const th = await window.storage.get("wm_themes"); if (th && th.value) setThemes(JSON.parse(th.value));
      const se = await window.storage.get("wm_scout_every"); if (se && se.value) setScoutEvery(JSON.parse(se.value));
      const sa = await window.storage.get("wm_scout_at"); if (sa && sa.value) setScoutAt(JSON.parse(sa.value));
    } } catch (e) {}
    loaded.current = true; setReady(true);
  })(); }, []);
  useEffect(() => { if (!loaded.current) return; (async () => { try { if (typeof window !== "undefined" && window.storage) await window.storage.set("wm_watchlist", JSON.stringify(items)); } catch (e) {} })(); }, [items]);
  useEffect(() => { if (!loaded.current) return; (async () => { try { if (typeof window !== "undefined" && window.storage) await window.storage.set("wm_themes", JSON.stringify(themes)); } catch (e) {} })(); }, [themes]);
  useEffect(() => { if (!loaded.current) return; (async () => { try { if (typeof window !== "undefined" && window.storage) await window.storage.set("wm_scout_every", JSON.stringify(scoutEvery)); } catch (e) {} })(); }, [scoutEvery]);
  useEffect(() => { if (!loaded.current) return; (async () => { try { if (typeof window !== "undefined" && window.storage) await window.storage.set("wm_scout_at", JSON.stringify(scoutAt)); } catch (e) {} })(); }, [scoutAt]);

  const pushLog = (text, kind = "sys") => setLog((l) => [...l, { id: Date.now() + Math.random(), text, kind }].slice(-50));
  const sendToAnalyze = (t) => { setAnalyzeTarget({ ...t, token: Date.now() }); setView("analyze"); };

  const openChat = (context) => { const ctx = context || deriveContext(view, analyzeTarget, items); setChatContext(ctx); setChatOpen(true); };
  const clearChat = () => { setChatMessages([]); setChatError(null); };
  const sendChat = async (textIn, contextArg) => {
    const t = (textIn || "").trim(); if (!t || chatBusy.current) return;
    const ctx = contextArg || chatContext || deriveContext(view, analyzeTarget, items);
    if (!chatContext) setChatContext(ctx);
    const history = [...chatMessages, { role: "user", content: t }];
    setChatMessages(history); setChatLoading(true); setChatError(null); chatBusy.current = true;
    try {
      const reply = await chatClaude(chatSystemPrompt(ctx), history.map((m) => ({ role: m.role, content: m.content })));
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (err) { setChatError((err.message || "Something went wrong") + " — try again."); }
    finally { setChatLoading(false); chatBusy.current = false; }
  };

  const addTracked = (asset, cls) => {
    const a = (asset || "").trim(); if (!a) return;
    setItems((prev) => {
      if (prev.some((it) => it.asset.toUpperCase() === a.toUpperCase())) return prev;
      return [{ id: Date.now() + Math.random(), asset: a, assetClass: cls || ASSET_CLASSES[0], lean: null, leanReason: "", update: "", watch: "", lastScanAt: null, pending: true, scanError: false, thesis: "", conviction: 3, note: "", date: new Date().toISOString() }, ...prev];
    });
  };
  const untrack = (asset) => setItems((prev) => prev.filter((it) => it.asset.toUpperCase() !== (asset || "").toUpperCase()));

  const runCommand = (raw) => {
    const line = (raw || "").trim(); if (!line) return;
    setHistory((h) => [...h, line]); setHistIdx(-1);
    pushLog("> " + line, "cmd");
    const [verbRaw, ...rest] = line.split(/\s+/);
    const verb = verbRaw.toUpperCase();
    const arg = rest.join(" ").trim();
    const nav = { RADAR: "radar", HOME: "radar", WATCH: "radar", FRMK: "frameworks", FRAMEWORKS: "frameworks", FRM: "frameworks", SIZE: "sizer", SIZER: "sizer", SIZ: "sizer", ANL: "analyze", ANALYZE: "analyze" };
    if (verb === "HELP" || verb === "?" || verb === "MAN") { setHelpOpen(true); return; }
    if (verb === "CLS" || verb === "CLEAR") { setLog([]); return; }
    if (verb === "DEBATE" || verb === "BULL" || verb === "BEAR" || verb === "VS") { setView("analyze"); setDebateSignal(Date.now()); return; }
    if (verb === "SCOUT" || verb === "SCAN") { setView("radar"); if (arg) { setThemes((prev) => prev.some((x) => x.toLowerCase() === arg.toLowerCase()) ? prev : [...prev, arg]); } setScoutSignal(Date.now()); return; }
    if (verb === "NEWS" || verb === "HEADLINES" || verb === "WIRE") { setView("news"); setNewsSignal({ q: arg || "", token: Date.now() }); return; }
    if (verb === "CHAT" || verb === "ASK" || verb === "DISCUSS") { const ctx = deriveContext(view, analyzeTarget, items); setChatContext(ctx); setChatOpen(true); if (arg) sendChat(arg, ctx); return; }
    if (verb === "TRACK" && arg) { const { sym, cls } = splitSymCls(arg); addTracked(sym, cls); setView("radar"); pushLog(`tracking ${sym}`, "ok"); return; }
    if (verb === "UNTRACK" && arg) { const { sym } = splitSymCls(arg); untrack(sym); pushLog(`untracked ${sym}`, "sys"); return; }
    if ((verb === "ANL" || verb === "ANALYZE") && arg) { const { sym, cls } = splitSymCls(arg); sendToAnalyze({ asset: sym, cls }); return; }
    if (verb in nav && !arg) { setView(nav[verb]); pushLog("→ " + nav[verb], "sys"); return; }
    const { sym, cls } = splitSymCls(line);
    sendToAnalyze({ asset: sym, cls });
  };

  const doHistory = (dir) => {
    if (!history.length) return;
    let idx = histIdx === -1 ? history.length : histIdx;
    idx = Math.min(Math.max(idx + dir, 0), history.length);
    setHistIdx(idx === history.length ? -1 : idx);
    setCmd(idx === history.length ? "" : history[idx] || "");
  };

  useEffect(() => {
    const onKey = (e) => {
      if (booting) return;
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      if (e.key === "Escape") { if (helpOpen) setHelpOpen(false); else if (typing && e.target.blur) e.target.blur(); return; }
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); if (cmdRef.current) cmdRef.current.focus(); return; }
      if (e.key === "?") { e.preventDefault(); setHelpOpen((h) => !h); return; }
      if (/^[1-9]$/.test(e.key)) { const idx = parseInt(e.key, 10) - 1; if (NAV[idx]) setView(NAV[idx].key); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [booting, helpOpen]);

  const moduleLabel = (NAV.find((n) => n.key === view) || NAV[0]).mod;
  const Brand = () => (<div className="pr-brand"><div className="pr-logo"><BaconMark size={26} /></div><div className="pr-brand-text"><span className="pr-brand-name">BACON</span><span className="pr-brand-tag">research radar</span></div></div>);

  return (
    <div className="pr-app">
      <style>{CSS}</style>
      <div className="pr-scan" aria-hidden="true" />
      {booting && <Boot onDone={() => setBooting(false)} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
      <ChatPanel open={chatOpen} context={chatContext} messages={chatMessages} loading={chatLoading} error={chatError} onSend={(t) => sendChat(t)} onClose={() => setChatOpen(false)} onClear={clearChat} />
      <ChatFab onClick={() => openChat()} hidden={chatOpen || booting} />
      <div className="pr-mobilehead"><Brand /></div>
      <div className="pr-shell">
        <aside className="pr-rail">
          <div className="pr-railbrand"><Brand /></div>
          <nav className="pr-railnav">
            {NAV.map((t, i) => { const Icon = t.icon; return (
              <button key={t.key} className={`pr-railbtn ${view === t.key ? "is-active" : ""}`} onClick={() => setView(t.key)}>
                <span className="pr-railidx">F{i + 1}</span><Icon size={17} /><span className="lbl">{t.name}</span>
                {t.key === "radar" && items.length > 0 && <em className="pr-railcount">{items.length}</em>}
              </button>); })}
          </nav>
          <div className="pr-railfoot">v3.0 · research radar<br />Charts via <a className="pr-foot-link" href="https://www.tradingview.com" target="_blank" rel="noopener noreferrer">TradingView</a><br />Not financial advice.</div>
        </aside>
        <main className="pr-main">
          <div className="pr-head">
            <StatusBar module={moduleLabel} />
            <Console value={cmd} setValue={setCmd} onRun={runCommand} inputRef={cmdRef} log={log} onHistory={doHistory} />
          </div>
          <div className="pr-canvas">
            <div style={{ display: view === "radar" ? "block" : "none" }}><RadarView items={items} setItems={setItems} addTracked={addTracked} themes={themes} setThemes={setThemes} onAnalyze={sendToAnalyze} onLog={pushLog} scoutSignal={scoutSignal} ready={ready} scoutEvery={scoutEvery} setScoutEvery={setScoutEvery} scoutAt={scoutAt} onScouted={() => setScoutAt(Date.now())} onDiscuss={openChat} onAutoSweep={() => setNewsSignal((s) => ({ q: s.q, token: Date.now(), auto: true }))} /></div>
            <div style={{ display: view === "news" ? "block" : "none" }}><NewsView active={view === "news"} signal={newsSignal} onAnalyze={sendToAnalyze} addTracked={addTracked} items={items} onLog={pushLog} onDiscuss={openChat} /></div>
            <div style={{ display: view === "analyze" ? "block" : "none" }}><AnalyzeView target={analyzeTarget} onSave={addTracked} onLog={pushLog} debateSignal={debateSignal} onDiscuss={openChat} /></div>
            <div style={{ display: view === "frameworks" ? "block" : "none" }}><FrameworksView /></div>
            <div style={{ display: view === "sizer" ? "block" : "none" }}><SizerView /></div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ============================== STYLES ============================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
.pr-app *{box-sizing:border-box;margin:0;padding:0}
.pr-app{
  --paper:#EBE8E0; --paper2:#F2F0E9; --card:#F7F5EF; --sink:#E3DFD4;
  --ink:#1A1712; --ink2:#2E2A22; --muted:#6E6658; --muted2:#9A9384;
  --line:#D8D3C6; --line2:#C3BDAD; --gridline:rgba(26,23,18,0.04);
  --accent:#EE4310; --accent2:#CC3608; --good:#1E8E4C; --bad:#CF3B2C; --warn:#B07A12;
  --spectrum:linear-gradient(90deg,#E2685C 0%,#E0A33E 20%,#5FB97E 42%,#38B6C4 62%,#6FA1CE 80%,#9B86E0 100%);
  --fd:'Space Grotesk',system-ui,sans-serif;
  --fb:'IBM Plex Sans',system-ui,sans-serif;
  --fm:'IBM Plex Mono',ui-monospace,monospace;
  font-family:var(--fb); background:var(--paper); color:var(--ink);
  min-height:100vh; line-height:1.55; -webkit-font-smoothing:antialiased; font-size:14px;
}
.pr-app{background:
  linear-gradient(var(--gridline) 1px,transparent 1px),
  linear-gradient(90deg,var(--gridline) 1px,transparent 1px),
  var(--paper);
  background-size:28px 28px,28px 28px;
}
.pr-scan{position:fixed;inset:0;pointer-events:none;z-index:60}
.pr-scan::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--spectrum)}
.pr-spectrum{display:flex;width:100%;overflow:hidden;border:1px solid var(--ink)}
.pr-spectrum span{flex:1}
.pr-prism{color:var(--ink);filter:drop-shadow(0 1px 1px rgba(26,23,18,0.12))}

.pr-shell{display:flex;min-height:100vh}
.pr-rail{width:222px;flex-shrink:0;border-right:1px solid var(--line2);position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:22px 14px;background:var(--paper2)}
.pr-railbrand{padding:0 6px 20px;margin-bottom:6px;border-bottom:1px solid var(--line2)}
.pr-railnav{display:flex;flex-direction:column;gap:3px;flex:1;padding-top:14px}
.pr-railbtn{display:flex;align-items:center;gap:11px;padding:10px 12px;border:none;background:none;color:var(--muted);font-family:var(--fb);font-size:14px;font-weight:500;cursor:pointer;border-radius:7px;transition:all .14s;position:relative;text-align:left;width:100%}
.pr-railbtn:hover{color:var(--ink);background:var(--sink)}
.pr-railbtn.is-active{background:var(--card);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2)}
.pr-railbtn.is-active::before{content:"";position:absolute;left:-14px;top:9px;bottom:9px;width:4px;background:var(--accent)}
.pr-railidx{font-family:var(--fm);font-size:10px;color:var(--muted2);letter-spacing:0.04em;width:18px}
.pr-railbtn.is-active .pr-railidx{color:var(--accent)}
.pr-railbtn .lbl{flex:1;letter-spacing:0.01em}
.pr-railcount{font-style:normal;font-family:var(--fm);font-size:10px;background:var(--accent);color:#fff;border-radius:3px;padding:1px 7px;font-weight:600}
.pr-railfoot{font-family:var(--fm);font-size:9.5px;color:var(--muted2);line-height:1.7;padding:14px 8px 0;border-top:1px solid var(--line2);letter-spacing:0.02em;text-transform:uppercase}
.pr-brand{display:flex;align-items:center;gap:12px}
.pr-logo{width:44px;height:44px;border-radius:9px;background:var(--card);border:1px solid var(--ink);display:flex;align-items:center;justify-content:center}
.pr-brand-text{display:flex;flex-direction:column;line-height:1.05;gap:3px}
.pr-brand-name{font-family:var(--fd);font-weight:700;font-size:21px;letter-spacing:0.02em;background:var(--spectrum);-webkit-background-clip:text;background-clip:text;color:transparent}
.pr-brand-tag{font-family:var(--fm);font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:0.16em}
.pr-mobilehead{display:none}
.pr-main{flex:1;min-width:0;display:flex;flex-direction:column}
.pr-head{position:sticky;top:0;z-index:15;background:var(--paper);border-bottom:1px solid var(--line2)}
.pr-canvas{padding:26px 36px 56px}
.pr-view{animation:prFade .35s ease;max-width:1000px}
@keyframes prFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

.pr-status{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 36px;font-size:11px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.pr-status-mod{display:flex;align-items:center;gap:9px;font-family:var(--fm);letter-spacing:0.1em;color:var(--muted);text-transform:uppercase}
.pr-status-live{width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 0 2px rgba(30,142,76,0.18);animation:prBlink 2.4s ease-in-out infinite}
@keyframes prBlink{0%,100%{opacity:1}50%{opacity:0.4}}
.pr-status-right{display:flex;align-items:center;gap:7px}
.pr-status-tag{font-family:var(--fm);font-size:9.5px;letter-spacing:0.07em;color:var(--muted);border:1px solid var(--line2);border-radius:3px;padding:4px 8px}
.pr-status-tag.is-warn{color:var(--accent);border-color:rgba(238,67,16,0.4)}
.pr-clock{font-family:var(--fm);font-size:12px;color:var(--ink);font-weight:500;letter-spacing:0.04em;display:inline-flex;align-items:baseline;gap:6px}
.pr-clock em{font-style:normal;font-size:9px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.06em}

.pr-cmd{position:relative;display:flex;align-items:center;gap:8px;font-family:var(--fm);font-size:13.5px;padding:12px 36px;cursor:text;white-space:nowrap;overflow:hidden}
.pr-cmd-prompt{color:var(--accent);font-weight:600;letter-spacing:0.08em}
.pr-cmd-arrow{color:var(--accent);margin-right:4px}
.pr-cmd-text{color:var(--ink);white-space:pre}
.pr-cmd-cursor{display:inline-block;color:var(--accent);animation:prCursor 1.05s step-end infinite;margin-left:-2px}
@keyframes prCursor{0%,100%{opacity:1}50%{opacity:0}}
.pr-cmd-hint{color:var(--muted2);margin-left:8px;letter-spacing:0.02em}
.pr-cmd-input{position:absolute;inset:0;width:100%;height:100%;background:transparent;border:none;color:transparent;caret-color:transparent;font:inherit;outline:none;padding:12px 36px;letter-spacing:inherit}
.pr-log{max-height:66px;overflow-y:auto;padding:6px 36px 9px;border-top:1px solid var(--line);font-family:var(--fm);font-size:11.5px;line-height:1.7;display:flex;flex-direction:column;gap:1px}
.pr-log::-webkit-scrollbar{width:6px}
.pr-log::-webkit-scrollbar-thumb{background:var(--line2);border-radius:99px}
.pr-log-line.is-cmd{color:var(--ink)}
.pr-log-line.is-ok{color:var(--good)}
.pr-log-line.is-err{color:var(--bad)}
.pr-log-line.is-sys{color:var(--muted)}

.pr-help-wrap{position:fixed;inset:0;background:rgba(26,23,18,0.4);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;animation:prFade .2s ease}
.pr-help{background:var(--card);border:1px solid var(--ink);border-radius:10px;max-width:600px;width:100%;overflow:hidden;box-shadow:0 24px 60px rgba(26,23,18,0.25)}
.pr-help-head{display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid var(--line2);font-family:var(--fm);font-size:11px;letter-spacing:0.12em;color:var(--accent);text-transform:uppercase}
.pr-help-head button{background:none;border:none;color:var(--muted);cursor:pointer;padding:5px;border-radius:6px}
.pr-help-head button:hover{color:var(--ink);background:var(--sink)}
.pr-help-body{font-family:var(--fm);font-size:12.5px;line-height:1.75;color:var(--ink);padding:20px;white-space:pre;overflow-x:auto}
.pr-help-foot{font-family:var(--fm);font-size:10px;color:var(--muted2);padding:12px 20px;border-top:1px solid var(--line2);text-transform:uppercase;letter-spacing:0.08em}

.pr-boot{position:fixed;inset:0;background:var(--paper);z-index:10001;display:flex;align-items:center;justify-content:center;animation:prFade .25s ease;background-image:linear-gradient(var(--gridline) 1px,transparent 1px),linear-gradient(90deg,var(--gridline) 1px,transparent 1px);background-size:28px 28px,28px 28px}
.pr-boot-inner{width:min(460px,86vw);text-align:center}
.pr-boot-prism{display:flex;justify-content:center;margin-bottom:20px;animation:prRise .7s cubic-bezier(.2,.8,.2,1)}
@keyframes prRise{from{opacity:0;transform:translateY(10px) scale(.92)}to{opacity:1;transform:none}}
.pr-boot-title{font-family:var(--fd);font-weight:700;font-size:26px;letter-spacing:0.02em;background:var(--spectrum);-webkit-background-clip:text;background-clip:text;color:transparent}
.pr-boot-ver{font-family:var(--fm);font-size:11px;color:var(--muted);margin:8px 0 24px;letter-spacing:0.06em}
.pr-boot-log{font-family:var(--fm);font-size:12px;line-height:2;color:var(--muted);min-height:130px;text-align:left;max-width:300px;margin:0 auto}
.pr-boot-line{color:var(--good)}
.pr-boot-cursor{color:var(--accent);animation:prCursor 1s step-end infinite}
.pr-boot-ready{margin-top:16px;font-family:var(--fm);color:var(--accent);font-size:12px;letter-spacing:0.1em;animation:prCursor 1.2s step-end infinite}

.pr-rdr-head{padding:16px 0 30px;max-width:760px}
.pr-rdr-head--split{max-width:1000px;display:flex;align-items:center;gap:40px}
.pr-rdr-head--split .pr-rdr-head-text{flex:1;min-width:0}
.pr-hero-prism{flex-shrink:0}
.pr-hero-eyebrow{font-family:var(--fm);font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--accent);margin-bottom:16px}
.pr-rdr-title,.pr-hero-title{font-family:var(--fd);font-weight:700;font-size:clamp(30px,5vw,50px);line-height:1.04;letter-spacing:-0.02em;color:var(--ink)}
.pr-rdr-honest{color:var(--muted);font-size:14px;line-height:1.65;margin-top:18px;max-width:620px;border-left:3px solid var(--accent);padding-left:15px}

.pr-sec{margin-top:34px;padding-top:26px;border-top:1px solid var(--line2)}
.pr-sec-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.pr-section-title{display:flex;align-items:center;gap:13px;font-family:var(--fd);font-weight:700;font-size:23px;letter-spacing:-0.015em;color:var(--ink);flex:1;min-width:130px}
.pr-section-title::before{content:"";width:14px;height:14px;background:var(--accent);flex-shrink:0}
.pr-section-title::after{content:"";flex:1;height:1px;background:var(--line2)}
.pr-sec-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}

.pr-btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:#fff;border:none;font-family:var(--fb);font-weight:600;font-size:13px;letter-spacing:0.02em;padding:10px 17px;border-radius:7px;cursor:pointer;transition:all .12s;white-space:nowrap;box-shadow:0 2px 0 var(--accent2)}
.pr-btn:hover:not(:disabled){background:#ff5018;transform:translateY(1px);box-shadow:0 1px 0 var(--accent2)}
.pr-btn:disabled{opacity:0.4;cursor:not-allowed;box-shadow:none}
.pr-btn-sm{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line2);color:var(--muted);font-family:var(--fb);font-size:12px;letter-spacing:0.02em;padding:9px 13px;border-radius:7px;cursor:pointer;transition:all .14s}
.pr-btn-sm:hover:not(:disabled){color:var(--ink);border-color:var(--accent)}
.pr-btn-sm:disabled{opacity:0.6;cursor:default}
.pr-btn-ghost{background:var(--card);border:1px solid var(--line2);color:var(--muted);font-family:var(--fb);padding:10px 13px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center}
.pr-spin{animation:prSpin 1s linear infinite}
@keyframes prSpin{to{transform:rotate(360deg)}}
.pr-rot{transform:rotate(90deg)}

.pr-add{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--ink);border-radius:9px;padding:8px 8px 8px 16px;flex-wrap:wrap;margin-bottom:16px}
.pr-add:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(238,67,16,0.14)}
.pr-add-prompt{color:var(--accent);font-family:var(--fm);font-size:17px;line-height:1;flex-shrink:0}
.pr-input{flex:1;min-width:170px;background:none;border:none;color:var(--ink);font-family:var(--fm);font-size:14px;outline:none;letter-spacing:0.01em}
.pr-input::placeholder{color:var(--muted2)}
.pr-select{background:var(--paper2);border:1px solid var(--line2);color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:10px 12px;border-radius:6px;cursor:pointer;outline:none}

.pr-empty{display:flex;flex-direction:column;align-items:center;gap:13px;text-align:center;color:var(--muted);font-size:13px;line-height:1.65;padding:48px 26px;background:var(--paper2);border:1px dashed var(--line2);border-radius:10px}
.pr-empty svg{color:var(--accent)}
.pr-empty strong{color:var(--ink);font-weight:600}

.pr-trk-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(390px,1fr));gap:13px}
.pr-trk{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:16px 18px 16px 20px;position:relative;overflow:hidden;transition:all .14s}
.pr-trk::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--h)}
.pr-trk:hover{border-color:var(--ink);box-shadow:0 3px 0 var(--line2)}
.pr-trk-top{display:flex;align-items:center;gap:11px;margin-bottom:11px;padding-bottom:11px;border-bottom:1px solid var(--line)}
.pr-trk-name{font-family:var(--fm);font-weight:600;font-size:17px;letter-spacing:0.03em;color:var(--ink)}
.pr-trk-class{font-family:var(--fm);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;flex:1}
.pr-trk-lean{font-family:var(--fm);font-size:9.5px;font-weight:500;border:1px solid var(--line2);color:var(--muted);border-radius:3px;padding:3px 9px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap}
.pr-trk-update{font-size:13px;line-height:1.6;color:var(--ink)}
.pr-trk-update.is-muted{color:var(--muted2)}
.pr-trk-update.is-err{color:var(--bad)}
.pr-trk-update.is-scan{color:var(--muted);display:flex;align-items:center;gap:8px}
.pr-trk-reason{color:var(--muted)}
.pr-trk-watch{margin-top:10px;font-size:12px;color:var(--ink2);background:var(--paper2);border:1px solid var(--line);border-radius:6px;padding:8px 11px;line-height:1.55}
.pr-trk-watch span{font-family:var(--fm);color:var(--accent);font-size:9px;letter-spacing:0.06em;margin-right:5px;font-weight:600}
.pr-trk-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap}
.pr-trk-when{font-family:var(--fm);font-size:9.5px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.05em}
.pr-trk-btns{display:flex;gap:5px;flex-wrap:wrap}
.pr-trk-btns button{display:inline-flex;align-items:center;gap:5px;background:var(--paper2);border:1px solid var(--line2);color:var(--muted);font-family:var(--fb);font-size:11px;letter-spacing:0.02em;padding:7px 10px;border-radius:6px;cursor:pointer;transition:all .14s}
.pr-trk-btns button:hover:not(:disabled){color:var(--ink);border-color:var(--accent)}
.pr-trk-btns button:disabled{opacity:0.5;cursor:default}
.pr-trk-btns button.is-danger:hover{color:var(--bad);border-color:var(--bad)}
.pr-trk-expand{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}

.pr-scout-themes{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pr-scout-lbl{font-family:var(--fm);font-size:9.5px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.1em;margin-right:2px}
.pr-theme{display:inline-flex;align-items:center;gap:7px;background:var(--paper2);border:1px solid var(--line2);color:var(--ink);font-size:12.5px;padding:6px 7px 6px 12px;border-radius:4px}
.pr-theme button{background:none;border:none;color:var(--muted);cursor:pointer;display:flex;padding:2px;border-radius:3px}
.pr-theme button:hover{color:var(--bad)}
.pr-theme-add input{background:var(--card);border:1px dashed var(--line2);color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:7px 12px;border-radius:4px;outline:none;width:140px}
.pr-theme-add input:focus{border-color:var(--accent);border-style:solid}
.pr-theme-add input::placeholder{color:var(--muted2)}
.pr-theme-sugg{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.pr-chip{background:var(--card);border:1px solid var(--line2);color:var(--muted);font-family:var(--fb);font-size:12.5px;padding:7px 13px;border-radius:4px;cursor:pointer;transition:all .14s}
.pr-chip:hover{color:var(--ink);border-color:var(--accent)}

.pr-summary{font-size:14px;line-height:1.7;color:var(--ink);margin:16px 0 18px;padding-left:16px;border-left:3px solid;border-image:var(--spectrum) 1}
.pr-pick-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:13px;margin-top:2px}
.pr-pick{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:17px 18px;display:flex;flex-direction:column;transition:all .14s}
.pr-pick:hover{border-color:var(--ink);box-shadow:0 3px 0 var(--line2)}
.pr-pick-head{display:flex;align-items:flex-start;justify-content:space-between;gap:9px;margin-bottom:11px;padding-bottom:11px;border-bottom:1px solid var(--line)}
.pr-pick-name{font-family:var(--fd);font-weight:700;font-size:16px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;color:var(--ink)}
.pr-pick-ticker{font-family:var(--fm);font-size:11px;color:var(--accent);background:rgba(238,67,16,0.1);border:1px solid rgba(238,67,16,0.3);padding:2px 7px;border-radius:3px}
.pr-pick-class{font-family:var(--fm);font-size:9.5px;color:var(--muted);white-space:nowrap;text-transform:uppercase;letter-spacing:0.05em}
.pr-pick-why{font-size:13px;color:var(--ink);line-height:1.6;margin-bottom:11px}
.pr-pick-now{font-size:12px;color:var(--ink);background:var(--paper2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:5px;padding:9px 11px;line-height:1.5;margin-bottom:9px}
.pr-pick-now span{font-family:var(--fm);color:var(--accent);font-size:9px;letter-spacing:0.06em;margin-right:5px;font-weight:600}
.pr-pick-check{font-size:12px;color:var(--muted);line-height:1.55;margin-bottom:14px}
.pr-pick-check span{font-family:var(--fm);font-size:9px;letter-spacing:0.06em;color:var(--muted2);margin-right:5px;font-weight:600}
.pr-pick-actions{margin-top:auto;display:flex;gap:8px}
.pr-pick-track{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--accent);color:#fff;border:none;font-family:var(--fb);font-size:12px;font-weight:600;letter-spacing:0.02em;padding:10px;border-radius:6px;cursor:pointer;transition:all .12s;box-shadow:0 2px 0 var(--accent2)}
.pr-pick-track:hover:not(:disabled){background:#ff5018;transform:translateY(1px);box-shadow:0 1px 0 var(--accent2)}
.pr-pick-track.is-on{background:var(--card);color:var(--good);border:1px solid rgba(30,142,76,0.45);cursor:default;box-shadow:none}
.pr-pick-lenses{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--card);border:1px solid var(--line2);color:var(--ink);font-family:var(--fb);font-size:12px;font-weight:500;letter-spacing:0.02em;padding:10px;border-radius:6px;cursor:pointer;transition:all .14s}
.pr-pick-lenses:hover{border-color:var(--accent)}

.pr-auto{display:inline-flex;align-items:center;gap:9px}
.pr-auto-lbl{font-family:var(--fm);font-size:9.5px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap}
.pr-auto-lbl.is-on{color:var(--accent)}
.pr-auto-sel{background:var(--card);border:1px solid var(--line2);color:var(--ink);font-family:var(--fm);font-size:11px;letter-spacing:0.04em;padding:9px 11px;border-radius:6px;cursor:pointer;outline:none;text-transform:uppercase}
.pr-auto-sel:focus{border-color:var(--accent)}
.pr-auto-note{font-family:var(--fm);font-size:10px;color:var(--muted2);line-height:1.5;margin:0 0 14px}

.pr-sec-flush{border-top:none;margin-top:6px;padding-top:0}
.pr-add-news{margin-top:11px}
.pr-src-row{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--line2);border-radius:6px;overflow:hidden;width:fit-content;max-width:100%}
.pr-src{background:var(--card);border:none;border-right:1px solid var(--line2);color:var(--muted);font-family:var(--fm);font-size:11px;letter-spacing:0.03em;padding:8px 13px;cursor:pointer;transition:all .14s;text-transform:uppercase}
.pr-src:last-child{border-right:none}
.pr-src:hover{color:var(--ink);background:var(--sink)}
.pr-src.is-on{color:#fff;background:var(--accent)}
.pr-news-list{display:flex;flex-direction:column;gap:11px;margin-top:14px}
.pr-news{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:15px 18px;position:relative;overflow:hidden;transition:all .14s}
.pr-news::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent);opacity:0;transition:opacity .14s}
.pr-news:hover{border-color:var(--ink)}
.pr-news:hover::before{opacity:1}
.pr-news-meta{display:flex;align-items:center;gap:9px;margin-bottom:8px;flex-wrap:wrap}
.pr-news-src{font-family:var(--fm);font-size:9.5px;font-weight:600;letter-spacing:0.1em;color:var(--accent);text-transform:uppercase}
.pr-news-sig{font-family:var(--fm);font-size:9px;letter-spacing:0.05em;color:var(--muted);border:1px solid var(--line2);border-radius:3px;padding:2px 8px;text-transform:uppercase}
.pr-news-when{font-family:var(--fm);font-size:9.5px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.05em}
.pr-news-head{font-family:var(--fd);font-size:16px;line-height:1.35;color:var(--ink);font-weight:600;letter-spacing:-0.01em}
.pr-news-why{font-size:12.5px;color:var(--muted);line-height:1.6;margin-top:6px}
.pr-news-actions{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.pr-news-tk{font-family:var(--fm);font-size:11px;color:var(--accent);background:rgba(238,67,16,0.1);border:1px solid rgba(238,67,16,0.3);padding:3px 9px;border-radius:3px;letter-spacing:0.04em}
.pr-news-dd{display:inline-flex;align-items:center;gap:6px;background:var(--accent);border:none;color:#fff;font-family:var(--fb);font-size:11.5px;font-weight:600;letter-spacing:0.02em;padding:8px 13px;border-radius:6px;cursor:pointer;transition:all .12s;box-shadow:0 2px 0 var(--accent2)}
.pr-news-dd:hover{background:#ff5018;transform:translateY(1px);box-shadow:0 1px 0 var(--accent2)}
.pr-news-tr{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--card);border:1px solid var(--line2);color:var(--muted);border-radius:6px;cursor:pointer;transition:all .14s}
.pr-news-tr:hover:not(:disabled){color:var(--accent);border-color:var(--accent)}
.pr-news-tr.is-on{color:var(--good);border-color:rgba(30,142,76,0.45);cursor:default}
.pr-news-macro{font-family:var(--fm);font-size:10.5px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.05em}

.pr-hero{padding:16px 0 30px;max-width:720px}
.pr-hero-spectrum{margin:22px 0;max-width:360px}
.pr-hero-sub{color:var(--muted);font-size:14px;line-height:1.7;max-width:620px}
.pr-command{margin:8px 0 4px}
.pr-command-row{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--ink);border-radius:9px;padding:8px 8px 8px 16px;flex-wrap:wrap}
.pr-command-row:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px rgba(238,67,16,0.14)}
.pr-command-prompt{font-family:var(--fm);font-size:17px;color:var(--accent);flex-shrink:0;line-height:1}
.pr-command-hint{font-family:var(--fm);font-size:10.5px;color:var(--muted2);margin:9px 0 0 3px;letter-spacing:0.02em}

.pr-loading{margin:30px 0;text-align:center}
.pr-loading-lenses{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-bottom:18px}
.pr-loading-lens{display:flex;align-items:center;gap:8px;font-family:var(--fm);font-size:11px;color:var(--muted);padding:8px 13px;border:1px solid var(--line2);border-radius:4px;background:var(--card);animation:prPulse 1.6s ease-in-out infinite;letter-spacing:0.06em}
@keyframes prPulse{0%,100%{opacity:0.45}50%{opacity:1}}
.pr-loading-dot{width:8px;height:8px;border-radius:50%}
.pr-loading-text{color:var(--muted);font-size:14px}
.pr-error{display:flex;gap:13px;align-items:flex-start;background:rgba(207,59,44,0.07);border:1px solid rgba(207,59,44,0.35);border-radius:9px;padding:16px 18px;margin-top:18px;color:var(--bad)}
.pr-error strong{color:var(--ink);font-weight:600}
.pr-error-detail{color:var(--muted);font-size:13px;margin-top:3px}

.pr-result{margin-top:24px;animation:prFade .4s ease}
.pr-raw{white-space:pre-wrap;font-family:var(--fm);font-size:13.5px;color:var(--ink);background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:22px;line-height:1.7}
.pr-readout{display:flex;align-items:stretch;gap:20px;background:var(--card);border:1px solid var(--ink);border-radius:10px;padding:20px 22px;flex-wrap:wrap;position:relative;overflow:hidden}
.pr-readout::before{content:"";position:absolute;top:0;left:0;right:0;height:4px;background:var(--accent)}
.pr-readout-id{flex:1;min-width:170px;display:flex;flex-direction:column;justify-content:center}
.pr-readout-ticker{font-family:var(--fm);font-weight:600;font-size:32px;letter-spacing:0.04em;line-height:1;color:var(--ink)}
.pr-readout-sub{font-family:var(--fm);font-size:11px;color:var(--muted);margin-top:8px;letter-spacing:0.02em;text-transform:uppercase}
.pr-readout-sep{margin:0 8px;color:var(--muted2)}
.pr-readout-lean{padding:0 20px;border-left:1px solid var(--line2);display:flex;flex-direction:column;justify-content:center;min-width:190px}
.pr-readout-leanlabel{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted);margin-bottom:6px}
.pr-readout-leanval{font-family:var(--fd);font-weight:700;font-size:21px;letter-spacing:-0.01em}
.pr-readout-leannote{font-family:var(--fm);font-size:9.5px;color:var(--muted2);margin-top:6px;line-height:1.4}
.pr-readout-save{align-self:center;background:var(--card);border:1px solid var(--line2);color:var(--muted);cursor:pointer;width:42px;height:42px;border-radius:7px;display:flex;align-items:center;justify-content:center;transition:all .14s;flex-shrink:0}
.pr-readout-save:hover:not(:disabled){color:var(--accent);border-color:var(--accent)}
.pr-readout-save.is-saved{color:var(--accent);border-color:rgba(238,67,16,0.5)}
.pr-readout-save:disabled{cursor:default}
.pr-subnav{display:flex;gap:6px;margin:20px 0 8px;border-bottom:1px solid var(--line2)}
.pr-subnav-btn{display:inline-flex;align-items:center;gap:7px;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);font-family:var(--fb);font-size:13px;font-weight:500;letter-spacing:0.02em;padding:11px 14px;cursor:pointer;transition:all .14s;margin-bottom:-1px}
.pr-subnav-btn:hover{color:var(--ink)}
.pr-subnav-btn.is-active{color:var(--accent);border-bottom-color:var(--accent)}

.pr-cluster{display:flex;gap:0;background:var(--card);border:1px solid var(--line2);border-radius:9px;margin:18px 0 20px;overflow:hidden;flex-wrap:wrap}
.pr-cluster-gauge{flex:1;min-width:270px;padding:18px 20px;border-right:1px solid var(--line2)}
.pr-cluster-bank{flex:1;min-width:250px;padding:18px 20px;display:flex;flex-direction:column}
.pr-cluster-cap{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.12em;color:var(--muted2);margin-bottom:12px}
.pr-radar{width:100%;height:auto;overflow:visible;max-width:320px;margin:0 auto;display:block}
.pr-radar-ring{fill:none;stroke:rgba(26,23,18,0.14);stroke-width:1}
.pr-radar-axis{stroke:rgba(26,23,18,0.13);stroke-width:1}
.pr-radar-poly{fill:rgba(238,67,16,0.12);stroke:var(--accent);stroke-width:2;stroke-linejoin:round}
.pr-radar-label{font-family:var(--fm);font-size:10px;font-weight:500;text-transform:uppercase;fill:var(--muted) !important}
.pr-led-list{display:flex;flex-direction:column;gap:2px}
.pr-led-row{display:flex;align-items:center;gap:11px;font-size:13px;padding:8px 0;border-bottom:1px solid var(--line)}
.pr-led-row:last-child{border-bottom:none}
.pr-led{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.pr-led-name{color:var(--ink);flex:1;font-size:13px}
.pr-led-stance{font-family:var(--fm);font-size:10.5px;font-weight:600;letter-spacing:0.03em;text-transform:uppercase}
.pr-cluster-note{font-family:var(--fm);font-size:10px;color:var(--muted2);line-height:1.55;margin-top:auto;padding-top:14px}

.pr-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.pr-panel{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:16px 18px 16px 20px;display:flex;flex-direction:column;position:relative;overflow:hidden;transition:all .14s}
.pr-panel::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--h)}
.pr-panel:hover{border-color:var(--ink)}
.pr-panel-top{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:11px;border-bottom:1px solid var(--line)}
.pr-panel-idx{font-family:var(--fm);font-size:10px;color:var(--muted2);letter-spacing:0.05em}
.pr-panel-name{font-family:var(--fd);font-weight:700;font-size:15px;flex:1;letter-spacing:-0.01em;color:color-mix(in srgb,var(--h) 55%,var(--ink)) !important}
.pr-panel-stance{font-family:var(--fm);font-size:9px;font-weight:600;border:1px solid;border-radius:3px;padding:3px 8px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap}
.pr-panel-body{font-size:13px;line-height:1.65;color:var(--ink)}
.pr-panel-verify{margin-top:12px;font-size:11.5px;color:var(--muted);background:var(--paper2);border:1px solid var(--line);border-radius:6px;padding:9px 11px;line-height:1.5}
.pr-panel-verify span{font-family:var(--fm);font-size:9px;letter-spacing:0.06em;margin-right:5px;font-weight:600}
.pr-bottomline{margin-top:20px;background:var(--paper2);border:1px solid var(--line2);border-left:4px solid var(--accent);border-radius:8px;padding:20px 22px;font-size:14px;line-height:1.7;color:var(--ink)}
.pr-bottomline-label{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.12em;color:var(--accent);margin-bottom:9px}
.pr-disclaimer{margin-top:18px;font-family:var(--fm);font-size:10.5px;color:var(--muted2);line-height:1.65}

.pr-debate{margin-top:8px}
.pr-debate-cols{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.pr-debate-card{border:1px solid var(--line2);border-radius:9px;padding:20px;background:var(--card);position:relative;overflow:hidden}
.pr-debate-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px}
.pr-debate-card.is-bull::before{background:var(--good)}
.pr-debate-card.is-bear::before{background:var(--bad)}
.pr-debate-head{display:flex;align-items:center;gap:9px;font-family:var(--fd);font-weight:700;font-size:14px;letter-spacing:-0.01em;margin-bottom:14px}
.pr-debate-card.is-bull .pr-debate-head{color:var(--good)}
.pr-debate-card.is-bear .pr-debate-head{color:var(--bad)}
.pr-debate-card ul{list-style:none}
.pr-debate-card li{position:relative;padding-left:18px;font-size:13px;line-height:1.62;color:var(--ink);margin-bottom:11px}
.pr-debate-card li::before{content:"";position:absolute;left:2px;top:8px;width:6px;height:6px;border-radius:50%;background:currentColor;opacity:0.5}

.pr-wl-sub{color:var(--muted);font-size:13px;line-height:1.65;max-width:560px;margin-top:8px}
.pr-wl-label{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);display:block;margin-bottom:8px}
.pr-textarea{width:100%;background:var(--paper2);border:1px solid var(--line2);border-radius:7px;color:var(--ink);font-family:var(--fb);font-size:13px;padding:11px 13px;resize:vertical;outline:none;line-height:1.55}
.pr-textarea:focus,.pr-wl-note:focus{border-color:var(--accent)}
.pr-textarea::placeholder,.pr-wl-note::placeholder{color:var(--muted2)}
.pr-wl-conviction{display:flex;align-items:center;gap:12px;margin:14px 0}
.pr-conviction-dots{display:flex;gap:7px}
.pr-conviction-dot{width:17px;height:17px;border-radius:50%;border:1.5px solid var(--line2);background:none;cursor:pointer;transition:all .14s;padding:0}
.pr-conviction-dot.is-on{background:var(--accent);border-color:var(--accent)}
.pr-conviction-val{font-family:var(--fm);font-size:11.5px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:0.03em}
.pr-wl-note{width:100%;background:var(--paper2);border:1px solid var(--line2);border-radius:7px;color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:10px 13px;outline:none}

.pr-fw-intro{margin-bottom:26px;max-width:720px}
.pr-fw-spectrum{margin:18px 0;max-width:320px}
.pr-fw-philosophy{color:var(--muted);font-size:14px;line-height:1.75}
.pr-fw-list{display:flex;flex-direction:column;gap:11px}
.pr-fw-card{background:var(--card);border:1px solid var(--line2);border-radius:9px;overflow:hidden;transition:border-color .2s}
.pr-fw-card.is-open{border-color:var(--ink)}
.pr-fw-card-head{width:100%;display:flex;align-items:center;gap:13px;padding:17px 20px;border:none;background:none;color:var(--ink);font-family:var(--fb);cursor:pointer;text-align:left}
.pr-fw-dot{width:12px;height:12px;flex-shrink:0}
.pr-fw-name{font-family:var(--fd);font-weight:700;font-size:16px;flex-shrink:0;letter-spacing:-0.01em}
.pr-fw-summary{color:var(--muted);font-size:12.5px;flex:1;min-width:0}
.pr-fw-chev{color:var(--muted);transition:transform .25s;flex-shrink:0}
.pr-fw-chev.is-open{transform:rotate(180deg)}
.pr-fw-body{padding:2px 20px 22px;animation:prFade .3s ease}
.pr-fw-plays{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-bottom:18px}
.pr-fw-play{background:var(--paper2);border:1px solid var(--line);border-radius:7px;padding:14px 15px}
.pr-fw-play-h{font-weight:600;font-size:13.5px;color:color-mix(in srgb,var(--h) 58%,var(--ink));margin-bottom:6px}
.pr-fw-play-p{font-size:12.5px;color:var(--muted);line-height:1.65}
.pr-fw-terms{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px}
.pr-fw-term{font-family:var(--fm);font-size:11px;color:var(--ink);background:var(--paper2);border:1px solid var(--line2);border-radius:3px;padding:5px 11px}
.pr-fw-caveat{display:flex;align-items:flex-start;gap:10px;font-size:13px;color:var(--ink);background:color-mix(in srgb,var(--h) 12%,var(--paper));border:1px solid color-mix(in srgb,var(--h) 34%,transparent);border-radius:8px;padding:13px 15px;line-height:1.65}
.pr-fw-caveat svg{color:color-mix(in srgb,var(--h) 55%,var(--ink));flex-shrink:0;margin-top:2px}

.pr-sz-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap}
.pr-sz-modes{display:flex;gap:9px;margin-bottom:22px;flex-wrap:wrap}
.pr-sz-mode{display:flex;flex-direction:column;gap:3px;align-items:flex-start;background:var(--card);border:1px solid var(--line2);color:var(--ink);font-family:var(--fd);font-weight:700;font-size:15px;letter-spacing:-0.01em;padding:14px 20px;border-radius:8px;cursor:pointer;transition:all .14s}
.pr-sz-mode span{font-family:var(--fm);font-weight:400;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em}
.pr-sz-mode.is-active{border-color:var(--accent);background:rgba(238,67,16,0.07)}
.pr-sz-panel{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:24px;animation:prFade .3s ease}
.pr-sz-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin-bottom:24px}
.pr-field{display:flex;flex-direction:column;gap:9px}
.pr-field-label{font-size:12.5px;color:var(--muted);display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.pr-field-label em{font-family:var(--fm);font-style:normal;font-size:10px;color:var(--muted2)}
.pr-field-input{display:flex;align-items:center;background:var(--paper2);border:1px solid var(--line2);border-radius:7px;overflow:hidden}
.pr-field-input:focus-within{border-color:var(--accent)}
.pr-field-input input{flex:1;background:none;border:none;color:var(--ink);font-family:var(--fm);font-size:16px;padding:12px 14px;outline:none;width:100%}
.pr-field-suffix{font-family:var(--fm);font-size:13px;color:var(--muted);padding:0 15px}
.pr-sz-out{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:11px;margin-bottom:18px}
.pr-out{background:var(--paper2);border:1px solid var(--line2);border-radius:7px;padding:15px 16px}
.pr-out.is-accent{border-color:rgba(238,67,16,0.4);background:rgba(238,67,16,0.07)}
.pr-out.is-warn{border-color:rgba(207,59,44,0.4);background:rgba(207,59,44,0.06)}
.pr-out-label{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted);margin-bottom:8px}
.pr-out-value{font-family:var(--fm);font-weight:600;font-size:21px;color:var(--ink)}
.pr-out.is-accent .pr-out-value{color:var(--accent)}
.pr-out.is-warn .pr-out-value{color:var(--bad)}
.pr-sz-warn{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--bad);background:rgba(207,59,44,0.07);border:1px solid rgba(207,59,44,0.25);border-radius:7px;padding:12px 15px;margin-bottom:16px}
.pr-sz-note{font-size:13px;color:var(--muted);line-height:1.75;border-top:1px solid var(--line);padding-top:16px}

@media (max-width:880px){
  .pr-shell{display:block}
  .pr-rail{position:fixed;bottom:0;left:0;right:0;top:auto;width:auto;height:auto;flex-direction:row;border-right:none;border-top:1px solid var(--line2);padding:7px;gap:3px;z-index:30;background:var(--paper2)}
  .pr-railbrand,.pr-railfoot{display:none}
  .pr-railnav{flex-direction:row;justify-content:space-around;padding-top:0;gap:3px}
  .pr-railbtn{flex-direction:column;gap:4px;padding:8px 5px;font-size:10px;border-radius:6px}
  .pr-railidx{display:none}
  .pr-railbtn .lbl{font-size:10px}
  .pr-railbtn.is-active::before{display:none}
  .pr-railcount{position:absolute;top:3px;right:14px}
  .pr-mobilehead{display:flex;align-items:center;padding:13px 18px;border-bottom:1px solid var(--line2);position:sticky;top:0;z-index:25;background:var(--paper)}
  .pr-head{position:static}
  .pr-status{padding:9px 18px}
  .pr-cmd{padding:11px 18px}
  .pr-cmd-input{padding:11px 18px}
  .pr-log{padding:6px 18px 8px;max-height:50px}
  .pr-canvas{padding:20px 18px 100px}
  .pr-rdr-head--split{flex-direction:column;align-items:flex-start;gap:20px}
  .pr-hero-prism{align-self:center}
  .pr-hero-prism .pr-prism{width:96px;height:96px}
  .pr-trk-list{grid-template-columns:1fr}
  .pr-grid{grid-template-columns:1fr}
  .pr-cluster-gauge{border-right:none;border-bottom:1px solid var(--line2)}
  .pr-fw-plays{grid-template-columns:1fr}
  .pr-debate-cols{grid-template-columns:1fr}
  .pr-readout-lean{border-left:none;padding-left:0;padding-top:14px;border-top:1px solid var(--line2);width:100%}
}
@media (prefers-reduced-motion:reduce){.pr-view,.pr-result,.pr-fw-body,.pr-sz-panel,.pr-boot-prism{animation:none}.pr-loading-lens,.pr-spin,.pr-status-live,.pr-cmd-cursor,.pr-boot-cursor,.pr-boot-ready{animation:none}}
.pr-readout-discuss{align-self:center;background:var(--card);border:1px solid var(--line2);color:var(--muted);cursor:pointer;width:42px;height:42px;border-radius:7px;display:flex;align-items:center;justify-content:center;transition:all .14s;flex-shrink:0}
.pr-readout-discuss:hover{color:var(--accent);border-color:var(--accent)}
.pr-news-discuss{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:var(--card);border:1px solid var(--line2);color:var(--muted);border-radius:6px;cursor:pointer;transition:all .14s}
.pr-news-discuss:hover{color:var(--accent);border-color:var(--accent)}
.pr-tv{display:inline-flex;align-items:center;gap:5px;background:var(--paper2);border:1px solid var(--line2);color:var(--muted);font-family:var(--fb);font-size:11px;letter-spacing:0.02em;padding:7px 10px;border-radius:6px;cursor:pointer;text-decoration:none;transition:all .14s}
.pr-tv:hover{color:var(--accent);border-color:var(--accent)}
.pr-tv svg{flex-shrink:0}
.pr-readout-tv{align-self:center;background:var(--card);border:1px solid var(--line2);color:var(--muted);cursor:pointer;width:42px;height:42px;border-radius:7px;display:flex;align-items:center;justify-content:center;transition:all .14s;flex-shrink:0;text-decoration:none}
.pr-readout-tv:hover{color:var(--accent);border-color:var(--accent)}
.pr-foot-link{color:var(--accent);text-decoration:none}
.pr-foot-link:hover{text-decoration:underline}

.pr-fab{position:fixed;right:26px;bottom:26px;z-index:40;display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;border:none;font-family:var(--fb);font-weight:600;font-size:13px;padding:13px 18px;border-radius:99px;cursor:pointer;box-shadow:0 8px 22px rgba(238,67,16,0.4),0 2px 0 var(--accent2);transition:all .15s}
.pr-fab:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(238,67,16,0.5),0 2px 0 var(--accent2)}
.pr-chat-wrap{position:fixed;inset:0;z-index:9000;display:flex;justify-content:flex-end;background:rgba(26,23,18,0.35);backdrop-filter:blur(3px);animation:prFade .2s ease}
.pr-chat{width:min(420px,100%);height:100%;background:var(--paper);border-left:1px solid var(--ink);display:flex;flex-direction:column;box-shadow:-22px 0 60px rgba(26,23,18,0.22);animation:prSlideIn .28s cubic-bezier(.2,.8,.2,1)}
@keyframes prSlideIn{from{transform:translateX(34px);opacity:0}to{transform:none;opacity:1}}
.pr-chat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;border-bottom:1px solid var(--line2);background:var(--paper2)}
.pr-chat-ctx{display:flex;align-items:center;gap:11px;min-width:0}
.pr-chat-ctx-dot{width:9px;height:9px;border-radius:50%;background:var(--accent);flex-shrink:0;box-shadow:0 0 0 3px rgba(238,67,16,0.16)}
.pr-chat-ctx-text{min-width:0}
.pr-chat-ctx-title{font-family:var(--fd);font-weight:700;font-size:15px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr-chat-ctx-sub{font-family:var(--fm);font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em}
.pr-chat-head-btns{display:flex;align-items:center;gap:6px;flex-shrink:0}
.pr-chat-clear{display:inline-flex;align-items:center;gap:4px;background:var(--card);border:1px solid var(--line2);color:var(--muted);font-family:var(--fb);font-size:11px;padding:6px 9px;border-radius:6px;cursor:pointer}
.pr-chat-clear:hover{color:var(--ink);border-color:var(--accent)}
.pr-chat-x{background:none;border:none;color:var(--muted);cursor:pointer;padding:5px;border-radius:6px;display:flex}
.pr-chat-x:hover{color:var(--ink);background:var(--sink)}
.pr-chat-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:13px}
.pr-chat-body::-webkit-scrollbar{width:7px}
.pr-chat-body::-webkit-scrollbar-thumb{background:var(--line2);border-radius:99px}
.pr-chat-intro{text-align:center;padding:22px 6px;display:flex;flex-direction:column;align-items:center;gap:9px}
.pr-chat-intro .pr-prism{color:var(--ink)}
.pr-chat-intro-title{font-family:var(--fd);font-weight:700;font-size:19px;color:var(--ink);margin-top:4px}
.pr-chat-intro-sub{font-size:12.5px;color:var(--muted);line-height:1.6;max-width:300px}
.pr-chat-starters{display:flex;flex-direction:column;gap:8px;width:100%;margin-top:10px}
.pr-chat-starter{text-align:left;background:var(--card);border:1px solid var(--line2);color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:11px 13px;border-radius:8px;cursor:pointer;transition:all .14s;line-height:1.4}
.pr-chat-starter:hover{border-color:var(--accent);background:var(--paper2)}
.pr-msg{display:flex;flex-direction:column;gap:4px;max-width:90%}
.pr-msg.is-user{align-self:flex-end;align-items:flex-end}
.pr-msg.is-assistant{align-self:flex-start}
.pr-msg-who{font-family:var(--fm);font-size:9px;letter-spacing:0.1em;color:var(--accent);text-transform:uppercase;padding-left:2px}
.pr-msg-body{font-size:13px;line-height:1.64;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}
.pr-msg.is-user .pr-msg-body{background:var(--ink);color:var(--paper);padding:10px 13px;border-radius:13px 13px 4px 13px}
.pr-msg.is-assistant .pr-msg-body{background:var(--card);border:1px solid var(--line2);color:var(--ink);padding:11px 14px;border-radius:4px 13px 13px 13px}
.pr-msg-typing{display:flex;gap:5px;align-items:center;padding:13px 14px !important}
.pr-msg-typing span{width:6px;height:6px;border-radius:50%;background:var(--muted2);animation:prType 1.2s ease-in-out infinite}
.pr-msg-typing span:nth-child(2){animation-delay:.16s}
.pr-msg-typing span:nth-child(3){animation-delay:.32s}
@keyframes prType{0%,60%,100%{opacity:0.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
.pr-chat-err{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--bad);background:rgba(207,59,44,0.07);border:1px solid rgba(207,59,44,0.25);border-radius:8px;padding:9px 12px}
.pr-chat-input{display:flex;align-items:flex-end;gap:8px;padding:12px 14px;border-top:1px solid var(--line2);background:var(--paper2)}
.pr-chat-input textarea{flex:1;background:var(--card);border:1px solid var(--line2);border-radius:9px;color:var(--ink);font-family:var(--fb);font-size:13px;padding:10px 12px;outline:none;resize:none;max-height:120px;line-height:1.5}
.pr-chat-input textarea:focus{border-color:var(--accent)}
.pr-chat-input textarea::placeholder{color:var(--muted2)}
.pr-chat-send{flex-shrink:0;width:38px;height:38px;background:var(--accent);border:none;color:#fff;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 0 var(--accent2);transition:all .12s}
.pr-chat-send:hover:not(:disabled){background:#ff5018;transform:translateY(1px);box-shadow:0 1px 0 var(--accent2)}
.pr-chat-send:disabled{opacity:0.4;cursor:not-allowed;box-shadow:none}
.pr-chat-foot{font-family:var(--fm);font-size:9px;color:var(--muted2);text-align:center;padding:8px;border-top:1px solid var(--line);text-transform:uppercase;letter-spacing:0.06em}
@media (max-width:880px){
  .pr-chat{width:100%;border-left:none}
  .pr-fab{right:16px;bottom:84px;padding:12px 16px}
}

.pr-app button:focus-visible,.pr-app input:focus-visible,.pr-app select:focus-visible,.pr-app textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`;
