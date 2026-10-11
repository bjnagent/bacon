// Route-handler plumbing shared by every /api/* route: authenticate, parse,
// answer in one consistent shape.
//
// Every route used to open with the same five lines — create a client, call
// getUser, 401, try/catch the JSON body, 400 — written slightly differently in
// each (some returned a JSON error, some a bare string, chat a text/plain 401).
// The client then had to cope with all of them. One helper, one error shape:
//
//   { error: string, code?: string, ...extra }
//
// Speed: identity comes from `getClaims()`, which verifies the session JWT
// locally against the project's published signing keys instead of making a
// network round trip to the auth server on every request (it transparently
// falls back to that round trip on projects still using a shared-secret JWT).

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

export interface ApiUser { id: string; email: string | null }
export interface Authed { sb: SupabaseClient; user: ApiUser }

export function fail(status: number, error: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error, ...(extra ?? {}) }, { status });
}

export const unauthorized = () => fail(401, "Not signed in", { code: "unauthenticated" });
export const badRequest = (msg = "Bad request") => fail(400, msg, { code: "bad_request" });

/** Resolve the signed-in user, or a 401 response to return as-is. */
export async function requireUser(): Promise<Authed | NextResponse> {
  const sb = await createClient();
  try {
    const { data, error } = await sb.auth.getClaims();
    const claims = data?.claims as { sub?: string; email?: string } | undefined;
    if (error || !claims?.sub) return unauthorized();
    return { sb, user: { id: claims.sub, email: claims.email ?? null } };
  } catch {
    return unauthorized();
  }
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof Response;
}

/** Parse a JSON body; null on anything malformed (the caller answers 400). */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const v = await req.json();
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

/** Trimmed, length-capped string from an unknown body field. */
export function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
