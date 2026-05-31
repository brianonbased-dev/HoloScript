import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHolo, getExportManager } from '../../index';

// Gate 3: the canvas2d-game target must resolve through the real export path
// (ExportManager -> CompilerFactory -> Canvas2DGameCompiler) — the same path the
// compile_to_canvas2d_game MCP tool drives.
const here = dirname(fileURLToPath(import.meta.url));
const holoSrc = readFileSync(
  join(here, '../../../../../examples/gold-game/gold-vault-game.holo'),
  'utf8'
);

describe('canvas2d-game export target (MCP compile path)', () => {
  it('compiles the GOLD .holo to a playable HTML game via ExportManager', async () => {
    const parsed = parseHolo(holoSrc);
    expect(parsed.success).toBe(true);
    const composition = parsed.ast!;

    const result = await getExportManager().export('canvas2d-game', composition, {
      useCircuitBreaker: false,
      throwOnError: true,
    });

    expect(result.success).toBe(true);
    expect(typeof result.output).toBe('string');
    const html = result.output as string;
    expect(html).toMatch(/<canvas/);
    expect(html).toMatch(/keydown/);
    expect(html).toMatch(/const GAME =/);
    expect(html).not.toMatch(/WebGLRenderer/);
  });

  it('derived the gameplay from traits (player/collectibles/hazard/goal/tiers)', async () => {
    const composition = parseHolo(holoSrc).ast!;
    const result = await getExportManager().export('canvas2d-game', composition, {
      useCircuitBreaker: false,
      throwOnError: true,
    });
    const html = result.output as string;
    const m = html.match(/const GAME = (\{.*?\});/);
    expect(m).not.toBeNull();
    const game = JSON.parse(m![1]);
    // gold-vault-game.holo: KnowledgeEntry (@grabbable), VaultCollision
    // (@collidable), Archivist (@dialogue), and ascending tiers. Robust to peer
    // edits of the shared .holo: assert trait-derivation, not exact counts.
    expect(game.collectibles.length).toBeGreaterThanOrEqual(1);
    expect(game.hazards.length).toBeGreaterThanOrEqual(1);
    expect(game.goal).not.toBeNull();
    expect(game.tiers.length).toBeGreaterThanOrEqual(3);
  });
});
