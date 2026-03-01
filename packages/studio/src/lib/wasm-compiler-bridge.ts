/**
 * wasm-compiler-bridge.ts — WASM Component Bridge for HoloScript Compiler
 *
 * Loads the holoscript-component WASM binary (compiled via jco from WIT interfaces)
 * in a Web Worker and exposes a typed async API for the Web Studio.
 *
 * Architecture:
 *   Main Thread (React UI) ←→ CompilerBridge (this file) ←→ Web Worker ←→ WASM Component
 *
 * The bridge provides:
 *   - parse(): Parse .hs/.hsplus/.holo source → AST
 *   - validate(): Validate source with trait checking
 *   - compile(): Compile source to target format (Three.js, Babylon, glTF, etc.)
 *   - generateObject(): AI-assisted object generation
 *   - suggestTraits(): Trait suggestions from description
 *   - format(): Format HoloScript source code
 *   - listTraits(): List all available traits
 *
 * Falls back to @holoscript/core TypeScript when WASM is unavailable.
 *
 * @see packages/holoscript-component/wit/holoscript.wit for interface definitions
 */

// ═══════════════════════════════════════════════════════════════════
// Types (mirror WIT interface types for TypeScript consumers)
// ═══════════════════════════════════════════════════════════════════

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Span {
  start: Position;
  end: Position;
}

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  severity: Severity;
  message: string;
  span?: Span;
  code?: string;
}

export interface TraitDef {
  name: string;
  category: string;
  description: string;
}

