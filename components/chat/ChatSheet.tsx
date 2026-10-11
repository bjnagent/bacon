"use client";

// Ask Bacon: a context-aware research chat. A right-hand panel on desktop, a
// full-height sheet on phones. It reasons through the lenses, weighs both
// sides and flags what to verify — grounded in live search, never advice.
//
// Mounted once by the shell and kept mounted while hidden, so a conversation
// (and a reply still streaming) survives closing and reopening the sheet.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, SquarePen } from "lucide-react";
import { Sheet, IconButton } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { openPaywall } from "@/lib/client/paywall";
import { chatStarters, type ChatContext } from "@/lib/chatContext";
import { Composer } from "./Composer";
import { Conversation, Intro } from "./Conversation";
import { contextLabel } from "./protocol";
import { useChat } from "./useChat";
import { useKeyboardFit } from "./useKeyboardFit";
import { FINE_POINTER, useMedia } from "./useMedia";
import s from "./Chat.module.css";

/** Within this distance of the bottom counts as "reading the latest". */
const PIN_SLACK = 48;

function placeholderFor(ctx: ChatContext | null): string {
  if ((ctx?.kind === "asset" || ctx?.kind === "tracked") && ctx.title) return `Ask about ${ctx.title}`;
  if (ctx?.kind === "radar") return "Ask about your watchlist";
  if (ctx?.kind === "news") return "Ask about this story";
  return "Ask Bacon";
}

export default function ChatSheet({ open, context, onClose }: { open: boolean; context: ChatContext | null; onClose: () => void }) {
  const app = useApp();
  const titleId = useId();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const appRef = useRef(app);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { appRef.current = app; closeRef.current = onClose; });
  // Sheet re-runs its focus/scroll-lock effect whenever onClose changes, so it
  // gets one stable function rather than whatever the parent passed this render.
  const close = useCallback(() => closeRef.current(), []);

  const chat = useChat({
    open,
    context,
    // A finished reply used a unit of the monthly allowance; refresh the count.
    onReply: () => { if (appRef.current.remaining("chat") != null) void appRef.current.refreshMe(); },
    onUnsend: (text) => setDraft((d) => (d.trim() ? d : text)),
  });
  const { thread, saved, streaming, error } = chat;

  // ---- scrolling ----------------------------------------------------------
  // Follow a growing reply only while the reader is at the bottom; scrolling
  // up to re-read stops the follow and offers a jump back instead.
  const pinnedRef = useRef(true);
  // While a smooth jump is animating, its in-between scroll positions aren't
  // the reader scrolling away.
  const jumpingRef = useRef(false);
  const [showJump, setShowJump] = useState(false);
  const scroller = () => contentRef.current?.parentElement ?? null; // the Sheet's scrolling body

  useEffect(() => {
    if (!open) return;
    const el = scroller();
    if (!el) return;
    const toEnd = () => { el.scrollTop = el.scrollHeight; };
    const onScroll = () => {
      const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_SLACK;
      if (jumpingRef.current) {
        if (!pinned) return;
        jumpingRef.current = false;
      }
      pinnedRef.current = pinned;
      setShowJump(!pinned);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // New words, the keyboard, a taller composer: anything that changes the
    // size of the content or the viewport keeps a pinned reader pinned. Runs
    // after layout and before paint, so following never jitters.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (pinnedRef.current) toEnd(); }) : null;
    ro?.observe(el);
    if (contentRef.current) ro?.observe(contentRef.current);
    pinnedRef.current = true;
    toEnd();
    return () => { el.removeEventListener("scroll", onScroll); ro?.disconnect(); };
  }, [open]);

  const pin = () => {
    pinnedRef.current = true;
    setShowJump(false);
    const el = scroller();
    if (el) el.scrollTop = el.scrollHeight;
  };
  const jumpToLatest = () => {
    const el = scroller();
    if (!el) return;
    pinnedRef.current = true;
    jumpingRef.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    // If the reader grabs the scroll mid-animation, they're in charge again.
    setTimeout(() => { jumpingRef.current = false; }, 800);
  };

  // ---- focus + keyboard -----------------------------------------------------
  // With a hardware keyboard, land in the composer. On a phone, don't raise the
  // keyboard over the suggestions until the user asks for it.
  const fine = useMedia(FINE_POINTER);
  useEffect(() => {
    if (!open || !fine) return;
    // After the Sheet's own initial focus, which is scheduled first.
    const id = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [open, fine]);
  const focusComposer = () => { if (fine) inputRef.current?.focus({ preventScroll: true }); };
  useKeyboardFit(open, contentRef);

  // ---- actions --------------------------------------------------------------
  const send = (text: string) => {
    if (chat.send(text)) { setDraft(""); pin(); }
  };
  const ask = (q: string) => { if (chat.send(q)) { pin(); focusComposer(); } };

  // ---- allowance ------------------------------------------------------------
  const left = app.remaining("chat");
  const meter = left != null && left <= 5 ? (
    <p className={s.meter} role="status">
      <span>{left === 0 ? "No chat messages left this month" : `${left} message${left === 1 ? "" : "s"} left this month`}</span>
      {app.me?.plan.plan !== "desk" && (
        <button type="button" className={s.meterLink} onClick={() => openPaywall({ reason: "browse" })}>Upgrade</button>
      )}
    </p>
  ) : null;

  const { title, sub } = contextLabel(thread.ctx);
  const empty = thread.turns.length === 0;

  return (
    <Sheet
      open={open}
      onClose={close}
      variant="side"
      full
      labelledBy={titleId}
      title={
        <div className={s.head}>
          <div className={s.headText}>
            <div id={titleId} className={s.headTitle}>{title}</div>
            {sub && <div className={s.headSub}>{sub}</div>}
          </div>
          {!empty && (
            <IconButton label="New chat" onClick={() => { chat.newChat(); setDraft(""); focusComposer(); }}>
              <SquarePen aria-hidden="true" />
            </IconButton>
          )}
        </div>
      }
      footer={
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          onStop={chat.stop}
          streaming={streaming}
          placeholder={placeholderFor(thread.ctx)}
          inputRef={inputRef}
          meter={meter}
        />
      }
    >
      <div ref={contentRef} className={s.body}>
        {empty ? (
          <Intro
            ctx={thread.ctx}
            saved={saved}
            starters={chatStarters(thread.ctx ?? { kind: "general" })}
            onResume={() => { chat.resume(); pin(); focusComposer(); }}
            onStarter={ask}
          />
        ) : (
          <Conversation
            turns={thread.turns}
            streaming={streaming}
            error={error}
            onRetry={() => { chat.retry(); pin(); }}
            onPlans={(e) => openPaywall(e.paywall)}
          />
        )}
        <div className={s.jumpDock}>
          {showJump && !empty && (
            <button type="button" className={s.jump} aria-label="Scroll to latest" onClick={jumpToLatest}>
              <ArrowDown aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
