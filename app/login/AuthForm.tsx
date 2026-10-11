"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Eye, EyeOff, Mail, MailCheck, Sparkles } from "lucide-react";
import { Button, Callout, Segmented } from "@/components/ui";
import { TRIAL_DAYS } from "@/lib/plans";
import { authAction } from "./actions";
import {
  INITIAL_AUTH_STATE, PASSWORD_MAX, PASSWORD_MIN, parseIntent, validateAuth,
  type AuthField, type AuthIntent, type AuthState,
} from "./messages";
import s from "./login.module.css";

type Mode = "signin" | "signup";
type View = "auth" | "reset";

export interface AuthNotice { tone: "neutral" | "neg"; text: string }

const COPY: Record<Mode | "reset", { title: string; sub: string; cta: string }> = {
  signin: { title: "Welcome back", sub: "Sign in to see this morning's brief.", cta: "Sign in" },
  signup: { title: "Start your research desk", sub: "A short, ranked brief every morning — with the reasoning.", cta: "Create account" },
  reset: { title: "Reset your password", sub: "Enter your email and we'll send you a link to choose a new one.", cta: "Send reset link" },
};

// Safari reads this to generate a strong password that meets our rules. It is
// not in React's typings, hence the cast.
const PASSWORD_RULES = { passwordrules: `minlength: ${PASSWORD_MIN}; maxlength: ${PASSWORD_MAX};` } as Record<string, string>;

