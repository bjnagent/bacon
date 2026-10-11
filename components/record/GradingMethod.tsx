import { CalendarClock, ClipboardPen, Flag, Scale, Target, ListChecks, Banknote, Brain, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import s from "./GradingMethod.module.css";

// How grading works, in plain English. One source for the Record tab's sheet
// and the public page's methodology section, so the two can never describe
// different rules. Every sentence here describes what lib/calls.ts and
// lib/houseRecord.ts actually do — change the code, change this.

interface Step { icon: ReactNode; title: string; body: ReactNode }

export function GradingMethod({ audience = "user", columns }: { audience?: "user" | "public"; columns?: boolean }) {
  const whose = audience === "public" ? "the house account" : "you";
  const steps: Step[] = [
    {
      icon: <ClipboardPen />,
      title: "Written down before the outcome",
      body: <>Every call Bacon files for {whose} — from a daily brief or an analysis — is stored with its date, action, target, horizon and how crowded the name was at the time. A same-day revision replaces it; after that day it&apos;s fixed.</>,
    },
    {
      icon: <CalendarClock />,
      title: "Priced at 30 days",
      body: <>Thirty days after filing, the call is priced against real closing prices: the move from the last close on or before the filing day to the latest close. No model is involved — it&apos;s arithmetic.</>,
    },
    {
      icon: <Flag />,
      title: "Settled at its horizon",
      body: <>It&apos;s re-graded every night until its horizon date, then the result is final. Until then it&apos;s labelled open, and it stays visible.</>,
    },
    {
      icon: <Scale />,
      title: "Benchmarked against SPY",
      body: <>Each call is compared with the same money in SPY over the identical window. The average versus the S&amp;P 500 uses only calls that carry a benchmark (property calls don&apos;t), on both sides, so the comparison is like for like.</>,
    },
    {
      icon: <Target />,
      title: "Hits and misses",
      body: <>A buy or accumulate is a hit if the price rose; an avoid or sell is a hit if it fell. Watch and hold calls state no direction, so they aren&apos;t scored. The averages and the $10K line treat every call as a purchase, so a correct avoid call counts against them — direction is scored by the hit rate.</>,
    },
    {
      icon: <ListChecks />,
      title: "Nothing is filtered out",
      body: audience === "public"
        ? <>Every priced call is listed, wins and misses, newest first. There is no way to sort or filter by outcome, and the headline numbers count everything.</>
        : <>Every call counts, wins and misses. You can filter the list to read it, but the numbers at the top always use every call.</>,
    },
    {
      icon: <Banknote />,
      title: "A hypothetical $10K",
      body: <>The money view puts $10,000 into each graded call that has a benchmark, on its filing day, and the same $10,000 into SPY beside it. It&apos;s price movement only — no fees, dividends, slippage or taxes.</>,
    },
    audience === "public"
      ? {
        icon: <EyeOff />,
        title: "Live calls never appear",
        body: <>A call shows up here only once it has been priced at 30 days, so this page can&apos;t front-run members. Calls still waiting are counted, not shown.</>,
      }
      : {
        icon: <Brain />,
        title: "The desk learns from it",
        body: <>Once eight calls have been graded on direction, Bacon writes a calibration memo — where it runs hot, where it&apos;s too cautious — and reads it before every new brief and analysis.</>,
      },
  ];

  return (
    <ol className={`${s.steps}${columns ? ` ${s.columns}` : ""}`}>
      {steps.map((st) => (
        <li key={st.title} className={s.step}>
          <span className={s.icon} aria-hidden="true">{st.icon}</span>
          <div className={s.text}>
            <h3 className={s.title}>{st.title}</h3>
            <p className={s.body}>{st.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
