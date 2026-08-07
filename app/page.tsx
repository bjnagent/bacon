import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import AppShell from "@/components/AppShell";

export default async function HomePage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Decided on the server so the allowlist never reaches the browser: a false
  // here only hides a link, and /admin re-checks independently — this is
  // convenience, not the security boundary.
  return <AppShell userEmail={user.email ?? "signed in"} isAdmin={isAdminEmail(user.email)} />;
}
