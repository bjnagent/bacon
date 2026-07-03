// One-shot helper: extract the artifact's `const CSS` template verbatim and
// assemble app/globals.css = base reset + ported design system + login styles.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const src = readFileSync("reference/bacon-artifact.jsx", "utf8");
const open = src.indexOf("const CSS = `");
if (open === -1) throw new Error("could not find `const CSS` in artifact");
const start = open + "const CSS = `".length;
const end = src.indexOf("`;", start);
if (end === -1) throw new Error("could not find end of CSS template");
let css = src.slice(start, end);

// `@import` must be the first statement in a stylesheet or it is ignored.
// Hoist the Google Fonts import out of the body so the base reset can sit after it.
const importMatch = css.match(/@import\s+url\([^)]*\)\s*;\s*/);
const importLine = importMatch ? importMatch[0].trim() : "";
if (importMatch) css = css.replace(importMatch[0], "");


const base = `/* ============================================================
   Base reset for the Next.js shell (outside .pr-app scope).
   The Bacon design system below is scoped to .pr-app, so the
   document chrome needs its own minimal reset + paper backdrop.
   ============================================================ */
html, body { margin: 0; padding: 0; }
body { background: #EBE8E0; color: #1A1712; }

/* ============================================================
   Bacon — "Daylight Instrument" design system.
   Ported VERBATIM from reference/bacon-artifact.jsx (const CSS).
   Do not edit by hand; it is the source-of-truth design system.
   All classes are pr-* and scoped under .pr-app.
   ============================================================ */
`;

