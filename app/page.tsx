import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="bacon-shell">
      <nav className="pr-nav-rail">
        <div className="pr-logo">🥓</div>
        {["Radar", "News", "Analyze", "Frameworks", "Sizer"].map((label) => (
          <button key={label} className="pr-nav-item">{label}</button>
        ))}
        <form action="/api/auth/signout" method="post" className="signout-form">
          <button type="submit" className="pr-nav-item pr-nav-signout">Sign out</button>
        </form>
      </nav>
      <main className="pr-content">
        <header className="pr-top-bar">
          <span className="pr-app-name">Bacon</span>
          <span className="pr-disclaimer-inline">Verify yourself · Not financial advice</span>
        </header>
        <div className="pr-view-placeholder">
          <p className="pr-placeholder-text">Phase 2: Radar, News, Analyze, Frameworks, Sizer views coming soon.</p>
          <p className="pr-placeholder-sub">Authenticated as {user.email}</p>
        </div>
      </main>
    </div>
  );
}
