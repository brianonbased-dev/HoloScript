/**
 * end-to-end: authored .holo → real parser → bridge → renderable host (→ pixels on GPU).
 *
 * Closes the loop: parse the SHIPPED brittney.holo with the production parser
 * (@holoscript/core/parser parseHolo), run buildCharacterHostFromComposition, and confirm the
 * bridge's structural-AST assumptions match the real parser output. The GPU-gated leg renders
 * the resulting host natively and asserts a figure — authored composition → native WebGPU pixels.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHolo } from '@holoscript/core/parser';
import { testDevice, GPU_LIVE } from '../../physics/__tests__/gpu-setup';
import {
  buildCharacterHostFromComposition,
  type ParsedComposition,
} from '../CharacterHostFromComposition';
import { renderCharacter } from '../character-render';
import type { PixelGrid } from '../../native-render/gpu-verify';

const BRITTNEY = resolve(
  __dirname,
  '../../../../../compositions/characters/embodied-agent/brittney.holo'
);

function figurePixels(g: PixelGrid): number {
  const clear = [18, 18, 23];
  let n = 0;
  for (let i = 0; i < g.data.length; i += 4) {
    const d =
      Math.abs(g.data[i] - clear[0]) +
      Math.abs(g.data[i + 1] - clear[1]) +
      Math.abs(g.data[i + 2] - clear[2]);
    if (d > 40) n++;
  }
  return n;
}

const itGpu = GPU_LIVE ? it : it.skip;

describe('composition-render e2e — authored .holo → bridge → host', () => {
  const src = readFileSync(BRITTNEY, 'utf8');
  const result = parseHolo(src) as unknown as { ast?: ParsedComposition } & ParsedComposition;
  const ast = result.ast ?? result;
  const bridged = buildCharacterHostFromComposition(ast);

  it('the real parser output drives the bridge (structural assumptions hold)', () => {
    expect(bridged.ok).toBe(true);
    expect(bridged.host).toBeDefined();
    // brittney.holo authors @body + @locomotion → both map through the real AST.
    expect(bridged.report.mapped).toContain('@body');
    expect(bridged.report.mapped).toContain('@locomotion');
    expect(bridged.report.mapped).toContain('@hair(style=medium_wavy)');
    expect(bridged.report.mapped).toContain('@hair(color)');
    expect(bridged.gait?.mode).toBe('walk');
  });

  itGpu('the bridged host renders a figure natively (authored .holo → WebGPU pixels)', async () => {
    const host = bridged.host!;
    if (bridged.gait) host.applyLocomotion(bridged.gait.mode, 0.4, bridged.gait.speed);
    const grid = await renderCharacter(testDevice!, host.getDrawSpec(), { size: 128 });
    expect(figurePixels(grid)).toBeGreaterThan(150);
  });
});
