#!/usr/bin/env node
/**
 * Build Meta Horizon Store screenshots at exactly 2560×1440 with no extra logos, captions,
 * badges, or marketing copy (VRC.Quest.Asset.5). Sources are real Quest compositor captures.
 * Square captures are cover-cropped so the 16:9 frame is filled (no letterboxing).
 *
 *   node apps/quest-universal-qr-scanner/scripts/gen-store-screenshots.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  { file: '04-tutorial-scan.png', source: 'agent-panel-tutorial-scanning-fast.png' },
  { file: '05-saved-links.png', source: 'meta-compositor-saved-links.jpg' },
];

async function toStoreScreenshot(sourcePath) {
  return sharp(sourcePath)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

const artifacts = [];
for (const slide of slides) {
  const sourcePath = join(captureDir, slide.source);
  const bytes = await toStoreScreenshot(sourcePath);
  const info = await sharp(bytes).metadata();
  if (info.width !== WIDTH || info.height !== HEIGHT) {
    throw new Error(`${slide.file} is ${info.width}x${info.height}, expected ${WIDTH}x${HEIGHT}`);
  }
  writeFileSync(join(outDir, slide.file), bytes);
  artifacts.push({
    file: slide.file,
    source: slide.source,
    width: info.width,
    height: info.height,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  console.log(`  ${slide.file}`);
}

const { unlinkSync, existsSync } = await import('node:fs');
for (const staleName of ['04-tutorial-scanning.png', '04-scanning.png']) {
  const stale = join(outDir, staleName);
  if (existsSync(stale)) unlinkSync(stale);
}

const receipt = {
  schemaVersion: 'holoscript.holoqr-store-screenshot-receipt.v0.3.0',
  kind: 'HoloQrStoreScreenshotReceipt',
  createdAt: new Date().toISOString(),
  rule: 'VRC.Quest.Asset.5 — unembellished in-experience frames, no extra logos/text/iconography',
  size: { width: WIDTH, height: HEIGHT },
  overlays: [],
  artifacts,
};
writeFileSync(join(outDir, 'store-screenshot-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`gen-store-screenshots: wrote ${artifacts.length} screenshot(s) → store-assets/screenshots/`);
