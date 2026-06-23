#!/usr/bin/env node
/**
 * Generate the HoloQR Meta Horizon Store listing image assets (exact px sizes) from the brand SVG.
 * SVG → PNG via sharp. Brand = the emitted ic_launcher glyph (QR finders + holo-lens) + the HoloQR
 * wordmark, on the dark MR background. Run: node scripts/gen-store-assets.mjs
 *
 * Outputs to store-assets/. Re-run anytime — deterministic. (Screenshots + trailer come from
 * on-device recordings, not this script.)
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'store-assets');
mkdirSync(outDir, { recursive: true });

const BG0 = '#0A0D11';
const BG1 = '#0E1A27';
const TILE = '#101418';
const MINT = '#9FE2BF';
const CYAN = '#7FD8FF';
const SUB = '#D4DEE6';
const HINT = '#7E8C97';
const FONT = "'Segoe UI', 'Arial', sans-serif";

// The icon glyph in a 108-unit viewport (matches the emitted ic_launcher.xml).
const glyph = (cut = TILE) => `
  <path fill="${MINT}" fill-rule="evenodd" d="M16,16h26v26h-26z M23,23h12v12h-12z"/>
  <path fill="${MINT}" fill-rule="evenodd" d="M66,16h26v26h-26z M73,23h12v12h-12z"/>
  <path fill="${MINT}" fill-rule="evenodd" d="M16,66h26v26h-26z M23,73h12v12h-12z"/>
  <path fill="${MINT}" d="M52,18h8v8h-8z M52,34h8v8h-8z M18,52h8v8h-8z M34,52h8v8h-8z M52,52h8v8h-8z"/>
  <path fill="${CYAN}" d="M79,62l17,17l-17,17l-17,-17z"/>
  <path fill="${cut}" d="M79,72l7,7l-7,7l-7,-7z"/>
  <path fill="#FFFFFF" d="M79,75l4,4l-4,4l-4,-4z"/>`;

const defs = (id) => `
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BG0}"/><stop offset="1" stop-color="${BG1}"/>
    </linearGradient>
  </defs>`;

const wordmark = (x, y, size, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" letter-spacing="${-size * 0.02}" text-anchor="${anchor}"><tspan fill="${CYAN}">Holo</tspan><tspan fill="${MINT}">QR</tspan></text>`;

/** Icon: solid dark square, glyph centred, no transparency, squared corners (Horizon masks it). */
function icon(W) {
  const g = Math.round(W * 0.68);
  const off = Math.round((W - g) / 2);
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${W}" fill="${TILE}"/>
    <g transform="translate(${off},${off}) scale(${g / 108})">${glyph(TILE)}</g>
  </svg>`;
}

/** Spatialized icon / logo glyph: transparent bg, glyph only. */
function glyphOnly(W) {
  return `<svg width="${W}" height="${W}" viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">
    <g transform="scale(${W / 108})">${glyph('#0A0D11')}</g>
  </svg>`;
}

/** Transparent wordmark logo (glyph + HoloQR), horizontal lockup. */
function logo(W, H) {
  const g = Math.round(H * 0.86);
  const gy = Math.round((H - g) / 2);
  const wmSize = Math.round(H * 0.46);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(${gy},${gy}) scale(${g / 108})">${glyph('#0A0D11')}</g>
    ${wordmark(g + gy + Math.round(H * 0.16), Math.round(H * 0.63), wmSize)}
  </svg>`;
}

/** Cover: dark MR background; horizontal (glyph left + text right) when wide, stacked otherwise. */
function cover(id, W, H) {
  const horizontal = W / H >= 1.5;
  if (horizontal) {
    const g = Math.round(Math.min(H * 0.6, W * 0.22));
    const gx = Math.round(W * 0.07);
    const gy = Math.round((H - g) / 2);
    const tx = gx + g + Math.round(W * 0.04);
    const wmSize = Math.round(H * 0.2);
    const tagSize = Math.round(H * 0.062);
    const cy = H / 2;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${defs(id)}
      <rect width="${W}" height="${H}" fill="url(#bg${id})"/>
      <g transform="translate(${gx},${gy})"><rect width="${g}" height="${g}" rx="${Math.round(g * 0.2)}" fill="${TILE}"/>
        <g transform="translate(${Math.round(g * 0.06)},${Math.round(g * 0.06)}) scale(${(g * 0.88) / 108})">${glyph(TILE)}</g></g>
      ${wordmark(tx, Math.round(cy - H * 0.02), wmSize)}
      <text x="${tx + 2}" y="${Math.round(cy + H * 0.11)}" font-family="${FONT}" font-size="${tagSize}" fill="${SUB}">Read QR codes in mixed reality</text>
      <text x="${tx + 2}" y="${Math.round(cy + H * 0.21)}" font-family="${FONT}" font-size="${Math.round(tagSize * 0.82)}" fill="${HINT}">Meta Quest 3 · 3S · passthrough</text>
    </svg>`;
  }
  const g = Math.round(W * 0.42);
  const gx = Math.round((W - g) / 2);
  const gy = Math.round(H * 0.16);
  const wmSize = Math.round(W * 0.16);
  const tagSize = Math.round(W * 0.045);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${defs(id)}
    <rect width="${W}" height="${H}" fill="url(#bg${id})"/>
    <g transform="translate(${gx},${gy})"><rect width="${g}" height="${g}" rx="${Math.round(g * 0.2)}" fill="${TILE}"/>
      <g transform="translate(${Math.round(g * 0.06)},${Math.round(g * 0.06)}) scale(${(g * 0.88) / 108})">${glyph(TILE)}</g></g>
    ${wordmark(W / 2, gy + g + Math.round(H * 0.13), wmSize, 'middle')}
    <text x="${W / 2}" y="${gy + g + Math.round(H * 0.2)}" font-family="${FONT}" font-size="${tagSize}" fill="${SUB}" text-anchor="middle">Read QR codes in mixed reality</text>
  </svg>`;
}

const assets = [
  { name: 'icon-512.png', svg: icon(512), alpha: false },
  { name: 'icon-spatialized-180.png', svg: glyphOnly(180), alpha: true },
  { name: 'logo-transparent-2400x384.png', svg: logo(2400, 384), alpha: true },
  { name: 'cover-hero-3000x900.png', svg: cover('h', 3000, 900), alpha: false },
  { name: 'cover-landscape-2560x1440.png', svg: cover('l', 2560, 1440), alpha: false },
  { name: 'cover-square-1440x1440.png', svg: cover('s', 1440, 1440), alpha: false },
  { name: 'cover-portrait-1008x1440.png', svg: cover('p', 1008, 1440), alpha: false },
  { name: 'cover-mini-1080x360.png', svg: cover('m', 1080, 360), alpha: false },
];

let n = 0;
for (const a of assets) {
  let img = sharp(Buffer.from(a.svg));
  if (!a.alpha) img = img.flatten({ background: BG0 });
  await img.png().toFile(join(outDir, a.name));
  console.log(`  ${a.name}`);
  n++;
}
console.log(`gen-store-assets: wrote ${n} asset(s) → store-assets/`);
