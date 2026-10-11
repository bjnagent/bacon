"use client";

import { useId, useState } from "react";
import { Button, Sheet } from "@/components/ui";
import { MAX_VOICES, formatVoices, parseVoices } from "./settings";
import s from "./Account.module.css";

/** Edit the X accounts the nightly brief checks. Saves through the parent's optimistic PATCH. */
export default function VoicesSheet({ open, initial, onClose, onSave }: {
  open: boolean;
  initial: string;
  onClose: () => void;
  onSave: (voices: string) => Promise<boolean>;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Tracked voices">
      {/* Remount per open so the box starts from what's saved, not a stale draft. */}
      {open && <VoicesForm initial={initial} onClose={onClose} onSave={onSave} />}
    </Sheet>
  );
}

function VoicesForm({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (voices: string) => Promise<boolean> }) {
  const id = useId();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const parsed = parseVoices(text);
  const unchanged = formatVoices(parsed.voices) === formatVoices(parseVoices(initial).voices);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed.error || saving) return;
    if (unchanged) { onClose(); return; }
    setSaving(true);
    const ok = await onSave(formatVoices(parsed.voices));
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <p className={s.sheetIntro}>
        Public commentators on X whose recent calls the nightly brief checks. A voice is one signal among many — never followed on its own.
      </p>
      <div className="ui-field">
        <label className="ui-label" htmlFor={`${id}-voices`}>X handles</label>
        <textarea
          id={`${id}-voices`}
          className={`ui-textarea ${s.voicesBox}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="@elerianm, @LynAldenContact"
          rows={4}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={parsed.error ? true : undefined}
          aria-describedby={`${id}-hint`}
        />
        <span id={`${id}-hint`} className={parsed.error ? s.fieldErr : "ui-hint"} aria-live="polite">
          {parsed.error ?? `Separate with commas. Up to ${MAX_VOICES}${parsed.voices.length ? ` · ${parsed.voices.length} added` : ""}.`}
        </span>
      </div>
      <Button type="submit" variant="primary" size="lg" block loading={saving} disabled={!!parsed.error}>Save</Button>
    </form>
  );
}
