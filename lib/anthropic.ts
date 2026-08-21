import Anthropic from "@anthropic-ai/sdk";
import { meter, type AiMeta } from "./usage";

// Sonnet 5 lists at the same $3/$15 as the 4.6 it replaces — and until
// 2026-08-31 runs at introductory $2/$10, so this is cheaper AND newer, not a
// trade. Kept in an env var so `BACON_MODEL=claude-sonnet-4-6` rolls the whole
// thing back without a deploy if the briefs read worse.
const MODEL = process.env.BACON_MODEL ?? "claude-sonnet-5";

// Thinking is the one thing that does NOT carry over from 4.6 untouched.
// Omitting the parameter meant "no thinking" on Sonnet 4.6; on Sonnet 5 it means
// ADAPTIVE thinking, and thinking tokens bill as output and count against
// max_tokens. Every caller here budgets 1000–1800 tokens for a delimited format
// that gets parsed downstream, so silently adopting thinking would eat that
// budget and truncate briefs mid-section. Off keeps behaviour identical to what
// the ledger already measured; it's the safe half of this migration.
const THINKING = { type: "disabled" as const };

/**
 * The stable half of every request. The system prompt is the only part that
 * repeats — messages carry the per-call payload — so the breakpoint belongs
 * here and not on the last block.
 *
 * Below the ~1024-token minimum a prefix silently isn't cached, which is most
 * of these prompts. Only the brief's is long enough to qualify today; the rest
 * cost nothing to mark and start paying off if they grow.
 */
const cachedSystem = (system: string) => [
  { type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } },
];

/**
 * `web_search_20260209` filters result content dynamically rather than feeding
 * every hit back verbatim. That matters more here than almost anywhere: results
 * are re-read on each turn of the search loop, and the ledger showed a single
 * extra search costing roughly 32,000 input tokens on the daily brief.
 */
const searchTool = (maxSearches?: number) => ({
  type: "web_search_20260209" as const,
  name: "web_search" as const,
  // max_uses bounds the search loop — it's what keeps latency and search spend
  // predictable; an uncapped loop can run for minutes.
  ...(maxSearches ? { max_uses: maxSearches } : {}),
});

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
      system: cachedSystem(system),
      thinking: THINKING,
      messages,
      ...(useSearch ? { tools: [searchTool(maxSearches)] } : {}),
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
      system: cachedSystem(system),
      thinking: THINKING,
      messages,
      stream: true,
      ...(useSearch ? { tools: [searchTool(maxSearches)] } : {}),
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
