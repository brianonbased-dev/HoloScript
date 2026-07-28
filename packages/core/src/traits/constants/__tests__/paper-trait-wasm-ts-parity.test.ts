/**
 * Paper 11 / ECOOP — cross-platform trait-resolution parity harness (twin-test pillar).
 *
 * What this harness ACTUALLY establishes (and what the paper §Cross-Platform
 * Parity claims — keep the two in sync; adversarial audit 2026-06-10 ruled the
 * previous wording OVERCLAIMED and both were rewritten together):
 *
 *   1. REAL-BINARY PARSER PARITY — the compiled Rust WASM parser
 *      (@holoscript/compiler-wasm, built via `wasm-pack build --target nodejs
 *      --out-dir pkg-node`) and the TypeScript extraction path agree on WHICH
 *      traits are present in the same HoloScript source, for 200 seeded random
 *      trait sets. This is a genuine two-implementation check: the Rust
 *      lexer/parser identifies the trait set independently of any TypeScript
 *      code. Skipped (not silently passed) when the binary is absent.
 *
 *   2. BRIDGE-LAYER EXTRACTION PARITY — extractTraitNames (the TypeScript
 *      wrapper-layer scan in packages/compiler-wasm/src/wasm-api.ts) agrees
 *      with the TS ProvenanceSemiring path on trait-set identity for 200
 *      seeded random trait sets. This is a TS-vs-TS front-end check; it does
 *      NOT exercise the Rust binary.
 *
 *   3. CONFLICT-RESOLUTION DETERMINISM — ProvenanceSemiring.add with
 *      deliberately COLLIDING property keys resolves to an identical canonical
 *      fingerprint on repeated evaluation. The composition semiring has a
 *      single (TypeScript) implementation; this asserts deterministic conflict
 *      resolution, not a second implementation of the algebra.
 *
 * Explicit non-claim: there is no Rust implementation of the composition
 * semiring, so this harness does NOT prove "two independent implementations
 * of the same semiring semantics". The paper text states the same boundary.
 *
 * Run:
 *   pnpm --filter @holoscript/core exec vitest run \
 *     src/traits/constants/__tests__/paper-trait-wasm-ts-parity.test.ts
 *
 * To (re)build the real WASM binary for block 1:
 *   cd packages/compiler-wasm && wasm-pack build --target nodejs --out-dir pkg-node
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

import { VR_TRAITS } from '../index';
import { ProvenanceSemiring } from '../../../compiler/traits/ProvenanceSemiring';
import type { TraitApplication } from '../../../compiler/traits/ProvenanceSemiring';
import { extractTraitNames } from '../../../../../compiler-wasm/src/wasm-api';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared with the order-independence harness (keep in sync)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

/** Canonical fingerprint of a plain-object config (sorted-key JSON). */
function fingerprint(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return JSON.stringify(sorted);
}

/** Seeded LCG RNG — same seed family as order-independence harness. */
function makeLcgRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Fisher–Yates shuffle (in-place). */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build a trivial TraitApplication from a trait name. */
function traitApp(name: string, index: number): TraitApplication {
  return {
    name,
    config: {
      [`prop_${name.replace(/[^a-zA-Z0-9]/g, '_')}`]: index,
      enabled: true,
    },
  };
}

/** Build a HoloScript source snippet from a list of trait names. */
function traitNamesToSource(names: string[]): string {
  const annotations = names.map((n) => `@${n}`).join(' ');
  return `orb parity_test { ${annotations} }`;
}

/** Canonical fingerprint of a TRAIT SET (sorted unique names). */
function traitSetFingerprint(names: string[]): string {
  return JSON.stringify(Array.from(new Set(names)).sort());
}

const TOTAL_INPUTS = 200;
const SUBSET_SIZE = 5; // traits per synthetic input

// Trait names both front ends can tokenize as a single @-annotation.
// The Rust lexer and the TS extraction regex agree on this conservative
// identifier shape; exotic names (digit-leading, exotic punctuation) are a
// lexer-divergence question tracked separately, not part of this claim.
const IDENT_SAFE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const uniqueTraits = Array.from(new Set(VR_TRAITS.map(normalizeTraitName))).filter((n) =>
  IDENT_SAFE.test(n)
);

// ─────────────────────────────────────────────────────────────────────────────
// Backend: TypeScript ProvenanceSemiring fingerprint from a trait-name list
// ─────────────────────────────────────────────────────────────────────────────

