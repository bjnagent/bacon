// TEST SUPPORT ONLY — never imported by app code.
//
// A small in-memory stand-in for the supabase-js query builder: enough of
// from()/select/insert/upsert/update/delete/eq/is/gt/lt/limit/order/maybeSingle
// and rpc() to run the billing and cron I/O against, with Postgres' unique
// (23505) and foreign-key (23503) errors where the real tables would raise them.
// A mutation followed by .select() returns the affected rows, as PostgREST does.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingRow } from "./billing";

export type Row = Record<string, unknown>;
export interface FakeResult { data: unknown; error: { message: string; code?: string } | null }

export class FakeDb {
  tables: Record<string, Row[]> = { subscriptions: [], billing_events: [] };
  /** auth.users — subscriptions.user_id must reference one of these. */
  users = new Set<string>();
  /** Make the next query on a table fail with this error. */
  failNext: Record<string, { message: string; code?: string }> = {};
  /** rpc(name) handlers; an unknown function answers like PostgREST does. */
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
  rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  constructor(users: string[] = []) { users.forEach((u) => this.users.add(u)); }
  from(table: string) { return new FakeQuery(this, table); }
  async rpc(name: string, args: Record<string, unknown> = {}): Promise<FakeResult> {
    this.rpcCalls.push({ name, args });
    const fn = this.rpcs[name];
    if (!fn) return { data: null, error: { code: "PGRST202", message: `Could not find the function public.${name}` } };
    const out = fn(args);
    return out && typeof out === "object" && "error" in (out as object) ? (out as FakeResult) : { data: out ?? null, error: null };
  }
  rows(table: string) { return (this.tables[table] ??= []); }
  sub(userId: string) { return this.rows("subscriptions").find((r) => r.user_id === userId) as (Row & ExistingRow) | undefined; }
  asClient() { return this as unknown as SupabaseClient; }
}

class FakeQuery implements PromiseLike<FakeResult> {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private lim: number | null = null;
  private single = false;
  private returning = false;
  private counting = false;
  constructor(private db: FakeDb, private table: string) {}
  select() { if (this.op !== "select") this.returning = true; return this; }
  insert(row: Row) { this.op = "insert"; this.payload = row; return this; }
  upsert(row: Row) { this.op = "upsert"; this.payload = row; return this; }
  update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
  delete(opts?: { count?: string }) { this.op = "delete"; this.counting = !!opts?.count; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  gt(c: string, v: number) { this.filters.push((r) => Number(r[c]) > v); return this; }
  is(c: string) { this.filters.push((r) => r[c] == null); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => String(r[c]) < String(v)); return this; }
  limit(n: number) { this.lim = n; return this; }
  order() { return this; }
  maybeSingle() { this.single = true; return this; }
  then<A = FakeResult, B = never>(ok?: ((v: FakeResult & { count?: number }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.exec()).then(ok, bad);
  }
  private exec(): FakeResult & { count?: number } {
    const forced = this.db.failNext[this.table];
    if (forced) { delete this.db.failNext[this.table]; return { data: null, error: forced }; }
    const rows = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    switch (this.op) {
      case "select": {
        let out = rows.filter(match);
        if (this.lim != null) out = out.slice(0, this.lim);
        return { data: this.single ? (out[0] ? { ...out[0] } : null) : out.map((r) => ({ ...r })), error: null };
      }
      case "insert": {
        const p = this.payload!;
        if (this.table === "billing_events" && rows.some((r) => r.id === p.id)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        rows.push({ ...p });
        return { data: this.returning ? [{ ...p }] : null, error: null };
      }
      case "upsert": {
        const p = this.payload!;
        if (this.table === "subscriptions" && !this.db.users.has(String(p.user_id))) {
          return { data: null, error: { code: "23503", message: "insert or update violates foreign key constraint" } };
        }
        const cur = rows.find((r) => r.user_id === p.user_id);
        if (cur) Object.assign(cur, p); else rows.push({ ...p });
        return { data: null, error: null };
      }
      case "update": {
        const hit = rows.filter(match);
        for (const r of hit) Object.assign(r, this.payload);
        return { data: this.returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      case "delete": {
        const hit = rows.filter(match);
        this.db.tables[this.table] = rows.filter((r) => !match(r));
        return { data: this.returning ? hit : null, error: null, ...(this.counting ? { count: hit.length } : {}) };
      }
    }
  }
}
