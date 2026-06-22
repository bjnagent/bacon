"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, AlertTriangle, ArrowRight, MessageCircle } from "lucide-react";
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
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, loading]);

  const send = async (textIn: string) => {
    const t = textIn.trim();
    if (!t || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next); setText(""); setLoading(true); setError(null);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, context, conversationId }) });
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

  const clear = () => { setMessages([]); setError(null); setConversationId(crypto.randomUUID()); };

  if (!open) return null;
  const starters = chatStarters(context || { kind: "general" });
  const showTyping = loading && (messages.length === 0 || messages[messages.length - 1].role !== "assistant");

  return (
    <div className="pr-chat-wrap" onClick={onClose}>
      <div className="pr-chat" onClick={(e) => e.stopPropagation()}>
        <div className="pr-chat-head">
          <div className="pr-chat-ctx">
            <span className="pr-chat-ctx-dot" />
            <div className="pr-chat-ctx-text">
              <div className="pr-chat-ctx-title">{context ? context.title : "Discussion"}</div>
              <div className="pr-chat-ctx-sub">{context ? context.sub : ""}</div>
            </div>
          </div>
          <div className="pr-chat-head-btns">
            {messages.length > 0 && <button onClick={clear} title="New chat" className="pr-chat-clear"><Plus size={13} /> New</button>}
            <button onClick={onClose} title="Close" className="pr-chat-x"><X size={16} /></button>
          </div>
        </div>
        <div className="pr-chat-body">
          {messages.length === 0 && (
            <div className="pr-chat-intro">
              <BaconMark size={46} />
              <div className="pr-chat-intro-title">Let&apos;s talk it through.</div>
              <div className="pr-chat-intro-sub">Ask anything about {context && context.kind !== "general" ? context.title : "what you're researching"}. I&apos;ll reason through the lenses, weigh both sides, and flag what to verify — grounded in live search, never advice.</div>
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
          <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} placeholder="Ask about what you're viewing…" rows={1} aria-label="Chat message" />
          <button onClick={() => send(text)} disabled={!text.trim() || loading} className="pr-chat-send" aria-label="Send"><ArrowRight size={16} /></button>
        </div>
        <div className="pr-chat-foot">Live web search · qualitative · not financial advice</div>
      </div>
    </div>
  );
}
