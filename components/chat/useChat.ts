"use client";

// Conversation state for the chat sheet: the open thread, the one that can be
// picked back up, and one in-flight request at a time.
//
// The sheet stays mounted while hidden, so a reply keeps streaming if the
// sheet is closed mid-answer and is there, finished, when it reopens.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiFetch, apiStream, ApiError } from "@/lib/client/api";
import type { PaywallRequest } from "@/lib/client/paywall";
import type { ChatContext } from "@/lib/prompts";
import { METER_LABEL } from "@/lib/plans";
import { haptic } from "@/lib/native";
import { ago, MAX_CHARS, normalizeHistory, sameContext, stripErrorMarker, uuid, type Role, type WireMessage } from "./protocol";

export interface Turn {
  id: string;
  role: Role;
  content: string;
  /** streaming: arriving now · stopped: the user stopped it · cut: the connection or model failed mid-reply */
  status?: "streaming" | "stopped" | "cut";
}
export interface Thread { id: string; ctx: ChatContext | null; turns: Turn[] }
/** A conversation that can be picked back up from the empty state. */
export interface Saved extends Thread { when?: string }

export type ChatError =
  | { kind: "error" | "offline"; message: string }
  | { kind: "limit"; message: string; paywall: PaywallRequest }
  | { kind: "daily"; message: string };

const fresh = (ctx: ChatContext | null): Thread => ({ id: uuid(), ctx, turns: [] });

/** A thread put aside mid-flight keeps what arrived, and nothing that didn't. */
function settle(turns: Turn[]): Turn[] {
  return turns
    .filter((t) => t.role === "user" || t.content.trim())
    .map((t) => (t.status === "streaming" ? { ...t, status: "stopped" as const } : t));
}

export function describeError(err: unknown, partial: boolean): ChatError {
  if (err instanceof ApiError) {
    if (err.isUpgrade) {
      const b = err.body as PaywallRequest & { limit?: number };
      const label = METER_LABEL.chat;
      const used = typeof b.limit === "number" && b.limit > 0 ? `all ${b.limit} ${b.limit === 1 ? label.one : label.many}` : `this month's ${label.many}`;
      const resets = b.resetsAt ? ` They reset on ${new Date(b.resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.` : "";
      return { kind: "limit", message: `You've used ${used} for this month.${resets}`, paywall: b };
    }
    if (err.status === 429) return { kind: "daily", message: err.message };
    if (err.code === "offline") return { kind: "offline", message: "You're offline. Check your connection and try again." };
    if (err.status === 401) return { kind: "error", message: "You've been signed out. Sign in again to keep chatting." };
    if (err.status === 502 || err.status === 504 || err.status >= 500) {
      return { kind: "error", message: partial ? "The reply was cut off." : "Bacon couldn't answer just now." };
    }
    return { kind: "error", message: err.message };
  }
  return { kind: "error", message: "Something went wrong." };
}

export interface UseChat {
  thread: Thread;
  saved: Saved | null;
  streaming: boolean;
  error: ChatError | null;
  send: (text: string) => boolean;
  retry: () => void;
  stop: () => void;
  newChat: () => void;
  resume: () => void;
}

