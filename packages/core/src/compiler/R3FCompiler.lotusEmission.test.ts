/**
 * R3FCompiler.lotusEmission — the compiler half of the I.007 closure (step 1).
 *
 * A node carrying a `botanical_lotus` trait directive must emit its compiled petal
 * material spec into `props.__compiledMaterial` (+ uniform bindings), in the locked
 * CompiledMaterialSpec shape that the renderer's buildCompiledMaterial consumes.
 *
 * This proves the COMPILE path attaches the spec; the cross-package contract test
 * (r3f-renderer/__tests__/lotusCompiledSpec.contract.test.ts) proves that same spec
 * shape constructs a real MeshPhysicalMaterial — together: `.holo` lotus → material.
 *
 * @cites I.007, plan §0.7, task_1780604509863_w7i9 (assembly)
 */
import { describe, it, expect } from 'vitest';
import type { ASTNode } from '../types';
import { R3FCompiler } from './R3FCompiler';

function lotusNode(config: Record<string, unknown> = {}): ASTNode {
  return {
    type: 'object',
    name: 'lotus1',
    directives: [{ type: 'trait', name: 'botanical_lotus', config }],
  } as unknown as ASTNode;
}

describe('R3FCompiler — botanical_lotus compiled-material emission', () => {
  const compiler = new R3FCompiler({});

  it('attaches a compiled material spec to a botanical_lotus node', () => {
    const node = compiler.compileNode(lotusNode());
    const spec = node.props.__compiledMaterial as {
      physical?: Record<string, unknown>;
      shaderChunks?: { chunks: unknown[]; uniforms?: Record<string, unknown> };
      proceduralMaps?: { normalMap?: { generator: string } };
    };
    expect(spec).toBeDefined();
    expect(spec.physical).toBeDefined();
    expect(spec.physical!.transparent).toBe(true);
    expect(spec.shaderChunks!.chunks.length).toBeGreaterThan(0);
    expect(spec.shaderChunks!.uniforms!.uLotusBaseColor).toBeDefined();
    expect(spec.proceduralMaps!.normalMap!.generator).toBe('botanical_normal');
  });

  it('attaches the uniform-binding map (pillar 1↔2 runtime bridge)', () => {
    const node = compiler.compileNode(lotusNode());
    const bindings = node.props.__uniformBindings as Record<string, string>;
    expect(bindings).toBeDefined();
    expect(bindings.uLotusGrowth).toBe('growth');
    expect(bindings.uPetalDevTime).toBe('devTime');
  });

  it('respects trait config — a custom roughness flows into the emitted spec', () => {
    const node = compiler.compileNode(lotusNode({ material: { roughness: 0.91 } }));
    const spec = node.props.__compiledMaterial as { physical?: { roughness?: number } };
    expect(spec.physical!.roughness).toBeCloseTo(0.91);
  });

  it('does NOT attach a compiled material to a node without the trait', () => {
    const plain = compiler.compileNode({
      type: 'object',
      name: 'box',
      directives: [],
    } as unknown as ASTNode);
    expect(plain.props.__compiledMaterial).toBeUndefined();
  });
});
