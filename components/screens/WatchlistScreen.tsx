"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader, Segmented, Button } from "@/components/ui";
import { useApp } from "@/components/app/AppContext";
import { paths } from "@/lib/client/routes";
import NamesPane from "@/components/watchlist/NamesPane";
import PropertyPane from "@/components/watchlist/PropertyPane";
import { isStale, plural } from "@/components/watchlist/logic";
import s from "@/components/watchlist/Watchlist.module.css";

type Sub = "names" | "property";

/**
 * The Watchlist tab: tracked names (re-read nightly) and the SG/AU property
 * tracker. Both panes stay mounted once visited so switching between them never
 * refetches; coming back to the tab after a few minutes refreshes quietly.
 */
export default function WatchlistScreen({ active }: { active: boolean }) {
  const app = useApp();
  const sub: Sub = app.route.tab === "watchlist" && app.route.sub === "property" ? "property" : "names";

  const [visited, setVisited] = useState<Record<Sub, boolean>>({ names: sub === "names", property: sub === "property" });
  if (!visited[sub]) setVisited((v) => ({ ...v, [sub]: true })); // adjust-during-render: mount a pane on first visit

  const [addName, setAddName] = useState(false);
  const [addProperty, setAddProperty] = useState(false);
  // Stable: these become a Sheet's onClose (see components/watchlist/useEvent).
  const openAddName = useCallback(() => setAddName(true), []);
  const closeAddName = useCallback(() => setAddName(false), []);
  const openAddProperty = useCallback(() => setAddProperty(true), []);
  const closeAddProperty = useCallback(() => setAddProperty(false), []);

  // Bumped when the tab becomes active with data older than STALE_MS; panes
  // watch it and refetch in the background.
  const [nonce, setNonce] = useState(0);
  const lastLoad = useRef(0);
  useEffect(() => {
    if (!active) return;
    const now = Date.now();
    if (lastLoad.current === 0) { lastLoad.current = now; return; } // first show: panes are loading already
    if (!isStale(lastLoad.current, now)) return;
    lastLoad.current = now;
    setNonce((n) => n + 1);
  }, [active]);

  const propertyLocked = !app.can("property");
  const n = app.watchlist.length;
  const subtitle = sub === "property"
    ? "Singapore and Australia"
    : !app.watchlistLoaded ? "Checked daily" : n ? `${plural(n, "name")} · checked daily` : "Nothing tracked yet";

  const onAdd = () => (sub === "property" ? setAddProperty(true) : setAddName(true));
  const showAdd = sub === "names" || !propertyLocked;

  return (
    <div className="page">
      <PageHeader
        title="Watchlist"
        subtitle={subtitle}
        actions={showAdd ? <Button variant="primary" size="sm" icon={<Plus />} onClick={onAdd}>Add</Button> : undefined}
      />

      <div className={s.segWrap}>
        <Segmented<Sub>
          label="Watchlist view" block value={sub}
          onChange={(v) => app.navigate(v === "property" ? paths.property() : paths.watchlist())}
          options={[{ value: "names", label: "Names" }, { value: "property", label: "Property" }]}
        />
      </div>

      {visited.names && (
        <div hidden={sub !== "names"}>
          <NamesPane addOpen={addName} onAdd={openAddName} onAddClose={closeAddName} refreshNonce={nonce} />
        </div>
      )}
      {visited.property && (
        <div hidden={sub !== "property"}>
          <PropertyPane addOpen={addProperty} onAdd={openAddProperty} onAddClose={closeAddProperty} refreshNonce={nonce} />
        </div>
      )}

      <p className={`t-caption ${s.disclaimer}`}>Research, not investment advice.</p>
    </div>
  );
}