const login = `

/* ============================================================
   Next.js additions — auth / login screen.
   Not in the artifact (it had no auth). Reuses the same tokens,
   scoped under .pr-app so the design variables resolve.
   ============================================================ */
.pr-login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background-image:linear-gradient(var(--gridline) 1px,transparent 1px),linear-gradient(90deg,var(--gridline) 1px,transparent 1px);
  background-size:28px 28px,28px 28px}
.pr-login-card{width:min(400px,100%);background:var(--card);border:1px solid var(--ink);border-radius:12px;padding:38px 34px;display:flex;flex-direction:column;align-items:center;gap:13px;box-shadow:0 18px 50px rgba(26,23,18,0.16)}
.pr-login-mark{display:flex;justify-content:center}
.pr-login-name{font-family:var(--fd);font-weight:700;font-size:30px;letter-spacing:0.02em;background:var(--spectrum);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1}
.pr-login-tag{font-family:var(--fm);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.16em}
.pr-login-sub{color:var(--muted);font-size:13.5px;text-align:center;line-height:1.6;margin-top:2px}
.pr-login-form{width:100%;display:flex;flex-direction:column;gap:11px;margin-top:10px}
.pr-login-input{width:100%;background:var(--paper2);border:1px solid var(--line2);border-radius:8px;color:var(--ink);font-family:var(--fm);font-size:14px;padding:12px 14px;outline:none}
.pr-login-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(238,67,16,0.14)}
.pr-login-input::placeholder{color:var(--muted2)}
.pr-login-btn{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:#fff;border:none;font-family:var(--fb);font-weight:600;font-size:14px;padding:12px;border-radius:8px;cursor:pointer;box-shadow:0 2px 0 var(--accent2);transition:all .12s}
.pr-login-btn:hover{background:#ff5018;transform:translateY(1px);box-shadow:0 1px 0 var(--accent2)}
.pr-login-btn-alt{background:var(--card);color:var(--ink);border:1px solid var(--line2);box-shadow:none}
.pr-login-btn-alt:hover{background:var(--paper2);border-color:var(--accent);transform:none;box-shadow:none}
.pr-login-link{background:none;border:none;color:var(--muted);font-family:var(--fb);font-size:12px;cursor:pointer;text-decoration:underline;padding:5px;margin-top:2px}
.pr-login-link:hover{color:var(--accent)}
.pr-login-note{font-family:var(--fm);font-size:9.5px;color:var(--muted2);text-align:center;text-transform:uppercase;letter-spacing:0.06em;margin-top:4px}
.pr-login-msg{font-size:12.5px;color:var(--good);text-align:center;line-height:1.5}
.pr-login-msg.is-err{color:var(--bad)}

/* Sign-out control + "coming soon" placeholders in the shell */
.pr-railsignout{margin-top:6px}
.pr-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;color:var(--muted);min-height:50vh;padding:40px 20px}
.pr-placeholder-title{font-family:var(--fd);font-weight:700;font-size:22px;color:var(--ink)}
.pr-placeholder-sub{font-size:13.5px;line-height:1.65;max-width:440px;color:var(--muted)}
.pr-placeholder .pr-prism{opacity:0.9}

/* Radar fresh-finds extras (auto-sweep movers) */
.pr-pick-move{font-family:var(--fm);font-size:11px;font-weight:600;color:var(--good);background:rgba(30,142,76,0.1);border:1px solid rgba(30,142,76,0.3);padding:2px 7px;border-radius:3px}
.pr-pick-src{font-family:var(--fm);font-size:9.5px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px}

/* Macro backdrop strip (real FRED indicators) */
.pr-macro{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:13px 16px;margin-bottom:22px}
.pr-macro-head{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.12em;color:var(--muted2);margin-bottom:10px}
.pr-macro-strip{display:flex;flex-wrap:wrap;gap:9px}
.pr-macro-item{display:flex;flex-direction:column;gap:2px;background:var(--paper2);border:1px solid var(--line);border-radius:6px;padding:8px 12px;min-width:92px}
.pr-macro-lbl{font-family:var(--fm);font-size:9px;text-transform:uppercase;letter-spacing:0.06em;color:var(--muted)}
.pr-macro-val{font-family:var(--fm);font-weight:600;font-size:15px;color:var(--ink)}
.pr-macro-chg{font-family:var(--fm);font-size:9.5px;color:var(--muted2)}
.pr-macro-foot{font-family:var(--fm);font-size:9px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.05em;margin-top:10px}

/* Account tab */
.pr-acct-field{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line2);border-radius:8px;padding:13px 16px;max-width:480px}
.pr-acct-label{font-family:var(--fm);font-size:9.5px;text-transform:uppercase;letter-spacing:0.1em;color:var(--muted2)}
.pr-acct-val{font-family:var(--fm);font-size:14px;color:var(--ink)}
.pr-acct-form{display:flex;flex-direction:column;gap:11px;max-width:360px;margin-top:14px}
.pr-acct-input{width:100%;background:var(--paper2);border:1px solid var(--line2);border-radius:8px;color:var(--ink);font-family:var(--fm);font-size:14px;padding:11px 14px;outline:none}
.pr-acct-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(238,67,16,0.14)}
.pr-acct-input::placeholder{color:var(--muted2)}
.pr-acct-msg{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;margin-top:2px}
.pr-acct-msg.is-ok{color:var(--good)}
.pr-acct-msg.is-err{color:var(--bad)}
.pr-acct-note{font-size:12px;color:var(--muted);margin-top:14px;line-height:1.6;max-width:420px}

/* Live TradingView chart (Markets tab + Analyze) */
.pr-tvchart{border:1px solid var(--line2);border-radius:9px;overflow:hidden;background:var(--card)}
.pr-result-chart{margin-top:18px}
.tradingview-widget-copyright{font-family:var(--fm);font-size:10px;color:var(--muted2);padding:6px 11px;text-align:right;line-height:1}
.tradingview-widget-copyright a{color:var(--accent);text-decoration:none}
.tradingview-widget-copyright a:hover{text-decoration:underline}

/* ============================================================
   Navigation rethink: rail groups, user menu, segmented control,
   tool slide-overs, and the command palette.
   ============================================================ */
.pr-railgroup{font-family:var(--fm);font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:var(--muted2);padding:16px 12px 6px}
.pr-railspacer{flex:1}
.pr-railkbd{margin-left:auto;font-family:var(--fm);font-size:9px;color:var(--muted2);border:1px solid var(--line2);border-radius:4px;padding:1px 5px}

.pr-usermenu{position:relative;margin-top:6px}
.pr-usermenu-trigger{display:flex;align-items:center;gap:9px;width:100%;background:var(--card);border:1px solid var(--line2);color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:9px 11px;border-radius:8px;cursor:pointer;transition:all .14s}
.pr-usermenu-trigger:hover{border-color:var(--accent)}
.pr-usermenu-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.pr-usermenu-chev{color:var(--muted);flex-shrink:0}
.pr-usermenu-pop{position:absolute;bottom:calc(100% + 7px);left:0;right:0;background:var(--card);border:1px solid var(--ink);border-radius:9px;box-shadow:0 12px 34px rgba(26,23,18,0.22);padding:6px;z-index:50;animation:prFade .14s ease}
.pr-usermenu-email{font-family:var(--fm);font-size:10px;color:var(--muted);padding:7px 9px 9px;border-bottom:1px solid var(--line);margin-bottom:5px;word-break:break-all}
.pr-usermenu-item{display:flex;align-items:center;gap:9px;width:100%;background:none;border:none;color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:9px;border-radius:6px;cursor:pointer;text-align:left}
.pr-usermenu-item:hover{background:var(--sink)}
.pr-usermenu-pop form{display:block}

.pr-seg{display:inline-flex;gap:3px;background:var(--paper2);border:1px solid var(--line2);border-radius:9px;padding:3px;margin-bottom:8px}
.pr-seg-btn{display:inline-flex;align-items:center;gap:7px;background:none;border:none;color:var(--muted);font-family:var(--fb);font-size:13px;font-weight:500;padding:8px 16px;border-radius:7px;cursor:pointer;transition:all .14s}
.pr-seg-btn:hover{color:var(--ink)}
.pr-seg-btn.is-on{background:var(--card);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line2)}

.pr-tool-wrap{position:fixed;inset:0;z-index:9000;display:flex;justify-content:flex-end;background:rgba(26,23,18,0.35);backdrop-filter:blur(3px);animation:prFade .2s ease}
.pr-tool{width:min(720px,100%);height:100%;background:var(--paper);border-left:1px solid var(--ink);display:flex;flex-direction:column;box-shadow:-22px 0 60px rgba(26,23,18,0.22);animation:prSlideIn .28s cubic-bezier(.2,.8,.2,1)}
.pr-tool-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 22px;border-bottom:1px solid var(--line2);background:var(--paper2);font-family:var(--fd);font-weight:700;font-size:16px;color:var(--ink)}
.pr-tool-head button{background:none;border:none;color:var(--muted);cursor:pointer;padding:5px;border-radius:6px;display:flex}
.pr-tool-head button:hover{color:var(--ink);background:var(--sink)}
.pr-tool-body{flex:1;overflow-y:auto;padding:22px}
.pr-tool-body .pr-view{max-width:none}

.pr-palette-wrap{position:fixed;inset:0;z-index:9500;display:flex;align-items:flex-start;justify-content:center;padding:14vh 20px 20px;background:rgba(26,23,18,0.38);backdrop-filter:blur(3px);animation:prFade .15s ease}
.pr-palette{width:min(580px,100%);background:var(--card);border:1px solid var(--ink);border-radius:12px;overflow:hidden;box-shadow:0 28px 70px rgba(26,23,18,0.32);display:flex;flex-direction:column;max-height:64vh}
.pr-palette-input{display:flex;align-items:center;gap:11px;padding:15px 18px;border-bottom:1px solid var(--line2);color:var(--muted)}
.pr-palette-input input{flex:1;background:none;border:none;outline:none;color:var(--ink);font-family:var(--fb);font-size:15px}
.pr-palette-input input::placeholder{color:var(--muted2)}
.pr-palette-list{overflow-y:auto;padding:7px}
.pr-palette-empty{padding:18px;text-align:center;color:var(--muted2);font-size:13px}
.pr-palette-item{display:flex;align-items:center;gap:11px;width:100%;background:none;border:none;color:var(--ink);font-family:var(--fb);font-size:13.5px;padding:11px 13px;border-radius:8px;cursor:pointer;text-align:left}
.pr-palette-item.is-sel{background:var(--paper2)}
.pr-palette-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pr-palette-hint{font-family:var(--fm);font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.05em;flex-shrink:0}
.pr-palette-arrow{color:var(--muted2);flex-shrink:0;opacity:0}
.pr-palette-item.is-sel .pr-palette-arrow{opacity:1;color:var(--accent)}
.pr-palette-foot{font-family:var(--fm);font-size:10px;color:var(--muted2);text-align:center;padding:9px;border-top:1px solid var(--line);text-transform:uppercase;letter-spacing:0.05em}

@media (max-width:880px){
  .pr-tool{width:100%;border-left:none}
  .pr-palette-wrap{padding:8vh 12px 12px}
  .pr-railgroup,.pr-railspacer,.pr-railkbd{display:none}
  .pr-usermenu{margin-top:0}
  .pr-usermenu-name,.pr-usermenu-chev{display:none}
  .pr-usermenu-trigger{padding:8px;border:none;background:none}
  .pr-usermenu-pop{left:auto;right:0;width:210px;bottom:calc(100% + 10px)}
}

/* ============================================================
   Loading skeletons (no content pop-in) + chat resume + nudges.
   ============================================================ */
.pr-skel{position:relative;overflow:hidden;background:var(--sink);border-radius:6px}
.pr-skel::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(247,245,239,0.65),transparent);animation:prShimmer 1.4s ease-in-out infinite}
@keyframes prShimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){.pr-skel::after{animation:none}}
.pr-skel-card{background:var(--card);border:1px solid var(--line2);border-radius:9px;padding:16px 18px;display:flex;flex-direction:column;gap:11px}
.pr-skel-line{height:12px}
.pr-skel-line.is-w40{width:40%}
.pr-skel-line.is-w70{width:70%}
.pr-skel-line.is-w90{width:90%}
.pr-macro-skel{display:flex;gap:9px}
.pr-macro-skel .pr-skel{width:96px;height:52px;border-radius:6px}

.pr-chat-resume{display:inline-flex;align-items:center;gap:7px;background:var(--paper2);border:1px dashed var(--line2);color:var(--ink);font-family:var(--fb);font-size:12.5px;padding:9px 14px;border-radius:99px;cursor:pointer;transition:all .14s;margin-top:6px;max-width:100%}
.pr-chat-resume:hover{border-color:var(--accent);border-style:solid;color:var(--accent)}

.pr-nudge{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;color:var(--ink2);background:var(--paper2);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:6px;padding:10px 13px;line-height:1.55;margin-bottom:14px}
.pr-nudge svg{color:var(--accent);flex-shrink:0;margin-top:1px}
`;

// Accessibility transform (intentional, documented override): raise the smallest
// label sizes to a readable floor and darken the faint --muted2 token so secondary
// labels meet WCAG AA contrast on the bone background.
const out = ((importLine ? importLine + "\n\n" : "") + base + css + login)
  .replace(/font-size:9px/g, "font-size:10.5px")
  .replace(/font-size:9\.5px/g, "font-size:11px")
  .replace(/--muted2:#9A9384/g, "--muted2:#6C6757");
mkdirSync("app", { recursive: true });
writeFileSync("app/globals.css", out, "utf8");
console.log("wrote app/globals.css —", out.split("\n").length, "lines; font import hoisted:", !!importLine);
