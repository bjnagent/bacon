import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import AppShell from "@/components/app/AppShell";

// The signed-in app. One persistent shell owns every screen; the pages under
// this layout render nothing themselves — the shell reads the URL and shows the
// matching screen, keeping the others mounted so switching is instant and
// nothing refetches.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data } = await sb.auth.getClaims();
  const claims = data?.claims as { sub?: string; email?: string } | undefined;
  if (!claims?.sub) redirect("/login");

  // Decided on the server so the allowlist never reaches the browser: a false
  // here only hides a link, and /admin re-checks independently.
  return (
    <>
      <AppShell email={claims.email ?? ""} isAdmin={isAdminEmail(claims.email)} />
      {children}
    </>
  );
}
