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

/* ============================================================
   Visual pass (screenshot-driven): tighter heroes, centered
   content column, compact mobile chrome, quick-run chips.
   ============================================================ */
/* Content column centers on wide screens instead of hugging the rail. */
.pr-view{margin-left:auto;margin-right:auto}

/* Heroes were eating ~40% of the viewport before any content. */
.pr-rdr-head{padding:8px 0 20px}
.pr-hero{padding:8px 0 20px}
.pr-rdr-title,.pr-hero-title{font-size:clamp(26px,3.6vw,38px)}
.pr-hero-eyebrow{margin-bottom:10px}
.pr-rdr-honest{margin-top:12px;font-size:13px}
.pr-hero-prism .pr-prism{width:104px;height:104px}

/* Rail footer needs air under the user menu. */
.pr-railfoot{margin-top:10px}

/* Palette input: accent underline instead of a boxed outline (focus stays visible). */
.pr-palette-input input:focus-visible{outline:none}
.pr-palette-input:focus-within{box-shadow:inset 0 -2px 0 var(--accent)}

/* Quick-run chips under the Analyze command row. */
.pr-quickrun{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
.pr-quickrun-lbl{font-family:var(--fm);font-size:10px;color:var(--muted2);text-transform:uppercase;letter-spacing:0.08em}
.pr-quickrun .pr-chip{font-family:var(--fm);font-size:12px;letter-spacing:0.03em}

@media (max-width:880px){
  /* One compact status row: keep NOT ADVICE + clock, drop CONN/DATA chips. */
  .pr-status{flex-wrap:nowrap;gap:8px}
  .pr-status-tag{display:none}
  .pr-status-tag.is-warn{display:inline-block}
  /* Hero: no oversized mark, tighter copy. */
  .pr-hero-prism{display:none}
  .pr-rdr-head,.pr-hero{padding:4px 0 14px}
  /* Icon-only round Discuss button. */
  .pr-fab span{display:none}
  .pr-fab{padding:14px;border-radius:50%}
}

/* ============================================================
   CHARACTER PASS — sticker tactility, lens hues everywhere,
   motion on touch, playful without breaking the honest-tool tone.
   All motion is gated behind prefers-reduced-motion at the end.
   ============================================================ */
.pr-app{--pop:cubic-bezier(.2,.8,.2,1)}

/* Section markers trade the flat orange square for the six-lens spectrum. */
.pr-section-title::before{background:var(--spectrum);border-radius:2px}

/* Eyebrows get a spectrum underline flourish. */
.pr-hero-eyebrow{position:relative;display:inline-block;padding-bottom:7px}
.pr-hero-eyebrow::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:3px;background:var(--spectrum);border-radius:2px}

/* Sticker cards: lift + a hair of tilt + hard offset shadow on hover. */
.pr-trk,.pr-pick,.pr-news{transition:transform .18s var(--pop),box-shadow .18s var(--pop),border-color .14s}
.pr-trk:hover,.pr-pick:hover,.pr-news:hover{transform:translateY(-3px) rotate(-0.35deg);border-color:var(--ink);box-shadow:5px 7px 0 var(--line2)}
/* Lens panels glow in their own hue instead. */
.pr-panel{transition:transform .18s var(--pop),box-shadow .18s var(--pop),border-color .14s}
.pr-panel:hover{transform:translateY(-2px);border-color:var(--ink);box-shadow:0 10px 26px color-mix(in srgb,var(--h) 30%,transparent)}

