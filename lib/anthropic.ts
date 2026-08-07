import Anthropic from "@anthropic-ai/sdk";
import { meter, type AiMeta } from "./usage";

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

// Anthropic reports usage in two places depending on mode: `res.usage` on a
// non-streaming reply, and message_start (input/cache) + message_delta (output)
// on a stream. Both carry the same field names, so one shape reads both.
interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}

export async function ask(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1100,
  maxSearches?: number,
  meta?: AiMeta
): Promise<string> {
  const t0 = Date.now();
  let res;
  try {
    res = await getClient().messages.create({
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
  } catch (err) {
    // Record the failure so the console shows error rate, not just spend.
    if (meta) meter({ ...meta, provider: "anthropic", model: MODEL, usage: { input: 0, output: 0 }, ms: Date.now() - t0, ok: false });
    throw err;
  }
  if (meta) {
    const u = res.usage as RawUsage | undefined;
    meter({
      ...meta,
      provider: "anthropic",
      model: res.model || MODEL,
      usage: {
        input: u?.input_tokens ?? 0,
        output: u?.output_tokens ?? 0,
        cacheRead: u?.cache_read_input_tokens ?? 0,
        cacheWrite: u?.cache_creation_input_tokens ?? 0,
        webSearches: u?.server_tool_use?.web_search_requests ?? 0,
      },
      ms: Date.now() - t0,
    });
  }
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
  maxSearches?: number,
  meta?: AiMeta
): AsyncGenerator<string> {
  const t0 = Date.now();
  // Accumulated across the stream: message_start carries input/cache counts,
  // message_delta the running output count (and the final search tally).
  const acc = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 };
  let model = MODEL;
  let ok = false;
  try {
    const stream = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
      stream: true,
      ...(useSearch ? { tools: [{ type: "web_search_20250305" as const, name: "web_search", ...(maxSearches ? { max_uses: maxSearches } : {}) }] } : {}),
    });
    for await (const ev of stream) {
      if (ev.type === "message_start") {
        const u = ev.message.usage as RawUsage | undefined;
        model = ev.message.model || MODEL;
        acc.input = u?.input_tokens ?? 0;
        acc.cacheRead = u?.cache_read_input_tokens ?? 0;
        acc.cacheWrite = u?.cache_creation_input_tokens ?? 0;
      } else if (ev.type === "message_delta") {
        const u = ev.usage as RawUsage | undefined;
        if (u?.output_tokens != null) acc.output = u.output_tokens;
        if (u?.server_tool_use?.web_search_requests != null) acc.webSearches = u.server_tool_use.web_search_requests;
      } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        yield ev.delta.text;
      }
    }
    ok = true;
  } finally {
    // In `finally` so an aborted stream (client disconnect, deadline) still
    // meters the tokens already billed upstream.
    if (meta) meter({ ...meta, provider: "anthropic", model, usage: acc, ms: Date.now() - t0, ok });
  }
}
