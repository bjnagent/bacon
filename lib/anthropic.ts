import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.BACON_MODEL ?? "claude-sonnet-4-6";

// Lazily construct the client so importing this module (e.g. during `next build`,
// when route handlers are traced) never throws on a missing key. The key is only
// required when an AI call actually runs, at request time, on the server.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return client;
}

export async function ask(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1100
): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    ...(useSearch
      ? {
          tools: [{ type: "web_search_20250305" as const, name: "web_search" }],
        }
      : {}),
  });
  return res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n")
    .trim();
}
