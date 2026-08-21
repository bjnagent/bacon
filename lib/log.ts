// Breadcrumbs for deliberately swallowed failures.
//
// Most catches in this codebase are correct and should stay: a missing price
// series should degrade to "no chart", and analytics must never break a user
// action. What was wrong is that they left NO trace — which is how three admin
// RPCs sat broken behind a permission error while the console rendered
// "No accounts yet." on eight live accounts. A failure that renders identically
// to an empty product is invisible until someone counts rows by hand.
//
// So: keep the fallback, add the breadcrumb. Never throws, never awaits, and
// costs one call — the point is that it can be dropped in without changing any
// control flow.

function reason(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  // Supabase returns plain objects with message/code rather than Errors.
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown };
    if (typeof e.message === "string") return e.code ? `${e.code}: ${e.message}` : e.message;
  }
  return String(err);
}

/** Record a failure that is being handled by falling back. `where` should name
 *  the operation, not the file — it's read in a log, without the code. */
export function swallowed(where: string, err: unknown): void {
  console.warn(`[swallowed] ${where} — ${reason(err)}`);
}

/**
 * Drop-in for `.catch(() => null)` that leaves a trace first:
 *
 *   getPropertySeries(sb, key).catch(orNull("property series"))
 *
 * Same shape, same fallback, same control flow — the failure is just no longer
 * silent. `orEmpty` is the array-valued twin.
 */
export const orNull = (where: string) => (err: unknown): null => { swallowed(where, err); return null; };
// `never[]`, not `T[]`: in a `.catch()` position there is nothing to infer T
// from, so a generic would widen the whole union to `unknown[]` and break every
// caller's element type. `never[]` is assignable to any array, which is exactly
// how the `[]` literal it replaces behaved.
export const orEmpty = (where: string) => (err: unknown): never[] => { swallowed(where, err); return []; };
