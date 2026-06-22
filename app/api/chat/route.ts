import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { chatSystemPrompt, type ChatContext } from "@/lib/prompts";

export const maxDuration = 60;

// Context-aware streaming chat. Streams text deltas to the client and persists
// the user + assistant turn to chat_messages once the stream completes.
export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  let body: { messages?: { role: "user" | "assistant"; content: string }[]; context?: ChatContext | null; conversationId?: string };
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  // Clamp to recent turns and cap each message to keep prompts bounded.
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .slice(-24)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: String(m.content).slice(0, 6000) }));
  const context = body.context ?? null;
  const conversationId = body.conversationId || crypto.randomUUID();
  if (!messages.length) return new Response("No messages", { status: 400 });

  const system = chatSystemPrompt(context);
  const lastUser = messages[messages.length - 1];
  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of askStream(system, messages, true, 1024)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[error: ${err instanceof Error ? err.message : "stream failed"}]`));
      } finally {
        try {
          const rows: Array<Record<string, unknown>> = [];
          if (lastUser?.role === "user") rows.push({ user_id: user.id, conversation_id: conversationId, role: "user", content: String(lastUser.content), context });
          if (full) rows.push({ user_id: user.id, conversation_id: conversationId, role: "assistant", content: full, context });
          if (rows.length) await sb.from("chat_messages").insert(rows);
        } catch { /* persistence best-effort */ }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": conversationId } });
}