export interface TraitFull extends TraitDef {
  defaultProperties: string[];
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

/** Engine-core compile targets (bundled in main WASM) */
export type CompileTarget =
  | 'threejs'
  | 'babylonjs'
  | 'aframe-html'
  | 'gltf-json'
  | 'glb-binary'
  | 'json-ast';

/** Platform plugin targets (lazy-loaded WASM components) */
export type PlatformTarget =
  | 'unity-csharp'
  | 'godot-gdscript'
  | 'unreal-cpp'
  | 'vrchat-udon'
  | 'openxr'
  | 'visionos-swift'
  | 'android-arcore'
  | 'webgpu-wgsl'
  | 'react-three-fiber'
  | 'playcanvas'
  | 'urdf'
  | 'sdf'
  | 'usd';

export type CompileResult =
  | { type: 'text'; data: string }
  | { type: 'binary'; data: Uint8Array }
  | { type: 'error'; diagnostics: Diagnostic[] };

export interface CompilerBridgeStatus {
  backend: 'wasm-component' | 'wasm-legacy' | 'typescript-fallback';
  wasmLoaded: boolean;
  binarySize: number;
  loadTimeMs: number;
  world: string;
  version: string;
}

// ═══════════════════════════════════════════════════════════════════
// Worker Message Protocol
// ═══════════════════════════════════════════════════════════════════

type WorkerRequestType =
  | 'init'
  | 'parse'
  | 'validate'
  | 'compile'
  | 'generate-object'
  | 'generate-scene'
  | 'suggest-traits'
  | 'list-traits'
  | 'list-traits-by-category'
  | 'format'
  | 'check-types'
  | 'completions'
  | 'status';

interface WorkerRequest {
  id: number;
  type: WorkerRequestType;
  payload: unknown;
}

interface WorkerResponse {
  id: number;
  type: 'result' | 'error';
  payload: unknown;
}

// ═══════════════════════════════════════════════════════════════════
// Native Asset Hydration
// ═══════════════════════════════════════════════════════════════════

/**
 * Hydrate childrenJson strings back into children arrays.
 * The WASM parser serializes nested objects as JSON strings (WIT recursive
 * type workaround). This function recursively deserializes them so the
 * R3F compiler can render nested objects as scene tree children.
 *
 * When keyframes are present, childrenJson is a JSON object:
 *   { "__children": [...], "__keyframes": [...] }
 * Otherwise it's a plain JSON array of children.
 */
function hydrateChildren(node: Record<string, unknown>): Record<string, unknown> {
  // Hydrate this node's childrenJson → children array + keyframes
  const childrenJson = node.childrenJson as string | undefined;
  if (childrenJson && childrenJson.length > 0) {
    try {
      const parsed = JSON.parse(childrenJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && ('__children' in parsed || '__keyframes' in parsed)) {
        // Combined format: { __children: [...], __keyframes: [...] }
        const rawChildren = parsed.__children;
        node.children = Array.isArray(rawChildren)
          ? (rawChildren as Record<string, unknown>[]).map(hydrateChildren)
          : [];
        if (Array.isArray(parsed.__keyframes) && parsed.__keyframes.length > 0) {
          node.keyframes = parsed.__keyframes;
        }
      } else if (Array.isArray(parsed)) {
        // Plain array format (children only, no keyframes)
        node.children = (parsed as Record<string, unknown>[]).map(hydrateChildren);
      } else {
        node.children = [];
      }
    } catch {
      node.children = [];
    }
  }
  // Hydrate objects inside composition or spatial groups
  if (Array.isArray(node.objects)) {
    node.objects = (node.objects as Record<string, unknown>[]).map(hydrateChildren);
  }
  if (Array.isArray(node.spatialGroups)) {
    for (const group of node.spatialGroups as Record<string, unknown>[]) {
      if (Array.isArray(group.objects)) {
        group.objects = (group.objects as Record<string, unknown>[]).map(hydrateChildren);
      }
    }
  }
  return node;
}

// ═══════════════════════════════════════════════════════════════════
// CompilerBridge — Main Thread API
// ═══════════════════════════════════════════════════════════════════

export class CompilerBridge {
  private worker: Worker | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private status: CompilerBridgeStatus = {
    backend: 'typescript-fallback',
    wasmLoaded: false,
    binarySize: 0,
    loadTimeMs: 0,
    world: 'none',
    version: '0.0.0',
  };
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the compiler bridge.
   * Attempts to load WASM component in a Web Worker.
   * Falls back to TypeScript @holoscript/core if WASM is unavailable.
   *
   * @param wasmUrl - URL to the holoscript WASM component binary
   * @param world - Which WIT world to instantiate (default: 'holoscript-runtime')
   */
  async init(
    wasmUrl = '/wasm/holoscript.wasm', // Raw WASM module (fallback) or .js for jco-transpiled
    world: 'holoscript-runtime' | 'holoscript-parser' | 'holoscript-compiler' | 'holoscript-spatial' = 'holoscript-runtime',
  ): Promise<CompilerBridgeStatus> {
    if (this.initPromise) {
      await this.initPromise;
      return this.status;
    }

    this.initPromise = this._doInit(wasmUrl, world);
    await this.initPromise;
    return this.status;
  }

  private async _doInit(wasmUrl: string, world: string): Promise<void> {
    const startTime = performance.now();

    try {
      // Create Web Worker
      this.worker = new Worker(
        new URL('./wasm-compiler-worker.ts', import.meta.url),
        { type: 'module' },
      );

      // Set up message handling
      this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        const handler = this.pending.get(response.id);
        if (handler) {
          this.pending.delete(response.id);
          if (response.type === 'error') {
            handler.reject(new Error(String(response.payload)));
          } else {
            handler.resolve(response.payload);
          }
        }
      });

      this.worker.addEventListener('error', (event) => {
        console.error('[CompilerBridge] Worker error:', event.message);
        // Reject all pending requests
        for (const [id, handler] of this.pending) {
          handler.reject(new Error(`Worker error: ${event.message}`));
          this.pending.delete(id);
        }
      });

      // Initialize WASM in worker
      const result = await this._send<CompilerBridgeStatus>('init', { wasmUrl, world });

      this.status = {
        ...result,
        loadTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      console.warn('[CompilerBridge] WASM init failed, using TypeScript fallback:', error);
      this.worker?.terminate();
      this.worker = null;
      this.status = {
        backend: 'typescript-fallback',
        wasmLoaded: false,
        binarySize: 0,
        loadTimeMs: performance.now() - startTime,
        world: 'none',
        version: 'fallback',
      };
    }
  }

