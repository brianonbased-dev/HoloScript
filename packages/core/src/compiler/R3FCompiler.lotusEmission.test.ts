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
import { R3FCompiler, type R3FNode } from './R3FCompiler';
import { HoloCompositionParser } from '../parser/HoloCompositionParser';

function findWithCompiledMaterial(node: R3FNode | undefined): R3FNode | undefined {
  if (!node) return undefined;
  if (node.props && node.props.__compiledMaterial) return node;
  for (const child of node.children ?? []) {
    const found = findWithCompiledMaterial(child);
    if (found) return found;
  }
  return undefined;
}

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

  it('also emits the compiled petal geometry data (mesh from .holo)', () => {
    const node = compiler.compileNode(lotusNode());
    const geo = node.props.__petalGeometry as {
      positions?: Float32Array;
      petalUv?: Float32Array;
      veinPhase?: Float32Array;
      indices?: Uint32Array;
      vertexCount?: number;
    };
    expect(geo).toBeDefined();
    expect(geo.positions!.length).toBe(geo.vertexCount! * 3);
    expect(geo.petalUv!.length).toBe(geo.vertexCount! * 2);
    expect(geo.indices!.length).toBeGreaterThan(0);
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

  // The above exercise compileNode with a synthetic AST. The REAL path is the
  // parser → compileComposition → compileObjectDecl route, which translates
  // `obj.traits` (not `node.directives`) and would silently miss the emission
  // if it weren't wired there too. This proves the production parse path emits.
  it('emits via the real parser → compileComposition path (.holo source)', () => {
    const source = `
      composition "PetalSlice" {
        object "petal" @botanical_lotus {
          mesh: "plane"
        }
      }
    `;
    const parser = new HoloCompositionParser();
    const parsed = parser.parse(source);
    expect(parsed.ast).toBeDefined();

    const root = compiler.compileComposition(parsed.ast as never);
    const lotus = findWithCompiledMaterial(root);
    expect(lotus, 'a node carrying __compiledMaterial must exist in the compiled tree').toBeDefined();

    const spec = lotus!.props.__compiledMaterial as {
      physical?: { transparent?: boolean };
      shaderChunks?: { chunks: unknown[] };
      proceduralMaps?: { normalMap?: { generator: string } };
    };
    expect(spec.physical!.transparent).toBe(true);
    expect(spec.shaderChunks!.chunks.length).toBeGreaterThan(0);
    expect(spec.proceduralMaps!.normalMap!.generator).toBe('botanical_normal');
    expect(lotus!.props.__uniformBindings).toBeDefined();
  });

  it('does not flag botanical_lotus as an unrecognized trait (.holo path)', () => {
    const source = `
      composition "PetalSlice2" {
        object "petal" @botanical_lotus { mesh: "plane" }
      }
    `;
    const parsed = new HoloCompositionParser().parse(source);
    const root = compiler.compileComposition(parsed.ast as never);
    const lotus = findWithCompiledMaterial(root);
    expect(lotus).toBeDefined();
    const unrecognized = (lotus!.props.__unrecognizedTraits as string[] | undefined) ?? [];
    expect(unrecognized).not.toContain('botanical_lotus');
  });
});