export default function AuthForm({ initialMode, initialView, next, notice: initialNotice }: {
  initialMode: Mode; initialView: View; next: string; notice: AuthNotice | null;
}) {
  const [state, formAction, pending] = useActionState(authAction, INITIAL_AUTH_STATE);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [view, setView] = useState<View>(initialView);
  // Controlled on purpose: React resets uncontrolled fields after every form
  // action, which would wipe the email on a wrong-password error.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<{ field: AuthField | null; message: string } | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(initialNotice);
  const [submitted, setSubmitted] = useState<AuthIntent | null>(null);
  const [dismissedSent, setDismissedSent] = useState<AuthState | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  // Surface each new server answer once (React's "adjust state when a value
  // changes" pattern — no effect round-trip, no flash of the old error).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "error" && state.message) setErr({ field: state.field, message: state.message });
  }

  // Put the cursor where the problem is — what a native form does.
  useEffect(() => {
    if (err?.field === "email") emailRef.current?.focus();
    else if (err?.field === "password") pwRef.current?.focus();
  }, [err]);

  const primary: AuthIntent = view === "reset" ? "reset" : mode;
  const copy = COPY[view === "reset" ? "reset" : mode];
  const showSent = state.status === "sent" && dismissedSent !== state;

  const switchMode = (m: Mode) => { setMode(m); setErr(null); };
  const switchView = (v: View) => { setView(v); setErr(null); setNotice(null); };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = parseIntent(submitter?.value ?? primary);
    const invalid = validateAuth(intent, email.trim(), password);
    if (invalid) {
      // Stop here: no round trip for something we can answer instantly.
      e.preventDefault();
      setErr(invalid);
      return;
    }
    setErr(null);
    setNotice(null);
    setSubmitted(intent);
  };

  // Return in the email field moves to the password (keyboard "Next") rather
  // than submitting a half-filled form.
  const onEmailKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && view === "auth" && !password) {
      e.preventDefault();
      pwRef.current?.focus();
    }
  };

  const emailErr = err?.field === "email" ? err.message : null;
  const pwErr = err?.field === "password" ? err.message : null;
  const formErr = err && !err.field ? err.message : null;

  if (showSent) {
    return (
      <>
        <div className={s.card}>
          <SentPanel state={state} />
          <div className={s.sentActions}>
            <form action={formAction}>
              <input type="hidden" name="email" value={state.email} />
              {/* A second sign-up would be answered as a duplicate. A sign-in
                  link does the same job for an unconfirmed address (opening it
                  confirms it), so resend that — still landing in onboarding. */}
              <input type="hidden" name="next" value={state.intent === "signup" ? "/onboarding" : next} />
              <Button type="submit" name="intent" value={state.intent === "signup" ? "magic" : state.intent ?? "magic"} block loading={pending}>
                Send it again
              </Button>
            </form>
            <Button variant="ghost" block onClick={() => { setDismissedSent(state); setView("auth"); setErr(null); }}>
              Use a different email
            </Button>
          </div>
        </div>
        <TrialNote />
      </>
    );
  }

  return (
    <>
      <div className={s.head}>
        <h1>{copy.title}</h1>
        <p>{copy.sub}</p>
      </div>

      {notice && <Callout tone={notice.tone === "neg" ? "neg" : "neutral"}>{notice.text}</Callout>}

      <div className={s.card}>
        {view === "auth" && (
          <Segmented<Mode>
            label="Sign in or create an account"
            block
            value={mode}
            onChange={switchMode}
            options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]}
          />
        )}

        <form className={s.form} action={formAction} onSubmit={onSubmit} noValidate>
          <input type="hidden" name="next" value={next} />

          <div className="ui-field">
            <label className="ui-label" htmlFor="auth-email">Email</label>
            <input
              ref={emailRef}
              id="auth-email"
              name="email"
              type="email"
              className={`ui-input ${s.input}`}
              placeholder="you@example.com"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint={view === "reset" ? "send" : "next"}
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (err?.field === "email") setErr(null); }}
              onKeyDown={onEmailKey}
              aria-invalid={emailErr ? true : undefined}
              aria-describedby={emailErr ? "auth-email-error" : undefined}
            />
            {emailErr && <p id="auth-email-error" className={s.fieldError}>{emailErr}</p>}
          </div>

          {view === "auth" && (
            <div className="ui-field">
              <div className={s.labelRow}>
                <label className="ui-label" htmlFor="auth-password">Password</label>
                {mode === "signin" && (
                  <button type="button" className={s.textLink} onClick={() => switchView("reset")}>Forgot password?</button>
                )}
              </div>
              <div className={s.pw}>
                <input
                  ref={pwRef}
                  id="auth-password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  className={`ui-input ${s.input}`}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (err?.field === "password") setErr(null); }}
                  aria-invalid={pwErr ? true : undefined}
                  aria-describedby={pwErr ? "auth-password-error" : mode === "signup" ? "auth-password-hint" : undefined}
                  {...(mode === "signup" ? PASSWORD_RULES : {})}
                />
                <button
                  type="button"
                  className={s.reveal}
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  aria-pressed={showPw}
                  aria-controls="auth-password"
                >
                  {showPw ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
              {pwErr
                ? <p id="auth-password-error" className={s.fieldError}>{pwErr}</p>
                : mode === "signup" && <p id="auth-password-hint" className="ui-hint">At least {PASSWORD_MIN} characters.</p>}
            </div>
          )}

          {formErr && <Callout tone="neg">{formErr}</Callout>}

          {/* First submit button = the one Return triggers (implicit submission). */}
          <Button
            type="submit" name="intent" value={primary} variant="primary" size="lg" block
            loading={pending && submitted === primary} disabled={pending}
          >
            {copy.cta}
          </Button>

          {view === "auth" ? (
            <>
              <div className={s.or} aria-hidden="true">or</div>
              <Button
                type="submit" name="intent" value="magic" size="lg" block icon={<Mail aria-hidden="true" />}
                loading={pending && submitted === "magic"} disabled={pending}
              >
                Email me a sign-in link
              </Button>
            </>
          ) : (
            <button type="button" className={`${s.textLink} ${s.back}`} onClick={() => switchView("auth")}>
              Back to sign in
            </button>
          )}
        </form>
      </div>

      {view === "auth" && <TrialNote />}
    </>
  );
}

function TrialNote() {
  return (
    <p className={s.trial}>
      <Sparkles aria-hidden="true" />
      New accounts get {TRIAL_DAYS} days of Pro, no card needed.
    </p>
  );
}

function SentPanel({ state }: { state: AuthState }) {
  const body =
    state.intent === "signup" ? <>We sent a confirmation link to <strong>{state.email}</strong>. Open it on this device to finish creating your account.</>
      : state.intent === "reset" ? <>If there&apos;s an account for <strong>{state.email}</strong>, a link to choose a new password is on its way.</>
        : <>We sent a sign-in link to <strong>{state.email}</strong>. Open it on this device and you&apos;re in.</>;
  return (
    <div className={s.sent} role="status">
      <div className={s.sentIcon} aria-hidden="true"><MailCheck /></div>
      <h2>Check your email</h2>
      <p>{body}</p>
      <p className="t-caption">It can take a minute to arrive. If it doesn&apos;t, check your spam folder.</p>
    </div>
  );
}
