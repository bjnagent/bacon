"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, AlertTriangle, ArrowLeft, ChevronRight, Info } from "lucide-react";
import { fetchJson } from "@/lib/fetchJson";
import type { DayRow, Overview, UserRow, UserDetail } from "@/lib/adminTypes";
import BaconMark from "./BaconMark";

const RANGES = [7, 30, 90] as const;

const usd = (n: number) => {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(4)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
};
const compact = (n: number) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};
const ms = (n: number | null) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`);
const ago = (iso: string | null) => {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(d)) return "—";
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};
// Local-part only in the table; the full address is in the row title. Keeps
// shoulder-surfing the console from being a list of customer emails.
const shortEmail = (e: string | null) => (e ? e.split("@")[0] : "system");

// Daily spend bars + a calls line on a shared x-axis. Hand-rolled SVG — the
// alternative is a charting dependency for one chart.
function SpendChart({ rows }: { rows: DayRow[] }) {
  if (rows.length < 2) return <div className="ad-empty">Not enough days of data to plot yet.</div>;
  const W = 100, H = 34;
  const maxCost = Math.max(...rows.map((r) => Number(r.cost) || 0), 1e-6);
  const maxCalls = Math.max(...rows.map((r) => r.calls), 1);
  const bw = W / rows.length;
  const line = rows
    .map((r, i) => `${(i + 0.5) * bw},${H - (r.calls / maxCalls) * (H - 4) - 2}`)
    .join(" ");
  return (
    <div className="ad-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Daily spend, peak ${usd(maxCost)}`}>
        {rows.map((r, i) => {
          const h = ((Number(r.cost) || 0) / maxCost) * (H - 4);
          return (
            <rect key={r.day} x={i * bw + bw * 0.16} y={H - h} width={bw * 0.68} height={Math.max(h, 0.4)} fill="var(--accent)" opacity={0.82}>
              <title>{`${r.day} — ${usd(r.cost)}, ${r.calls} calls, ${r.users} users`}</title>
            </rect>
          );
        })}
        <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth="0.6" strokeLinejoin="round" opacity={0.55} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="ad-chart-axis">
        <span>{rows[0].day}</span>
        <span className="ad-chart-legend"><i className="ad-key ad-key-bar" /> spend · peak {usd(maxCost)} <i className="ad-key ad-key-line" /> calls · peak {maxCalls}</span>
        <span>{rows[rows.length - 1].day}</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="ad-kpi">
      <div className="ad-kpi-lbl">{label}</div>
      <div className={`ad-kpi-val${tone ? ` is-${tone}` : ""}`}>{value}</div>
      {sub ? <div className="ad-kpi-sub">{sub}</div> : null}
    </div>
  );
}

