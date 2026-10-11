// Chat context: what the user is looking at when they open the chat, and the
// starter questions for it. Kept apart from lib/prompts on purpose — the chat
// sheet and the app shell need these in the BROWSER, and importing them from
// lib/prompts shipped every system prompt (~35 KB of the product's prompt
// engineering) to every client.

export type ChatKind = "asset" | "tracked" | "radar" | "news" | "news-feed" | "frameworks" | "sizing" | "general";

export interface ChatContext {
  kind: ChatKind;
  asset?: string;
  cls?: string;
  thesis?: string;
  update?: string;
  assets?: string[];
  headline?: string;
  ticker?: string;
  title?: string;
  sub?: string;
  notes?: string; // grounding from what the user is viewing (e.g. the lens read)
}

interface DeriveTarget { asset?: string; cls?: string }
interface DeriveItem { asset: string }

export function deriveContext(view: string, target: DeriveTarget | null, items: DeriveItem[] | null): ChatContext {
  if (view === "analyze" && target && target.asset) return { kind: "asset", asset: target.asset, cls: target.cls, title: String(target.asset).toUpperCase(), sub: `multi-lens analysis${target.cls ? " · " + target.cls : ""}` };
  if (view === "news") return { kind: "news-feed", title: "Market headlines", sub: "news discussion" };
  if (view === "radar" && items && items.length) return { kind: "radar", title: "Your radar", sub: `${items.length} tracked`, assets: items.map((i) => i.asset) };
  return { kind: "general", title: "Markets & research", sub: "open discussion" };
}

export function chatStarters(ctx: ChatContext | null): string[] {
  switch (ctx && ctx.kind) {
    case "asset": return ["What's the strongest bull and bear case?", "What would break this thesis?", "What should I verify first?", "How do the lenses line up here?"];
    case "tracked": return ["What's changed recently that matters?", "What's the next catalyst to watch?", "What would make me wrong?", "Give me the bull vs bear in brief."];
    case "radar": return ["Where might I be over-concentrated?", "Which name has the most event risk soon?", "What themes connect these?", "Which deserves a deeper look first?"];
    case "news": return ["What does this actually mean for the stock?", "Is this likely already priced in?", "What should I verify before acting?", "Who else does this affect?"];
    case "news-feed": return ["What's the most important headline right now?", "Anything today worth a deep dive?", "What's been the market reaction?"];
    case "frameworks": return ["How do I combine these lenses in practice?", "Which lens matters most for FX?", "When lenses disagree, what then?"];
    case "sizing": return ["How should I size a moderate-conviction idea?", "Why use fractional Kelly?", "How does correlation change my sizing?"];
    default: return ["What should I be watching in markets now?", "Help me build a research process.", "Explain convergence across the lenses."];
  }
}
