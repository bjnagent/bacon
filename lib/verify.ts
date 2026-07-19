// The verification gate — bacon's "no fabricated numbers" rule, enforced after
// the fact instead of trusted to the prompt. It scans generated text for HARD
// figures (prices, %, multiples, targets) and flags the ones that don't cite a
// source nearby, turning the blanket "verify yourself" disclaimer into concrete,
// per-figure pointers.
//
// Deliberately a SURFACED check, not a silent hard block: output streams to the
// UI, and much of it is web-grounded with the attribution in prose — a hard
// block would nuke legitimate figures. Framed as "figures to verify", an
// over-eager flag is still useful (verify it) rather than wrong.

export interface FigureFlag {
  figure: string;   // the matched figure, e.g. "$450", "30x", "12.5%"
  snippet: string;  // the sentence it appeared in (trimmed)
}

export interface FigureAudit {
  total: number;             // hard figures found
  cited: number;             // figures in a sentence that names a source
  estimates: number;         // figures in a sentence that declares itself an estimate/scenario/target
  flagged: FigureFlag[];     // hard figures with neither a source nor an estimate label
}

// A "hard figure" is the kind bacon bans inventing: a currency amount/target, a
// percentage stated as fact, or a valuation multiple. Plain integers, years, and
// MA-period labels ("200-day") deliberately don't match.
const FIGURE_RE = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:trillion|billion|million|bn|tn|[mk])?\b|\d[\d,]*(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?[x×]\b|\bP\/?E\s+of\s+\d+(?:\.\d+)?/gi;

// A sentence "cites a source" if it names WHERE the number comes from — a
// publication, a filing, a disclosure verb, or a real data provider bacon uses.
// Deliberately excludes metric words like "earnings"/"margin": naming what a
// number measures is not the same as sourcing it.
const CITE_RE = /\b(via|per|according to|reported|reports|reporting|sources?|cited?|Reuters|Bloomberg|CNBC|WSJ|FT|SEC|EDGAR|FRED|Form ?4|10-?[KQ]|8-?K|filing|filings|consensus|analysts?|Street|press release|disclosed|disclosure|prospectus|as reported|as of)\b/i;

// Bacon now makes forward calls: a figure whose sentence DECLARES itself an
// estimate / scenario / target is an opinion, not a fact needing a source —
// counted separately, never flagged.
// NB: match "bear case"/"bull case" only — bare "bear"/"bull" also match "bear
// market"/"bull market", which would let an uncited hard figure in such a
// sentence escape the fabrication flag.
const ESTIMATE_RE = /\b(est\.?|estimates?|estimated|scenario|scenarios|target|targets|base case|bear case|bull case|12-mo|12-month|projected|projection|forecast|implies|implied|could reach|we think|my estimate|fair value|odds|probability|likely worth)\b/i;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Audit one blob of generated text. `grounding` (optional) is the set of real
// figures we handed the model (macro/MA levels) — a figure that appears verbatim
// there is grounded even without an inline citation.
export function auditFigures(text: string, grounding: string[] = []): FigureAudit {
  const groundSet = new Set(grounding.map((g) => g.replace(/\s+/g, "").toLowerCase()));
  const flagged: FigureFlag[] = [];
  let total = 0, cited = 0, estimates = 0;
  for (const sentence of splitSentences(text)) {
    const figs = sentence.match(FIGURE_RE);
    if (!figs) continue;
    const hasCite = CITE_RE.test(sentence);
    const isEstimate = ESTIMATE_RE.test(sentence);
    for (const raw of figs) {
      const figure = raw.trim();
      total++;
      if (hasCite || groundSet.has(figure.replace(/\s+/g, "").toLowerCase())) { cited++; continue; }
      if (isEstimate) { estimates++; continue; }
      flagged.push({ figure, snippet: sentence });
    }
  }
  return { total, cited, estimates, flagged };
}

// Convenience: audit a parsed briefing (lens bodies + summary + bottom line).
// The per-lens "Verify:" pointers are meta-instructions, not claims, so skip them.
export function auditBriefingText(parts: { summary?: string; bottomline?: string; lensBodies: string[] }, grounding: string[] = []): FigureAudit {
  const text = [parts.summary, ...parts.lensBodies, parts.bottomline].filter(Boolean).join(" \n ");
  return auditFigures(text, grounding);
}
