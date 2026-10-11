"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button, Callout, IconButton, Sheet, toast } from "@/components/ui";
import { apiFetch, ApiError } from "@/lib/client/api";
import { validatePassword } from "./validation";
import s from "./Account.module.css";

export default function PasswordSheet({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Change password">
      {open && <PasswordForm email={email} onDone={onClose} />}
    </Sheet>
  );
}

function PasswordForm({ email, onDone }: { email: string; onDone: () => void }) {
  const id = useId();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  // Errors appear after the first submit attempt, then track typing — no red
  // text while someone is still halfway through their first password.
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);

  const errs = validatePassword(pw, confirm);
  const show1 = tried ? errs.password : null;
  const show2 = tried ? errs.confirm : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setTried(true);
    setServerErr(null);
    if (errs.password || errs.confirm) return;
    setSaving(true);
    try {
      await apiFetch("/api/account/password", { body: { password: pw } });
      toast("Password updated.");
      onDone();
    } catch (err) {
      setServerErr(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't update your password — try again.");
    } finally {
      setSaving(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <form className={s.form} onSubmit={submit} noValidate>
      <p className={s.sheetIntro}>You&apos;ll stay signed in on this device. Signed up with an email link? This sets a password for the first time.</p>
      <div className="ui-field">
        <label className="ui-label" htmlFor={`${id}-pw`}>New password</label>
        <div className={s.pw}>
          <input
            id={`${id}-pw`} className="ui-input" type={type} name="new-password" autoComplete="new-password"
            value={pw} onChange={(e) => setPw(e.target.value)} minLength={8}
            aria-invalid={show1 ? true : undefined} aria-describedby={`${id}-pw-hint`}
          />
          <IconButton type="button" className={s.eye} label={show ? "Hide password" : "Show password"} onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff /> : <Eye />}
          </IconButton>
        </div>
        <span id={`${id}-pw-hint`} className={show1 ? s.fieldErr : "ui-hint"}>{show1 ?? "At least 8 characters."}</span>
      </div>

      <div className="ui-field">
        <label className="ui-label" htmlFor={`${id}-pw2`}>Confirm new password</label>
        <input
          id={`${id}-pw2`} className="ui-input" type={type} name="confirm-password" autoComplete="new-password"
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={show2 ? true : undefined} aria-describedby={show2 ? `${id}-pw2-err` : undefined}
        />
        {show2 && <span id={`${id}-pw2-err`} className={s.fieldErr}>{show2}</span>}
      </div>

      {/* Lets password managers file the new password under the right account.
          After the fields, so the sheet's autofocus lands on "New password". */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {serverErr && <Callout tone="neg">{serverErr}</Callout>}
      <Button type="submit" variant="primary" size="lg" block loading={saving}>Update password</Button>
    </form>
  );
}
