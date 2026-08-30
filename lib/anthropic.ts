import Anthropic from "@anthropic-ai/sdk";
import { meter, type AiMeta } from "./usage";

// User-facing work: analyze, chat, debate, personas. BACON_MODEL overrides it,
// which is worth knowing before trusting this line — the ledger showed every
// call still metering as claude-sonnet-4-6 long after the default here changed,
// because the env var was set and silently won.
export const MODEL = process.env.BACON_MODEL ?? "claude-sonnet-5";

/**
 * Bulk background work: the nightly brief and the kill-condition watch. Nobody
 * is waiting on these and their output is a delimited format, not prose, so
 * they do not need the frontier model.
 *
 * This is a SEPARATE variable on purpose. Routing them through BACON_MODEL would
 * make the expensive half of the bill hostage to a single env var that is
 * already set to something else — the exact way the last model change failed to
 * take effect.
 */
export const BULK_MODEL = process.env.BACON_BULK_MODEL ?? "claude-haiku-4-5";

/**
 * Capability is derived from the model, not assumed, because the cheap model is
 * an older generation and two request fields depend on that:
 *
 *  - `web_search_20260209` (dynamic filtering) needs Sonnet 4.6 / Sonnet 5 /
 *    Opus 4.6+. Haiku 4.5 must use the basic `web_search_20250305` or the
 *    request is rejected.
 *  - `thinking: {type:"disabled"}` is the 4.6+ form. Pre-4.6 models take
 *    `{type:"enabled", budget_tokens}` and have no thinking when the parameter
 *    is omitted — which is the behaviour we want, so it is simply left off.
 */
const isCurrentGen = (model: string) => /(sonnet-(4-6|5)|opus-)/.test(model);

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
const searchTool = (model: string, maxSearches?: number) => ({
  type: (isCurrentGen(model) ? "web_search_20260209" : "web_search_20250305") as
    "web_search_20260209" | "web_search_20250305",
  name: "web_search" as const,
  // max_uses bounds the search loop — it's what keeps latency and search spend
  // predictable; an uncapped loop can run for minutes. It also bounds OUTPUT
  // now: the dynamic-filtering tool runs code per turn, and the ledger showed
  // brief output rising 2,105 -> 3,712 tokens when it was adopted. Output bills
  // at 5x input, so turns are the expensive axis, not the search fee.
  ...(maxSearches ? { max_uses: maxSearches } : {}),
});

// `{type:"disabled"}` only exists on 4.6+; older models simply omit the field.
const thinkingFor = (model: string) =>
  isCurrentGen(model) ? { thinking: { type: "disabled" as const } } : {};

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
  meta?: AiMeta,
  model: string = MODEL,
): Promise<string> {
  const t0 = Date.now();
  let res;
  try {
    res = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system: cachedSystem(system),
      ...thinkingFor(model),
      messages,
      ...(useSearch ? { tools: [searchTool(model, maxSearches)] } : {}),
    });
  } catch (err) {
    // Record the failure so the console shows error rate, not just spend.
    if (meta) meter({ ...meta, provider: "anthropic", model, usage: { input: 0, output: 0 }, ms: Date.now() - t0, ok: false });
    throw err;
  }
  if (meta) {
    const u = res.usage as RawUsage | undefined;
    meter({
      ...meta,
      provider: "anthropic",
      model: res.model || model,
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
  meta?: AiMeta,
  model: string = MODEL,
): AsyncGenerator<string> {
  const t0 = Date.now();
  // Accumulated across the stream: message_start carries input/cache counts,
  // message_delta the running output count (and the final search tally).
  const acc = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 };
  let served = model;
  let ok = false;
  try {
    const stream = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system: cachedSystem(system),
      ...thinkingFor(model),
      messages,
      stream: true,
      ...(useSearch ? { tools: [searchTool(model, maxSearches)] } : {}),
    });
    for await (const ev of stream) {
      if (ev.type === "message_start") {
        const u = ev.message.usage as RawUsage | undefined;
        served = ev.message.model || model;
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
    if (meta) meter({ ...meta, provider: "anthropic", model: served, usage: acc, ms: Date.now() - t0, ok });
  }
}
