#!/usr/bin/env node
// gate-42-hologram-raster-verify.mjs — adversarial verifier for Gate 42.
// Re-derives the quilt from source IN-MEMORY (no clobber) and proves the committed
// PNG + sidecar are real, reproducible, parallax-bearing, and source-faithful.

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  renderQuilt,
  encodePng,
  sha,
  TILE_W,
  TILE_H,
  GRID_COLS,
  GRID_ROWS,
  VIEWS,
  EXPORT_PATH,
  PNG_PATH,
  SIDECAR_PATH,
} from './gate-42-hologram-raster.mjs';

const checks = [];
const ok = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
};

async function main() {
  const exp = JSON.parse(await fs.readFile(EXPORT_PATH, 'utf8'));
  const sidecar = JSON.parse(await fs.readFile(SIDECAR_PATH, 'utf8'));
  const png = await fs.readFile(PNG_PATH);
  const W = GRID_COLS * TILE_W,
    H = GRID_ROWS * TILE_H;

  // 1. PNG is a real PNG with the expected quilt dimensions.
  const sigOk = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const pw = png.readUInt32BE(16),
    ph = png.readUInt32BE(20);
  ok('1 PNG signature + dims', sigOk && pw === W && ph === H, `${pw}x${ph} sig=${sigOk}`);

  // 2. Sidecar schema/shape.
  ok(
    '2 sidecar schema/shape',
    sidecar.schema === 'gold-game-hologram-raster-v1' &&
      sidecar.gate === 42 &&
      sidecar.views === VIEWS &&
      sidecar.grid === `${GRID_COLS}x${GRID_ROWS}` &&
      sidecar.sampleCount === exp.samples.length &&
      sidecar.parallaxApplied === true,
    `gate=${sidecar.gate} views=${sidecar.views} samples=${sidecar.sampleCount}`
  );

  // 3. Anti-stale: committed PNG hash == sidecar claim (hand-edited PNG flips this).
  const pngSha = createHash('sha256').update(png).digest('hex');
  ok('3 committed PNG sha == sidecar', pngSha === sidecar.pngSha256, pngSha.slice(0, 12));

  // 4. Determinism + source-faithful: re-render from source reproduces the raster digest.
  const real = renderQuilt(exp, { noParallax: false });
  const realRasterDigest = sha(real.buf);
  ok(
    '4 raster reproduces from source',
    realRasterDigest === sidecar.rasterDigest,
    realRasterDigest.slice(0, 12)
  );

  // 5. PNG reproduces byte-for-byte from source (encoder is deterministic).
  const reSha = sha(encodePng(real.buf, real.W, real.H));
  ok('5 PNG reproduces from source', reSha === sidecar.pngSha256, reSha.slice(0, 12));

  // 6. Real content: the quilt is not blank — depth samples actually rasterized.
  let nonBg = 0;
  for (let i = 0; i < real.buf.length; i += 3) {
    if (!(real.buf[i] === 10 && real.buf[i + 1] === 9 && real.buf[i + 2] === 16)) nonBg++;
  }
  ok('6 non-background content present', nonBg > 200, `${nonBg} lit px`);

  // 7. Parallax monotonic across views (real light-field, not a copied tile).
  const eyes = sidecar.perViewEyeX;
  let mono = true;
  for (let i = 1; i < eyes.length; i++)
    if (!(eyes[i] > eyes[i - 1])) {
      mono = false;
      break;
    }
  const span = eyes[eyes.length - 1] - eyes[0];
  ok('7 parallax sweeps monotonically', mono && span > 0, `span=${span.toFixed(4)}`);

  // 8. NEGATIVE CONTROL A — kill parallax → raster MUST change (parallax is load-bearing).
  const flat = renderQuilt(exp, { noParallax: true });
  const flatDigest = sha(flat.buf);
  ok(
    '8 [neg] no-parallax flips raster digest',
    flatDigest !== sidecar.rasterDigest,
    `flat=${flatDigest.slice(0, 12)}`
  );

  // 9. NEGATIVE CONTROL B — tamper one source sample → raster MUST change (source-faithful).
  const tampered = JSON.parse(JSON.stringify(exp));
  tampered.samples[0].world = [
    tampered.samples[0].world[0] + 5,
    tampered.samples[0].world[1],
    tampered.samples[0].world[2],
  ];
  const tamperedDigest = sha(renderQuilt(tampered, { noParallax: false }).buf);
  ok(
    '9 [neg] tampered sample flips raster digest',
    tamperedDigest !== sidecar.rasterDigest,
    `tampered=${tamperedDigest.slice(0, 12)}`
  );

  const passed = checks.filter((c) => c.pass).length;
  for (const c of checks)
    console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  console.log(`\n${passed}/${checks.length} checks pass`);
  if (passed === checks.length) {
    console.log(
      `Gate 42 PASS — physical hologram quilt rasterized (${W}x${H}, digest ${sidecar.rasterDigest.slice(0, 12)}).`
    );
    process.exit(0);
  }
  console.log('Gate 42 FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
