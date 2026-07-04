// Morning-brief email delivery (server-only), via Resend's plain HTTP API.
// Opt-in per user (settings.brief_email_enabled); silently disabled when
// RESEND_API_KEY is unset so the sweep never fails on email.

import type { OpportunityBrief } from "./parsers";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.BRIEF_EMAIL_FROM || "Bacon <onboarding@resend.dev>";

export function emailEnabled(): boolean {
  return !!KEY;
}

export function renderBriefEmail(brief: OpportunityBrief, dateLabel: string): string {
  const items = brief.items.map((o, i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #E8E4D8">
      <div style="font:600 15px 'Segoe UI',system-ui,sans-serif;color:#1A1712">${i + 1}. ${o.name}${o.ticker && o.ticker !== "—" ? ` <span style="color:#EE4310">(${o.ticker})</span>` : ""} <span style="font:400 11px monospace;color:#6E6658;text-transform:uppercase">◷ ${o.horizon || "—"}</span></div>
      <div style="font:400 13px 'Segoe UI',system-ui,sans-serif;color:#2E2A22;margin-top:4px">${o.thesis}</div>
      <div style="font:400 12px 'Segoe UI',system-ui,sans-serif;color:#6E6658;margin-top:4px"><b>Signals:</b> ${o.signals}</div>
      <div style="font:400 12px 'Segoe UI',system-ui,sans-serif;color:#6E6658;margin-top:2px"><b>Confirm:</b> ${o.confirm} · <b>Kill:</b> ${o.kill}</div>
    </td></tr>`).join("");
  return `
  <div style="background:#EBE8E0;padding:28px 16px">
    <div style="max-width:560px;margin:0 auto;background:#F7F5EF;border:1px solid #1A1712;border-radius:12px;overflow:hidden">
      <div style="height:5px;background:linear-gradient(90deg,#E2685C,#E0A33E,#5FB97E,#38B6C4,#6FA1CE,#9B86E0)"></div>
      <div style="padding:22px 26px">
        <div style="font:700 20px 'Segoe UI',system-ui,sans-serif;color:#1A1712">BACON · Today's brief</div>
        <div style="font:400 11px monospace;color:#6E6658;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">${dateLabel}</div>
        ${brief.intro ? `<div style="font:400 13.5px 'Segoe UI',system-ui,sans-serif;color:#2E2A22;margin-top:14px;padding-left:12px;border-left:3px solid #EE4310">${brief.intro}</div>` : ""}
        <table style="width:100%;border-collapse:collapse;margin-top:8px">${items}</table>
        <div style="font:400 10.5px monospace;color:#6E6658;margin-top:16px;line-height:1.6">${brief.caveat || "Assembled from today's public signals as research starting points."} Not financial advice — verify everything yourself.</div>
      </div>
    </div>
  </div>`;
}

export async function sendBriefEmail(to: string, brief: OpportunityBrief, dateLabel: string): Promise<boolean> {
  if (!KEY || !to || !brief.items.length) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: `Bacon · today's brief — ${brief.items.length} opportunities (${dateLabel})`, html: renderBriefEmail(brief, dateLabel) }),
  });
  return res.ok;
}
