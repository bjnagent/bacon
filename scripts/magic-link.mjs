// Mint a working login link WITHOUT sending an email (bypasses the email rate
// limit). Uses your service-role key + the admin API, then prints a URL that
// hits /api/auth/confirm to establish the session.
//
// Usage:
//   node scripts/magic-link.mjs you@example.com
//
// Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and (optionally)
// NEXT_PUBLIC_SITE_URL from .env.local, or pass them inline:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SITE_URL=https://bacon-flax.vercel.app \
//   node scripts/magic-link.mjs you@example.com
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Best-effort load of .env.local (without overriding already-set vars).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local — rely on inline env */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const email = process.argv[2];

if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
if (!email) { console.error("Usage: node scripts/magic-link.mjs you@example.com"); process.exit(1); }

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// type "magiclink" needs the user to exist; fall back to "signup" for a new email.
let res = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (res.error && /not.*found|no user/i.test(res.error.message)) {
  res = await admin.auth.admin.generateLink({ type: "signup", email, password: crypto.randomUUID() });
}
if (res.error) { console.error("generateLink failed:", res.error.message); process.exit(1); }

const { hashed_token, verification_type } = res.data.properties;
const confirm = `${site}/api/auth/confirm?token_hash=${hashed_token}&type=${verification_type}&next=/`;
console.log("\nOpen this in your browser (no email, no rate limit):\n\n" + confirm + "\n");
