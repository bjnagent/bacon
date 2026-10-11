// Rasterize the Bacon mark into the PWA icon set (PNG) for browsers' "Add to
// Home Screen". Same sources as the iOS app icon (resources/icon.svg,
// resources/mark.svg — see scripts/gen-ios-assets.mjs), rendered with sharp
// (already installed as Next.js's image optimizer; no browser needed).
//
//   node scripts/gen-icons.mjs [outDir]     (default: public/icons)
//
// Re-run only if the mark changes.
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2] || `${root}public/icons`;
mkdirSync(out, { recursive: true });

const iconSvg = readFileSync(`${root}resources/icon.svg`);
const markSvg = readFileSync(`${root}resources/mark.svg`);
const BG = "#110E0A";

/** Full-bleed square (the platform applies its own mask): apple-touch-icon. */
async function fullBleed(size) {
  return sharp(iconSvg, { density: (72 * size) / 1024 }).resize(size, size).flatten({ background: BG }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

/** Rounded tile with transparent corners: the regular "any" icons. */
async function tile(size) {
  const r = Math.round(size * 0.225);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
  return sharp(await fullBleed(size)).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png({ compressionLevel: 9 }).toBuffer();
}

/** Maskable: full-bleed background, the mark kept inside the 80% safe circle. */
async function maskable(size) {
  const markPx = Math.round(size * 0.62);
  const mark = await sharp(markSvg, { density: (72 * markPx) / 64 }).resize(markPx, markPx).png().toBuffer();
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2A221A"/><stop offset="1" stop-color="${BG}"/></radialGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`);
  const left = Math.round((size - markPx) / 2);
  const top = Math.round((size - markPx) / 2 - markPx * (4 / 64)); // optical centre: the strip sits low in its box
  return sharp(bg).composite([{ input: mark, left, top }]).flatten({ background: BG }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

const jobs = [
  ["icon-192.png", () => tile(192)],
  ["icon-512.png", () => tile(512)],
  ["icon-maskable-512.png", () => maskable(512)],
  ["apple-touch-icon.png", () => fullBleed(180)],
];
for (const [file, make] of jobs) {
  const buf = await make();
  writeFileSync(`${out}/${file}`, buf);
  console.log(file, buf.length, "bytes");
}