  /** Parse HoloScript source code into AST (JSON) */
  async parse(source: string): Promise<{ ast?: unknown; errors?: Diagnostic[] }> {
    const result = this.worker
      ? await this._send<{ ast?: unknown; errors?: Diagnostic[] }>('parse', { source })
      : await this._fallbackParse(source);
    // Hydrate childrenJson → children for native asset nesting
    if (result.ast && typeof result.ast === 'object') {
      hydrateChildren(result.ast as Record<string, unknown>);
    }
    return result;
  }

  /** Validate HoloScript source code */
  async validate(source: string, options?: {
    checkTraits?: boolean;
    checkTypes?: boolean;
  }): Promise<ValidationResult> {
    if (!this.worker) return this._fallbackValidate(source);
    return this._send('validate', { source, ...options });
  }

  /** Compile HoloScript to engine-core target */
  async compile(source: string, target: CompileTarget): Promise<CompileResult> {
    if (!this.worker) return this._fallbackCompile(source, target);
    return this._send('compile', { source, target });
  }

  /** Generate a HoloScript object from natural language */
  async generateObject(description: string): Promise<string> {
    if (!this.worker) return this._fallbackGenerateObject(description);
    return this._send('generate-object', { description });
  }

  /** Generate a complete scene from natural language */
  async generateScene(description: string): Promise<string> {
    if (!this.worker) return this._fallbackGenerateScene(description);
    return this._send('generate-scene', { description });
  }

  /** Suggest appropriate traits for a description */
  async suggestTraits(description: string): Promise<TraitDef[]> {
    if (!this.worker) return this._fallbackSuggestTraits(description);
    return this._send('suggest-traits', { description });
  }

  /** List all available traits */
  async listTraits(): Promise<TraitDef[]> {
    if (!this.worker) return this._fallbackListTraits();
    return this._send('list-traits', {});
  }

  /** List traits by category */
  async listTraitsByCategory(category: string): Promise<TraitDef[]> {
    if (!this.worker) return this._fallbackListTraitsByCategory(category);
    return this._send('list-traits-by-category', { category });
  }

  /** Format HoloScript source code */
  async format(source: string): Promise<string> {
    if (!this.worker) return this._fallbackFormat(source);
    return this._send('format', { source });
  }

  /** Type-check source and return diagnostics */
  async checkTypes(source: string): Promise<Diagnostic[]> {
    if (!this.worker) return this._fallbackCheckTypes(source);
    return this._send('check-types', { source });
  }

  /** Get completions at a byte offset */
  async completionsAt(source: string, offset: number): Promise<string[]> {
    if (!this.worker) return [];
    return this._send('completions', { source, offset });
  }

  /** Get bridge status */
  getStatus(): CompilerBridgeStatus {
    return { ...this.status };
  }

