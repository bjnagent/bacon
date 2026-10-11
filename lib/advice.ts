// Advice mode: whether bacon states a position or describes one.
//
// In research mode an opportunity ends in "here is the case, here is what to
// verify". In advice mode it ends in a directive — BUY / SELL / TRIM / HOLD with
// an entry band, a stop level and a size. Same signals, different contract with
// the reader.
//
// This is a per-ACCOUNT entitlement rather than a global switch, because the two
// modes are not interchangeable for everyone using the app. Advice to yourself
// is your own business; the same output sent to someone else is a different
// thing entirely, and this database has other real accounts in it.
//
// ADVICE_EMAILS is a comma-separated allowlist. It falls back to ADMIN_EMAILS so
// the owner needs no extra configuration, but stays a SEPARATE variable because
// "may read the operator console" and "receives investment calls" are different
// permissions that should be able to diverge later. Unset and with no admin
// list, nobody is entitled — fail-CLOSED, the same posture as the admin gate.

import { adminEmails } from "./admin";

export function adviceEmails(): string[] {
  const raw = process.env.ADVICE_EMAILS;
  if (raw == null || raw.trim() === "") return adminEmails();
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** Does this account get directive calls rather than research write-ups? */
export function adviceEnabled(email: string | null | undefined): boolean {
  const list = adviceEmails();
  if (!list.length) return false;
  return !!email && list.includes(email.toLowerCase());
}

/**
 * The shared house account (HOUSE_USER_ID). Its brief is the one every Free
 * member reads, so it is the one account whose output must never be written in
 * advice mode — whatever allowlist its email happens to be on. A directive
 * call to yourself is your business; the same call broadcast to every free
 * member is regulated advice.
 */
export function isHouseAccount(userId: string | null | undefined): boolean {
  const house = (process.env.HOUSE_USER_ID ?? "").trim().toLowerCase();
  return !!house && !!userId && userId.trim().toLowerCase() === house;
}

/** Advice mode for one account: the allowlist, and never the house account. */
export function adviceFor(userId: string | null | undefined, email: string | null | undefined): boolean {
  return !isHouseAccount(userId) && adviceEnabled(email);
}
