import { describe, expect, it } from 'vitest';
import { QuiltCompiler } from './QuiltCompiler';

describe('QuiltCompiler', () => {
  it('generates tiles with symmetric baseline and view shearing', () => {
    const compiler = new QuiltCompiler();
    const config = {
      views: 5,
      columns: 5,
      rows: 1,
      resolution: [1000, 200] as [number, number],
      baseline: 0.1,
      device: '16inch' as const,
      focusDistance: 2.0,
    };
    const tiles = compiler.generateTiles(config);
    expect(tiles).toHaveLength(5);
    expect(tiles[0].cameraOffset).toBeCloseTo(-0.05);
    expect(tiles[4].cameraOffset).toBeCloseTo(0.05);
    expect(tiles[0].viewShear).toBeCloseTo(-tiles[0].cameraOffset / config.focusDistance);
    expect(tiles[2].cameraOffset).toBeCloseTo(0);
    expect(tiles[0].column).toBe(0);
    expect(tiles[4].column).toBe(4);
  });

  it('compileQuilt reads @quilt trait and device preset', () => {
    const compiler = new QuiltCompiler();
    const result = compiler.compileQuilt({
      name: 'LGDemo',
      objects: [
        {
          traits: [
            {
              name: 'quilt',
              config: { views: 12, columns: 4, rows: 3, device: 'go' },
            },
          ],
          properties: [],
        },
      ],
    });

    expect(result.config.views).toBe(12);
    expect(result.config.columns).toBe(4);
    expect(result.config.rows).toBe(3);
    expect(result.config.device).toBe('go');
    expect(result.tiles).toHaveLength(12);
    expect(result.metadata.numViews).toBe(12);
    expect(result.metadata.tileWidth).toBe(Math.floor(result.config.resolution[0] / 4));
    expect(result.metadata.tileHeight).toBe(Math.floor(result.config.resolution[1] / 3));
    expect(result.rendererCode).toContain('QuiltCompiler output');
    expect(result.rendererCode).toContain('TILES');
  });

  it('compile() returns renderer code string', () => {
    const compiler = new QuiltCompiler();
    const code = compiler.compile({ name: 'Q', objects: [] }, 'tok');
    expect(code.length).toBeGreaterThan(200);
    expect(code).toContain('QUILT_CONFIG');
  });
});
