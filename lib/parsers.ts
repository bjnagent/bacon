// Parsers — ported from bacon-artifact.jsx
// TODO: copy verbatim from reference artifact once bacon-artifact.jsx is committed

export function parseBriefing(raw: string): {
  lenses: string;
  bull: string;
  bear: string;
} {
  const lenses = extract(raw, "===LENSES===", "===BULL===");
  const bull   = extract(raw, "===BULL===", "===BEAR===");
  const bear   = extract(raw, "===BEAR===");
  return { lenses, bull, bear };
}

export function parseDebate(raw: string): {
  pro: string;
  con: string;
  verification: string;
} {
  const pro = extract(raw, "===PRO===", "===CON===");
  const con = extract(raw, "===CON===", "===VERIFICATION===");
  const verification = extract(raw, "===VERIFICATION===");
  return { pro, con, verification };
}

export function parseScout(raw: string): Array<{
  name: string;
  assetClass: string;
  why: string;
  check: string;
}> {
  const section = extract(raw, "===IDEAS===") || raw;
  return section
    .split(/@@ITEM@@/)
    .slice(1)
    .map((block) => {
      const nameMatch = block.match(/^(.+?)\s*\(/);
      const assetMatch = block.match(/\(([^)]+)\)\s*[-–—]\s*([\s\S]+)$/);
      const whyMatch = block.match(/Why:\s*([\s\S]+?)(?=\n\s*Check:|$)/);
      const checkMatch = block.match(/Check:\s*([\s\S]+)$/);
      return {
        name: nameMatch?.[1]?.trim() || "",
        assetClass: assetMatch?.[1]?.trim() || "",
        why: whyMatch?.[1]?.trim() || "",
        check: checkMatch?.[1]?.trim() || "",
      };
    });
}

export function parseTrackingUpdate(raw: string): {
  update: string;
  status: string;
} {
  const update = extract(raw, "===UPDATE===", "===STATUS===");
  const status = extract(raw, "===STATUS===")?.trim() || "unknown";
  return { update, status };
}

export function parseNews(raw: string): Array<{
  headline: string;
  source: string;
  signal: string;
  verify: string;
}> {
  const section = extract(raw, "===NEWS===") || raw;
  return section
    .split(/@@ITEM@@/)
    .slice(1)
    .map((block) => {
      const headline = block.replace(/Via:[\s\S]*$/m, "").trim();
      const sourceMatch = block.match(/Via:\s*(.+?)(?:\||\n)/);
      const signalMatch = block.match(/Signal:\s*(\w+)/);
      const verifyMatch = block.match(/Verify:\s*(.+)$/);
      return {
        headline: headline.trim(),
        source: sourceMatch?.[1]?.trim() || "",
        signal: signalMatch?.[1]?.trim() || "neutral",
        verify: verifyMatch?.[1]?.trim() || "",
      };
    });
}

function extract(raw: string, start: string, end?: string): string {
  const idx = raw.indexOf(start);
  if (idx === -1) return "";
  const from = idx + start.length;
  const to = end ? raw.indexOf(end, from) : raw.length;
  return raw.slice(from, to > from ? to : undefined).trim();
}
