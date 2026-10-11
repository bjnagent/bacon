// Rasterize the brand sources in resources/ into the iOS asset catalog:
//
//   resources/icon.svg  → AppIcon (one 1024×1024 PNG, opaque — App Store rejects alpha)
//   resources/mark.svg  → Splash (the mark at 120pt @1x/@2x/@3x, transparent)
//   + the adaptive colours the launch screen and native chrome use:
//     LaunchBackground (#F6F4EF light / #0E0D0B dark), AccentColor (#CC3F0E / #FF6B3D)
//
// Run with `npm run ios:assets` after changing the mark (no network, no browser:
// sharp is already installed as Next.js's image optimizer). Idempotent.
import sharp from "sharp";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const xcassets = `${root}ios/App/App/Assets.xcassets`;
const INFO = { author: "xcode", version: 1 };

function resetDir(dir) {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) rmSync(`${dir}/${f}`, { recursive: true, force: true });
}
const json = (v) => JSON.stringify(v, null, 2) + "\n";

// ---- App icon ----------------------------------------------------------------
const iconDir = `${xcassets}/AppIcon.appiconset`;
resetDir(iconDir);
const icon = await sharp(readFileSync(`${root}resources/icon.svg`), { density: 72 })
  .resize(1024, 1024)
  .flatten({ background: "#110E0A" })
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toBuffer();
const meta = await sharp(icon).metadata();
if (meta.width !== 1024 || meta.height !== 1024 || meta.hasAlpha) throw new Error("App icon must be 1024×1024 without alpha");
writeFileSync(`${iconDir}/AppIcon-1024.png`, icon);
writeFileSync(`${iconDir}/Contents.json`, json({
  images: [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "ios", size: "1024x1024" }],
  info: INFO,
}));
console.log("AppIcon-1024.png", icon.length, "bytes");

// ---- Launch mark ---------------------------------------------------------------
const POINTS = 120; // keep in step with the image constraints in LaunchScreen.storyboard
const splashDir = `${xcassets}/Splash.imageset`;
resetDir(splashDir);
const mark = readFileSync(`${root}resources/mark.svg`);
const images = [];
for (const scale of [1, 2, 3]) {
  const px = POINTS * scale;
  const file = scale === 1 ? "splash.png" : `splash@${scale}x.png`;
  // Render from the vector at the target size (density scales the 64-unit viewBox).
  const buf = await sharp(mark, { density: (72 * px) / 64 }).resize(px, px).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(`${splashDir}/${file}`, buf);
  images.push({ filename: file, idiom: "universal", scale: `${scale}x` });
  console.log(file, buf.length, "bytes");
}
writeFileSync(`${splashDir}/Contents.json`, json({ images, info: INFO }));

// ---- Colours -----------------------------------------------------------------
function colorset(name, light, dark) {
  const c = (hex) => ({
    "color-space": "srgb",
    components: {
      alpha: "1.000",
      red: `0x${hex.slice(1, 3)}`,
      green: `0x${hex.slice(3, 5)}`,
      blue: `0x${hex.slice(5, 7)}`,
    },
  });
  const dir = `${xcassets}/${name}.colorset`;
  resetDir(dir);
  writeFileSync(`${dir}/Contents.json`, json({
    colors: [
      { color: c(light), idiom: "universal" },
      { appearances: [{ appearance: "luminosity", value: "dark" }], color: c(dark), idiom: "universal" },
    ],
    info: INFO,
  }));
  console.log(`${name}.colorset`, light, dark);
}
// app/globals.css: --bg and --accent, light and dark.
colorset("LaunchBackground", "#F6F4EF", "#0E0D0B");
colorset("AccentColor", "#CC3F0E", "#FF6B3D");

writeFileSync(`${xcassets}/Contents.json`, json({ info: INFO }));
