"use client";

import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, Lock, RefreshCw, TrendingDown, TrendingUp, WifiOff } from "lucide-react";
import { Button, Callout, Card, Skeleton } from "@/components/ui";
import { PERSONAS } from "@/lib/lenses";
import { PLANS, cheapestPlanWith } from "@/lib/plans";
import { openPaywall } from "@/lib/client/paywall";
import type { ExtraKey, ToolResult } from "@/lib/analysisStore";
import type { ToolStatus } from "./useAnalysis";
import { PERSONA_VAR, TOOL_BY_KEY, listPoints, redteamTone, splitLead } from "./model";
import s from "./DeepTools.module.css";

type HueStyle = CSSProperties & { "--hue"?: string };

function Points({ text, ordered }: { text?: string; ordered?: boolean }) {
  const pts = listPoints(text);
  if (!pts.length) return <p className="t-callout">Nothing came back for this part.</p>;
  const items = pts.map((p, i) => {
    const { lead, rest } = splitLead(p);
    return <li key={i}>{lead ? <><strong>{lead}</strong> — {rest}</> : rest}</li>;
  });
  return ordered ? <ol className={s.ol}>{items}</ol> : <ul className={s.ul}>{items}</ul>;
}

function Side({ tone, icon, title, children }: { tone: "pos" | "neg"; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className={s.side} data-tone={tone}>
      <div className={s.sideHead}>{icon}<span>{title}</span></div>
      {children}
    </Card>
  );
}

function Prose({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <Card>
      <div className="t-eyebrow">{title}</div>
      <p className={s.prose}>{text}</p>
    </Card>
  );
}

function Debate({ r }: { r: ToolResult }) {
  return (
    <>
      <div className="grid-2">
        <Side tone="pos" icon={<TrendingUp />} title="The bull case"><Points text={r.BULL} /></Side>
        <Side tone="neg" icon={<TrendingDown />} title="The bear case"><Points text={r.BEAR} /></Side>
      </div>
      <Prose title="Who wins, and why" text={r.SYNTHESIS} />
    </>
  );
}

function Personas({ r }: { r: ToolResult }) {
  return (
    <div className="grid-2">
      {PERSONAS.map((p) => (
        <Card key={p.key} className={s.persona} style={{ "--hue": PERSONA_VAR[p.key] ?? "var(--text-3)" } as HueStyle}>
          <div className={s.personaHead}>
            <span className={s.personaName}>{p.name}</span>
            <span className="t-caption">{p.lens}</span>
          </div>
          <p className={s.prose}>{r[p.key] || "No take came back for this discipline."}</p>
        </Card>
      ))}
    </div>
  );
}

function RedTeam({ r }: { r: ToolResult }) {
  const tone = redteamTone(r.VERDICT);
  return (
    <>
      {r.VERDICT && (
        <Card className={s.rtVerdict} data-tone={tone}>
          <div className="t-eyebrow">After the attack</div>
          <p className={s.rtCall}>{r.VERDICT}</p>
        </Card>
      )}
      <Side tone="neg" icon={<AlertTriangle />} title="Ten ways this loses money"><Points text={r.RISKS} ordered /></Side>
      <Prose title="Which are actually likely" text={r.ODDS} />
    </>
  );
}

function Chain({ r }: { r: ToolResult }) {
  return (
    <>
      <Prose title="The chain" text={r.MAP} />
      <div className="grid-2">
        <Side tone="pos" icon={<TrendingUp />} title="Non-obvious winners"><Points text={r.WINNERS} /></Side>
        <Side tone="neg" icon={<TrendingDown />} title="Gets disrupted"><Points text={r.LOSERS} /></Side>
      </div>
      {r.TOPPICKS && (
        <Card>
          <div className="t-eyebrow">Real setups now</div>
          <Points text={r.TOPPICKS} />
        </Card>
      )}
    </>
  );
}

const VIEWS: Record<ExtraKey, (p: { r: ToolResult }) => ReactNode> = { debate: Debate, personas: Personas, redteam: RedTeam, chain: Chain };

export function ToolPanel({ toolKey, allowed, ready, result, status, onRun, planName }: {
  toolKey: ExtraKey;
  /** The plan includes this tool. */
  allowed: boolean;
  /** The lens read has finished (tools attach to a complete analysis). */
  ready: boolean;
  result?: ToolResult;
  status: ToolStatus;
  onRun: () => void;
  planName?: string;
}) {
  const tool = TOOL_BY_KEY[toolKey];
  const View = VIEWS[toolKey];

  if (result) {
    return (
      <div className="stack" aria-live="polite">
        <View r={result} />
        <p className="t-caption">{tool.note}</p>
      </div>
    );
  }

  if (!allowed) {
    const suggested = cheapestPlanWith(tool.feature);
    return (
      <Card pad="lg" className={s.locked}>
        <span className={s.lockIcon} aria-hidden="true"><Lock /></span>
        <div className="t-headline">{tool.label} is part of {PLANS[suggested].name}</div>
        <p className={s.lockedBody}>{tool.blurb}</p>
        {planName && <p className="t-caption">You&apos;re on {planName}.</p>}
        <Button variant="primary" onClick={() => openPaywall({ reason: "feature", feature: tool.feature, suggested })}>Upgrade to {PLANS[suggested].name}</Button>
      </Card>
    );
  }

  if (!ready) {
    return <Callout tone="info">{tool.label} runs once the lens read finishes.</Callout>;
  }

  if (status.error) {
    const e = status.error;
    if (e.isUpgrade) {
      return (
        <Callout tone="warn" icon={<AlertTriangle />}>
          <strong>{e.message}</strong>{" "}
          <button type="button" className={s.inlineAction} onClick={() => openPaywall(e.body as Parameters<typeof openPaywall>[0])}>See plans</button>
        </Callout>
      );
    }
    return (
      <Callout tone="neg" icon={e.code === "offline" ? <WifiOff /> : <AlertTriangle />}>
        <strong>{e.message}</strong>
        <div className={s.retry}><Button size="sm" icon={<RefreshCw />} onClick={onRun}>Try again</Button></div>
      </Callout>
    );
  }

  if (status.loading) {
    return (
      <div className="stack" aria-live="polite" aria-busy="true">
        <Card className={s.working}>
          <span className="ui-spinner" aria-hidden="true" />
          <div>
            <div className="t-headline">{tool.working}…</div>
            <div className="t-caption">Live web search · usually 20–40 seconds</div>
          </div>
        </Card>
        <div className="grid-2">
          <Card><Skeleton height={16} width="50%" /><Skeleton lines={4} style={{ marginTop: 12 }} /></Card>
          <Card><Skeleton height={16} width="50%" /><Skeleton lines={4} style={{ marginTop: 12 }} /></Card>
        </div>
      </div>
    );
  }

  // Allowed, ready and idle: the screen starts it on first open; this is the
  // fallback if that didn't happen (e.g. it was aborted).
  return (
    <Card pad="lg" className={s.locked}>
      <div className="t-headline">{tool.label}</div>
      <p className={s.lockedBody}>{tool.blurb}</p>
      <Button variant="primary" onClick={onRun}>Run {tool.label.toLowerCase()}</Button>
    </Card>
  );
}
