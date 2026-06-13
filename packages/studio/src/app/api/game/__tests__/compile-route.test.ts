/**
 * Tests for POST /api/game/compile
 *
 * Imports the route handler directly — vitest resolves '@holoscript/core' to the
 * workspace package so parseHolo + the canvas2d-game ExportManager run fully
 * in-process.
 *
 * Coverage:
 *   1. All curated game presets compile (200 + playable HTML + derived gates)
 *   2. Digest determinism — two identical builds produce the same htmlDigest
 *   3. timeLimit / hearts options flow into the report
 *   4. Empty / missing source → 400
 *   5. Garbage source that fails to parse → 400
 *   6. Derived gameplay gates: player, objective, challenge, playable-html all pass
 */

import { describe, it, expect } from 'vitest';
import { POST } from '../compile/route';
import { GAME_PRESETS } from '@/components/game/presets';

async function post(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request('http://localhost/api/game/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as unknown as import('next/server').NextRequest);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

describe('POST /api/game/compile — curated presets', () => {
  for (const preset of GAME_PRESETS) {
    it(`compiles preset "${preset.id}" to a playable game (200)`, async () => {
      const { status, json } = await post({ source: preset.source });

      expect(status).toBe(200);

      const html = json['html'] as string;
      expect(typeof html).toBe('string');
      expect(html).toMatch(/<canvas/);
      expect(html).toMatch(/keydown/);
      expect(html).not.toMatch(/WebGLRenderer/);

      const report = json['report'] as Record<string, unknown>;
      expect(report['target']).toBe('canvas2d-game');
      expect(report['playerPresent']).toBe(true);
      expect((report['htmlDigest'] as string).length).toBe(64); // sha256 hex
      expect(report['htmlBytes']).toBeGreaterThan(0);

      const gates = json['gates'] as Array<{ id: string; pass: boolean }>;
      expect(Array.isArray(gates)).toBe(true);
      // All derived-gameplay gates pass for the curated presets.
      for (const g of gates) {
        expect(g.pass, `gate ${g.id} should pass for ${preset.id}`).toBe(true);
      }
    });
  }
});

describe('POST /api/game/compile — determinism', () => {
  it('two identical builds produce the same htmlDigest', async () => {
    const src = GAME_PRESETS[0]!.source;
    const a = await post({ source: src });
    const b = await post({ source: src });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const da = (a.json['report'] as Record<string, unknown>)['htmlDigest'];
    const db = (b.json['report'] as Record<string, unknown>)['htmlDigest'];
    expect(da).toBe(db);
  });
});

describe('POST /api/game/compile — options', () => {
  it('timeLimit and hearts options flow into the report', async () => {
    const { status, json } = await post({
      source: GAME_PRESETS[0]!.source,
      options: { timeLimit: 99, hearts: 7 },
    });
    expect(status).toBe(200);
    const report = json['report'] as Record<string, unknown>;
    expect(report['timeLimit']).toBe(99);
    expect(report['hearts']).toBe(7);
  });

  it('out-of-range options are clamped', async () => {
    const { status, json } = await post({
      source: GAME_PRESETS[0]!.source,
      options: { timeLimit: 99999, hearts: 99 },
    });
    expect(status).toBe(200);
    const report = json['report'] as Record<string, unknown>;
    expect(report['timeLimit']).toBe(600); // TIME_LIMIT_MAX
    expect(report['hearts']).toBe(9); // HEARTS_MAX
  });
});

describe('POST /api/game/compile — validation', () => {
  it('missing source → 400', async () => {
    const { status, json } = await post({});
    expect(status).toBe(400);
    expect(typeof json['error']).toBe('string');
  });

  it('empty source → 400', async () => {
    const { status } = await post({ source: '   ' });
    expect(status).toBe(400);
  });

  // parseHolo is lenient (error-recovering): junk text recovers to a valid but
  // empty composition rather than failing. The route honestly compiles it — but
  // an empty composition derives no collectibles / goal / hazards / tiers, so the
  // `objective` and `challenge` gameplay gates report the failure instead of a
  // 200/all-pass lie. (deriveGameSpec always seeds a default player object, so
  // the `player` gate is not a discriminator for emptiness — objective/challenge
  // are.) If a future parser change makes junk hard-fail, the route returns 400
  // with a parse/compile error, which this assertion also accepts.
  it('junk source compiles to a game whose objective/challenge gates fail', async () => {
    const { status, json } = await post({ source: 'this is not holoscript ){{{' });
    if (status === 400) {
      expect(json['error']).toMatch(/[Pp]arse|[Cc]ompile/);
      return;
    }
    expect(status).toBe(200);
    const report = json['report'] as Record<string, unknown>;
    expect(report['collectibles']).toBe(0);
    expect(report['goalPresent']).toBe(false);
    const gates = json['gates'] as Array<{ id: string; pass: boolean }>;
    expect(gates.find((g) => g.id === 'objective')?.pass).toBe(false);
    expect(gates.find((g) => g.id === 'challenge')?.pass).toBe(false);
  });
});
