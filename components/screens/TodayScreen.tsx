"use client";

import { useCallback, useState } from "react";
import { PageHeader, Segmented } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { paths } from "@/lib/client/routes";
import BriefPane from "@/components/today/BriefPane";
import HeadlinesPane from "@/components/today/HeadlinesPane";
import { ago, localDateLabel } from "@/components/today/brief";
import { useNow } from "@/components/today/useNow";
import s from "@/components/today/Today.module.css";

type Sub = "brief" | "news";

/**
 * Today: the overnight brief and the day's headlines, as two panes of one tab.
 *
 * Both panes stay mounted once visited (switching is a URL change, not a
 * refetch), and each reports when its data was last updated so the header can
 * say so for whichever one is on screen.
 */
export default function TodayScreen({ active }: { active: boolean }) {
  const app = useApp();
  const sub: Sub = app.route.sub === "news" ? "news" : "brief";
  const now = useNow();

  // Lazily mount a pane the first time it's shown, then keep it. Adjusting
  // state during render (rather than in an effect) avoids painting a frame
  // with nothing in it on the first switch.
  const [visited, setVisited] = useState<Record<Sub, boolean>>(() => ({ brief: sub === "brief", news: sub === "news" }));
  if (!visited[sub]) setVisited((v) => ({ ...v, [sub]: true }));

  const [updated, setUpdated] = useState<Record<Sub, string | null>>({ brief: null, news: null });
  const onBriefUpdated = useCallback((iso: string | null) => setUpdated((u) => (u.brief === iso ? u : { ...u, brief: iso })), []);
  const onNewsUpdated = useCallback((iso: string | null) => setUpdated((u) => (u.news === iso ? u : { ...u, news: iso })), []);

  // Empty until the client clock is known: the server renders in UTC and the
  // reader's "today" may already be tomorrow.
  const date = now ? localDateLabel(now) : "";
  const rel = ago(updated[sub], now);
  const subtitle = date ? <span className={s.subtitle}>{date}{rel ? ` · Updated ${rel}` : ""}</span> : null;

  return (
    <div className={`page ${s.root}`}>
      <PageHeader
        title="Today"
        subtitle={subtitle}
        actions={
          <Segmented<Sub>
            label="Today view"
            value={sub}
            onChange={(v) => app.navigate(v === "news" ? paths.news() : paths.today())}
            options={[{ value: "brief", label: "Brief" }, { value: "news", label: "Headlines" }]}
          />
        }
      />
      {visited.brief && (
        <div className={s.panel} hidden={sub !== "brief"} role="tabpanel" aria-label="Brief">
          <BriefPane active={active && sub === "brief"} onUpdated={onBriefUpdated} />
        </div>
      )}
      {visited.news && (
        <div className={s.panel} hidden={sub !== "news"} role="tabpanel" aria-label="Headlines">
          <HeadlinesPane active={active && sub === "news"} onUpdated={onNewsUpdated} />
        </div>
      )}
    </div>
  );
}
