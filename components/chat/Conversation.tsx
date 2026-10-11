"use client";

import { memo, useEffect, useState } from "react";
import { Check, ChevronRight, CircleAlert, Clock, Copy, Crown, History, RotateCcw, WifiOff } from "lucide-react";
import BaconMark from "@/components/BaconMark";
import { Button, Callout } from "@/components/ui";
import type { ChatContext } from "@/lib/chatContext";
import { Markdown } from "./Markdown";
import { contextLabel, introTitle } from "./protocol";
import type { ChatError, Saved, Turn } from "./useChat";
import s from "./Chat.module.css";

function Avatar() {
  return <span className={s.avatar} aria-hidden="true"><BaconMark size={22} /></span>;
}

function Typing() {
  return <span className={s.typing} role="status" aria-label="Bacon is thinking"><i /><i /><i /></span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch { /* clipboard blocked — nothing useful to say */ }
  };
  return (
    <button type="button" className={s.mini} onClick={copy} aria-label={copied ? "Copied" : "Copy reply"}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : null}
    </button>
  );
}

const UserMessage = memo(function UserMessage({ turn }: { turn: Turn }) {
  return (
    <div className={s.userRow}>
      <div className={s.bubble}><span className="sr-only">You: </span>{turn.content}</div>
    </div>
  );
});

const AssistantMessage = memo(function AssistantMessage({ turn }: { turn: Turn }) {
  const streaming = turn.status === "streaming";
  const has = !!turn.content.trim();
  return (
    <div className={s.botRow}>
      <Avatar />
      <div className={s.botBody}>
        <span className="sr-only">Bacon: </span>
        {has ? <Markdown text={turn.content} streaming={streaming} /> : streaming ? <Typing /> : null}
        {streaming && has && <span className={s.pulse} aria-hidden="true" />}
        {!streaming && has && (
          <div className={s.actions}>
            <CopyButton text={turn.content} />
            {turn.status === "stopped" && <span className={s.status}>Stopped</span>}
          </div>
        )}
      </div>
    </div>
  );
});

function Notice({ error, onRetry, onPlans }: { error: ChatError; onRetry: () => void; onPlans: (e: Extract<ChatError, { kind: "limit" }>) => void }) {
  if (error.kind === "limit") {
    return (
      <div className={s.notice}>
        <Callout tone="accent" icon={<Crown aria-hidden="true" />}>
          <div className={s.noticeBody}>
            <p>{error.message} Upgrade for a bigger monthly allowance.</p>
            <Button size="sm" variant="primary" onClick={() => onPlans(error)}>See plans</Button>
          </div>
        </Callout>
      </div>
    );
  }
  if (error.kind === "daily") {
    return (
      <div className={s.notice}>
        <Callout tone="warn" icon={<Clock aria-hidden="true" />}><p>{error.message}</p></Callout>
      </div>
    );
  }
  return (
    <div className={s.notice}>
      <Callout tone="neg" icon={error.kind === "offline" ? <WifiOff aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}>
        <div className={s.noticeBody}>
          <p>{error.message}</p>
          <Button size="sm" icon={<RotateCcw aria-hidden="true" />} onClick={onRetry}>Try again</Button>
        </div>
      </Callout>
    </div>
  );
}

export function Conversation({ turns, streaming, error, onRetry, onPlans }: {
  turns: Turn[];
  streaming: boolean;
  error: ChatError | null;
  onRetry: () => void;
  onPlans: (e: Extract<ChatError, { kind: "limit" }>) => void;
}) {
  return (
    // aria-busy holds screen-reader announcements until the reply is complete,
    // instead of reading every frame of a streaming answer.
    <div className={s.thread} role="log" aria-live="polite" aria-busy={streaming} aria-label="Conversation">
      {turns.map((t) => (t.role === "user" ? <UserMessage key={t.id} turn={t} /> : <AssistantMessage key={t.id} turn={t} />))}
      {error && <Notice error={error} onRetry={onRetry} onPlans={onPlans} />}
    </div>
  );
}

export function Intro({ ctx, saved, starters, onResume, onStarter }: {
  ctx: ChatContext | null;
  saved: Saved | null;
  starters: string[];
  onResume: () => void;
  onStarter: (q: string) => void;
}) {
  const savedLabel = saved
    ? [contextLabel(saved.ctx).title, `${saved.turns.length} message${saved.turns.length === 1 ? "" : "s"}`, saved.when].filter(Boolean).join(" · ")
    : "";
  return (
    <div className={s.intro}>
      <div className={s.hero}>
        <span className={s.heroMark} aria-hidden="true"><BaconMark size={44} /></span>
        <h2 className={s.heroTitle}>{introTitle(ctx)}</h2>
        <p className={s.heroBody}>I&apos;ll weigh both sides and flag what to verify, using live search.</p>
      </div>
      {saved && (
        <button type="button" className={s.resume} onClick={onResume}>
          <span className={s.resumeIcon} aria-hidden="true"><History /></span>
          <span className={s.resumeText}>
            <span className={s.resumeTitle}>Continue your last conversation</span>
            <span className={s.resumeSub}>{savedLabel}</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
      <div className={s.starters} role="group" aria-label="Suggested questions">
        {starters.map((q) => (
          <button key={q} type="button" className={s.starter} onClick={() => onStarter(q)}>{q}</button>
        ))}
      </div>
    </div>
  );
}
