/**
 * Pseudo-noise + smooth-noise — pure functions, deterministic, seedable.
 *
 * Extracted 2026-04-27 to dedupe identical implementations between
 * `engines/cloth-verlet.ts` and `runtime/src/traits/PhysicsTraits.ts`
 * (per /critic batch-6 Annoying #8: "two sources of truth for what is
 * supposed to be deterministic noise"). All callers now import from
 * here.
 *
 * The noise function is the classic `sin * 43758.5453` hash — fast,
 * deterministic, no allocations, no Math.random. Suitable for Verlet
 * cloth wind, soft-body turbulence, fluid agitation. NOT cryptographic.
 *
 * Domain: t and seed are real numbers; output is in [-1, 1].
 */

/**
 * Hash-style 1D noise. Deterministic for any (t, seed) pair.
 * Output: [-1, 1].
 */
export function noise(t: number, seed: number): number {
  const n = Math.sin(t * 12.9898 + seed * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/**
 * Smoothstep-interpolated noise. Continuous and C1 across integer t boundaries.
 * Output: [-1, 1].
 */
export function smoothNoise(t: number, seed: number): number {
  const floor = Math.floor(t);
  const frac = t - floor;
  const smooth = frac * frac * (3 - 2 * frac);
  return noise(floor, seed) + smooth * (noise(floor + 1, seed) - noise(floor, seed));
}
