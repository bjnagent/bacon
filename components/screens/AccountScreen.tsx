"use client";

// The Account tab: who you are, what your plan includes and how much of it is
// left, the switches that decide what Bacon does overnight, and the exits
// (sign out, delete). Built like iOS Settings — grouped lists, one job per row.
//
// /account/<section> deep-links to a group (see components/account/sections).

import { useEffect, useRef, useState } from "react";
import { FileText, Gauge, KeyRound, LifeBuoy, LogOut, Scale, ShieldCheck, Trash2 } from "lucide-react";
import { List, PageHeader, Row, toast } from "@/components/ui";
import { useApp, type MeState } from "@/components/app/AppContext";
import ProfileHeader from "@/components/account/ProfileHeader";
import PlanCard, { PlanCardError, PlanCardSkeleton } from "@/components/account/PlanCard";
import AlertSettings from "@/components/account/AlertSettings";
import AppearanceSettings from "@/components/account/AppearanceSettings";
import PasswordSheet from "@/components/account/PasswordSheet";
import DeleteAccountSheet from "@/components/account/DeleteAccountSheet";
import { SECTION_ID, resolveAccountSub } from "@/components/account/sections";
import { pinScroll } from "@/components/account/pinScroll";
import { APP_VERSION, LEGAL, SUPPORT_EMAIL, supportMailto } from "@/components/account/constants";
import { paths } from "@/lib/client/routes";
import { openPaywall } from "@/lib/client/paywall";
import { cheapestPlanWith } from "@/lib/plans";
import { openExternal } from "@/lib/native";
import s from "@/components/account/Account.module.css";

/** Stale after this long; refreshed when the tab is shown again. */
const ME_TTL_MS = 60_000;

/** /api/me can answer `{ error }` on a bad day; never render a plan from that. */
function validMe(me: MeState | null): MeState | null {
  return me && me.plan && me.limits ? me : null;
}

function GroupTitle({ children }: { children: string }) {
  return <h2 className={s.groupTitle}>{children}</h2>;
}

