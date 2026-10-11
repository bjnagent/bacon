"use client";

import { useLayoutEffect, type ReactNode, type RefObject } from "react";
import { ArrowUp, Square } from "lucide-react";
import { MAX_CHARS } from "./protocol";
import { FINE_POINTER, useMedia } from "./useMedia";
import s from "./Chat.module.css";

// Tapping send must not take focus from the field: on a phone that would drop
// the keyboard after every message.
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export function Composer({ value, onChange, onSend, onStop, streaming, placeholder, inputRef, meter }: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  meter?: ReactNode;
}) {
  // Enter sends with a hardware keyboard (Shift+Enter for a new line); on a
  // touch keyboard Return is a new line and the button sends, as in Messages.
  const enterSends = useMedia(FINE_POINTER);

  // Grow with the text, up to the CSS max-height, then scroll inside.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  const submit = () => { if (!streaming && value.trim()) onSend(value); };

  return (
    <form className={s.composer} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {meter}
      <div className={s.composeRow}>
        <div className={s.field}>
          <textarea
            ref={inputRef}
            className={s.input}
            value={value}
            rows={1}
            maxLength={MAX_CHARS}
            placeholder={placeholder}
            aria-label="Message"
            enterKeyHint={enterSends ? "send" : "enter"}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || !enterSends) return;
              e.preventDefault();
              submit();
            }}
          />
        </div>
        {streaming ? (
          <button type="button" className={`${s.action} ${s.stop}`} aria-label="Stop" onMouseDown={keepFocus} onClick={onStop}>
            <Square aria-hidden="true" />
          </button>
        ) : (
          <button type="submit" className={`${s.action} ${s.send}`} aria-label="Send" onMouseDown={keepFocus} disabled={!value.trim()}>
            <ArrowUp aria-hidden="true" strokeWidth={2.4} />
          </button>
        )}
      </div>
      <p className={s.disclaimer}>Research, not investment advice.</p>
    </form>
  );
}
