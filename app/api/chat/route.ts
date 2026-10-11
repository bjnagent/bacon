import { NextResponse } from "next/server";
import { requireUser, isResponse, readJson, fail, badRequest } from "@/lib/api";
import { gate } from "@/lib/entitlements";
import { askStream } from "@/lib/anthropic";
import { chatSystemPrompt } from "@/lib/prompts";
import { withinQuota } from "@/lib/quota";
import { swallowed } from "@/lib/log";
import { isUuid, normalizeHistory, sanitizeContext } from "@/components/chat/protocol";

export const maxDuration = 300;

/** Saved messages returned for a resume — enough to pick the thread back up. */
const RESUME_LIMIT = 40;

// GET: the most recent conversation — its id, messages, context and when it
// was last active — so the sheet can offer to pick up where the user left off.
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb } = auth;

  const { data: latest, error } = await sb
    .from("chat_messages")
    .select("conversation_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    swallowed("chat: latest conversation", error);
    return fail(500, "Couldn't load your last conversation.");
  }
  if (!latest) return NextResponse.json({ conversationId: null, messages: [], context: null, updatedAt: null }, { headers: { "Cache-Control": "private, no-store" } });

  // Newest first so a long thread returns its latest turns, then back into order.
  const { data: rows } = await sb
    .from("chat_messages")
    .select("role,content,context,created_at")
    .eq("conversation_id", latest.conversation_id)
    .order("created_at", { ascending: false })
    .limit(RESUME_LIMIT);
  const ordered = (rows ?? []).slice().reverse();
  // A thread must open on a question, not on half of an exchange cut by the limit.
  while (ordered.length && ordered[0].role !== "user") ordered.shift();
  const last = ordered[ordered.length - 1];
  return NextResponse.json(
    {
      conversationId: latest.conversation_id,
      messages: ordered.map((r) => ({ role: r.role, content: r.content })),
      context: last?.context ?? null,
      updatedAt: last?.created_at ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// POST: one streamed reply. Text deltas go to the client as they arrive; the
// exchange is saved once the reply completes.
export async function POST(req: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const { sb, user } = auth;

  const body = await readJson<{ messages?: unknown; context?: unknown; conversationId?: unknown }>(req);
  if (!body) return badRequest();
  const messages = normalizeHistory(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") return badRequest("Ask a question to start the conversation.");
  const context = sanitizeContext(body.context);
  // conversation_id is a uuid column: an id we can't store would silently lose the thread.
  const conversationId = isUuid(body.conversationId) ? body.conversationId : crypto.randomUUID();

  // Daily anti-abuse cap first, then the monthly plan allowance — both after
  // validation, so a malformed request costs nothing.
  if (!(await withinQuota(sb))) return fail(429, "You've reached today's chat limit. It resets tomorrow.", { code: "daily_limit" });
  const g = await gate(sb, user, "chat");
  if (!g.ok) return g.response;

  const askedAt = new Date().toISOString();
  const question = messages[messages.length - 1].content;
  const gen = askStream(chatSystemPrompt(context), messages, true, 1024, 5, { route: "chat", userId: user.id });
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let ok = true;
      try {
        for await (const chunk of gen) {
          if (cancelled) break;
          if (!chunk) continue;
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        ok = false;
        if (!cancelled) {
          swallowed("chat: stream", err);
          // The client recognises this marker and shows a retry; the reason
          // stays in our logs rather than in the user's conversation.
          try { controller.enqueue(encoder.encode("\n\n[error: stream failed]")); } catch { /* client gone */ }
        }
      } finally {
        if (cancelled) ok = false;
        // The allowance pays for answers received. Nothing came back — an
        // upstream failure, or the user stopped before the first word — so
        // give the unit back.
        if (!full.trim()) await g.refund();
        // Save the exchange only when the reply completed: a truncated answer
        // must not be resumed later as if it were finished, and an unanswered
        // question would be saved twice when the client retries it.
        if (ok && full.trim()) {
          const { error } = await sb.from("chat_messages").insert([
            { user_id: user.id, conversation_id: conversationId, role: "user", content: question, context, created_at: askedAt },
            // Its own timestamp, so the pair can never sort out of order on resume.
            { user_id: user.id, conversation_id: conversationId, role: "assistant", content: full, context, created_at: new Date().toISOString() },
          ]);
          if (error) swallowed("chat: save exchange", error);
        }
        try { controller.close(); } catch { /* already closed by a cancel */ }
      }
    },
    cancel() {
      // The client stopped or went away: stop paying for tokens nobody reads.
      cancelled = true;
      gen.return(undefined).catch(() => { /* already finished */ });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": conversationId,
      ...(g.remaining != null ? { "X-Remaining": String(g.remaining) } : {}),
    },
  });
}
