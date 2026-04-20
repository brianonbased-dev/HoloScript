/**
 * .holo source → AST: asset maturity metadata keys on `HoloObjectDecl`.
 * (R3F emission is covered in `compiler/__tests__/R3FCompiler.test.ts`.)
 */
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function parseComposition(source: string): HoloComposition {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source.trim());
  if (!result.success || !result.ast) {
    throw new Error(`Parse failed: ${result.errors.map((e) => e.message).join('; ')}`);
  }
  return result.ast;
}

describe('.holo maturity annotation (parser)', () => {
  it('parses promote_url, collision_shape, and @draft on object', () => {
    const ast = parseComposition(`
      composition "MaturityDemo" {
        object "Block" {
          @draft
          geometry: box
          promote_url: "/meshes/block.glb"
          collision_shape: box
        }
      }
    `);

    expect(ast.objects).toHaveLength(1);
    const o = ast.objects[0];
    const byKey = Object.fromEntries(o.properties.map((p) => [p.key, p.value]));
    expect(byKey.geometry).toBe('box');
    expect(byKey.promote_url).toBe('/meshes/block.glb');
    expect(byKey.collision_shape).toBe('box');
    expect(o.traits.some((t) => t.name === 'draft')).toBe(true);
  });

  it('parses explicit maturity: final', () => {
    const ast = parseComposition(`
      composition "TowerScene" {
        object "Spire" {
          geometry: cone
          maturity: final
        }
      }
    `);

    const o = ast.objects[0];
    const m = o.properties.find((p) => p.key === 'maturity');
    expect(m?.value).toBe('final');
  });
});
