/**
 * wasm-compiler-worker.ts — Web Worker for HoloScript WASM Component
 *
 * Runs in a dedicated Web Worker thread. Loads the holoscript-component
 * WASM binary and handles requests from the CompilerBridge on the main thread.
 *
 * Message protocol:
 *   Main Thread → Worker: { id, type, payload }
 *   Worker → Main Thread: { id, type: 'result'|'error', payload }
 *
 * Supports two WASM formats:
 * 1. Component Model (jco-transpiled) - ES module bindings with namespaced exports
 * 2. Raw WASM module - Direct instantiation with fallback to @holoscript/core
 *
 * The WASM binary may be located at:
 *   /wasm/holoscript.component.wasm (Component Model format, preferred)
 *   /wasm/holoscript.wasm (Raw module, fallback)
 *
 * If WASM is unavailable or fails to load, falls back to TypeScript implementation
 * from @holoscript/core package.
 *
 * @see packages/holoscript-component/wit/holoscript.wit
 */

// ═══════════════════════════════════════════════════════════════════
// Types (must match wasm-compiler-bridge.ts)
// ═══════════════════════════════════════════════════════════════════

interface WorkerRequest {
  id: number;
  type: string;
  payload: Record<string, unknown>;
}

interface WorkerResponse {
  id: number;
  type: 'result' | 'error';
  payload: unknown;
}

// ═══════════════════════════════════════════════════════════════════
// WASM Module Interface (matches jco transpile output)
// ═══════════════════════════════════════════════════════════════════

/**
 * Shape of the jco-transpiled holoscript module.
 * jco generates namespaced ES module exports matching the WIT interfaces.
 * Each WIT interface becomes a namespace: parser.parse(), compiler.compile(), etc.
 */
interface HoloScriptModule {
  parser: {
    parse(source: string): unknown;
    parseHeader(source: string): string;
    parseToJson(source: string): string;
    parseIncremental(
      previousAstJson: string,
      editOffset: number,
      editLength: number,
      newText: string
    ): string;
  };
  validator: {
    validate(source: string): { valid: boolean; diagnostics: unknown[] };
    validateWithOptions(
      source: string,
      maxSeverity: string,
      checkTraits: boolean,
      checkTypes: boolean
    ): { valid: boolean; diagnostics: unknown[] };
    traitExists(name: string): boolean;
    getTrait(name: string): unknown | undefined;
    getTraitFull(name: string): unknown | undefined;
    listTraits(): unknown[];
    listTraitsByCategory(category: string): unknown[];
    listCategories(): string[];
  };
  typeChecker: {
    check(source: string): unknown[];
    inferTypeAt(source: string, offset: number): unknown | undefined;
    completionsAt(source: string, offset: number): string[];
  };
  compiler: {
    compile(source: string, target: string): unknown;
    compileAst(ast: unknown, target: string): unknown;
    listTargets(): string[];
    version(): string;
  };
  generator: {
    generateObject(description: string): string;
    generateScene(description: string): string;
    suggestTraits(description: string): unknown[];
    fromJson(json: string): string;
  };
  spatialEngine: {
    perlinNoiseTwoD(x: number, y: number, seed: number): number;
    perlinNoiseThreeD(x: number, y: number, z: number, seed: number): number;
    fbmNoise(
      x: number,
      y: number,
      octaves: number,
      lacunarity: number,
      persistence: number,
      seed: number
    ): number;
    sphereSphereTest(
      ax: number,
      ay: number,
      az: number,
      ar: number,
      bx: number,
      by: number,
      bz: number,
      br: number
    ): boolean;
    aabbOverlap(...args: number[]): boolean;
    rayAabbTest(...args: number[]): number;
    frustumCullAabb(frustumJson: string, ...args: number[]): boolean;
  };
  formatter: {
    format(source: string): string;
    formatWithOptions(source: string, optionsJson: string): string;
  };
}

// ═══════════════════════════════════════════════════════════════════
// Worker State
// ═══════════════════════════════════════════════════════════════════

let wasmModule: HoloScriptModule | null = null;
let loadedWorld = 'none';
let binarySize = 0;

