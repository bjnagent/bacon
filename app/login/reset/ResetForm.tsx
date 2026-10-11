"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui";
import { updatePasswordAction, type ResetState } from "../actions";
import { PASSWORD_MAX, PASSWORD_MIN, validateNewPassword } from "../messages";
import s from "../login.module.css";

const INITIAL: ResetState = { message: null };
const PASSWORD_RULES = { passwordrules: `minlength: ${PASSWORD_MIN}; maxlength: ${PASSWORD_MAX};` } as Record<string, string>;

export default function ResetForm({ email, next }: { email: string; next: string }) {
  const [state, formAction, pending] = useActionState(updatePasswordAction, INITIAL);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  // A fresh server answer replaces any local message.
  const [seen, setSeen] = useState(state);
  if (state !== seen) { setSeen(state); setLocalErr(null); }
  const error = localErr ?? state.message;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const invalid = validateNewPassword(password);
    if (invalid) { e.preventDefault(); setLocalErr(invalid.message); }
  };

  return (
    <div className={s.card}>
      <form className={s.form} action={formAction} onSubmit={onSubmit} noValidate>
        <input type="hidden" name="next" value={next} />
        {/* Lets the password manager file the new password under the right
            account; visually hidden rather than type=hidden, which managers ignore. */}
        <input className="sr-only" type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" />

        <div className="ui-field">
          <label className="ui-label" htmlFor="new-password">New password</label>
          <div className={s.pw}>
            <input
              id="new-password"
              name="password"
              type={show ? "text" : "password"}
              className={`ui-input ${s.input}`}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setLocalErr(null); }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "new-password-error" : "new-password-hint"}
              {...PASSWORD_RULES}
            />
            <button
              type="button" className={s.reveal} onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} aria-controls="new-password"
            >
              {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </button>
          </div>
          {error
            ? <p id="new-password-error" className={s.fieldError} role="alert">{error}</p>
            : <p id="new-password-hint" className="ui-hint">At least {PASSWORD_MIN} characters.</p>}
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={pending}>Save password</Button>
      </form>
    </div>
  );
}
