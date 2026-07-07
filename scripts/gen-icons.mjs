// One-shot: rasterize the bacon mark into the PWA icon set (PNG) using headless
// Chromium. Outputs to public/icons/. Re-run only if the mark changes.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const stripes = (inset, w) => {
  const hues = ["#E0A33E", "#38B6C4", "#9B86E0", "#E2685C", "#5FB97E", "#6FA1CE"];
  const wave = (y) => `M6 ${y} C 16 ${y - 5}, 24 ${y + 5}, 32 ${y} C 40 ${y - 5}, 48 ${y + 5}, 58 ${y}`;
  return hues.map((h, i) => `<path d="${wave(18 + i * 5.6)}" stroke="${h}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`).join("");
};

// tile: rounded dark card (transparent corners) — regular icons.
// bleed: full-square dark background, mark scaled into the safe zone — maskable/apple.
function svg(size, { bleed = false, scale = 1 } = {}) {
  const r = bleed ? 0 : Math.round(size * 0.2);
  const g = (size / 64) * scale;
  const off = (size - 64 * g) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="#1A1712"/>
    <g transform="translate(${off},${off}) scale(${g})"><g transform="rotate(-14 32 32)">${stripes(0, 4.2)}</g></g>
  </svg>`;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["icon-192.png", svg(192), 192],
  ["icon-512.png", svg(512), 512],
  ["icon-maskable-512.png", svg(512, { bleed: true, scale: 0.66 }), 512],
  ["apple-touch-icon.png", svg(180, { bleed: true, scale: 0.78 }), 180],
];
for (const [file, markup, size] of jobs) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.setContent(`<body style="margin:0">${markup}</body>`);
  const buf = await p.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: true });
  writeFileSync(`public/icons/${file}`, buf);
  await ctx.close();
  console.log(file, buf.length, "bytes");
}
await browser.close();
