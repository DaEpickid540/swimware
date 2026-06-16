/**
 * Rasterizes assets/logo.svg into the PWA + iOS icon set in /public.
 * Run with: npm run icons
 *
 * Produces:
 *   - pwa-192x192.png, pwa-512x512.png        (manifest icons, purpose "any")
 *   - maskable-512x512.png                    (purpose "maskable", safe padding)
 *   - apple-touch-icon.png (180)              (iOS home screen)
 *   - favicon-32.png, favicon-16.png          (browser tab)
 *   - apple-splash-*.png                      (iOS launch screens, common sizes)
 */
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

const svg = readFileSync(join(root, "assets", "logo.svg"));

async function png(size, file, { padding = 0, bg = null } = {}) {
  const inner = Math.round(size * (1 - padding));
  const logo = await sharp(svg).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const offset = Math.round((size - inner) / 2);
  await canvas.composite([{ input: logo, top: offset, left: offset }]).png().toFile(join(pub, file));
  console.log("  ✓", file);
}

// Splash: centered logo on the brand background at device resolution.
async function splash(w, h, file) {
  const logoSize = Math.round(Math.min(w, h) * 0.32);
  const logo = await sharp(svg).resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 11, g: 107, b: 203, alpha: 1 } } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(join(pub, file));
  console.log("  ✓", file);
}

console.log("Generating icons…");
await png(192, "pwa-192x192.png");
await png(512, "pwa-512x512.png");
await png(512, "maskable-512x512.png", { padding: 0.18, bg: { r: 11, g: 107, b: 203, alpha: 1 } });
await png(180, "apple-touch-icon.png", { bg: { r: 11, g: 107, b: 203, alpha: 1 } });
await png(32, "favicon-32.png");
await png(16, "favicon-16.png");

console.log("Generating iOS splash screens…");
// width, height in device pixels for common iPhone/iPad sizes (portrait).
const splashes = [
  [1170, 2532, "apple-splash-1170-2532.png"], // iPhone 13/14
  [1284, 2778, "apple-splash-1284-2778.png"], // iPhone Pro Max
  [1125, 2436, "apple-splash-1125-2436.png"], // iPhone X/11 Pro
  [828, 1792, "apple-splash-828-1792.png"], // iPhone XR/11
  [750, 1334, "apple-splash-750-1334.png"], // iPhone 8/SE
  [1536, 2048, "apple-splash-1536-2048.png"], // iPad
  [1668, 2388, "apple-splash-1668-2388.png"], // iPad Pro 11
  [2048, 2732, "apple-splash-2048-2732.png"], // iPad Pro 12.9
];
for (const [w, h, file] of splashes) await splash(w, h, file);

console.log("Done.");
