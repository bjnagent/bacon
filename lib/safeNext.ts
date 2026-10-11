// Where to send someone after they sign in.
//
// `next` reaches us through URLs the user didn't type: proxy.ts appends it when
// it bounces a signed-out visitor, and it rides along inside every email link
// (magic link, sign-up confirmation, password reset). Anyone can mint such a URL,
// so it is attacker-controlled input. An open redirect on a login page is a
// ready-made phishing kit — "sign in to Bacon", then land on a lookalike that
// asks for the password again — so only a path on this origin survives.
//
// Pure and dependency-free: used by server actions, route handlers and client
// components alike.

// A throwaway origin to resolve against. `.invalid` is reserved (RFC 2606), so
// it can never collide with a real host that a crafted value might name.
const BASE = "http://next.invalid";

// Browsers strip tabs/newlines from URLs and treat "\" as "/", so "/\t/evil.com"
// and "/\evil.com" both become the protocol-relative "//evil.com".
const UNSAFE_CHARS = /[\\\u0000-\u001F\u007F]/;

/**
 * Return `raw` if it is a same-origin path ("/analyze/NVDA?x=1#y"), otherwise
 * `fallback`. Never returns an absolute or protocol-relative URL.
 */
export function safeNext(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return fallback;
  // Root-relative paths only. "//host" and "/\host" are protocol-relative.
  if (raw[0] !== "/" || raw[1] === "/" || raw[1] === "\\") return fallback;
  if (UNSAFE_CHARS.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  const out = url.pathname + url.search + url.hash;
  // Dot segments can normalise back into "//": "/..//evil.com" resolves to the
  // path "//evil.com", which a browser would read as a host.
  if (out.startsWith("//")) return fallback;

  // Never bounce into API plumbing: next=/api/auth/signout would sign the user
  // straight back out the moment they signed in. And /login would just loop.
  const p = url.pathname;
  if (p === "/api" || p.startsWith("/api/") || p === "/login") return fallback;

  return out;
}
