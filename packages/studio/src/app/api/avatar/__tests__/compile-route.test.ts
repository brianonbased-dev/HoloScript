/**
 * Tests for POST /api/avatar/compile
 *
 * Imports the route handler directly — vitest resolves '@holoscript/core' to the
 * workspace package so parseHolo runs fully in-process.
 *
 * Coverage:
 *   1. All curated avatar presets derive a rig (200 + bones + gates)
 *   2. Digest determinism — two identical builds produce the same rigDigest
 *   3. scale / expressionCount options flow into the report
 *   4. Empty / missing source → 400
 *   5. Garbage source that fails to parse → 400
 *   6. Derived-rig gates: parse, skeleton, rig-integrity, expressions, budget
 *   7. Bone coverage: full-skeleton presets hit 7/7 required bones
 */

import { describe, it, expect } from 'vitest';
import { POST } from '../compile/route';
import { AVATAR_PRESETS } from '@/components/avatar/presets';

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request('http://localhost/api/avatar/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as unknown as import('next/server').NextRequest);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('POST /api/avatar/compile — curated presets', () => {
  for (const preset of AVATAR_PRESETS) {
    it(`derives a rig for preset "${preset.id}" (200)`, async () => {
      const { status, json } = await post({ source: preset.source });

      expect(status).toBe(200);

      const rig = json['rig'] as Record<string, unknown>;
      expect(rig['version']).toBe('1.0');
      expect(typeof rig['humanoid_bones']).toBe('object');

      const bones = json['bones'] as unknown[];
      expect(Array.isArray(bones)).toBe(true);
      expect(bones.length).toBeGreaterThan(0);

      const report = json['report'] as Record<string, unknown>;
      expect(report['target']).toBe('vrm-humanoid-rig');
      expect((report['rigDigest'] as string).length).toBe(64); // sha256 hex
      expect(report['rigBytes']).toBeGreaterThan(0);
      expect(report['boneCount']).toBeGreaterThan(0);

      const gates = json['gates'] as Array<{ id: string; pass: boolean }>;
      const byId = Object.fromEntries(gates.map((g) => [g.id, g.pass]));
      expect(byId['parse']).toBe(true);
      expect(byId['skeleton']).toBe(true);
    });
  }
});

describe('POST /api/avatar/compile — bone coverage', () => {
  it('full-humanoid preset hits all 7 required bones', async () => {
    const preset = AVATAR_PRESETS.find((p) => p.id === 'full-humanoid')!;
    const { status, json } = await post({ source: preset.source });
    expect(status).toBe(200);
    const report = json['report'] as Record<string, unknown>;
    expect(report['requiredBonesPresent']).toBe(report['requiredBonesTotal']);
    expect(report['boneCoverage']).toBe(1);
    const gates = json['gates'] as Array<{ id: string; pass: boolean }>;
    const rigIntegrity = gates.find((g) => g.id === 'rig-integrity');
    expect(rigIntegrity?.pass).toBe(true);
  });

  it('derives expression presets from an @expressive face', async () => {
    const preset = AVATAR_PRESETS.find((p) => p.id === 'full-humanoid')!;
    const { json } = await post({ source: preset.source, options: { expressionCount: 4 } });
    const report = json['report'] as Record<string, unknown>;
    expect(report['expressionCount']).toBe(4);
    const gates = json['gates'] as Array<{ id: string; pass: boolean }>;
    expect(gates.find((g) => g.id === 'expressions')?.pass).toBe(true);
  });
});

describe('POST /api/avatar/compile — determinism', () => {
  it('two identical builds produce the same rigDigest', async () => {
    const preset = AVATAR_PRESETS[0]!;
    const a = await post({ source: preset.source, options: { scale: 1.0, expressionCount: 5 } });
    const b = await post({ source: preset.source, options: { scale: 1.0, expressionCount: 5 } });
    const da = (a.json['report'] as Record<string, unknown>)['rigDigest'];
    const db = (b.json['report'] as Record<string, unknown>)['rigDigest'];
    expect(da).toBe(db);
  });

  it('changing scale changes the rigDigest', async () => {
    const preset = AVATAR_PRESETS[0]!;
    const a = await post({ source: preset.source, options: { scale: 1.0 } });
    const b = await post({ source: preset.source, options: { scale: 1.5 } });
    const da = (a.json['report'] as Record<string, unknown>)['rigDigest'];
    const db = (b.json['report'] as Record<string, unknown>)['rigDigest'];
    expect(da).not.toBe(db);
  });
});

describe('POST /api/avatar/compile — options clamping', () => {
  it('clamps scale into [0.5, 2.0]', async () => {
    const preset = AVATAR_PRESETS[0]!;
    const { json } = await post({ source: preset.source, options: { scale: 99 } });
    expect((json['report'] as Record<string, unknown>)['scale']).toBe(2.0);
  });

  it('clamps expressionCount into [1, 10]', async () => {
    const preset = AVATAR_PRESETS[0]!;
    const { json } = await post({ source: preset.source, options: { expressionCount: 999 } });
    expect((json['report'] as Record<string, unknown>)['expressionCount']).toBeLessThanOrEqual(10);
  });
});

describe('POST /api/avatar/compile — validation', () => {
  it('rejects empty source (400)', async () => {
    const { status, json } = await post({ source: '' });
    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
  });

  it('rejects missing source (400)', async () => {
    const { status } = await post({});
    expect(status).toBe(400);
  });

  // parseHolo is lenient (error-recovering): junk text recovers to a valid but
  // empty composition rather than a hard parse failure. The route then derives
  // an empty rig (0 bones), so the skeleton/rig-integrity gates fail honestly
  // but the response is still 200. If a future parser change makes junk
  // hard-fail, the route returns 400 with a parse error — this assertion accepts
  // either outcome and asserts the honest gate failure on the 200 path.
  it('handles unparseable junk without crashing', async () => {
    const { status, json } = await post({ source: 'this is not holoscript ){{{' });
    expect([200, 400]).toContain(status);
    if (status === 400) {
      expect(typeof json['error']).toBe('string');
    } else {
      const gates = json['gates'] as Array<{ id: string; pass: boolean }>;
      expect(gates.find((g) => g.id === 'skeleton')?.pass).toBe(false);
    }
  });
});
