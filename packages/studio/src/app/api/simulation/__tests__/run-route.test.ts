/**
 * Tests for POST /api/simulation/run
 *
 * Imports the route handler directly — vitest resolves '@holoscript/engine' to
 * packages/engine/src (via the alias in vitest.config.ts) so the engine runs
 * fully in-process without a webpackIgnore boundary.
 *
 * Test coverage:
 *   1. All 4 curated presets run to completion (200 + non-empty data)
 *   2. Digest determinism — two identical runs produce the same finalStateDigest
 *   3. Grid-resolution clamp — a 96^3 request is silently clamped to 48^3
 *   4. Particle-count clamp — a 9999-particle request is clamped to 5000
 *   5. Unknown solver → 400 with allowed list
 *   6. steps > 2000 → clamped (not rejected); returned steps ≤ 2000
 *   7. Invalid dt → 400
 *   8. config not an object → 400
 */

import { describe, it, expect } from 'vitest';
import { POST } from '../run/route';
import { CURATED_SIM_PRESETS } from '@/components/simsci/presets';

// ── Helper ─────────────────────────────────────────────────────────────────────

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request('http://localhost/api/simulation/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as unknown as import('next/server').NextRequest);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

// ── Preset run tests ────────────────────────────────────────────────────────────

describe('POST /api/simulation/run — curated presets', () => {
  for (const preset of CURATED_SIM_PRESETS) {
    it(`runs preset "${preset.id}" (${preset.solver}) and returns 200 with non-empty data`, async () => {
      const { status, json } = await post({
        solver: preset.solver,
        config: preset.config,
        steps: preset.steps,
        dt: preset.dt,
      });

      expect(status).toBe(200);
      expect(json['kind']).toBe(preset.kind);

      const report = json['runReport'] as Record<string, unknown>;
      expect(report).toBeTruthy();
      expect(report['solver']).toBe(preset.solver);
      expect(typeof report['finalStateDigest']).toBe('string');
      expect((report['finalStateDigest'] as string).length).toBe(64); // sha256 hex
      expect(typeof report['wallMs']).toBe('number');
      expect(report['steps']).toBe(preset.steps);

      if (preset.kind === 'particles') {
        const positions = json['positions'] as number[];
        expect(Array.isArray(positions)).toBe(true);
        expect(positions.length).toBeGreaterThan(0);
        // flat xyz — length must be divisible by 3
        expect(positions.length % 3).toBe(0);
      } else {
        const field = json['field'] as { resolution: [number, number, number]; values: number[] };
        expect(field).toBeTruthy();
        expect(Array.isArray(field.resolution)).toBe(true);
        expect(field.resolution.length).toBe(3);
        expect(Array.isArray(field.values)).toBe(true);
        expect(field.values.length).toBeGreaterThan(0);
        // values length must match resolution product
        const [nx, ny, nz] = field.resolution;
        expect(field.values.length).toBe(nx * ny * nz);
      }

      expect(json['stats']).toBeTruthy();
    }, 60_000); // generous timeout — some solvers are compute-heavy
  }
});

// ── Digest determinism ──────────────────────────────────────────────────────────

describe('POST /api/simulation/run — digest determinism', () => {
  // Use the smallest/fastest preset (thermal-hotspot) for determinism check
  const preset = CURATED_SIM_PRESETS.find((p) => p.id === 'thermal-hotspot')!;

  it('produces the same finalStateDigest on two identical runs', async () => {
    const body = {
      solver: preset.solver,
      config: preset.config,
      steps: preset.steps,
      dt: preset.dt,
    };
    const [run1, run2] = await Promise.all([post(body), post(body)]);

    expect(run1.status).toBe(200);
    expect(run2.status).toBe(200);

    const d1 = (run1.json['runReport'] as Record<string, unknown>)['finalStateDigest'];
    const d2 = (run2.json['runReport'] as Record<string, unknown>)['finalStateDigest'];
    expect(d1).toBe(d2);
  }, 60_000);

  // Also check dem-granular determinism (seeded LCG positions, no Math.random)
  const demPreset = CURATED_SIM_PRESETS.find((p) => p.id === 'dem-pour')!;

  it('produces the same finalStateDigest for dem-granular on two identical runs', async () => {
    const body = {
      solver: demPreset.solver,
      config: demPreset.config,
      steps: demPreset.steps,
      dt: demPreset.dt,
    };
    const [run1, run2] = await Promise.all([post(body), post(body)]);

    expect(run1.status).toBe(200);
    expect(run2.status).toBe(200);

    const d1 = (run1.json['runReport'] as Record<string, unknown>)['finalStateDigest'];
    const d2 = (run2.json['runReport'] as Record<string, unknown>)['finalStateDigest'];
    expect(d1).toBe(d2);
  }, 60_000);
});

// ── Safety clamps ───────────────────────────────────────────────────────────────

describe('POST /api/simulation/run — safety clamps', () => {
  it('clamps grid_resolution axes to 48 max', async () => {
    const { status, json } = await post({
      solver: 'thermal',
      config: {
        grid_resolution: [96, 96, 96],
        domain_size: [1, 1, 1],
        default_material: 'air',
        initial_temperature: 20,
      },
      steps: 2,
      dt: 0.01,
    });

    expect(status).toBe(200);
    const field = json['field'] as { resolution: [number, number, number]; values: number[] };
    expect(field.resolution[0]).toBeLessThanOrEqual(48);
    expect(field.resolution[1]).toBeLessThanOrEqual(48);
    expect(field.resolution[2]).toBeLessThanOrEqual(48);
  }, 60_000);

  it('clamps particleCount to 5000 max for dem-granular', async () => {
    const { status, json } = await post({
      solver: 'dem-granular',
      config: { particleCount: 9999 },
      steps: 1,
      dt: 0.005,
    });

    expect(status).toBe(200);
    const positions = json['positions'] as number[];
    // particleCount clamped to 5000 → positions.length = 5000 * 3 = 15000
    expect(positions.length).toBeLessThanOrEqual(5000 * 3);
  }, 60_000);

  it('clamps steps to 2000 max (does not reject)', async () => {
    const { status, json } = await post({
      solver: 'thermal',
      config: {
        grid_resolution: [4, 4, 4],
        domain_size: [1, 1, 1],
        default_material: 'air',
        initial_temperature: 20,
      },
      steps: 99999,
      dt: 0.01,
    });

    expect(status).toBe(200);
    const report = json['runReport'] as Record<string, unknown>;
    expect(report['steps']).toBe(2000);
  }, 120_000);
});

// ── Validation rejections ────────────────────────────────────────────────────────

describe('POST /api/simulation/run — validation rejects', () => {
  it('returns 400 for an unknown solver', async () => {
    const { status, json } = await post({
      solver: 'navier-stokes',
      config: {},
    });

    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
    // Error must mention the allowed solver list
    expect(json['error'] as string).toContain('thermal');
  });

  it('returns 400 for dt <= 0', async () => {
    const { status, json } = await post({
      solver: 'thermal',
      config: {},
      dt: -0.1,
    });

    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
  });

  it('returns 400 for non-finite dt', async () => {
    const { status, json } = await post({
      solver: 'thermal',
      config: {},
      dt: Infinity,
    });

    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
  });

  it('returns 400 when config is an array instead of an object', async () => {
    const { status, json } = await post({
      solver: 'thermal',
      config: [1, 2, 3],
    });

    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/simulation/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body['error']).toBe('string');
  });
});
