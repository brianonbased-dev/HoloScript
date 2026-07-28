/**
 * Structural test for splat-train-forward.wgsl (the GPU forward raster of the trainer).
 *
 * The kernel writes f32 RGB directly (no fixed-point, no atomics), so its "CPU twin" is exactly
 * GaussianTrainer2D.forward2D — a behavioral JS parity test would be forward2D-vs-forward2D, vacuous.
 * The real behavioral validation is on a GPU: the full capture-training loop self-checks the GPU
 * image against forward2D (PASS, max-abs 1.33e-5 on an RTX 3060). Here we structurally assert the
 * .wgsl still contains the load-bearing operations, so it can't silently drift from forward2D.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const wgsl = readFileSync(
  fileURLToPath(new URL('../splat-train-forward.wgsl', import.meta.url)),
  'utf8'
);

describe('splat-train-forward.wgsl — structural', () => {
  it('contains the alpha-blend forward operations (matches forward2D)', () => {
    expect(wgsl).toMatch(/fn cs_train_forward/);
    expect(wgsl).toMatch(/var alpha = s\.op \* exp\(-sigma\)/); // alpha = opacity * exp(-sigma)
    expect(wgsl).toMatch(/1\.0 \/ 255\.0/); // alpha cutoff
    expect(wgsl).toMatch(/0\.999/); // alpha clamp
    expect(wgsl).toMatch(/T = T \* \(1\.0 - alpha\)/); // front-to-back transmittance
    expect(wgsl).toMatch(/cr = cr \+ T \* alpha \* s\.r/); // premultiplied over-blend
    expect(wgsl).toMatch(/img\[o\] = cr \+ T \* u\.bg\.x/); // background composite
    expect(wgsl).not.toMatch(/atomicAdd|atomic</); // forward needs no atomics (each pixel owns its output)
  });
});