/* Cards pop in with a stagger when a list mounts. */
.pr-trk-list>*,.pr-pick-grid>*,.pr-news-list>*{animation:prPopIn .5s var(--pop) backwards}
.pr-trk-list>*:nth-child(1),.pr-pick-grid>*:nth-child(1),.pr-news-list>*:nth-child(1){animation-delay:.03s}
.pr-trk-list>*:nth-child(2),.pr-pick-grid>*:nth-child(2),.pr-news-list>*:nth-child(2){animation-delay:.08s}
.pr-trk-list>*:nth-child(3),.pr-pick-grid>*:nth-child(3),.pr-news-list>*:nth-child(3){animation-delay:.13s}
.pr-trk-list>*:nth-child(4),.pr-pick-grid>*:nth-child(4),.pr-news-list>*:nth-child(4){animation-delay:.18s}
.pr-trk-list>*:nth-child(5),.pr-pick-grid>*:nth-child(5),.pr-news-list>*:nth-child(5){animation-delay:.23s}
.pr-trk-list>*:nth-child(6),.pr-pick-grid>*:nth-child(6),.pr-news-list>*:nth-child(6){animation-delay:.28s}
.pr-trk-list>*:nth-child(n+7),.pr-pick-grid>*:nth-child(n+7),.pr-news-list>*:nth-child(n+7){animation-delay:.33s}
@keyframes prPopIn{from{opacity:0;transform:translateY(12px) scale(.985)}}

/* Nav comes alive: icons tip their hat, active gets the accent. */
.pr-railbtn svg{transition:transform .18s var(--pop),color .14s}
.pr-railbtn:hover svg{transform:rotate(-8deg) scale(1.15)}
.pr-railbtn.is-active svg{color:var(--accent)}

/* Buttons squish when pressed. */
.pr-btn:active,.pr-btn-sm:active,.pr-pick-track:active,.pr-news-dd:active,.pr-chip:active,.pr-seg-btn:active,.pr-login-btn:active{transform:translateY(2px) scale(.985)}
.pr-chip{transition:transform .14s var(--pop),border-color .14s,color .14s}
.pr-chip:hover{transform:translateY(-1px) rotate(-0.5deg)}

/* Segmented control gets sticker depth when selected. */
.pr-seg-btn{transition:all .16s var(--pop)}
.pr-seg-btn.is-on{box-shadow:inset 0 0 0 1px var(--ink),2px 2px 0 var(--line2)}

/* The spectrum bar is touchable — stripes grow under the cursor. */
.pr-spectrum span{transition:flex .22s var(--pop)}
.pr-spectrum span:hover{flex:2.4}

/* Convergence gauge draws itself in; lens dots breathe. */
.pr-radar-poly{transform-box:fill-box;transform-origin:center;animation:prGaugeIn .7s var(--pop) backwards .15s}
@keyframes prGaugeIn{from{opacity:0;transform:scale(.6)}}
.pr-radar circle{animation:prDotIn .5s var(--pop) backwards .5s}
@keyframes prDotIn{from{opacity:0;transform:scale(0)}}

/* Logo wiggles when greeted; FAB sizzles idly every few seconds. */
.pr-logo:hover .pr-prism{animation:prWiggle .55s ease}
@keyframes prWiggle{25%{transform:rotate(-7deg)}60%{transform:rotate(5deg)}85%{transform:rotate(-2deg)}}
.pr-fab{animation:prSizzle 8s ease-in-out infinite}
@keyframes prSizzle{0%,93%,100%{transform:none}94.5%{transform:rotate(-3.5deg) scale(1.03)}96%{transform:rotate(3deg)}97.5%{transform:rotate(-1.5deg)}}

/* Inputs perk up on focus. */
.pr-add,.pr-command-row{transition:transform .16s var(--pop),border-color .14s,box-shadow .14s}
.pr-add:focus-within,.pr-command-row:focus-within{transform:translateY(-1px)}

/* Login card becomes a sticker with a spectrum lid. */
.pr-login-card{position:relative;overflow:hidden;box-shadow:7px 9px 0 rgba(26,23,18,0.12)}
.pr-login-card::before{content:"";position:absolute;top:0;left:0;right:0;height:5px;background:var(--spectrum)}

/* Tool + chat panels: the header strip carries the spectrum too. */
.pr-tool-head,.pr-chat-head{position:relative}
.pr-tool-head::after,.pr-chat-head::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--spectrum);opacity:.85}

/* Selection color joins the brand. */
.pr-app ::selection{background:rgba(238,67,16,0.22)}

