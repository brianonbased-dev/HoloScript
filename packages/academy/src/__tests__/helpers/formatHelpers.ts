/**
 * formatHelpers.ts — Shared utilities for 3-format scenario tests
 *
 * Provides helpers to load .holo and .hsplus files from disk and invoke
 * the core parsers/compiler — bridging studio scenario tests to the
 * @holoscript/core language layer.
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { HoloScriptPlusParser, HoloCompositionParser, R3FCompiler } from '@holoscript/core';

// ─── Paths ────────────────────────────────────────────────────────────────────

/** Root of the monorepo (packages/studio/src/__tests__/helpers → 5 levels up) */
const ROOT = resolve(__dirname, '../../../../../');

export const FIXTURES_DIR = resolve(__dirname, '../../__tests__/fixtures');
export const CORE_FIXTURES_DIR = resolve(ROOT, 'packages/core/src/__tests__/fixtures');
export const EXAMPLES_DIR = resolve(ROOT, 'examples');

// ─── File Loaders ─────────────────────────────────────────────────────────────

/** Load a .hsplus fixture from packages/core/src/__tests__/fixtures/ */
export function loadHsplusFixture(name: string): string {
  const p = name.endsWith('.hsplus')
    ? join(CORE_FIXTURES_DIR, name)
    : join(CORE_FIXTURES_DIR, `${name}.hsplus`);
  if (!existsSync(p)) throw new Error(`Fixture not found: ${p}`);
  return readFileSync(p, 'utf-8');
}

/** Load a .holo example from examples/ */
export function loadHoloExample(name: string): string {
  const p = name.endsWith('.holo') ? join(EXAMPLES_DIR, name) : join(EXAMPLES_DIR, `${name}.holo`);
  if (!existsSync(p)) throw new Error(`Example not found: ${p}`);
  return readFileSync(p, 'utf-8');
}

// ─── Parser Wrappers ──────────────────────────────────────────────────────────

/** Parse HoloScript+ (.hsplus / .hs) source and return typed result */
export function parseHsplus(source: string, opts?: { enableVRTraits?: boolean }) {
  const parser = new HoloScriptPlusParser({ enableVRTraits: opts?.enableVRTraits ?? true });
  return parser.parse(source);
}

/** Parse HoloComposition (.holo) source and return typed result */
export function parseHolo(source: string, opts?: { tolerant?: boolean; locations?: boolean }) {
  const parser = new HoloCompositionParser({
    tolerant: opts?.tolerant,
    locations: opts?.locations,
  });
  return parser.parse(source);
}

// ─── Compiler Wrapper ─────────────────────────────────────────────────────────

export interface CompileResult {
  r3fTree: any;
  errors: Array<{ message: string; line?: number }>;
}

/**
 * Parse a .holo composition and compile it to an R3F tree.
 * Mirrors useScenePipeline.ts logic for use in tests (no React hooks).
 */
export function compileHoloToR3F(source: string): CompileResult {
  try {
    const compiler = new R3FCompiler();
    const parser = new HoloCompositionParser();
    const result = parser.parse(source);

    if (result.errors && result.errors.length > 0) {
      return {
        r3fTree: null,
        errors: result.errors.map((e: any) => ({
          message: typeof e === 'string' ? e : (e.message ?? String(e)),
          line: e.line ?? e.loc?.line,
        })),
      };
    }

    const tree = compiler.compileComposition(result.ast ?? result);
    return { r3fTree: tree, errors: [] };
  } catch (err) {
    return {
      r3fTree: null,
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
    };
  }
}

/**
 * Parse a .hsplus source and compile it to an R3F tree.
 */
export function compileHsplusToR3F(source: string): CompileResult {
  try {
    const compiler = new R3FCompiler();
    const parser = new HoloScriptPlusParser({ enableVRTraits: true });
    const result = parser.parse(source);

    if (result.errors && result.errors.length > 0) {
      return {
        r3fTree: null,
        errors: result.errors.map((e: any) => ({
          message: typeof e === 'string' ? e : (e.message ?? String(e)),
          line: e.line,
        })),
      };
    }

    const tree = compiler.compile(result.ast ?? result);
    return { r3fTree: tree, errors: [] };
  } catch (err) {
    return {
      r3fTree: null,
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
    };
  }
}
