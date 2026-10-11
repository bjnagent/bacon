import Link from "next/link";
import type { ReactNode } from "react";
import BaconMark from "@/components/BaconMark";
import { IconClose, IconMenu } from "./icons";
import { CONTACT_EMAIL, LEGAL_ENTITY } from "./site";
import s from "./Marketing.module.css";

// Header + footer for the public pages. Server-rendered with no client
// JavaScript: the phone menu is a <details> element.
//
// The CTAs don't try to detect a signed-in visitor. /login sends anyone who is
// already signed in straight into the app, so "Sign in" and "Start free" both
// do the right thing without a cookie check (and without a label flash).

type Current = "home" | "pricing" | "record" | "legal";

export function SiteHeader({ current }: { current?: Current }) {
  const here = (c: Current) => (current === c ? ("page" as const) : undefined);
  return (
    <header className={s.header}>
      <div className={`${s.container} ${s.headerInner}`}>
        <Link href="/welcome" className={s.brand} aria-current={here("home")}>
          <BaconMark size={30} />
          <span>Bacon</span>
        </Link>
        <nav className={s.nav} aria-label="Main">
          <Link href="/pricing" className={s.navLink} aria-current={here("pricing")}>Pricing</Link>
          <Link href="/record" className={s.navLink} aria-current={here("record")}>Track record</Link>
        </nav>
        <div className={s.headerEnd}>
          <Link href="/login" className={s.signIn}>Sign in</Link>
          <Link href="/login?mode=signup" className={`ui-btn ui-btn--primary ${s.cta}`}>Start free</Link>
          <details className={s.menu}>
            <summary aria-label="Menu">
              <IconMenu className={s.iconOpen} />
              <IconClose className={s.iconClose} />
            </summary>
            <nav className={s.menuPanel} aria-label="Menu">
              <Link href="/welcome">Home</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/record">Track record</Link>
              <Link href="/login">Sign in</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.container}>
        <div className={s.footGrid}>
          <div className={s.footBrand}>
            <Link href="/welcome" className={s.brand}><BaconMark size={28} /><span>Bacon</span></Link>
            <p>Your overnight research desk. A short, ranked brief each morning, with the reasoning — and a public record of how its calls aged.</p>
          </div>
          <nav className={s.footCol} aria-labelledby="foot-product">
            <h2 id="foot-product">Product</h2>
            <Link href="/pricing">Pricing</Link>
            <Link href="/record">Track record</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/login?mode=signup">Create account</Link>
          </nav>
          <nav className={s.footCol} aria-labelledby="foot-legal">
            <h2 id="foot-legal">Legal</h2>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/disclaimer">Disclaimer</Link>
          </nav>
          <div className={s.footCol}>
            <h2>Contact</h2>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
        </div>
        <div className={s.footFine}>
          <p>
            Bacon is a research tool, not investment advice. It doesn&apos;t know your circumstances, its output can be
            wrong, and past results don&apos;t predict future ones. Check anything that matters before you act on it.
          </p>
          <p>© {new Date().getFullYear()} {LEGAL_ENTITY}</p>
        </div>
      </div>
    </footer>
  );
}

/** Header, a skip link, the page, and the footer. */
export function MarketingShell({ current, children }: { current?: Current; children: ReactNode }) {
  return (
    <div className={s.shell}>
      <a href="#main" className={s.skip}>Skip to content</a>
      <SiteHeader current={current} />
      <main id="main" className={s.main}>{children}</main>
      <SiteFooter />
    </div>
  );
}
