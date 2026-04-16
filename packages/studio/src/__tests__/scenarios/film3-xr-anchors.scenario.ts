import { describe, test, expect } from 'vitest';

/**
 * Film3 XR anchors — host-side contract tests for Ticket 1/2 (depth occlusion + UI vs world).
 * Does not run on Quest; validates policy we expect AndroidXRCompiler + runtime to honor.
 *
 * **On-device:** Use {@link FILM3_XR_MINIMAL_TEST_SCENE} as the narrative checklist when compiling
 * a `.holo` composition for Android XR and sideloading to Quest 3 (see `FILM3_XR_GROUNDING_SPRINT.md`).
 */

/** Minimal object/traits set for Quest 3 validation of the three prioritized Film3 primitives. */
export const FILM3_XR_MINIMAL_TEST_SCENE = {
  name: 'film3-depth-probe-gaze',
  description:
    'One world-anchored depth occluder, one environment probe for HDR/sh, one gaze+pinch interactable panel.',
  objects: [
    { name: 'soundstage_occlusion', traits: ['occlusion_mesh'] as const },
    { name: 'hdr_environment', traits: ['environment_probe'] as const },
    { name: 'director_hud', traits: ['gaze_interactable'] as const },
  ],
} as const;

export type Film3LayerKind = 'depth_wall' | 'hologram' | 'ui';

export interface Film3Layer {
  id: string;
  kind: Film3LayerKind;
  /** Eye-space Z (smaller = closer to camera when camera looks down -Z). */
  z: number;
}

/**
 * Painter order: last = drawn on top. Depth wall + hologram use mesh pass; UI uses overlay pass after.
 * When depth is off, hologram is not culled by synthetic wall (no reliable occlusion).
 */
export function computeFilm3PainterOrder(
  depthSupported: boolean,
  layers: Film3Layer[]
): { painterOrder: string[]; hologramCulledByDepth: boolean } {
  const wall = layers.find((l) => l.kind === 'depth_wall');
  const holo = layers.find((l) => l.kind === 'hologram');
  const ui = layers.find((l) => l.kind === 'ui');

  let hologramCulledByDepth = false;
  if (depthSupported && wall && holo && holo.z < wall.z) {
    hologramCulledByDepth = true;
  }

  const meshLike = layers.filter((l) => l.kind !== 'ui');
  meshLike.sort((a, b) => b.z - a.z);

  const ordered: string[] = [];
  for (const l of meshLike) {
    if (hologramCulledByDepth && l.kind === 'hologram') continue;
    ordered.push(l.id);
  }
  if (ui) ordered.push(ui.id);

  return { painterOrder: ordered, hologramCulledByDepth };
}

/** Mirrors compiler guard: never touch depth config when unsupported (avoids ARCore init crashes). */
export function applyDepthGuard(session: { isDepthSupported: boolean }, out: string[]): void {
  if (session.isDepthSupported) {
    out.push('configure:DepthMode.AUTOMATIC');
  }
}

describe('Film3 XR anchor scenarios', () => {
  test('depth-disabled path does not configure depth (no silent crash contract)', () => {
    const lines: string[] = [];
    applyDepthGuard({ isDepthSupported: false }, lines);
    expect(lines).toHaveLength(0);
  });

  test('depth-enabled path configures automatic depth once', () => {
    const lines: string[] = [];
    applyDepthGuard({ isDepthSupported: true }, lines);
    expect(lines).toEqual(['configure:DepthMode.AUTOMATIC']);
  });

  test('hologram behind depth wall is culled from painter order when depth is supported', () => {
    const { painterOrder, hologramCulledByDepth } = computeFilm3PainterOrder(true, [
      { id: 'wall', kind: 'depth_wall', z: -1 },
      { id: 'holo', kind: 'hologram', z: -2 },
      { id: 'panel', kind: 'ui', z: 0 },
    ]);
    expect(hologramCulledByDepth).toBe(true);
    expect(painterOrder).toContain('wall');
    expect(painterOrder).toContain('panel');
    expect(painterOrder).not.toContain('holo');
  });

  test('UI stays last in painter order (overlay), not treated as world overlap with hologram', () => {
    const { painterOrder } = computeFilm3PainterOrder(true, [
      { id: 'wall', kind: 'depth_wall', z: -1 },
      { id: 'holo', kind: 'hologram', z: 0 },
      { id: 'panel', kind: 'ui', z: 0 },
    ]);
    expect(painterOrder[painterOrder.length - 1]).toBe('panel');
  });

  test('without depth, hologram is not culled (no mesh occlusion)', () => {
    const { painterOrder, hologramCulledByDepth } = computeFilm3PainterOrder(false, [
      { id: 'wall', kind: 'depth_wall', z: -1 },
      { id: 'holo', kind: 'hologram', z: -2 },
      { id: 'panel', kind: 'ui', z: 0 },
    ]);
    expect(hologramCulledByDepth).toBe(false);
    expect(painterOrder).toContain('holo');
  });
});
