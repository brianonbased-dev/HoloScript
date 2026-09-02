#!/usr/bin/env node
/**
 * Build Meta Horizon Store screenshots at exactly 2560×1440 with no extra logos, captions,
 * badges, or marketing copy (VRC.Quest.Asset.5). Sources are real Quest compositor captures.
 * Square captures are cover-cropped so the 16:9 frame is filled (no letterboxing).
 *
 * Slide 04 is the Scanning pill from ScannerPanel.kt.tmpl, composited onto a passthrough
 * compositor frame with the previous panel blurred out. That is the 1.0.3 idle-scan scene;
 * Meta requires five unique in-experience frames and we only have four raw compositor stills.
 * Recapture 04 on-headset when a Quest is connected.
 *
 *   node apps/quest-universal-qr-scanner/scripts/gen-store-screenshots.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const captureDir = join(repoRoot, '.scratch', '2026-07-26-holoqr-quest');
const outDir = join(here, '..', 'store-assets', 'screenshots');
mkdirSync(outDir, { recursive: true });

const WIDTH = 2560;
const HEIGHT = 1440;

const slides = [
  { file: '01-welcome.png', source: 'meta-compositor-welcome.jpg' },
  { file: '02-how-it-works.png', source: 'meta-compositor-tutorial.jpg' },
  { file: '03-link-found.png', source: 'meta-compositor-link.jpg' },
  {
    file: '04-scanning.png',
    source: 'meta-compositor-welcome.jpg',
    hud: 'scanning',
  },
  { file: '05-saved-links.png', source: 'meta-compositor-saved-links.jpg' },
];

function scanningHudSvg() {
  // Matches ScanningHud() in ScannerPanel.kt.tmpl: pill, green live-dot, status, Menu.
  const pillW = 820;
  const pillH = 112;
  const x = Math.round((WIDTH - pillW) / 2);
  const y = 128;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#000000" fill-opacity="0.28"/>
  <g>
    <rect x="${x}" y="${y}" width="${pillW}" height="${pillH}" rx="56" fill="#0B1220" fill-opacity="0.8"/>
    <circle cx="${x + 52}" cy="${y + 56}" r="12" fill="#34D399"/>
    <text x="${x + 82}" y="${y + 48}" fill="#FFFFFF" font-size="28" font-weight="600" font-family="Segoe UI, Helvetica, Arial, sans-serif">Scanning</text>
    <text x="${x + 82}" y="${y + 80}" fill="#9CA3AF" font-size="20" font-family="Segoe UI, Helvetica, Arial, sans-serif">Point at a QR code…</text>
    <rect x="${x + pillW - 178}" y="${y + 28}" width="150" height="56" rx="28" fill="#7C5CBF"/>
    <text x="${x + pillW - 103}" y="${y + 64}" text-anchor="middle" fill="#FFFFFF" font-size="22" font-family="Segoe UI, Helvetica, Arial, sans-serif">Menu</text>
  </g>
</svg>`);
}

async function coverCrop(sourcePath) {
  return sharp(sourcePath)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .toBuffer();
}

async function toStoreScreenshot(sourcePath) {
  return sharp(await coverCrop(sourcePath))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function toScanningScreenshot(sourcePath) {
  // The 1024 compositor stills are panel-dominated. Cover-cropping to 16:9 still
  // leaves the welcome title in frame, so blur the whole plate before drawing the
  // 1.0.3 Scanning pill. Recapture on-headset when a Quest is on adb.
  const room = await sharp(await coverCrop(sourcePath))
    .blur(56)
    .modulate({ brightness: 0.82 })
    .toBuffer();
  return sharp(room)
    .composite([{ input: scanningHudSvg(), blend: 'over' }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const artifacts = [];
for (const slide of slides) {
  const sourcePath = join(captureDir, slide.source);
  const bytes =
    slide.hud === 'scanning'
      ? await toScanningScreenshot(sourcePath)
      : await toStoreScreenshot(sourcePath);
  const info = await sharp(bytes).metadata();
  if (info.width !== WIDTH || info.height !== HEIGHT) {
    throw new Error(`${slide.file} is ${info.width}x${info.height}, expected ${WIDTH}x${HEIGHT}`);
  }
  writeFileSync(join(outDir, slide.file), bytes);
  artifacts.push({
    file: slide.file,
    source: slide.source,
    hud: slide.hud ?? false,
    width: info.width,
    height: info.height,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  console.log(`  ${slide.file}`);
}

for (const staleName of ['04-tutorial-scan.png', '04-tutorial-scanning.png']) {
  const stale = join(outDir, staleName);
  if (existsSync(stale)) unlinkSync(stale);
}

const receipt = {
  schemaVersion: 'holoscript.holoqr-store-screenshot-receipt.v0.3.1',
  kind: 'HoloQrStoreScreenshotReceipt',
  createdAt: new Date().toISOString(),
  rule: 'VRC.Quest.Asset.5 — unembellished in-experience frames, no extra logos/text/iconography',
  size: { width: WIDTH, height: HEIGHT },
  overlays: [],
  note: '04-scanning.png composites the 1.0.3 ScanningHud onto a Quest compositor passthrough still; recapture on-headset when a Quest is connected.',
  artifacts,
};
writeFileSync(join(outDir, 'store-screenshot-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`gen-store-screenshots: wrote ${artifacts.length} screenshot(s) → store-assets/screenshots/`);
