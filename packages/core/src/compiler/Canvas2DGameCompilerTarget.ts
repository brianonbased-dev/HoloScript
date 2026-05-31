/**
 * @holoscript/core/compiler — Canvas2DGameCompiler (registered target)
 *
 * The first-class, RBAC-aware compiler class for the native 2D-canvas-game
 * target (ANS: /compile/gamedev/canvas2d-game). It is a thin CompilerBase
 * wrapper over the dependency-free codegen in ./Canvas2DGameCompiler so that:
 *   - the pure codegen stays importable from lightweight build scripts (no RBAC
 *     graph pulled in), AND
 *   - this target plugs into the standard compiler dispatch + UCAN/RBAC
 *     enforcement like every other CompilerName.
 *
 * Gate 2 of the native-2D-compiler build. Access validation is a no-op when no
 * token is supplied (dev/test), matching the rest of the compiler family.
 */

import { CompilerBase, type BaseCompilerOptions, type CompilerToken } from './CompilerBase';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import {
  compileCanvas2DGame,
  type CG2DComposition,
  type Canvas2DGameOptions,
} from './Canvas2DGameCompiler';

// ── Minimal view of the parser AST this target reads (loose by design) ───────
interface RawProp {
  key: string;
  value: unknown;
}
interface RawTrait {
  name: string;
  config?: Record<string, unknown>;
}
interface RawObject {
  name: string;
  template?: string;
  state?: Record<string, unknown>;
  traits?: RawTrait[];
  properties?: RawProp[];
}
interface RawGroup {
  name: string;
  properties?: RawProp[];
  objects?: RawObject[];
}
interface RawComposition {
  name?: string;
  templates?: Array<{ name: string; traits?: RawTrait[] }>;
  spatialGroups?: RawGroup[];
  environment?: { properties?: RawProp[] };
}

function propOf(node: { properties?: RawProp[] } | undefined, key: string, dflt: unknown): unknown {
  return (node?.properties || []).find((p) => p.key === key)?.value ?? dflt;
}

/**
 * Flatten the parser AST (positions/colors in `properties`, traits on templates)
 * into the flat CG2DComposition the codegen consumes. Shared logic with
 * examples/gold-game/gold-canvas2d-build.mjs.
 */
export function normalizeHoloComposition(raw: RawComposition): CG2DComposition {
  return {
    name: raw.name,
    templates: (raw.templates || []).map((t) => ({
      name: t.name,
      traits: (t.traits || []).map((tr) => ({ name: tr.name, config: tr.config || {} })),
    })),
    spatialGroups: (raw.spatialGroups || []).map((g) => ({
      name: g.name,
      origin: propOf(g, 'origin', [0, 0, 0]) as number[],
      objects: (g.objects || []).map((o) => ({
        name: o.name,
        template: o.template,
        position: propOf(o, 'position', [0, 0, 0]) as number[],
        color: propOf(o, 'color', '#cccccc') as string,
        state: o.state || {},
        traits: (o.traits || []).map((tr) => ({ name: tr.name, config: tr.config || {} })),
      })),
    })),
    environment: { gravity: propOf(raw.environment, 'gravity', [0, -9.81, 0]) as number[] },
  };
}

export type Canvas2DGameCompilerOptions = Canvas2DGameOptions & BaseCompilerOptions;

export class Canvas2DGameCompiler extends CompilerBase {
  protected readonly compilerName = 'Canvas2DGameCompiler';
  private readonly ctorOptions: Canvas2DGameCompilerOptions & { sceneJson?: string };

  /**
   * Options passed at construction (how ExportManager/CompilerFactory supplies
   * them — `exportDirect` calls `compile(composition)` with no per-call options).
   */
  constructor(options: Canvas2DGameCompilerOptions & { sceneJson?: string } = {}) {
    super();
    this.ctorOptions = options;
  }

  /**
   * Compile a composition to a self-contained, offline, playable HTML game.
   * `options.sceneJson` (when present) is embedded verbatim for the modality
   * digest contract; otherwise the derived spec is embedded. Per-call options
   * override constructor options.
   */
  // @ts-expect-error widened options param during migration (matches Native2DCompiler)
  compile(
    composition: HoloComposition,
    agentToken?: CompilerToken,
    outputPath?: string,
    options?: Canvas2DGameCompilerOptions & { sceneJson?: string }
  ): string {
    this.validateCompilerAccess(agentToken, outputPath);
    const merged = { ...this.ctorOptions, ...(options || {}) };
    const normalized = normalizeHoloComposition(composition as unknown as RawComposition);
    return compileCanvas2DGame(normalized, merged, merged.sceneJson);
  }
}
