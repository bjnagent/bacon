import { NextResponse } from "next/server";
import { requireUser, isResponse, fail } from "@/lib/api";

// DELETE: remove a property from the portfolio. Deliberately ungated — a member
// who downgrades must still be able to remove what they saved. RLS guarantees a
// member can only touch their own rows, so matching on id alone is safe.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUser();
  if (isResponse(auth)) return auth;

  const { error } = await auth.sb.from("properties").delete().eq("id", id);
  if (error) return fail(500, "Couldn't remove that property — try again.", { code: "db_error" });
  return NextResponse.json({ ok: true });
}
