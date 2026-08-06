/**
 * task_1784330208777_288f: the compiler-wasm build-provenance reader must resolve to the REAL
 * on-disk rebuild receipt, not a hardcoded/stale value — these tests read
 * packages/compiler-wasm/pkg-node/rebuild-receipt.json directly (independent of the reader) and
 * assert the reader's output matches it, so a wired-in-wrong value fails here.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  getCompilerWasmBuildIdentity,
  __resetCompilerWasmBuildIdentityCache,
} from '../parserBuildIdentity';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RECEIPT_PATH = path.join(
  HERE,
  '..',
  '..',
  '..',
  'compiler-wasm',
  'pkg-node',
  'rebuild-receipt.json'
);

interface RawReceipt {
  schema: string;
  sourceCommit: string;
  generatedAt: string;
  result: { wasmSha256: string; wasmBytes: number };
}

function readRawReceipt(): RawReceipt {
  return JSON.parse(readFileSync(RECEIPT_PATH, 'utf8')) as RawReceipt;
}

describe('getCompilerWasmBuildIdentity', () => {
  beforeEach(() => {
    __resetCompilerWasmBuildIdentityCache();
  });

  it('resolves to the same sourceCommit/wasmSha256 as the real on-disk rebuild receipt', () => {
    const raw = readRawReceipt();
    const identity = getCompilerWasmBuildIdentity();

    expect(identity).not.toBeNull();
    expect(identity?.sourceCommit).toBe(raw.sourceCommit);
    expect(identity?.wasmSha256).toBe(raw.result.wasmSha256);
    expect(identity?.wasmBytes).toBe(raw.result.wasmBytes);
    expect(identity?.schema).toBe(raw.schema);
    expect(identity?.generatedAt).toBe(raw.generatedAt);
  });

  it('a sourceCommit is a resolvable 40-character git hash, not a placeholder', () => {
    const identity = getCompilerWasmBuildIdentity();
    expect(identity?.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('caches the result — a second call returns the same object without re-reading', () => {
    const first = getCompilerWasmBuildIdentity();
    const second = getCompilerWasmBuildIdentity();
    expect(second).toBe(first);
  });

  it('__resetCompilerWasmBuildIdentityCache forces a fresh read (still matches the receipt)', () => {
    const first = getCompilerWasmBuildIdentity();
    __resetCompilerWasmBuildIdentityCache();
    const second = getCompilerWasmBuildIdentity();
    expect(second).not.toBe(first); // fresh object
    expect(second).toEqual(first); // same content
  });
});
