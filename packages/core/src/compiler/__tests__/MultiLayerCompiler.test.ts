import { describe, expect, test } from 'vitest';
import { MultiLayerCompiler } from '../MultiLayerCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

describe('MultiLayerCompiler', () => {
  const parser = new HoloCompositionParser();

  test('should generate compilation results for multiple requested targets', () => {
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
      source_maps: false
    });

    const result = compiler.compile(parseResult.ast!);

    expect(result.success).toBe(true);
    expect(result.vrr).toBeDefined();
    expect(result.ar).toBeDefined();
    expect(result.vr).toBeUndefined();

    // Verify VRR compilation occurred
    expect(result.vrr?.target).toBe('threejs');
    expect(result.vrr?.code).toContain('const vrr = new VRRRuntime');

    // Verify AR compilation occurred
    expect(result.ar?.target).toBe('webxr');
    expect(result.ar?.code).toContain('const arRuntime = new ARRuntime');
  });
});