  /** Terminate the worker and free resources */
  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const [, handler] of this.pending) {
      handler.reject(new Error('CompilerBridge destroyed'));
    }
    this.pending.clear();
    this.initPromise = null;
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: Worker IPC
  // ─────────────────────────────────────────────────────────────────

  private _send<T>(type: WorkerRequestType, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });

      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CompilerBridge timeout: ${type} (id=${id})`));
        }
      }, 30_000); // 30s timeout for compilation

      // Clear timeout when resolved
      const originalResolve = resolve;
      const originalReject = reject;
      this.pending.set(id, {
        resolve: (v: unknown) => { clearTimeout(timeout); (originalResolve as (v: unknown) => void)(v); },
        reject: (e: Error) => { clearTimeout(timeout); originalReject(e); },
      });

      this.worker!.postMessage({ id, type, payload } satisfies WorkerRequest);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: TypeScript fallback (uses @holoscript/core directly)
  // ─────────────────────────────────────────────────────────────────

  private async _fallbackParse(source: string): Promise<{ ast?: unknown; errors?: Diagnostic[] }> {
    try {
      // Dynamic import — compiled exports may vary; cast to access known source exports
      const core = await import('@holoscript/core') as Record<string, unknown>;
      const parseHolo = core.parseHolo as ((s: string) => unknown) | undefined;
      if (!parseHolo) {
        return { errors: [{ severity: 'error', message: 'parseHolo not available in @holoscript/core' }] };
      }
      const result = parseHolo(source);
      return { ast: result };
    } catch (error) {
      return { errors: [{ severity: 'error', message: String(error) }] };
    }
  }

  private async _fallbackValidate(source: string): Promise<ValidationResult> {
    try {
      const core = await import('@holoscript/core') as Record<string, unknown>;
      const ValidatorClass = core.HoloScriptValidator as (new () => { validate(code: string): { message: string }[] }) | undefined;
      if (!ValidatorClass) {
        return { valid: false, diagnostics: [{ severity: 'error', message: 'HoloScriptValidator not available in @holoscript/core' }] };
      }
      const validator = new ValidatorClass();
      const errors = validator.validate(source);
      return {
        valid: errors.length === 0,
        diagnostics: errors.map((e: { message: string }) => ({
          severity: 'error' as Severity,
          message: e.message,
        })),
      };
    } catch (error) {
      return { valid: false, diagnostics: [{ severity: 'error', message: String(error) }] };
    }
  }

  private async _fallbackCompile(source: string, target: CompileTarget): Promise<CompileResult> {
    try {
      const core = await import('@holoscript/core') as Record<string, unknown>;
      const trimmed = source.trimStart();
      const isComposition = trimmed.startsWith('composition');

      // Parse first — compilers expect AST, not raw source
      let ast: unknown;
      if (isComposition) {
        const HoloCompositionParser = core.HoloCompositionParser as (new () => { parse(s: string): { ast?: unknown; errors?: { message: string }[] } }) | undefined;
        if (!HoloCompositionParser) return { type: 'error', diagnostics: [{ severity: 'error', message: 'HoloCompositionParser not available' }] };
        const parser = new HoloCompositionParser();
        const parsed = parser.parse(source);
        if (parsed.errors?.length) {
          return { type: 'error', diagnostics: parsed.errors.map(e => ({ severity: 'error' as Severity, message: e.message })) };
        }
        ast = parsed.ast ?? parsed;
      } else {
        const HoloScriptPlusParser = core.HoloScriptPlusParser as (new () => { parse(s: string): { ast?: unknown; errors?: { message: string }[] } }) | undefined;
        if (!HoloScriptPlusParser) return { type: 'error', diagnostics: [{ severity: 'error', message: 'HoloScriptPlusParser not available' }] };
        const parser = new HoloScriptPlusParser();
        const parsed = parser.parse(source);
        if (parsed.errors?.length) {
          return { type: 'error', diagnostics: parsed.errors.map(e => ({ severity: 'error' as Severity, message: e.message })) };
        }
        ast = parsed.ast ?? parsed;
      }

      // Map compile target to existing TS compilers
      switch (target) {
        case 'threejs':
        case 'json-ast': {
          const R3FCompiler = core.R3FCompiler as
            (new () => {
              compile(ast: unknown): unknown;
              compileComposition(ast: unknown): unknown;
            }) | undefined;
          if (!R3FCompiler) return { type: 'error', diagnostics: [{ severity: 'error', message: 'R3FCompiler not available' }] };
          const compiler = new R3FCompiler();
          const result = isComposition ? compiler.compileComposition(ast) : compiler.compile(ast);
          return { type: 'text', data: typeof result === 'string' ? result : JSON.stringify(result) };
        }
        case 'babylonjs': {
          const BabylonCompiler = core.BabylonCompiler as (new () => { compile(ast: unknown): unknown }) | undefined;
          if (!BabylonCompiler) return { type: 'error', diagnostics: [{ severity: 'error', message: 'BabylonCompiler not available' }] };
          const compiler = new BabylonCompiler();
          const result = compiler.compile(ast);
          return { type: 'text', data: typeof result === 'string' ? result : JSON.stringify(result) };
        }
        default:
          return { type: 'error', diagnostics: [{ severity: 'error', message: `Target '${target}' not available in TS fallback` }] };
      }
    } catch (error) {
      return { type: 'error', diagnostics: [{ severity: 'error', message: String(error) }] };
    }
  }

  private async _fallbackGenerateObject(description: string): Promise<string> {
    // Simple template-based generation (WASM generator does the same)
    return `object "Generated" {\n  // Generated from: ${description}\n  geometry: "cube"\n  position: [0, 1, 0]\n}`;
  }

  private async _fallbackGenerateScene(description: string): Promise<string> {
    return `composition "Generated Scene" {\n  // Generated from: ${description}\n  environment {\n    skybox: "default"\n    ambient_light: 0.5\n  }\n\n  object "Object1" {\n    geometry: "cube"\n    position: [0, 1, 0]\n  }\n}`;
  }

  private async _fallbackSuggestTraits(description: string): Promise<TraitDef[]> {
    // Basic keyword matching
    const traits: TraitDef[] = [];
    const desc = description.toLowerCase();
    if (desc.includes('grab') || desc.includes('pick up') || desc.includes('interact')) {
      traits.push({ name: 'grabbable', category: 'interaction', description: 'Object can be grabbed by user' });
    }
    if (desc.includes('throw') || desc.includes('toss')) {
      traits.push({ name: 'throwable', category: 'interaction', description: 'Object can be thrown after grabbing' });
    }
    if (desc.includes('physics') || desc.includes('fall') || desc.includes('bounce')) {
      traits.push({ name: 'physics', category: 'physics', description: 'Object has physics simulation' });
      traits.push({ name: 'collidable', category: 'physics', description: 'Object participates in collision detection' });
    }
    if (desc.includes('glow') || desc.includes('light') || desc.includes('emit')) {
      traits.push({ name: 'glowing', category: 'visual', description: 'Object emits a glow effect' });
    }
    if (desc.includes('network') || desc.includes('multiplayer') || desc.includes('sync')) {
      traits.push({ name: 'networked', category: 'networking', description: 'Object state synced across network' });
    }
    return traits;
  }

  private async _fallbackListTraits(): Promise<TraitDef[]> {
    // Return core traits (WASM has full 1525+ registry)
    return [
      { name: 'grabbable', category: 'interaction', description: 'Object can be grabbed' },
      { name: 'throwable', category: 'interaction', description: 'Object can be thrown' },
      { name: 'clickable', category: 'interaction', description: 'Object responds to clicks' },
      { name: 'hoverable', category: 'interaction', description: 'Object responds to hover' },
      { name: 'collidable', category: 'physics', description: 'Collision detection' },
      { name: 'physics', category: 'physics', description: 'Physics simulation' },
      { name: 'glowing', category: 'visual', description: 'Glow effect' },
      { name: 'networked', category: 'networking', description: 'Network synced' },
    ];
  }

  private async _fallbackListTraitsByCategory(category: string): Promise<TraitDef[]> {
    const all = await this._fallbackListTraits();
    return all.filter(t => t.category === category);
  }

  private async _fallbackFormat(source: string): Promise<string> {
    // No TS formatter available — return as-is
    return source;
  }

  private async _fallbackCheckTypes(source: string): Promise<Diagnostic[]> {
    // Basic validation only in fallback
    const result = await this._fallbackValidate(source);
    return result.diagnostics;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════

let instance: CompilerBridge | null = null;

/** Get or create the singleton CompilerBridge */
export function getCompilerBridge(): CompilerBridge {
  if (!instance) {
    instance = new CompilerBridge();
  }
  return instance;
}

/** Reset the singleton (for testing) */
export function resetCompilerBridge(): void {
  instance?.destroy();
  instance = null;
}
