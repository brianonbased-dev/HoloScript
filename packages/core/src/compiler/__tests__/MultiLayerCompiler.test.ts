import { describe, expect, test, vi } from 'vitest';
import { MultiLayerCompiler } from '../MultiLayerCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// MultiLayerCompiler was retired 2026-06-17 along with its apex-poison dependencies
// (BabylonCompiler, VRRCompiler, ARCompiler). compile() now throws a clear retirement error
// directing callers to the native BrowserRuntime path. This test pins that retirement contract.
describe('MultiLayerCompiler (retired 2026-06-17)', () => {
  const parser = new HoloCompositionParser();

  test('compile() throws a clear retirement error', () => {
    const input = `
      composition "HybridWorld" {
        spatial_group "downtown" {
          object "menu" @ar_beacon(type: "qr") {
            mesh: "cube"
          }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const compiler = new MultiLayerCompiler({
      targets: ['vrr', 'ar'],
      minify: false,
      source_maps: false,
    });

    expect(() => compiler.compile(parseResult.ast!, 'test-token')).toThrowError(/retired/i);
  });
});