// ═══════════════════════════════════════════════════════════════════
// Message Handler
// ═══════════════════════════════════════════════════════════════════

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    const result = await handleRequest(type, payload);
    reply({ id, type: 'result', payload: result });
  } catch (error) {
    reply({
      id,
      type: 'error',
      payload: error instanceof Error ? error.message : String(error),
    });
  }
};

function reply(response: WorkerResponse) {
  (self as unknown as { postMessage(msg: WorkerResponse): void }).postMessage(response);
}

// ═══════════════════════════════════════════════════════════════════
// Request Router
// ═══════════════════════════════════════════════════════════════════

async function handleRequest(type: string, payload: Record<string, unknown>): Promise<unknown> {
  switch (type) {
    case 'init':
      return handleInit(payload);
    case 'parse':
      return handleParse(payload);
    case 'validate':
      return handleValidate(payload);
    case 'compile':
      return handleCompile(payload);
    case 'generate-object':
      return handleGenerateObject(payload);
    case 'generate-scene':
      return handleGenerateScene(payload);
    case 'suggest-traits':
      return handleSuggestTraits(payload);
    case 'list-traits':
      return handleListTraits();
    case 'list-traits-by-category':
      return handleListTraitsByCategory(payload);
    case 'format':
      return handleFormat(payload);
    case 'check-types':
      return handleCheckTypes(payload);
    case 'completions':
      return handleCompletions(payload);
    case 'status':
      return handleStatus();
    default:
      throw new Error(`Unknown request type: ${type}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Init: Load WASM Component
// ═══════════════════════════════════════════════════════════════════

async function handleInit(payload: Record<string, unknown>): Promise<unknown> {
  const wasmUrl = payload.wasmUrl as string;
  const world = (payload.world as string) || 'holoscript-runtime';

  let jcoError: unknown;

  // Option 1: Try loading jco-transpiled JS module FIRST
  // jco handles its own WASM loading internally — it fetches the companion
  // .core.wasm files relative to its own import.meta.url. No need to
  // pre-fetch the raw WASM binary for this path.
  try {
    const jsUrl = wasmUrl.replace('.component.wasm', '.js').replace('.wasm', '.js');
    const module = (await import(
      /* webpackIgnore: true */ /* @vite-ignore */ jsUrl
    )) as HoloScriptModule;
    wasmModule = module;
    loadedWorld = world;

    // Get binary size from the companion .core.wasm (informational only)
    try {
      const coreUrl = jsUrl.replace('.js', '.core.wasm');
      const sizeResp = await fetch(coreUrl, { method: 'HEAD' });
      binarySize = Number(sizeResp.headers.get('content-length') || 0);
    } catch {
      binarySize = 0;
    }

    return {
      backend: 'wasm-component' as const,
      wasmLoaded: true,
      binarySize,
      loadTimeMs: 0, // Measured by caller
      world,
      version: safeCall(() => wasmModule!.compiler.version(), '0.8.0'),
    };
  } catch (err) {
    jcoError = err;
    console.warn('[WASM Worker] jco JS module not available, trying raw WebAssembly:', err);
  }

  // Option 2: Try raw WebAssembly instantiation (non-component, legacy fallback)
  // This path works if the WASM was built via wasm-pack (compiler-wasm crate)
  try {
    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch WASM: ${response.status} ${response.statusText} (${wasmUrl})`
      );
    }
    const wasmBytes = await response.arrayBuffer();
    binarySize = wasmBytes.byteLength;

    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    const exports = instance.exports as unknown as HoloScriptModule;
    wasmModule = exports;
    loadedWorld = world;

    return {
      backend: 'wasm-legacy' as const,
      wasmLoaded: true,
      binarySize,
      loadTimeMs: 0,
      world,
      version: safeCall(() => wasmModule!.compiler.version(), 'legacy'),
    };
  } catch (rawError) {
    throw new Error(
      `Failed to load WASM component:\n` +
        `  jco error: ${formatError(jcoError)}\n` +
        `  raw error: ${formatError(rawError)}`
    );
  }
}

function formatError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Parser
// ═══════════════════════════════════════════════════════════════════