function tsBackendFingerprint(names: string[]): string {
  const semiring = new ProvenanceSemiring();
  const apps: TraitApplication[] = names.map((n, i) => traitApp(n, i));
  const result = semiring.add(apps);
  return fingerprint(result.config);
}

/** Same config-shape derivation from an extracted name list (shared by design:
 *  the parity claim is about trait-set identity reaching the semiring, so both
 *  paths must feed the same derivation). */
function configFingerprintFromNames(names: string[]): string {
  const configObj: Record<string, unknown> = {};
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    configObj[`prop_${n.replace(/[^a-zA-Z0-9]/g, '_')}`] = i;
  }
  if (names.length > 0) {
    configObj['enabled'] = true;
  }
  return fingerprint(configObj);
}

// ─────────────────────────────────────────────────────────────────────────────
// Real Rust WASM binary (block 1) — loaded only if the wasm-pack artifact exists
// ─────────────────────────────────────────────────────────────────────────────

const require = createRequire(import.meta.url);
const PKG_NODE_DIR = path.resolve(__dirname, '../../../../../compiler-wasm/pkg-node');
const WASM_GLUE = path.join(PKG_NODE_DIR, 'holoscript_wasm.js');
const wasmBinaryPresent = fs.existsSync(WASM_GLUE);

interface RustTraitNode {
  name: string;
}
interface RustObjectNode {
  type: string;
  traits?: RustTraitNode[];
}
interface RustProgram {
  type: string;
  body: RustObjectNode[];
}