export default function AccountScreen({ active }: { active: boolean }) {
  const app = useApp();
  const { refreshMe } = app;
  const me = validMe(app.me);
  const email = app.email || me?.user.email || "";

  const [sheet, setSheet] = useState<"password" | "delete" | null>(null);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // ---- plan freshness ----------------------------------------------------
  // The shell loads /api/me once; usage moves as the member works, so coming
  // back to this tab after a while should show current numbers.
  const meLoadedAt = useRef(0);
  useEffect(() => {
    if (!active) return;
    const now = Date.now();
    if (meLoadedAt.current === 0) { meLoadedAt.current = now; return; }
    if (now - meLoadedAt.current < ME_TTL_MS) return;
    meLoadedAt.current = now;
    void refreshMe();
  }, [active, refreshMe]);

  // If the shell's first load failed, try once more before showing an error.
  const [meTried, setMeTried] = useState(false);
  const [meRetrying, setMeRetrying] = useState(false);
  useEffect(() => {
    if (!active || me || meTried) return;
    const t = setTimeout(() => { void refreshMe().finally(() => setMeTried(true)); }, 4000);
    return () => clearTimeout(t);
  }, [active, me, meTried, refreshMe]);
  const retryMe = async () => {
    setMeRetrying(true);
    try { await refreshMe(); } finally { setMeRetrying(false); }
  };

  // ---- deep links ----------------------------------------------------------
  // A link to /account/<section> is an instruction, used once: scroll there
  // (and open the sheet it names), then put the address back to /account.
  // Otherwise the same link — Watchlist's "Edit voices in Account", say —
  // would do nothing the second time, and the tab bar would return to the
  // section instead of to where the user left the tab.
  const { navigate, can } = app;
  const sub = app.route.sub;
  const layoutRef = useRef<HTMLDivElement>(null);
  // Outlives the effect below on purpose: replacing the URL changes `sub`
  // straight away, but the section should stay pinned while content loads.
  const stopPin = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPin.current?.(), []);
  useEffect(() => {
    if (!active || !sub) return;
    // Next frame: the pane has just been un-hidden and the shell has restored
    // this tab's scroll position; scroll from there.
    const raf = requestAnimationFrame(() => {
      const target = resolveAccountSub(sub);
      navigate(paths.account(), { replace: true });
      if (!target) return;
      const el = document.getElementById(SECTION_ID[target.section]);
      if (el && layoutRef.current) {
        stopPin.current?.();
        stopPin.current = pinScroll(el, layoutRef.current);
      }
      if (target.open === "password") setSheet("password");
      if (target.open === "voices") {
        // Voices feed the personal brief; on a plan without it, show what unlocks it.
        if (can("personal_brief")) setVoicesOpen(true);
        else openPaywall({ reason: "feature", feature: "personal_brief", suggested: cheapestPlanWith("personal_brief") });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [active, sub, navigate, can]);

  // ---- actions -------------------------------------------------------------
  const openLegal = (path: string) => openExternal(new URL(path, window.location.origin).toString());

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // POST only (a GET sign-out is a logout-CSRF). The route clears the auth
      // cookies on its own response and answers 303 → /login?signedout=1.
      // fetch rather than a <form> post so that being offline becomes a toast
      // here instead of a browser error page; the redirect isn't followed
      // (the cookies are already cleared by then) — we navigate ourselves.
      const res = await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
      if (!res.ok && res.type !== "opaqueredirect") throw new Error(`signout ${res.status}`);
      // Full reload, not the router: nothing of this account may survive in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload is the point
      window.location.assign("/login?signedout=1");
    } catch {
      setSigningOut(false);
      toast.error("Couldn't sign out — check your connection and try again.");
    }
  };

  return (
    <div className="page">
      <PageHeader title="Account" />

      <div className={s.layout} ref={layoutRef}>
        <div className={s.grid}>
          <div className={s.col}>
            <ProfileHeader email={email} me={me} />

            <section id={SECTION_ID.plan} className={s.group}>
              <div className="ui-list-title t-eyebrow"><GroupTitle>Plan &amp; usage</GroupTitle></div>
              {me
                ? <PlanCard me={me} refreshMe={refreshMe} />
                : meTried && !meRetrying ? <PlanCardError onRetry={() => void retryMe()} retrying={meRetrying} /> : <PlanCardSkeleton />}
            </section>
          </div>

          <div className={s.col}>
            <section id={SECTION_ID.alerts} className={s.group}>
              <AlertSettings title={<GroupTitle>Brief &amp; alerts</GroupTitle>} voicesOpen={voicesOpen} setVoicesOpen={setVoicesOpen} />
            </section>

            <section id={SECTION_ID.appearance} className={s.group}>
              <AppearanceSettings title={<GroupTitle>Appearance</GroupTitle>} />
            </section>

            <section id={SECTION_ID.security} className={s.group}>
              <List title={<GroupTitle>Security</GroupTitle>}>
                <Row icon={<KeyRound />} title="Change password" chevron onClick={() => setSheet("password")} />
              </List>
            </section>

            <section id={SECTION_ID.support} className={s.group}>
              <List title={<GroupTitle>Support &amp; legal</GroupTitle>}>
                <Row icon={<LifeBuoy />} title="Help & feedback" sub={SUPPORT_EMAIL} href={supportMailto()} />
                <Row icon={<FileText />} title="Terms of service" chevron onClick={() => openLegal(LEGAL.terms)} />
                <Row icon={<ShieldCheck />} title="Privacy policy" chevron onClick={() => openLegal(LEGAL.privacy)} />
                <Row icon={<Scale />} title="Research disclaimer" chevron onClick={() => openLegal(LEGAL.disclaimer)} />
              </List>
            </section>

            {app.isAdmin && (
              <section id={SECTION_ID.admin} className={s.group}>
                <List title={<GroupTitle>Admin</GroupTitle>}>
                  <Row icon={<Gauge />} title="Operator console" sub="Users, plans and usage" href="/admin" />
                </List>
              </section>
            )}

            <section id={SECTION_ID.danger} className={s.group} aria-label="Sign out or delete account">
              <List>
                <Row
                  icon={<LogOut />} title={signingOut ? "Signing out…" : "Sign out"} onClick={() => void signOut()} disabled={signingOut}
                  trailing={signingOut ? <span className="ui-spinner" aria-hidden="true" /> : undefined}
                />
                <Row icon={<Trash2 />} title="Delete account" danger onClick={() => setSheet("delete")} />
              </List>
            </section>

            <footer className={s.footer}>
              <span className="t-caption">Bacon {APP_VERSION}</span>
              <span className="t-caption">Research, not investment advice.</span>
            </footer>
          </div>
        </div>
      </div>

      <PasswordSheet open={sheet === "password"} email={email} onClose={() => setSheet(null)} />
      <DeleteAccountSheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        appStoreSubscriber={me?.plan.source === "subscription" && me.plan.provider === "app_store"}
      />
    </div>
  );
}
