import { createClient } from "@/lib/supabase/server";
import { askStream } from "@/lib/anthropic";
import { chatSystemPrompt, type ChatContext } from "@/lib/prompts";
import { withinQuota, QUOTA_MESSAGE } from "@/lib/quota";

export const maxDuration = 300;

// GET: resume the most recent conversation — its id, messages, and context —
// so the panel can pick up where the user left off.
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { data: latest } = await sb
    .from("chat_messages")
    .select("conversation_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return Response.json({ conversationId: null, messages: [], context: null });

  const { data: rows } = await sb
    .from("chat_messages")
    .select("role,content,context,created_at")
    .eq("conversation_id", latest.conversation_id)
    .order("created_at", { ascending: true })
    .limit(40);
  const messages = (rows ?? []).map((r) => ({ role: r.role, content: r.content }));
  const context = rows && rows.length ? rows[rows.length - 1].context : null;
  return Response.json({ conversationId: latest.conversation_id, messages, context });
}

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
  // Meter AFTER validation, so an empty/malformed request doesn't burn a daily unit.
  if (!(await withinQuota(sb))) return Response.json({ error: QUOTA_MESSAGE }, { status: 429 });

  const system = chatSystemPrompt(context);
  const lastUser = messages[messages.length - 1];
  const encoder = new TextEncoder();
  let full = "";
  let ok = true; // set false if the stream errors mid-flight

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of askStream(system, messages, true, 1024, 5)) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        ok = false;
        controller.enqueue(encoder.encode(`\n\n[error: ${err instanceof Error ? err.message : "stream failed"}]`));
      } finally {
        try {
          const rows: Array<Record<string, unknown>> = [];
          if (lastUser?.role === "user") rows.push({ user_id: user.id, conversation_id: conversationId, role: "user", content: String(lastUser.content), context });
          // Only persist the assistant turn if the stream COMPLETED — a truncated
          // answer must not be saved (and later resumed) as if it were finished.
          if (ok && full) rows.push({ user_id: user.id, conversation_id: conversationId, role: "assistant", content: full, context });
          if (rows.length) await sb.from("chat_messages").insert(rows);
        } catch { /* persistence best-effort */ }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Conversation-Id": conversationId } });
}
