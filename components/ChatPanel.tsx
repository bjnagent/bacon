"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, AlertTriangle, ArrowRight, MessageCircle, History } from "lucide-react";
import { chatStarters, type ChatContext } from "@/lib/prompts";
import BaconMark from "./BaconMark";

interface Msg { role: "user" | "assistant"; content: string }

export function ChatFab({ onClick, hidden }: { onClick: () => void; hidden?: boolean }) {
  if (hidden) return null;
  return <button className="pr-fab" onClick={onClick} aria-label="Discuss what you're viewing"><MessageCircle size={19} /><span>Discuss</span></button>;
}

// Context-aware streaming chat. Reasons through the lenses, weighs both sides,
// flags what to verify — grounded in live search, never advice.
export default function ChatPanel({ open, context, onClose }: { open: boolean; context: ChatContext | null; onClose: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  // A resumable prior conversation (from the server) + its restored context.
  // localCtx overrides the prop context after a resume; cleared on "New".
  const [resume, setResume] = useState<{ id: string; messages: Msg[]; ctx: ChatContext | null } | null>(null);
  const [localCtx, setLocalCtx] = useState<ChatContext | null>(null);
  const fetchedRef = useRef(false);
  const effCtx = localCtx ?? context;
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (open) taRef.current?.focus(); }, [open]);

  // Look up the latest saved conversation once, so the intro can offer resume.
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        const res = await fetch("/api/chat");
        const d = await res.json();
        if (res.ok && d.conversationId && Array.isArray(d.messages) && d.messages.length) {
          setResume({ id: d.conversationId, messages: d.messages as Msg[], ctx: (d.context as ChatContext) ?? null });
        }
      } catch { /* resume is best-effort */ }
    })();
  }, [open]);

  const doResume = () => {
    if (!resume) return;
    setMessages(resume.messages);
    setConversationId(resume.id);
    if (resume.ctx) setLocalCtx(resume.ctx);
    setResume(null);
  };

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, loading]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async (textIn: string) => {
    const t = textIn.trim();
    if (!t || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next); setText(""); setLoading(true); setError(null);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, context: effCtx, conversationId }) });
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? "Please sign in again" : `Request failed (${res.status})`);
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMessages((m) => {
          const c = [...m];
          c[c.length - 1] = { role: "assistant", content: (c[c.length - 1]?.content || "") + chunk };
          return c;
        });
      }
    } catch (err) {
      setError((err instanceof Error ? err.message : "Something went wrong") + " — try again.");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    // The cleared thread stays resumable until a new one starts.
    if (messages.length) setResume({ id: conversationId, messages, ctx: effCtx });
    setMessages([]); setError(null); setLocalCtx(null); setConversationId(crypto.randomUUID());
  };

  if (!open) return null;
  const starters = chatStarters(effCtx || { kind: "general" });
  const showTyping = loading && (messages.length === 0 || messages[messages.length - 1].role !== "assistant");

  return (
    <div className="pr-chat-wrap" onClick={onClose}>
      <div className="pr-chat" role="dialog" aria-modal="true" aria-label={effCtx ? `Discuss ${effCtx.title}` : "Discussion"} onClick={(e) => e.stopPropagation()}>
        <div className="pr-chat-head">
          <div className="pr-chat-ctx">
            <span className="pr-chat-ctx-dot" />
            <div className="pr-chat-ctx-text">
              <div className="pr-chat-ctx-title">{effCtx ? effCtx.title : "Discussion"}</div>
              <div className="pr-chat-ctx-sub">{effCtx ? effCtx.sub : ""}</div>
            </div>
          </div>
          <div className="pr-chat-head-btns">
            {messages.length > 0 && <button onClick={clear} title="New chat" className="pr-chat-clear"><Plus size={13} /> New</button>}
            <button onClick={onClose} title="Close" className="pr-chat-x"><X size={16} /></button>
          </div>
        </div>
        <div className="pr-chat-body" aria-live="polite">
          {messages.length === 0 && (
            <div className="pr-chat-intro">
              <BaconMark size={46} />
              <div className="pr-chat-intro-title">Let&apos;s talk it through.</div>
              <div className="pr-chat-intro-sub">Ask anything about {effCtx && effCtx.kind !== "general" ? effCtx.title : "what you're researching"}. I&apos;ll reason through the lenses, weigh both sides, and flag what to verify — grounded in live search, never advice.</div>
              {resume && (
                <button className="pr-chat-resume" onClick={doResume}>
                  <History size={13} /> Resume last conversation{resume.ctx?.title ? ` — ${resume.ctx.title}` : ""} ({resume.messages.length} messages)
                </button>
              )}
              <div className="pr-chat-starters">
                {starters.map((s, i) => <button key={i} className="pr-chat-starter" onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`pr-msg is-${m.role}`}>
              {m.role === "assistant" && <span className="pr-msg-who">BACON</span>}
              <div className="pr-msg-body">{m.content}</div>
            </div>
          ))}
          {showTyping && <div className="pr-msg is-assistant"><span className="pr-msg-who">BACON</span><div className="pr-msg-body pr-msg-typing"><span /><span /><span /></div></div>}
          {error && <div className="pr-chat-err"><AlertTriangle size={14} /> {error}</div>}
          <div ref={endRef} />
        </div>
        <div className="pr-chat-input">
          <textarea ref={taRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} placeholder="Ask about what you're viewing…" rows={1} aria-label="Chat message" />
          <button onClick={() => send(text)} disabled={!text.trim() || loading} className="pr-chat-send" aria-label="Send"><ArrowRight size={16} /></button>
        </div>
        <div className="pr-chat-foot">Live web search · qualitative · not financial advice</div>
      </div>
    </div>
  );
}