/** Parse source with the REAL Rust WASM binary and return the trait names. */
function rustWasmTraitNames(wasm: { parse(src: string): string }, source: string): string[] {
  const ast = JSON.parse(wasm.parse(source)) as RustProgram;
  const names: string[] = [];
  for (const node of ast.body ?? []) {
    for (const t of node.traits ?? []) {
      names.push(t.name);
    }
  }
  return names;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence artifact accumulator (.bench-logs/paper-trait-wasm-ts-parity.json)
// ─────────────────────────────────────────────────────────────────────────────

const artifactResults: Record<string, unknown> = {};

afterAll(() => {
  const artifact = {
    generatedAt: new Date().toISOString(),
    traitUniverseCount: uniqueTraits.length,
    subsetSize: SUBSET_SIZE,
    totalInputsPerBlock: TOTAL_INPUTS,
    blocks: artifactResults,
    nonClaim:
      'No Rust implementation of the composition semiring exists; this harness establishes ' +
      'front-end/runtime agreement on trait-set identity (real Rust WASM parser + TS bridge layer) ' +
      'plus deterministic conflict resolution in the single TypeScript ProvenanceSemiring.',
  };
  const outDir = path.resolve(__dirname, '../../../../../../.bench-logs');
  if (fs.existsSync(outDir)) {
    fs.writeFileSync(
      path.join(outDir, 'paper-trait-wasm-ts-parity.json'),
      JSON.stringify(artifact, null, 2)
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 1 — REAL Rust WASM binary parser parity (genuine two-implementation)
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!wasmBinaryPresent)(
  'Paper 11 — REAL Rust WASM parser vs TypeScript path: trait-set identity parity',
  () => {
    it(`agrees on the trait set for ${TOTAL_INPUTS} seeded random inputs (real binary)`, () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const wasm = require(WASM_GLUE) as { parse(src: string): string; version(): string };
      const rng = makeLcgRng(0xdeadbef2);

      let pass = 0;
      const failures: Array<{ i: number; expected: string; got: string }> = [];

      for (let i = 0; i < TOTAL_INPUTS; i++) {
        const pool = [...uniqueTraits];
        shuffle(pool, rng);
        const subset = pool.slice(0, SUBSET_SIZE);
        const source = traitNamesToSource(subset);

        // Independent implementation: Rust lexer/parser identifies the traits.
        const rustNames = rustWasmTraitNames(wasm, source);

        const expected = traitSetFingerprint(subset);
        const got = traitSetFingerprint(rustNames);
        if (got === expected) {
          pass++;
        } else {
          failures.push({ i, expected, got });
        }

        // And the trait set the Rust parser found feeds the same canonical
        // config fingerprint the TS semiring path produces.
        expect(configFingerprintFromNames(rustNames)).toBe(tsBackendFingerprint(subset));
      }

      if (failures.length > 0) {
        console.error('[real-wasm parity] failures:', failures.slice(0, 5));
      }
      expect(pass).toBe(TOTAL_INPUTS);

      artifactResults.realWasmParserParity = {
        ran: true,
        wasmVersion: wasm.version(),
        pass,
        fail: TOTAL_INPUTS - pass,
        rngSeed: '0xdeadbef2',
        assertion:
          'Rust WASM parser (compiled binary) and TS path agree on trait-set identity; ' +
          'identical canonical config fingerprint for every input',
      };
    });
  }
);

if (!wasmBinaryPresent) {
  artifactResults.realWasmParserParity = {
    ran: false,
    reason: `wasm-pack artifact absent at ${PKG_NODE_DIR} — block skipped, not passed`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block 2 — bridge-layer extraction parity (TypeScript vs TypeScript)
// ─────────────────────────────────────────────────────────────────────────────

describe('Paper 11 — TS bridge-layer extraction vs TS ProvenanceSemiring path', () => {
  it(`produces byte-identical config fingerprints for ${TOTAL_INPUTS} seeded random inputs`, () => {
    const rng = makeLcgRng(0xdeadbef0 + 1);

    let pass = 0;
    let fail = 0;
    const failures: Array<{
      inputIndex: number;
      traits: string[];
      tsHex: string;
      bridgeHex: string;
    }> = [];

    for (let i = 0; i < TOTAL_INPUTS; i++) {
      const pool = [...uniqueTraits];
      shuffle(pool, rng);
      const subset = pool.slice(0, SUBSET_SIZE);

      const tsHex = tsBackendFingerprint(subset);
      // Bridge layer: extract names from synthesized source via the TS
      // wrapper-layer scan (packages/compiler-wasm/src/wasm-api.ts). This is
      // a TS-vs-TS front-end agreement check — the Rust binary is NOT involved.
      const extracted = extractTraitNames(traitNamesToSource(subset));
      const bridgeHex = configFingerprintFromNames(extracted);

      if (tsHex === bridgeHex) {
        pass++;
      } else {
        fail++;
        failures.push({ inputIndex: i, traits: subset, tsHex, bridgeHex });
      }
    }

    if (failures.length > 0) {
      console.error(`[bridge-layer parity] PARITY FAILURES (${failures.length}):`);
      for (const f of failures.slice(0, 5)) {
        console.error(`  input #${f.inputIndex}: traits=[${f.traits.join(', ')}]`);
        console.error(`    ts-backend:    ${f.tsHex}`);
        console.error(`    bridge-layer:  ${f.bridgeHex}`);
      }
    }

    expect(fail, `Expected 0 parity failures; got ${fail}/${TOTAL_INPUTS}`).toBe(0);
    expect(pass).toBe(TOTAL_INPUTS);

    artifactResults.bridgeLayerExtractionParity = {
      ran: true,
      pass,
      fail,
      rngSeed: '0xdeadbef1',
      assertion:
        'TS wrapper-layer trait extraction and TS ProvenanceSemiring path produce ' +
        'byte-identical canonical config fingerprints (trait-set identity; Rust binary not involved)',
    };
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Block 3 — conflict-resolution determinism (single TS semiring, real conflicts)
// ─────────────────────────────────────────────────────────────────────────────

describe('Paper 11 — ProvenanceSemiring conflict-resolution determinism', () => {
  it('resolves deliberately colliding property keys to an identical fingerprint on repeated runs', () => {
    const rng = makeLcgRng(0xdeadbef3);
    const ROUNDS = 50;

    for (let round = 0; round < ROUNDS; round++) {
      const pool = [...uniqueTraits];
      shuffle(pool, rng);
      const subset = pool.slice(0, SUBSET_SIZE);

      // Every trait contributes the SAME property keys with DIFFERENT values —
      // the semiring must actually resolve a conflict for each shared key.
      const apps: TraitApplication[] = subset.map((n, i) => ({
        name: n,
        config: {
          shared_priority: i + 1,
          shared_label: `from_${n}`,
          enabled: true,
        },
      }));

      const first = fingerprint(new ProvenanceSemiring().add(apps).config);
      const second = fingerprint(new ProvenanceSemiring().add(apps).config);
      expect(second, `round ${round}: non-deterministic conflict resolution`).toBe(first);

      // The collided keys must appear exactly once in the resolved config.
      const resolved = new ProvenanceSemiring().add(apps).config;
      expect(Object.keys(resolved).filter((k) => k === 'shared_priority')).toHaveLength(1);
    }

    artifactResults.conflictResolutionDeterminism = {
      ran: true,
      rounds: ROUNDS,
      collidingKeysPerInput: 2,
      rngSeed: '0xdeadbef3',
      assertion:
        'ProvenanceSemiring.add resolves real key collisions deterministically ' +
        '(identical canonical fingerprint across repeated evaluations)',
    };
  });
});
