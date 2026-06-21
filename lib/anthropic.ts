import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = process.env.BACON_MODEL ?? "claude-sonnet-4-20250514";

export async function ask(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  useSearch = true,
  maxTokens = 1100
): Promise<string> {
  const res = await anthropic.messages.create({
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
