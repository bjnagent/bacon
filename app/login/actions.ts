"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";
import {
  friendlyAuthError, parseIntent, validateAuth, validateNewPassword,
  type AuthState,
} from "./messages";

// The sign-in flow's server actions. Every input is re-validated here: the
// client checks are a convenience, and an action is a public POST endpoint.

async function siteOrigin(): Promise<string> {
  // Prefer the configured site URL: email links must point at the canonical
  // host, not whichever preview/alias host happened to serve the form.
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/** The email-link landing URL: exchange the code, then continue to `next`. */
function callbackUrl(origin: string, next: string): string {
  return next === "/" ? `${origin}/api/auth/callback` : `${origin}/api/auth/callback?next=${encodeURIComponent(next)}`;
}

/**
 * One action for the whole form; the submit button that was pressed names the
 * intent. Errors and "check your email" come back as state; success redirects.
 */
export async function authAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const intent = parseIntent(formData.get("intent"));
  const email = String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const base = { intent, email };

  const invalid = validateAuth(intent, email, password);
  if (invalid) return { ...base, status: "error", ...invalid };

  const sb = await createClient();

  if (intent === "signin") {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ...base, status: "error", ...friendlyAuthError(intent, error) };
    redirect(next);
  }

  if (intent === "signup") {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      // A confirmation link continues into onboarding, same as an instant sign-up.
      options: { emailRedirectTo: callbackUrl(await siteOrigin(), next === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`) },
    });
    if (error) return { ...base, status: "error", ...friendlyAuthError(intent, error) };
    // With confirmations on, Supabase answers a duplicate sign-up with a user
    // that has no identities instead of an error (so the address isn't
    // revealed to a stranger). The person typing it is far more likely to be
    // the owner who forgot, so point them at sign-in.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return { ...base, status: "error", field: "email", message: "There's already an account with that email. Sign in instead." };
    }
    if (data.session) redirect(next === "/" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(next)}`);
    return { ...base, status: "sent", field: null, message: null };
  }

  if (intent === "magic") {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(await siteOrigin(), next) } });
    if (error) return { ...base, status: "error", ...friendlyAuthError(intent, error) };
    return { ...base, status: "sent", field: null, message: null };
  }

  // reset — Supabase answers the same whether or not the address has an
  // account, and so does the UI, so this can't be used to probe for members.
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl(await siteOrigin(), "/login/reset") });
  if (error) return { ...base, status: "error", ...friendlyAuthError(intent, error) };
  return { ...base, status: "sent", field: null, message: null };
}

export interface ResetState { message: string | null }

/** Set a new password for the signed-in user (arrived via a reset link). */
export async function updatePasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const invalid = validateNewPassword(password);
  if (invalid) return { message: invalid.message };

  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  if (!data?.claims?.sub) return { message: "Your reset link has expired. Request a new one from the sign-in page." };

  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    const f = friendlyAuthError("reset", error);
    // Only the password-specific mappings (too weak, unchanged) and rate limits
    // make sense here; anything else gets this screen's own wording.
    return { message: f.field === "password" || /too many/i.test(f.message) ? f.message : "We couldn't save your new password. Please try again." };
  }
  redirect(next);
}
