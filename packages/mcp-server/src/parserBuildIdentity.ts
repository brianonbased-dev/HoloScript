/**
 * Compiler-WASM build-provenance reader.
 *
 * `packages/compiler-wasm/scripts/build-wasm.mjs` stamps a rebuild receipt
 * (packages/compiler-wasm/pkg-node/rebuild-receipt.json) every time the Rust
 * parser is rebuilt for Node: the source commit it was compiled from, and the
 * sha256 + byte length of the produced .wasm artifact. That receipt already
 * carries everything task_1784330208777_288f needs — it just wasn't surfaced
 * anywhere a caller of validate_holoscript or /health could read it, so a
 * "validator: rust-wasm" response gave no way to resolve WHICH build actually
 * answered. This module reads the existing receipt; it does not compute or
 * regenerate anything.
 *
 * Secret-safe: a git commit hash, a content digest, a byte count, and a
 * timestamp — no paths beyond the package-relative ones already public in the
 * open-source repo, no tokens, no environment values.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface CompilerWasmBuildIdentity {
  /** Receipt schema id, e.g. "holoscript.compiler-wasm.pkg-node.rebuild-receipt.v1". */
  schema: string;
  /** Git commit the Rust source was built from. */
  sourceCommit: string;
  /** sha256 of the produced holoscript_wasm_bg.wasm artifact. */
  wasmSha256: string;
  /** Byte length of the produced .wasm artifact. */
  wasmBytes: number;
  /** When the receipt was generated (build time), ISO 8601. */
  generatedAt: string;
}

interface RawRebuildReceipt {
  schema?: string;
  sourceCommit?: string;
  generatedAt?: string;
  result?: { wasmSha256?: string; wasmBytes?: number };
}

// Path assembled from segments, not a string literal — mirrors
// WasmParserBridge.ts's loadDefaultNodeGrammar rationale: a literal
// `new URL('...', import.meta.url)` gets statically resolved by bundlers, which
// hard-fails when this artifact isn't built in the consumer's context. This
// reader must stay a runtime-only optional load, same as the parser itself.
const RECEIPT_REL_SEGMENTS = ['..', '..', 'compiler-wasm', 'pkg-node', 'rebuild-receipt.json'];

let cached: CompilerWasmBuildIdentity | null | undefined;

/**
 * Reads the compiler-wasm Node build's rebuild receipt. Returns `null` when the
 * receipt is absent (e.g. a Node-only deploy that skipped the Rust workspace
 * build) or malformed — never throws, matching the parser bridge's own
 * optional-load philosophy for this artifact. Cached after the first read since
 * the receipt only changes when the process is rebuilt/restarted.
 */
export function getCompilerWasmBuildIdentity(): CompilerWasmBuildIdentity | null {
  if (cached !== undefined) return cached;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const receiptPath = path.join(here, ...RECEIPT_REL_SEGMENTS);
    const raw = JSON.parse(readFileSync(receiptPath, 'utf8')) as RawRebuildReceipt;
    if (!raw.sourceCommit || !raw.result?.wasmSha256) {
      cached = null;
      return cached;
    }
    cached = {
      schema: raw.schema ?? 'unknown',
      sourceCommit: raw.sourceCommit,
      wasmSha256: raw.result.wasmSha256,
      wasmBytes: raw.result.wasmBytes ?? 0,
      generatedAt: raw.generatedAt ?? 'unknown',
    };
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}

/** Test-only: clears the memoized receipt so a test can assert a fresh read. */
export function __resetCompilerWasmBuildIdentityCache(): void {
  cached = undefined;
}
