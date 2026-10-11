// Morning-brief email delivery (server-only), via Resend's plain HTTP API.
// Opt-in per user (settings.brief_email_enabled) AND a plan with `email_brief`
// — the crons check both. Silently disabled when RESEND_API_KEY is unset so the
// sweep never fails on email.
//
// Every value interpolated into the HTML is model-written (names, theses, kill
// reasons from web search), so it is escaped: text from the open web must not
// be able to add markup — a link, an image, a fake "sign in" button — to a
// message sent under our name. Sends are bounded in time: the sweep awaits
// them inside a worker slot.

import type { OpportunityBrief } from "./parsers";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.BRIEF_EMAIL_FROM || "Bacon <onboarding@resend.dev>";
const SEND_TIMEOUT_MS = 10_000;

export function emailEnabled(): boolean {
  return !!KEY;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** HTML-escape untrusted text. */
export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

/** "Open Bacon · turn these off in Settings" — only when the site URL is known. */
function footerLinks(path: string): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(site)) return "";
  return `<div style="font:400 12px 'Segoe UI',system-ui,sans-serif;color:#6E6658;margin-top:14px"><a href="${esc(site + path)}" style="color:#EE4310">Open in Bacon</a> · You get this because email is on in <a href="${esc(site + "/account")}" style="color:#6E6658">Settings</a>.</div>`;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function renderBriefEmail(brief: OpportunityBrief, dateLabel: string): string {
  const items = brief.items.map((o, i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #E8E4D8">
      <div style="font:600 15px 'Segoe UI',system-ui,sans-serif;color:#1A1712">${i + 1}. ${esc(o.name)}${o.ticker && o.ticker !== "—" ? ` <span style="color:#EE4310">(${esc(o.ticker)})</span>` : ""} <span style="font:400 11px monospace;color:#6E6658;text-transform:uppercase">◷ ${esc(o.horizon || "—")}</span></div>
      <div style="font:400 13px 'Segoe UI',system-ui,sans-serif;color:#2E2A22;margin-top:4px">${esc(o.thesis)}</div>
      <div style="font:400 12px 'Segoe UI',system-ui,sans-serif;color:#6E6658;margin-top:4px"><b>Signals:</b> ${esc(o.signals)}</div>
      <div style="font:400 12px 'Segoe UI',system-ui,sans-serif;color:#6E6658;margin-top:2px"><b>Confirm:</b> ${esc(o.confirm)} · <b>Kill:</b> ${esc(o.kill)}</div>
    </td></tr>`).join("");
  return `
  <div style="background:#EBE8E0;padding:28px 16px">
    <div style="max-width:560px;margin:0 auto;background:#F7F5EF;border:1px solid #1A1712;border-radius:12px;overflow:hidden">
      <div style="height:5px;background:linear-gradient(90deg,#E2685C,#E0A33E,#5FB97E,#38B6C4,#6FA1CE,#9B86E0)"></div>
      <div style="padding:22px 26px">
        <div style="font:700 20px 'Segoe UI',system-ui,sans-serif;color:#1A1712">BACON · Today's brief</div>
        <div style="font:400 11px monospace;color:#6E6658;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">${esc(dateLabel)}</div>
        ${brief.intro ? `<div style="font:400 13.5px 'Segoe UI',system-ui,sans-serif;color:#2E2A22;margin-top:14px;padding-left:12px;border-left:3px solid #EE4310">${esc(brief.intro)}</div>` : ""}
        <table style="width:100%;border-collapse:collapse;margin-top:8px">${items}</table>
        <div style="font:400 10.5px monospace;color:#6E6658;margin-top:16px;line-height:1.6">${esc(brief.caveat || "Assembled from today's public signals as research starting points.")} Not financial advice — verify everything yourself.</div>
        ${footerLinks("/")}
      </div>
    </div>
  </div>`;
}

export async function sendBriefEmail(to: string, brief: OpportunityBrief, dateLabel: string): Promise<boolean> {
  if (!KEY || !to || !brief.items.length) return false;
  return send(to, `Bacon · today's brief — ${brief.items.length} opportunities (${dateLabel})`, renderBriefEmail(brief, dateLabel));
}

// Kill-condition watch alert — sent when the watcher flags a triggered kill.
export async function sendKillAlertEmail(to: string, alerts: { ticker: string; name?: string; why: string }[], dateLabel: string): Promise<boolean> {
  if (!KEY || !to || !alerts.length) return false;
  const rows = alerts.map((a) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #E8E4D8">
      <div style="font:600 15px 'Segoe UI',system-ui,sans-serif;color:#CF3B2C">${esc(a.ticker && a.ticker !== "—" ? a.ticker : a.name || a.ticker)}</div>
      <div style="font:400 13px 'Segoe UI',system-ui,sans-serif;color:#2E2A22;margin-top:4px">${esc(a.why)}</div>
    </td></tr>`).join("");
  const one = alerts.length === 1;
  const html = `
  <div style="background:#EBE8E0;padding:28px 16px">
    <div style="max-width:560px;margin:0 auto;background:#F7F5EF;border:1px solid #1A1712;border-radius:12px;overflow:hidden">
      <div style="height:5px;background:#CF3B2C"></div>
      <div style="padding:22px 26px">
        <div style="font:700 18px 'Segoe UI',system-ui,sans-serif;color:#1A1712">BACON · Kill-condition watch</div>
        <div style="font:400 11px monospace;color:#6E6658;margin-top:2px;text-transform:uppercase;letter-spacing:.08em">${esc(dateLabel)}</div>
        <div style="font:400 13.5px 'Segoe UI',system-ui,sans-serif;color:#2E2A22;margin-top:14px">A kill condition may have triggered on the following idea${one ? "" : "s"}. Re-check before relying on ${one ? "it" : "them"}.</div>
        <table style="width:100%;border-collapse:collapse;margin-top:8px">${rows}</table>
        <div style="font:400 10.5px monospace;color:#6E6658;margin-top:16px;line-height:1.6">Qualitative, from public reporting — verify everything yourself. Not financial advice.</div>
        ${footerLinks("/track-record")}
      </div>
    </div>
  </div>`;
  return send(to, `Bacon · kill-condition watch — ${alerts.length} alert${one ? "" : "s"}`, html);
}