export function useChat({ open, context, onReply, onUnsend }: {
  open: boolean;
  context: ChatContext | null;
  /** A reply finished — the allowance moved. */
  onReply?: () => void;
  /** Stopped before a word came back: the message goes back to the composer. */
  onUnsend?: (text: string) => void;
}): UseChat {
  const [thread, setThread] = useState<Thread>(() => fresh(context));
  const [saved, setSaved] = useState<Saved | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  // Opening the sheet on something else than the conversation is about starts
  // a new conversation for it; the old one stays one tap away. Done while
  // rendering (not in an effect) so the old thread never flashes up first. A
  // reply that is still streaming is left alone rather than thrown away.
  const [seenOpen, setSeenOpen] = useState(false);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open) {
      if (!thread.turns.length) {
        if (thread.ctx !== context) setThread({ ...thread, ctx: context });
      } else if (!streaming && !sameContext(thread.ctx, context)) {
        setSaved({ ...thread, turns: settle(thread.turns) });
        setThread(fresh(context));
        setError(null);
      }
    }
  }

  // Handlers and async work read the latest values through refs. Synced in a
  // layout effect — inside the commit — so a tap that lands right after a
  // render can never act on the previous render's thread.
  const threadRef = useRef(thread);
  const savedRef = useRef(saved);
  const contextRef = useRef(context);
  const cbRef = useRef({ onReply, onUnsend });
  useLayoutEffect(() => {
    threadRef.current = thread;
    savedRef.current = saved;
    contextRef.current = context;
    cbRef.current = { onReply, onUnsend };
  });
  const ctrlRef = useRef<AbortController | null>(null);
  // Which request the user stopped, as opposed to one cut off by switching threads.
  const stoppedRef = useRef<AbortController | null>(null);

  // Offer the latest saved conversation, once, the first time the sheet opens.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    apiFetch<{ conversationId?: string | null; messages?: WireMessage[]; context?: ChatContext | null; updatedAt?: string | null }>("/api/chat", { paywall: false })
      .then((d) => {
        if (!d.conversationId || !Array.isArray(d.messages)) return;
        const turns: Turn[] = d.messages
          .filter((m) => m && typeof m.content === "string" && m.content.trim())
          .map((m) => ({ id: uuid(), role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
        if (!turns.length || d.conversationId === threadRef.current.id) return;
        const offer: Saved = { id: d.conversationId, ctx: d.context ?? null, turns, when: ago(d.updatedAt, Date.now()) };
        setSaved((cur) => cur ?? offer);
      })
      .catch(() => { /* resuming is a convenience; the chat works without it */ });
  }, [open]);

  const patch = useCallback((id: string, fn: (t: Turn) => Turn | null) => {
    setThread((th) => (th.turns.some((t) => t.id === id)
      ? { ...th, turns: th.turns.flatMap((t) => (t.id === id ? (fn(t) ?? []) : [t])) }
      : th));
  }, []);

  /** Ask for a reply to `base` (which ends with the user's turn). */
  const run = useCallback(async (th: Thread, base: Turn[]) => {
    const reply: Turn = { id: uuid(), role: "assistant", content: "", status: "streaming" };
    setThread((cur) => (cur.id === th.id ? { ...cur, turns: [...base, reply] } : cur));
    setError(null);
    setStreaming(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    let got = "";
    try {
      const full = await apiStream(
        "/api/chat",
        { messages: normalizeHistory(base), context: th.ctx, conversationId: th.id },
        (acc) => {
          got = stripErrorMarker(acc);
          patch(reply.id, (t) => ({ ...t, content: got }));
        },
        ctrl.signal,
      );
      got = stripErrorMarker(full);
      if (!got.trim()) throw new ApiError(502, { error: "Empty reply" });
      patch(reply.id, (t) => ({ ...t, content: got, status: undefined }));
      cbRef.current.onReply?.();
    } catch (err) {
      const partial = !!got.trim();
      if (ctrl.signal.aborted) {
        if (partial) patch(reply.id, (t) => ({ ...t, content: got, status: "stopped" }));
        else if (stoppedRef.current === ctrl) {
          // Nothing came back, so treat it as never sent: the bubble goes and
          // the words return to the composer to edit or send again.
          const last = base[base.length - 1];
          setThread((cur) => ({ ...cur, turns: cur.turns.filter((t) => t.id !== reply.id && t.id !== last?.id) }));
          if (last?.role === "user") cbRef.current.onUnsend?.(last.content);
        }
      } else {
        if (partial) patch(reply.id, (t) => ({ ...t, content: got, status: "cut" }));
        else patch(reply.id, () => null);
        setError(describeError(err, partial));
        haptic("error");
      }
    } finally {
      if (ctrlRef.current === ctrl) {
        ctrlRef.current = null;
        setStreaming(false);
      }
    }
  }, [patch]);

  const send = useCallback((raw: string) => {
    const text = raw.trim().slice(0, MAX_CHARS);
    if (!text || ctrlRef.current) return false;
    const th = threadRef.current;
    const user: Turn = { id: uuid(), role: "user", content: text };
    haptic("light");
    void run(th, [...th.turns, user]);
    return true;
  }, [run]);

  const retry = useCallback(() => {
    if (ctrlRef.current) return;
    const th = threadRef.current;
    let last = -1;
    th.turns.forEach((t, i) => { if (t.role === "user") last = i; });
    if (last < 0) return;
    // Drop whatever partial reply followed it and ask again.
    void run(th, th.turns.slice(0, last + 1));
  }, [run]);

  const stop = useCallback(() => {
    stoppedRef.current = ctrlRef.current;
    ctrlRef.current?.abort();
    haptic("light");
  }, []);

  const newChat = useCallback(() => {
    if (ctrlRef.current) { ctrlRef.current.abort(); ctrlRef.current = null; setStreaming(false); }
    const th = threadRef.current;
    // The thread being cleared stays resumable until another replaces it.
    if (th.turns.length) setSaved({ ...th, turns: settle(th.turns), when: undefined });
    setThread(fresh(contextRef.current));
    setError(null);
  }, []);

  const resume = useCallback(() => {
    const s = savedRef.current;
    if (!s || ctrlRef.current) return;
    const th = threadRef.current;
    setSaved(th.turns.length ? { ...th, turns: settle(th.turns), when: undefined } : null);
    setThread({ id: s.id, ctx: s.ctx, turns: s.turns });
    setError(null);
  }, []);

  return { thread, saved, streaming, error, send, retry, stop, newChat, resume };
}
