#!/usr/bin/env node
// Screenshot the signed-in app against scripts/mock-supabase.mjs.
//
//   node scripts/shoot.mjs <outDir> [path ...]
//   BASE=http://localhost:3000 VIEWPORT=mobile|desktop|both THEME=light|dark
//
// Uses the globally installed Playwright (the dev container ships Chromium).

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"))); }

const BASE = process.env.BASE || "http://localhost:3000";
const out = process.argv[2] || "shots";
const routes = process.argv.slice(3).length ? process.argv.slice(3) : ["/", "/news", "/watchlist", "/analyze", "/track-record", "/account"];
const which = process.env.VIEWPORT || "both";
const theme = process.env.THEME || "light";
fs.mkdirSync(out, { recursive: true });

// Same session shape the mock serves; the token is only checked by the mock.
const now = Math.floor(Date.now() / 1000), exp = now + 30 * 24 * 3600;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const head = b64({ alg: "HS256", typ: "JWT" });
const pay = b64({ sub: "00000000-0000-4000-8000-000000000001", email: "demo@bacon.test", role: "authenticated", aud: "authenticated", exp, iat: now });
const sig = crypto.createHmac("sha256", "mock-secret").update(`${head}.${pay}`).digest("base64url");
const session = { access_token: `${head}.${pay}.${sig}`, token_type: "bearer", expires_in: 2592000, expires_at: exp, refresh_token: "mock-refresh", user: { id: "00000000-0000-4000-8000-000000000001", email: "demo@bacon.test", aud: "authenticated", role: "authenticated" } };
const cookie = { name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE };

const viewports = [];
if (which !== "desktop") viewports.push({ name: "mobile", viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (which !== "mobile") viewports.push({ name: "desktop", viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });

const browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? undefined : undefined });
for (const vp of viewports) {
  const ctx = await browser.newContext({ ...vp, colorScheme: theme });
  await ctx.addCookies([cookie]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  for (const r of routes) {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => errors.push(`goto ${r}: ${e.message}`));
    await page.waitForTimeout(600);
    const file = path.join(out, `${vp.name}-${theme}${r === "/" ? "-today" : r.replace(/\//g, "-")}.png`);
    await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
    console.log("shot", file);
  }
  if (errors.length) console.log(`[${vp.name}] console/page errors:\n  ` + [...new Set(errors)].slice(0, 20).join("\n  "));
  await ctx.close();
}
await browser.close();
