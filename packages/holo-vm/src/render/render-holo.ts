/**
 * renderHolo — the single native entry: `.holo` source text → native pixels.
 *
 * This is the one call that chains the two separately-proven halves of the native
 * pipeline into an end-to-end path with ZERO foreign engine on the pixel route
 * (no three.js, no react, no cannon):
 *
 *   source ──parseHolo (core)──▶ HoloComposition                [.holo text → AST]
 *          ──HolobCompiler.compile (core)──▶ HoloBytecode       [AST → bytecode]
 *          ──HoloVM.load + tick──▶ executed ECS world           [bytecode → state]
 *          ──NativeHoloRenderer.render──▶ RGBA framebuffer       [world → pixels]
 *
 * The first two stages live in @holoscript/core (the parser + HolobCompiler, each
 * separately tested); the last two live here in @holoscript/holo-vm (the VM + the
 * native software rasterizer). Before this entry the chain was only covered
 * piecewise — bytecode→pixels by the native-renderer e2e, text→bytecode by core's
 * compiler — with no single call joining them. renderHolo joins them.
 *
 * Design notes (why async, why the structural views of core's symbols):
 *  - core is acquired via dynamic import at CALL time, not at this module's top.
 *    core's HolobCompiler eagerly `require()`s @holoscript/holo-vm; importing core
 *    statically here would close a core→holo-vm→core module-eval cycle and could
 *    capture a half-initialized holo-vm. Deferring to call time means holo-vm is
 *    fully loaded before core re-enters it (this mirrors HolobCompiler's own lazy
 *    require of holo-vm).
 *  - `parseHolo` and `HolobCompiler` are both runtime exports of `@holoscript/core`.
 *    `HolobCompiler` is not yet in core's hand-crafted public `.d.ts`, so both are
 *    consumed through minimal structural views (which also keeps resolution off the
 *    `/parser` subpath that this package's `moduleResolution` can't follow).
 *    Surfacing HolobCompiler in core's public type surface is a separate follow-up;
 *    this entry intentionally carries zero core-build risk.
 */
import { HoloVM } from '../executor';
import type { HoloBytecode } from '../bytecode';
import {
  NativeFramebuffer,
  SoftwareRasterBackend,
  NativeHoloRenderer,
  type OrthoCamera,
  type RGBA,
  type RenderStats,
} from './native-renderer';

/** Default clear matches the native-renderer e2e (dark slate). */
const DEFAULT_CLEAR: RGBA = { r: 18, g: 18, b: 22, a: 255 };

export interface RenderHoloOptions {
  /** Framebuffer width in pixels (default 256). */
  width?: number;
  /** Framebuffer height in pixels (default 256). */
  height?: number;
  /** Orthographic camera overrides (default: 16 px/unit, centered on world origin). */
  camera?: Partial<OrthoCamera>;
  /** Background clear color (default dark slate). */
  clear?: RGBA;
  /** Forwarded to HolobCompiler (debug / physics / networking). */
  compiler?: { debug?: boolean; physics?: boolean; networking?: boolean };
}

export interface RenderHoloResult {
  /** The rasterized RGBA framebuffer. */
  framebuffer: NativeFramebuffer;
  /** Render pass stats (entities considered vs. drawn). */
  stats: RenderStats;
  /** Number of entities the VM materialized from the bytecode. */
  entityCount: number;
  width: number;
  height: number;
}

// Minimal structural views of the two core symbols renderHolo consumes. core's
// runtime exports both; only HolobCompiler is currently absent from core's public
// `.d.ts`, hence the structural typing rather than a direct import.
interface HoloParseResultLike {
  success: boolean;
  ast?: unknown;
  errors?: Array<{ message?: string }>;
}
type ParseHolo = (source: string, options?: unknown) => HoloParseResultLike;
interface HolobCompilerLike {
  compile(composition: unknown): { bytecode: unknown; stats: Record<string, number> };
}
type HolobCompilerCtor = new (opts?: RenderHoloOptions['compiler']) => HolobCompilerLike;

/**
 * Compile and natively render `.holo` source text to an RGBA framebuffer in one call.
 *
 * @param source `.holo` composition source (e.g. `composition "X" { object "o" { ... } }`).
 * @param options framebuffer size, camera, clear color, and compiler flags.
 * @returns the framebuffer plus render stats and entity count.
 * @throws if the source fails to parse (the strict parser front rejects it) or the
 *   compile/load/execute path errors.
 */
export async function renderHolo(
  source: string,
  options: RenderHoloOptions = {}
): Promise<RenderHoloResult> {
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const clear = options.clear ?? DEFAULT_CLEAR;
  const camera: OrthoCamera = {
    pixelsPerUnit: options.camera?.pixelsPerUnit ?? 16,
    centerWorld: options.camera?.centerWorld ?? { x: 0, y: 0 },
  };

  // Lazy, call-time acquisition of core's text-front (see header for the cycle reason).
  const core = (await import('@holoscript/core')) as unknown as {
    parseHolo: ParseHolo;
    HolobCompiler: HolobCompilerCtor;
  };

  // .holo text → HoloComposition. Strict front: a real syntax error is surfaced as a
  // thrown error rather than silently rendering nothing.
  const parsed = core.parseHolo(source, { tolerant: false });
  if (!parsed.success || !parsed.ast) {
    throw new Error(
      `renderHolo: failed to parse source — ${parsed.errors?.[0]?.message ?? 'unknown parse error'}`
    );
  }
  // HoloComposition → HoloBytecode.
  const { bytecode } = new core.HolobCompiler(options.compiler).compile(parsed.ast);

  // HoloBytecode → executed ECS world. main() carries the geometry/transform/material
  // opcodes, so one tick runs it to HALT, populating the components the renderer reads.
  const vm = new HoloVM();
  vm.load(bytecode as HoloBytecode);
  vm.tick(0);

  // ECS world → native RGBA pixels (no foreign engine).
  const framebuffer = new NativeFramebuffer(width, height);
  const stats = new NativeHoloRenderer(new SoftwareRasterBackend(framebuffer)).render(
    vm.world,
    framebuffer,
    camera,
    clear
  );

  return { framebuffer, stats, entityCount: vm.world.entityCount, width, height };
}