// Everything the product did before the cost ledger existed. Spend is only
// knowable from `ai_events`, but ACTIVITY isn't — the quota meter and the
// content tables have been recording all along. Showing this separately is what
// keeps an empty ledger from reading as an empty product.
function ActivityPanel({ a, metered }: { a: Overview["activity"]; metered: boolean }) {
  const tiles: [string, number][] = [
    ["Briefs", a.briefs], ["Calls filed", a.callsFiled], ["Scout picks", a.picks],
    ["News items", a.news], ["Chat messages", a.chats], ["Watchlist", a.watchlist],
    ["Themes", a.themes], ["Property outlooks", a.outlooks],
  ];
  return (
    <section className="ad-sec">
      <h2 className="ad-h">
        Activity <span className="ad-h-sub">
          all time{a.since ? `, from ${a.since}` : ""} · counted by the quota meter and the content tables
        </span>
      </h2>
      {!metered ? (
        <div className="ad-note">
          <Info size={13} /> Cost metering starts with this deploy, so the spend panels above are
          empty — that is the ledger&rsquo;s age, not an idle product. {a.aiCalls} AI call
          {a.aiCalls === 1 ? "" : "s"} across {a.activeUsers} account
          {a.activeUsers === 1 ? "" : "s"} are already on record below; token and dollar detail
          begins accruing from the next call.
        </div>
      ) : null}
      <div className="ad-kpis">
        <Kpi label="AI calls · all time" value={compact(a.aiCalls)} sub={a.since ? `since ${a.since}` : "no calls recorded"} />
        <Kpi label="Accounts that ran a call" value={String(a.activeUsers)} />
        {tiles.filter(([, n]) => n > 0).map(([label, n]) => <Kpi key={label} label={label} value={compact(n)} />)}
      </div>
      {a.byDay.length >= 2 ? (
        <div className="ad-bars">
          {a.byDay.map((d) => {
            const max = Math.max(...a.byDay.map((x) => x.calls), 1);
            return (
              <div key={d.day} className="ad-bar" title={`${d.day} — ${d.calls} calls, ${d.users} user${d.users === 1 ? "" : "s"}`}>
                <div className="ad-bar-fill" style={{ height: `${Math.max((d.calls / max) * 100, 4)}%` }} />
                <span className="ad-bar-lbl">{d.day.slice(5)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

// The drill-down: what one account is actually doing. Loaded on demand — a
// transcript per row would make the user table's payload enormous.
function UserDetailPanel({ d }: { d: UserDetail }) {
  return (
    <div className="ad-detail">
      <div className="ad-detail-cols">
        <div>
          <h3 className="ad-h3">Following <span className="ad-h-sub">{d.watchlist.length} name{d.watchlist.length === 1 ? "" : "s"}</span></h3>
          {d.watchlist.length ? (
            <ul className="ad-list">
              {d.watchlist.map((w) => (
                <li key={`${w.symbol}-${w.at}`}>
                  <span className="ad-mono ad-strong">{w.symbol}</span>
                  {w.lean ? <span className={`ad-pill is-${w.lean}`}>{w.lean}</span> : null}
                  {w.conviction ? <span className="ad-dim"> conviction {w.conviction}/5</span> : null}
                  {w.thesis ? <div className="ad-sub">{w.thesis}</div> : null}
                </li>
              ))}
            </ul>
          ) : <p className="ad-empty-cell">Nothing on the watchlist.</p>}

          <h3 className="ad-h3">Themes</h3>
          {d.themes.length ? (
            <div className="ad-chips">{d.themes.map((t) => <span key={t.label} className="ad-chip">{t.label}</span>)}</div>
          ) : <p className="ad-empty-cell">No themes followed.</p>}

          <h3 className="ad-h3">Calls filed <span className="ad-h-sub">{d.calls.length}</span></h3>
          {d.calls.length ? (
            <table className="ad-table">
              <thead><tr><th>When</th><th>Name</th><th>Call</th><th>vs SPY</th></tr></thead>
              <tbody>
                {d.calls.slice(0, 12).map((c, i) => (
                  <tr key={`${c.instrument}-${c.at}-${i}`}>
                    <td className="ad-dim">{ago(c.at)}</td>
                    <td className="ad-mono">{c.instrument}</td>
                    <td>{c.action}{c.target ? <span className="ad-dim"> → {c.target}</span> : null}</td>
                    <td className={c.hit == null ? "ad-dim" : c.hit ? "ad-good" : "ad-bad"}>
                      {c.actualPct == null ? "ungraded"
                        : `${c.actualPct > 0 ? "+" : ""}${Number(c.actualPct).toFixed(1)}%${
                            c.benchPct == null ? "" : ` vs ${Number(c.benchPct) > 0 ? "+" : ""}${Number(c.benchPct).toFixed(1)}%`}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="ad-empty-cell">No calls filed.</p>}
        </div>

        <div>
          <h3 className="ad-h3">
            Chat log <span className="ad-h-sub">{d.chat.length} message{d.chat.length === 1 ? "" : "s"}, newest first</span>
          </h3>
          {d.chat.length ? (
            <div className="ad-chat">
              {d.chat.map((m, i) => (
                <div key={`${m.at}-${i}`} className={`ad-msg is-${m.role}`}>
                  <div className="ad-msg-head">
                    <span className="ad-msg-role">{m.role === "user" ? "user" : "bacon"}</span>
                    <span className="ad-dim">{ago(m.at)}</span>
                  </div>
                  <div className="ad-msg-body">{m.text}{m.truncated ? <span className="ad-dim"> …truncated</span> : null}</div>
                </div>
              ))}
            </div>
          ) : <p className="ad-empty-cell">No chat history.</p>}

          {d.briefs.length ? (
            <>
              <h3 className="ad-h3">Briefs <span className="ad-h-sub">{d.briefs.length} days</span></h3>
              <div className="ad-chips">
                {d.briefs.slice(0, 20).map((b) => (
                  <span key={b.day} className={`ad-chip${b.reviewed ? " is-on" : ""}`} title={b.reviewed ? "reviewed" : "not reviewed"}>
                    {b.day.slice(5)} · {b.items}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Operator console: what the AI layer is costing, which surfaces users actually
// reach for, and who the heavy accounts are. Every number here is measured —
// token counts come from the providers themselves, priced at write time.
export default function AdminConsole({
  email, days: initialDays, overview, users: initialUsers, loadError,
}: {
  email: string;
  days: number;
  overview: Overview | null;
  users: UserRow[];
  loadError: string | null;
}) {
  const [days, setDays] = useState<number>(initialDays);
  const [ov, setOv] = useState<Overview | null>(overview);
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [error, setError] = useState<string | null>(loadError);
  const [busy, setBusy] = useState(false);
  // Monotonic request token: flipping the range twice quickly can land the
  // responses out of order, and the slower first one would clobber the newer.
  const seq = useRef(0);
  // Drill-down state. Details are cached by user id so re-opening a row is free.
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, UserDetail>>({});
  const [loadingUser, setLoadingUser] = useState<string | null>(null);

  const toggleUser = useCallback(async (id: string) => {
    if (openUser === id) { setOpenUser(null); return; }
    setOpenUser(id);
    if (details[id]) return;              // already fetched
    setLoadingUser(id);
    const r = await fetchJson(`/api/admin/user?id=${encodeURIComponent(id)}&limit=200`);
    if (r.ok) setDetails((prev) => ({ ...prev, [id]: r.data as unknown as UserDetail }));
    setLoadingUser((cur) => (cur === id ? null : cur));
  }, [openUser, details]);

  // Only ever called from an event handler — the first range comes in as props
  // from the server component, so there's no fetch-on-mount effect at all.
  const refresh = useCallback(async (d: number) => {
    const mine = ++seq.current;
    setDays(d);
    setBusy(true);
    const [a, b] = await Promise.all([
      fetchJson(`/api/admin/overview?days=${d}`),
      fetchJson(`/api/admin/users?days=${d}&limit=200`),
    ]);
    if (mine !== seq.current) return;        // superseded — drop it
    if (!a.ok) setError(String(a.data.error ?? "Couldn't load metrics"));
    else { setError(null); setOv(a.data as unknown as Overview); }
    if (b.ok) setUsers((b.data.users ?? []) as UserRow[]);
    setBusy(false);
  }, []);

  const t = ov?.totals;
  const errRate = t && t.calls ? (t.errors / t.calls) * 100 : 0;
  const perUser = t && t.users ? t.cost / t.users : 0;
  const cacheHit = t && t.input + t.cacheRead > 0 ? (t.cacheRead / (t.input + t.cacheRead)) * 100 : 0;
  // Lifetime, not the metered window — otherwise every account reads as
  // inactive until the ledger has been running a while.
  const activeUsers = useMemo(() => users.filter((u) => u.lifetimeCalls > 0).length, [users]);

  return (
    <div className="pr-app">
      <div className="pr-scan" />
      <div className="ad-wrap">
        <header className="ad-head">
          <div className="pr-brand">
            <div className="pr-logo"><BaconMark size={30} /></div>
            <div className="pr-brand-text">
              <span className="pr-brand-name">bacon</span>
              <span className="pr-brand-tag">operator console</span>
            </div>
          </div>
          <div className="ad-head-right">
            <div className="pr-seg" role="group" aria-label="Time range">
              {RANGES.map((d) => (
                <button key={d} className={`pr-seg-btn${days === d ? " is-on" : ""}`} onClick={() => void refresh(d)} aria-pressed={days === d}>
                  {d}d
                </button>
              ))}
            </div>
            <button className="pr-btn-sm" onClick={() => void refresh(days)} disabled={busy} title="Refresh">
              {busy ? <Loader2 size={13} className="pr-spin" /> : <RefreshCw size={13} />} Refresh
            </button>
            <Link className="pr-btn-sm" href="/"><ArrowLeft size={13} /> App</Link>
          </div>
        </header>

        <div className="ad-who">Signed in as {email} · metrics are measured from provider-reported token counts, priced at call time</div>

        {error ? (
          <div className="pr-error"><AlertTriangle size={15} /> {error}</div>
        ) : null}

        {!ov && busy ? <div className="ad-empty"><Loader2 size={15} className="pr-spin" /> Loading metrics…</div> : null}

        {ov && t ? (
          <>
            <div className="ad-kpis">
              <Kpi label={`Spend · ${days}d`} value={usd(t.cost)} sub={`${usd(perUser)} per active user`} />
              <Kpi label="AI calls" value={compact(t.calls)} sub={`${compact(t.searches)} web searches`} />
              <Kpi label="Tokens" value={compact(t.input + t.output + t.cacheRead + t.cacheWrite)} sub={`${compact(t.input)} in · ${compact(t.output)} out`} />
              <Kpi label="Active users" value={String(t.users)} sub={`${activeUsers} of ${users.length} accounts`} />
              <Kpi label="Error rate" value={`${errRate.toFixed(1)}%`} sub={`${t.errors} failed calls`} tone={errRate > 5 ? "bad" : errRate === 0 ? "good" : undefined} />
              <Kpi label="Latency p50 / p95" value={`${ms(t.p50ms)} / ${ms(t.p95ms)}`} sub={`cache hit ${cacheHit.toFixed(0)}%`} />
            </div>

            {t.unpriced > 0 ? (
              <div className="ad-note"><AlertTriangle size={13} /> {t.unpriced} call{t.unpriced === 1 ? "" : "s"} ran on a model with no rate card — their tokens are counted but excluded from spend.</div>
            ) : null}

            <ActivityPanel a={ov.activity} metered={!!ov.meteringSince} />

            {ov.meteringSince ? (
              <section className="ad-sec">
                <h2 className="ad-h">Daily spend &amp; volume</h2>
                <SpendChart rows={ov.daily} />
              </section>
            ) : null}

            <div className="ad-cols">
              <section className="ad-sec">
                <h2 className="ad-h">By surface</h2>
                <table className="ad-table">
                  <thead><tr><th>Route</th><th>Calls</th><th>Tokens</th><th>Avg</th><th>Cost</th></tr></thead>
                  <tbody>
                    {ov.byRoute.map((r) => (
                      <tr key={r.route}>
                        <td className="ad-mono">{r.route}{r.errors > 0 ? <span className="ad-err" title={`${r.errors} errors`}>{r.errors}</span> : null}</td>
                        <td>{compact(r.calls)}</td>
                        <td>{compact(r.tokens)}</td>
                        <td>{ms(r.avgMs)}</td>
                        <td className="ad-num">{usd(r.cost)}</td>
                      </tr>
                    ))}
                    {!ov.byRoute.length ? <tr><td colSpan={5} className="ad-empty-cell">No calls in this window.</td></tr> : null}
                  </tbody>
                </table>
              </section>

              <section className="ad-sec">
                <h2 className="ad-h">By model</h2>
                <table className="ad-table">
                  <thead><tr><th>Model</th><th>Calls</th><th>In</th><th>Out</th><th>Cost</th></tr></thead>
                  <tbody>
                    {ov.byModel.map((m) => (
                      <tr key={`${m.provider}:${m.model}`}>
                        <td className="ad-mono">{m.model}{!m.priced ? <span className="ad-err" title="No rate card — cost not counted">?</span> : null}</td>
                        <td>{compact(m.calls)}</td>
                        <td>{compact(m.input)}</td>
                        <td>{compact(m.output)}</td>
                        <td className="ad-num">{usd(m.cost)}</td>
                      </tr>
                    ))}
                    {!ov.byModel.length ? <tr><td colSpan={5} className="ad-empty-cell">No calls in this window.</td></tr> : null}
                  </tbody>
                </table>
              </section>
            </div>

            <section className="ad-sec">
              <h2 className="ad-h">Users <span className="ad-h-sub">click a row for their chat log, names followed and filed calls</span></h2>
              <div className="ad-scroll">
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th></th><th>Account</th><th>Last seen</th><th>Calls</th><th>Chats</th>
                      <th>Following</th><th>Themes</th><th>Briefs</th><th>Today</th><th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const open = openUser === u.userId;
                      return [
                        <tr
                          key={u.userId}
                          className={`ad-row${open ? " is-open" : ""}`}
                          title={u.email ?? u.userId}
                          onClick={() => void toggleUser(u.userId)}
                          tabIndex={0}
                          role="button"
                          aria-expanded={open}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void toggleUser(u.userId); } }}
                        >
                          <td className="ad-chev">
                            {loadingUser === u.userId
                              ? <Loader2 size={13} className="pr-spin" />
                              : <ChevronRight size={13} className={open ? "ad-chev-open" : ""} />}
                          </td>
                          <td className="ad-mono">{shortEmail(u.email)}</td>
                          <td className="ad-dim">{ago(u.lastSeen)}</td>
                          {/* Lifetime calls, not the windowed metered count — a user
                              with no metered spend is not an inactive user. */}
                          <td>{u.lifetimeCalls || "—"}</td>
                          <td>{u.chats || "—"}</td>
                          <td className="ad-syms">
                            {u.symbols.length
                              ? u.symbols.slice(0, 3).join(", ") + (u.symbols.length > 3 ? ` +${u.symbols.length - 3}` : "")
                              : "—"}
                          </td>
                          <td className="ad-syms">
                            {u.themeLabels.length
                              ? u.themeLabels.slice(0, 2).join(", ") + (u.themeLabels.length > 2 ? ` +${u.themeLabels.length - 2}` : "")
                              : "—"}
                          </td>
                          <td>{u.briefs || "—"}</td>
                          <td className={u.usedToday >= 150 ? "ad-bad" : ""}>{u.usedToday || "—"}</td>
                          <td className="ad-num">{u.cost ? usd(u.cost) : "—"}</td>
                        </tr>,
                        open ? (
                          <tr key={`${u.userId}-d`} className="ad-row-detail">
                            <td colSpan={10}>
                              {details[u.userId]
                                ? <UserDetailPanel d={details[u.userId]} />
                                : <div className="ad-empty"><Loader2 size={14} className="pr-spin" /> Loading {shortEmail(u.email)}…</div>}
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })}
                    {!users.length ? <tr><td colSpan={10} className="ad-empty-cell">No accounts yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <p className="ad-foot">
                &ldquo;Calls&rdquo; is lifetime AI calls from the quota meter, so it covers usage from
                before cost metering existed. &ldquo;Today&rdquo; counts against the 150/day quota.
                A blank cell means zero.
              </p>
            </section>

            <section className="ad-sec">
              <h2 className="ad-h">Live tail <span className="ad-h-sub">most recent calls</span></h2>
              <div className="ad-tail">
                {ov.recent.map((e, i) => (
                  <div key={`${e.at}-${i}`} className={`ad-tail-row${e.ok ? "" : " is-bad"}`}>
                    <span className="ad-tail-t">{ago(e.at)}</span>
                    <span className="ad-tail-who">{shortEmail(e.email)}</span>
                    <span className="ad-tail-route">{e.route}</span>
                    <span className="ad-tail-model">{e.model}</span>
                    <span className="ad-tail-n">{compact(e.tokens)} tok</span>
                    <span className="ad-tail-n">{ms(e.ms)}</span>
                    <span className="ad-tail-n ad-num">{usd(e.cost)}</span>
                  </div>
                ))}
                {!ov.recent.length ? <div className="ad-empty">Nothing metered yet — the ledger fills as calls run.</div> : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
