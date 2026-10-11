import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronDown } from "./icons";
import { CONTACT_EMAIL, formatLegalDate } from "./site";
import s from "./Legal.module.css";

// The frame every legal page shares: title, "Last updated", a summary in plain
// English, a table of contents built from the sections, and the sections.
// Static markup only.

export interface LegalSection { id: string; title: string; body: ReactNode }

const DOCS = [
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/disclaimer", label: "Disclaimer" },
] as const;

export function LegalDoc({ path, title, updated, summary, sections }: {
  path: (typeof DOCS)[number]["href"];
  title: string;
  updated: string;
  summary: ReactNode;
  sections: LegalSection[];
}) {
  const toc = (
    <ol className={s.tocList}>
      {sections.map((sec, i) => (
        <li key={sec.id}><a href={`#${sec.id}`}><span className={s.tocNum}>{i + 1}.</span>{sec.title}</a></li>
      ))}
    </ol>
  );
  return (
    <div className={s.wrap}>
      <nav className={s.docs} aria-label="Legal documents">
        {DOCS.map((d) => (
          <Link key={d.href} href={d.href} className={s.doc} aria-current={d.href === path ? "page" : undefined}>{d.label}</Link>
        ))}
      </nav>

      <header className={s.head}>
        <h1 className={s.title}>{title}</h1>
        <p className={s.updated}>Last updated <time dateTime={updated}>{formatLegalDate(updated)}</time></p>
      </header>

      <div className={s.grid}>
        <aside className={s.tocSide} aria-label="On this page">
          <p className={s.tocHead}>On this page</p>
          {toc}
        </aside>

        <article className={s.body}>
          <div className={s.summary}>
            <p className={s.summaryHead}>The short version</p>
            {summary}
          </div>

          <details className={s.tocInline}>
            <summary><span>On this page</span><IconChevronDown /></summary>
            {toc}
          </details>

          {sections.map((sec, i) => (
            <section key={sec.id} id={sec.id} className={s.section} aria-labelledby={`${sec.id}-h`}>
              <h2 id={`${sec.id}-h`}><span className={s.secNum}>{i + 1}.</span> {sec.title}</h2>
              {sec.body}
            </section>
          ))}

          <p className={s.contact}>
            Questions about this document? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </article>
      </div>
    </div>
  );
}
