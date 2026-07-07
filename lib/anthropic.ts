import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.BACON_MODEL ?? "claude-sonnet-4-6";

// Lazily construct the client so importing this module (e.g. during `next build`,
// when route handlers are traced) never throws on a missing key. The key is only
// required when an AI call actually runs, at request time, on the server.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  // timeout < the 300s Fluid-compute function ceiling so a hung upstream call
  // fails with a readable error instead of riding into the gateway timeout page.
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: 240_000, maxRetries: 1 });
  return client;
}

export async function ask(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1100,
  maxSearches?: number
): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    ...(useSearch
      ? {
          // max_uses bounds the search loop — it's what keeps latency and
          // search spend predictable; an uncapped loop can run for minutes.
          tools: [{ type: "web_search_20250305" as const, name: "web_search", ...(maxSearches ? { max_uses: maxSearches } : {}) }],
        }
      : {}),
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
}

// Streaming variant for chat — yields text deltas as they arrive.
export async function* askStream(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1024,
  maxSearches?: number
): AsyncGenerator<string> {
  const stream = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    stream: true,
    ...(useSearch ? { tools: [{ type: "web_search_20250305" as const, name: "web_search", ...(maxSearches ? { max_uses: maxSearches } : {}) }] } : {}),
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
}