/* Today's brief — ranked opportunity cards (the cockpit centerpiece). */
.pr-opp-list{display:flex;flex-direction:column;gap:13px;margin-top:14px}
.pr-opp-list>*{animation:prPopIn .5s var(--pop) backwards}
.pr-opp-list>*:nth-child(1){animation-delay:.03s}
.pr-opp-list>*:nth-child(2){animation-delay:.09s}
.pr-opp-list>*:nth-child(3){animation-delay:.15s}
.pr-opp-list>*:nth-child(4){animation-delay:.21s}
.pr-opp-list>*:nth-child(n+5){animation-delay:.27s}
.pr-opp{display:flex;gap:16px;background:var(--card);border:1px solid var(--line2);border-radius:10px;padding:18px 20px;position:relative;overflow:hidden;transition:transform .18s var(--pop),box-shadow .18s var(--pop),border-color .14s}
.pr-opp::before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--spectrum)}
.pr-opp:hover{transform:translateY(-3px) rotate(-0.25deg);border-color:var(--ink);box-shadow:5px 7px 0 var(--line2)}
.pr-opp-rank{font-family:var(--fd);font-weight:700;font-size:26px;color:var(--line2);line-height:1;flex-shrink:0;padding-top:2px}
.pr-opp:hover .pr-opp-rank{color:var(--accent)}
.pr-opp-main{flex:1;min-width:0}
.pr-opp-horizon{font-family:var(--fm);font-size:10px;color:var(--muted);border:1px solid var(--line2);border-radius:99px;padding:2px 9px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap}
@media (max-width:880px){.pr-opp{flex-direction:column;gap:8px}.pr-opp-rank{font-size:18px}}

/* Track record + morning-email toggle. */
.pr-record-list{display:flex;flex-direction:column;gap:11px;margin-top:6px}
.pr-record{background:var(--card);border:1px solid var(--line2);border-radius:9px;overflow:hidden;transition:border-color .2s}
.pr-record.is-open{border-color:var(--ink)}
.pr-record-head{width:100%;display:flex;align-items:center;gap:12px;padding:14px 18px;border:none;background:none;color:var(--ink);font-family:var(--fb);cursor:pointer;text-align:left}
.pr-record-date{font-family:var(--fm);font-weight:600;font-size:14px;letter-spacing:0.03em}
.pr-record-sum{font-family:var(--fm);font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;flex:1}
.pr-record-verdicts{display:flex;gap:5px;flex-wrap:wrap}
.pr-verdict{font-style:normal;font-family:var(--fm);font-size:10px;border:1px solid var(--line2);border-radius:99px;padding:2px 9px;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted)}
.pr-verdict.is-good{color:var(--good);border-color:rgba(30,142,76,0.45);background:rgba(30,142,76,0.07)}
.pr-verdict.is-live{color:var(--warn);border-color:rgba(176,122,18,0.45);background:rgba(176,122,18,0.07)}
.pr-verdict.is-bad{color:var(--bad);border-color:rgba(207,59,44,0.45);background:rgba(207,59,44,0.07)}
.pr-verdict.is-mute{color:var(--muted)}
.pr-record-body{padding:2px 18px 18px;animation:prFade .3s ease}
.pr-record-item{padding:12px 0;border-top:1px solid var(--line)}
.pr-record-item-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:14px;color:var(--ink);margin-bottom:5px}
.pr-record-actions{margin-top:14px}

.pr-mailtoggle{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line2);color:var(--muted);font-family:var(--fm);font-size:11px;letter-spacing:0.04em;padding:9px 12px;border-radius:99px;cursor:pointer;transition:all .14s;text-transform:uppercase}
.pr-mailtoggle:hover{border-color:var(--accent);color:var(--ink)}
.pr-mailtoggle.is-on{color:var(--good);border-color:rgba(30,142,76,0.5);background:rgba(30,142,76,0.07)}

@media (prefers-reduced-motion:reduce){
  .pr-trk-list>*,.pr-pick-grid>*,.pr-news-list>*,.pr-radar-poly,.pr-radar circle,.pr-fab,.pr-logo:hover .pr-prism{animation:none}
  .pr-trk:hover,.pr-pick:hover,.pr-news:hover,.pr-panel:hover,.pr-chip:hover,.pr-railbtn:hover svg{transform:none}
}
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
