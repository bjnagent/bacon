import type { ReactNode } from "react";
import { IconChevronDown } from "./icons";
import s from "./Marketing.module.css";

export interface FaqEntry { q: string; a: ReactNode }

// Native disclosure widgets: keyboard and screen-reader support for free, find-
// in-page opens the matching answer (Chrome), and no JavaScript.
export function Faq({ items }: { items: FaqEntry[] }) {
  return (
    <div className={s.faq}>
      {items.map((it) => (
        <details key={it.q} className={s.faqItem}>
          <summary>
            <span>{it.q}</span>
            <IconChevronDown />
          </summary>
          <div className={s.faqBody}>{it.a}</div>
        </details>
      ))}
    </div>
  );
}
