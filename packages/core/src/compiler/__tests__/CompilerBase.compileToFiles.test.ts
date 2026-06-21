import { describe, it, expect } from 'vitest';
import { CompilerBase } from '../CompilerBase';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

/**
 * Locks in the CompilerBase.compileToFiles() default contract (the shared build-verify harness, task C):
 *  - single string  → wrapped under defaultOutputFileName()
 *  - string-map      → passed through
 *  - no string output (binary/typed object, e.g. GLTFExportResult) → THROWS (fail-loud, not garbage)
 * The throw guard prevents a silent "[object Object]" reaching the byte-diff gate / build-verify runner.
 */
const EMPTY = {} as HoloComposition;

class StringCompiler extends CompilerBase {
  protected readonly compilerName = 'StringCompiler';
  compile(): string {
    return 'GENERATED SOURCE';
  }
}

class RecordCompiler extends CompilerBase {
  protected readonly compilerName = 'RecordCompiler';
  compile(): Record<string, string> {
    return { 'a/Main.kt': 'class Main', 'b/State.kt': 'class State' };
  }
}

class BinaryCompiler extends CompilerBase {
  protected readonly compilerName = 'BinaryCompiler';
  compile(): { binary: Uint8Array; stats: object } {
    return { binary: new Uint8Array([1, 2, 3]), stats: {} };
  }
}

describe('CompilerBase.compileToFiles default', () => {
  it('wraps a single string under the default output name', () => {
    const files = new StringCompiler().compileToFiles(EMPTY, '');
    expect(Object.values(files)).toEqual(['GENERATED SOURCE']);
  });

  it('passes through a string-valued record', () => {
    const files = new RecordCompiler().compileToFiles(EMPTY, '');
    expect(files).toEqual({ 'a/Main.kt': 'class Main', 'b/State.kt': 'class State' });
  });

  it('throws fail-loud for a compile() result with no string output', () => {
    expect(() => new BinaryCompiler().compileToFiles(EMPTY, '')).toThrow(
      /must override compileToFiles/
    );
  });
});
