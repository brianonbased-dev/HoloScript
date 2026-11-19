/**
 * Lazy call into the Rust `.hs` checker (`validate_detailed` → `check_semantics`
 * → `semantic_types.rs`). The TypeScript reader does not implement type rules.
 *
 * The WASM package is loaded on the first typed function only. An untyped
 * function never reaches this module's loader.
 */

import { createRequire } from 'node:module';

export interface RustFunctionDiagnostic {
  /** `HS-TYPE-*` when the Rust checker emitted one; otherwise the Rust sentence. */
  code: string;
  /** The Rust diagnostic sentence, unchanged. */
  message: string;
  line: number;
  column: number;
}

interface WasmValidate {
  validate_detailed(source: string): string;
}

interface ValidateJson {
  valid?: boolean;
  errors?: Array<{ message?: string; line?: number; column?: number }>;
}

let checker: WasmValidate | null = null;
let attempted = false;
let loadError: string | null = null;

export function hsplusRustCheckerLoaded(): boolean {
  return checker !== null;
}

/** Test hook. Does not unload a WASM module Node has already cached. */
export function resetHsplusRustCheckerForTests(): void {
  checker = null;
  attempted = false;
  loadError = null;
}

/**
 * Package export for the node build of `@holoscript/wasm` (`pkg-node`).
 * Joined at runtime so a bundler does not try to resolve the glue while
 * compiling a consumer that has not installed the package yet.
 */
const WASM_NODE_SPECIFIER = ['@holoscript', 'wasm', 'node'].join('/');

function loadChecker(): WasmValidate | null {
  if (attempted) return checker;
  attempted = true;
  try {
    // Resolution starts at this module. From source that is
    // packages/core/src/parser. From the tsup bundle it is packages/core/dist.
    // From an installed package it is node_modules/@holoscript/core/dist.
    // Walking relative to the file only reaches compiler-wasm inside the
    // monorepo source tree. require.resolve of the package export works in
    // all three places, because @holoscript/core depends on @holoscript/wasm
    // and that package publishes pkg-node behind the "./node" export.
    const require = createRequire(import.meta.url);
    const resolved = require.resolve(WASM_NODE_SPECIFIER);
    const loaded = require(resolved) as { validate_detailed?: unknown };
    if (typeof loaded.validate_detailed === 'function') {
      checker = {
        validate_detailed: loaded.validate_detailed.bind(
          loaded
        ) as WasmValidate['validate_detailed'],
      };
      return checker;
    }
    loadError = 'validate_detailed is not exported';
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }
  return null;
}

function codeOf(message: string): string {
  const typed = message.match(/\[(HS-TYPE-[A-Z0-9-]+)\]/);
  if (typed?.[1]) return typed[1];
  if (message.includes('HS010')) return 'HS010';
  return 'HS-CHECK';
}

/**
 * Run the Rust checker on one function that already has a type written on it.
 * `origin` is the `function` keyword in the `.hsplus` file. Lines inside the
 * slice are shifted back onto that file.
 */
export function checkTypedHsFunction(
  functionSource: string,
  origin: { line: number; column: number }
): RustFunctionDiagnostic[] {
  const wasm = loadChecker();
  if (!wasm) {
    const detail = loadError ? `: ${loadError}` : '';
    return [
      {
        code: 'HS-CHECK',
        message: `The Rust type checker could not be loaded${detail}`,
        line: origin.line,
        column: origin.column,
      },
    ];
  }

  let parsed: ValidateJson;
  try {
    parsed = JSON.parse(wasm.validate_detailed(functionSource)) as ValidateJson;
  } catch {
    return [
      {
        code: 'HS-CHECK',
        message: 'The Rust type checker returned a result that was not JSON',
        line: origin.line,
        column: origin.column,
      },
    ];
  }

  if (parsed.valid === true) return [];

  const errors = parsed.errors ?? [];
  if (errors.length === 0) {
    return [
      {
        code: 'HS-CHECK',
        message: 'The Rust type checker rejected this function',
        line: origin.line,
        column: origin.column,
      },
    ];
  }

  return errors.map((error) => {
    const message = error.message ?? 'The Rust type checker rejected this function';
    const rustLine = error.line && error.line > 0 ? error.line : 1;
    const rustColumn = error.column && error.column > 0 ? error.column : 1;
    return {
      code: codeOf(message),
      message,
      line: origin.line + rustLine - 1,
      column: rustLine === 1 ? origin.column + rustColumn - 1 : rustColumn,
    };
  });
}