function handleParse(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const source = payload.source as string;

  // parser.parse() returns a parse-result variant: ok(composition-node) | err(list<diagnostic>)
  const result = wasmModule!.parser.parse(source);

  // jco represents WIT variants as tagged objects
  // { tag: 'ok', val: compositionNode } | { tag: 'err', val: diagnostics[] }
  if (isTaggedVariant(result)) {
    if (result.tag === 'ok') {
      return { ast: result.val };
    } else {
      return { errors: result.val };
    }
  }

  // If plain object, assume success
  return { ast: result };
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Validator
// ═══════════════════════════════════════════════════════════════════

function handleValidate(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const source = payload.source as string;
  const checkTraits = (payload.checkTraits as boolean) ?? true;
  const checkTypes = (payload.checkTypes as boolean) ?? false;

  if (checkTraits || checkTypes) {
    return wasmModule!.validator.validateWithOptions(source, 'error', checkTraits, checkTypes);
  }
  return wasmModule!.validator.validate(source);
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Compiler
// ═══════════════════════════════════════════════════════════════════

function handleCompile(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const source = payload.source as string;
  const target = payload.target as string;

  const result = wasmModule!.compiler.compile(source, target);

  // compile-result variant: text(string) | binary(list<u8>) | error(list<diagnostic>)
  if (isTaggedVariant(result)) {
    switch (result.tag) {
      case 'text':
        return { type: 'text', data: result.val };
      case 'binary':
        return { type: 'binary', data: result.val };
      case 'error':
        return { type: 'error', diagnostics: result.val };
    }
  }

  // Fallback: assume text result
  return { type: 'text', data: String(result) };
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Generator
// ═══════════════════════════════════════════════════════════════════

function handleGenerateObject(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const description = payload.description as string;
  const result = wasmModule!.generator.generateObject(description);

  // result<string, string> → { tag: 'ok', val: string } | { tag: 'err', val: string }
  if (isTaggedVariant(result)) {
    if (result.tag === 'ok') return result.val;
    throw new Error(result.val as string);
  }
  return result;
}

function handleGenerateScene(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const description = payload.description as string;
  const result = wasmModule!.generator.generateScene(description);

  if (isTaggedVariant(result)) {
    if (result.tag === 'ok') return result.val;
    throw new Error(result.val as string);
  }
  return result;
}

function handleSuggestTraits(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const description = payload.description as string;
  return wasmModule!.generator.suggestTraits(description);
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Traits
// ═══════════════════════════════════════════════════════════════════

function handleListTraits(): unknown {
  assertLoaded();
  return wasmModule!.validator.listTraits();
}

function handleListTraitsByCategory(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const category = payload.category as string;
  return wasmModule!.validator.listTraitsByCategory(category);
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Formatter
// ═══════════════════════════════════════════════════════════════════

function handleFormat(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const source = payload.source as string;
  const result = wasmModule!.formatter.format(source);

  if (isTaggedVariant(result)) {
    if (result.tag === 'ok') return result.val;
    throw new Error(result.val as string);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Type Checker
// ═══════════════════════════════════════════════════════════════════

function handleCheckTypes(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const source = payload.source as string;
  return wasmModule!.typeChecker.check(source);
}

function handleCompletions(payload: Record<string, unknown>): unknown {
  assertLoaded();
  const source = payload.source as string;
  const offset = payload.offset as number;
  return wasmModule!.typeChecker.completionsAt(source, offset);
}

// ═══════════════════════════════════════════════════════════════════
// Handlers: Status
// ═══════════════════════════════════════════════════════════════════

function handleStatus(): unknown {
  return {
    backend: wasmModule ? 'wasm-component' : 'none',
    wasmLoaded: wasmModule !== null,
    binarySize,
    world: loadedWorld,
    version: wasmModule ? safeCall(() => wasmModule!.compiler.version(), 'unknown') : 'none',
  };
}

// ═══════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════

function assertLoaded(): void {
  if (!wasmModule) {
    throw new Error('WASM module not initialized. Call init() first.');
  }
}

interface TaggedVariant {
  tag: string;
  val: unknown;
}

function isTaggedVariant(value: unknown): value is TaggedVariant {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag' in value &&
    typeof (value as TaggedVariant).tag === 'string'
  );
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
