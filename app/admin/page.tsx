import { notFound } from "next/navigation";
import { requireAdmin, loadOverview, loadUsers } from "@/lib/admin";
import AdminConsole from "@/components/AdminConsole";

// The operator console. Gated server-side: a signed-in non-admin gets a plain
// 404, so the route's existence isn't advertised. The APIs re-check
// independently — the page gate is convenience, not the security boundary.
//
// The first range is fetched here rather than from a mount effect in the client,
// so the console paints with numbers already in it. Switching the range and
// hitting refresh go through /api/admin/*.
export const dynamic = "force-dynamic";

export const metadata = { title: "Bacon — Operator Console", robots: { index: false, follow: false } };

const DEFAULT_DAYS = 30;

export default async function AdminPage() {
  const { ok, email, db } = await requireAdmin();
  if (!ok || !db) notFound();

  const [overview, users] = await Promise.all([
    loadOverview(db, DEFAULT_DAYS),
    loadUsers(db, DEFAULT_DAYS, 200),
  ]);

  return (
    <AdminConsole
      email={email ?? ""}
      days={DEFAULT_DAYS}
      overview={overview}
      users={users ?? []}
      // Only real failure mode worth surfacing: the migration isn't applied yet.
      loadError={overview ? null : "Couldn't load metrics — has the ai_events migration been applied?"}
    />
  );
}
