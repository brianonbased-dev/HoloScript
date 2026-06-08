/**
 * Integration proof (PATH-3 second plugin): the geolocation `vincenty_geodesy`
 * trait, registered through the SHARED P1 registrar, is dispatched by the
 * runtime and runs the REAL WGS-84 Vincenty solver — proving the wiring pattern
 * generalizes beyond energy-grid to a different domain.
 *
 * Drives the real path: executeNode(orb) -> orb-executor -> applyDirectives ->
 * traitHandlers.get('vincenty_geodesy').onAttach -> vincentyInverse.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerGeolocationTraitHandlers, type LatLon } from '../runtime';

function geodesyOrb(from: LatLon, to: LatLon): unknown {
  return {
    type: 'orb',
    name: 'geo',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#00aa00', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'vincenty_geodesy', config: { from, to } }],
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// 1 degree of longitude at the equator is a WGS-84 geodesic of a * (pi/180)
// = 6378137 * 0.0174532925 ~= 111319.49 m. The crude equirectangular *111320
// approximation the deep-ratchet flagged would NOT match the ellipsoidal solve.
const FROM: LatLon = { latDeg: 0, lonDeg: 0 };
const TO: LatLon = { latDeg: 0, lonDeg: 1 };

describe('geolocation-gis -> HoloScript runtime integration (PATH-3 second plugin)', () => {
  it('runtime dispatch runs the REAL Vincenty solver for a registered @vincenty_geodesy orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerGeolocationTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('vincenty_geodesy_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(geodesyOrb(FROM, TO) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const s = solved[0];
    expect(s.antipodal).toBe(false);
    // Real WGS-84 geodesic ~111319.49 m (not a stub returning 0 / crude approx).
    expect(s.distanceM as number).toBeGreaterThan(111300);
    expect(s.distanceM as number).toBeLessThan(111340);
  });

  it('NEGATIVE CONTROL: without registration the @vincenty_geodesy trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('vincenty_geodesy_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(geodesyOrb(FROM, TO) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the geodesic result into durable runtime state on attach', async () => {
    const runtime = new HoloScriptRuntime();
    registerGeolocationTraitHandlers(runtime);

    await runtime.executeNode(geodesyOrb(FROM, TO) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['vincenty_geodesy:geo'] as { distanceM?: number } | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.distanceM as number).toBeGreaterThan(111300);
  });

  it('emits vincenty_geodesy_error (does not throw through the runtime) for missing from/to', async () => {
    const runtime = new HoloScriptRuntime();
    registerGeolocationTraitHandlers(runtime);
    const errors: Array<Record<string, unknown>> = [];
    runtime.on('vincenty_geodesy_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    const orb = {
      type: 'orb',
      name: 'geo',
      properties: {},
      methods: [],
      position: [0, 0, 0],
      hologram: { shape: 'orb', color: '#00aa00', size: 1, glow: false, interactive: false },
      directives: [{ type: 'trait', name: 'vincenty_geodesy', config: { from: FROM } }], // no `to`
    };
    await runtime.executeNode(orb as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('from and config.to');
  });
});
