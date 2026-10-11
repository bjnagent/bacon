// Validation and error copy for the sign-in flow. Pure, so the same rules run
// in the browser (instant inline errors) and in the server action (the real
// gate — a form can be posted without our JavaScript).

export type AuthIntent = "signin" | "signup" | "magic" | "reset";
export type AuthField = "email" | "password";

export interface AuthState {
  intent: AuthIntent | null;
  status: "idle" | "error" | "sent";
  message: string | null;
  /** Which input the message belongs to; null = the form as a whole. */
  field: AuthField | null;
  /** Echoed back so a no-JS post re-renders with the address still filled in. */
  email: string;
}

export const INITIAL_AUTH_STATE: AuthState = { intent: null, status: "idle", message: null, field: null, email: "" };

export const PASSWORD_MIN = 8;
// bcrypt (what Supabase hashes with) ignores everything past 72 bytes; saying
// so up front beats a password that silently only half counts.
export const PASSWORD_MAX = 72;

export function parseIntent(v: unknown): AuthIntent {
  return v === "signup" || v === "magic" || v === "reset" ? v : "signin";
}

// Deliberately loose: one "@", something either side, a dot in the domain.
// The real check is the confirmation email; this only catches typos early.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAuth(intent: AuthIntent, email: string, password: string): { field: AuthField; message: string } | null {
  if (!email) return { field: "email", message: "Enter your email address." };
  if (!EMAIL.test(email)) return { field: "email", message: "That doesn't look like an email address." };
  if (intent === "signin" && !password) return { field: "password", message: "Enter your password." };
  if (intent === "signup") return validateNewPassword(password);
  return null;
}

export function validateNewPassword(password: string): { field: "password"; message: string } | null {
  if (password.length < PASSWORD_MIN) return { field: "password", message: `Use at least ${PASSWORD_MIN} characters.` };
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return { field: "password", message: `Use ${PASSWORD_MAX} characters or fewer.` };
  return null;
}

/**
 * Turn a Supabase auth error into something a person can act on. Matches the
 * stable `code` first and falls back to the message text for older servers.
 */
export function friendlyAuthError(intent: AuthIntent, err: { message?: string; code?: string; status?: number }): { field: AuthField | null; message: string } {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return { field: "password", message: "That email and password don't match. Try again, or reset your password." };
  }
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return { field: null, message: "Confirm your email first — open the link we sent when you signed up. Or email yourself a sign-in link instead." };
  }
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) {
    return { field: "email", message: "There's already an account with that email. Sign in instead." };
  }
  if (code === "weak_password" || msg.includes("password should") || msg.includes("weak")) {
    return { field: "password", message: "That password is too easy to guess. Try a longer one, or a few unrelated words." };
  }
  if (code === "same_password") {
    return { field: "password", message: "That's your current password. Choose a new one." };
  }
  if (code === "email_address_invalid" || msg.includes("invalid format") || msg.includes("unable to validate email")) {
    return { field: "email", message: "That doesn't look like an email address." };
  }
  if (code.startsWith("over_") || err.status === 429 || msg.includes("rate limit") || msg.includes("security purposes")) {
    return { field: null, message: "Too many attempts in a short time. Wait a minute, then try again." };
  }
  if (code === "signup_disabled" || msg.includes("signups not allowed")) {
    return { field: null, message: "New sign-ups are paused for the moment. Please try again later." };
  }
  if (msg.includes("fetch") || msg.includes("network")) {
    return { field: null, message: "We couldn't reach the sign-in service. Check your connection and try again." };
  }
  const what = intent === "signup" ? "create your account" : intent === "signin" ? "sign you in" : "send that email";
  return { field: null, message: `We couldn't ${what}. Please try again in a moment.` };
}

/** Copy for an email link that failed at /api/auth/callback or /confirm. */
export function linkErrorMessage(reason: string | undefined): string {
  const r = (reason ?? "").toLowerCase();
  // The PKCE verifier lives in a cookie in the browser that asked for the link,
  // so opening it anywhere else fails — the most common "broken link" by far.
  if (r.includes("verifier") || r.includes("code challenge")) {
    return "Open the link on the same device and browser you requested it from — or request a new one here.";
  }
  if (r.includes("expired") || r.includes("invalid")) {
    return "That link has expired or was already used. Request a new one below.";
  }
  return "We couldn't verify that link. Request a new one below.";
}
