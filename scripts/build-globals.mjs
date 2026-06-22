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
`;

const out = (importLine ? importLine + "\n\n" : "") + base + css + login;
mkdirSync("app", { recursive: true });
writeFileSync("app/globals.css", out, "utf8");
console.log("wrote app/globals.css —", out.split("\n").length, "lines; font import hoisted:", !!importLine);
