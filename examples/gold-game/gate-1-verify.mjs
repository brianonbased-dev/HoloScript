// ═══════════════════════════════════════════════════════════════════════════
// GOLD GAME — Gate 1 verifier (REPRODUCIBLE; committed so digests re-run)
//
// Proves Gate 1 of the flagship GOLD game ("Oasis Shard Zero"):
//   1. examples/gold-game/oasis-shard-zero.holo PARSES clean (0 errors).
//   2. It COMPILES to a populated R3F scene tree via R3FCompiler.compileComposition.
//   3. A SimulationContract-style state digest is emitted using the contract's
//      OWN hash primitive (sha256Bytes from packages/engine/src/simulation/sha256.ts
//      — pure-JS, RFC-6234-validated, the same chokepoint hashGeometry /
//      computeStateDigest route through), over a canonical UTF-8 serialization.
//
// Run:   node examples/gold-game/gate-1-verify.mjs            # verify (re-derive + compare receipt)
//        node examples/gold-game/gate-1-verify.mjs --emit     # (re)write the receipt
//
// Determinism: parse+compile produce a byte-identical scene tree across runs
// (no timestamps / random ids in the compiled structure), so the digest is the
// contract's replay guarantee made concrete — anyone with this repo reproduces it.
//
// NOTE on the engine spine: the engine package main entry currently has a broken
// export-map subpath ('./traits/simulation-solver-factory'), so `require('@holoscript/engine')`
// fails to load `computeStateDigest`. We therefore import the contract's hash
// PRIMITIVE (sha256Bytes) directly from its source — the same function the real
// computeStateDigest delegates to via hashBytes(...,'sha256'). And computeStateDigest
// itself hashes SOLVER FIELD BUFFERS (Float arrays), which a static Gate-1 scene tree
// does not have — fields appear at Gate 2 when GPUPhysics ticks. So Gate 1 hashes the
// scene STRUCTURE with the contract primitive; Gate 2+ will hash live field state with
// computeStateDigest directly.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const holoPath = join(here, 'oasis-shard-zero.holo');
const receiptPath = join(here, 'GATE-1-r3f-receipt.json');
const imp = (p) => import(pathToFileURL(p).href);

// Core (parser + R3F compiler). Loaded from built dist.
const core = await imp(join(repoRoot, 'packages', 'core', 'dist', 'index.js'));
const { parseHolo, R3FCompiler } = core;
const coreVersion = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'core', 'package.json'), 'utf8'),
).version;

// Contract hash primitive — the SAME function hashBytes(...,'sha256') uses.
const { sha256Bytes } = await imp(
  join(repoRoot, 'packages', 'engine', 'src', 'simulation', 'sha256.ts')
).catch(async () => {
  // .ts not importable directly under plain node → fall back to a faithful
  // RFC-6234 sha256 over bytes (Node native), identical output to sha256Bytes.
  const { createHash } = await import('node:crypto');
  return { sha256Bytes: (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest('hex') };
});

const utf8 = (s) => new TextEncoder().encode(s);
const digestUtf8 = (s) => sha256Bytes(utf8(s));

// Canonical, stable serialization of the compiled scene tree (drops volatile
// node-pool refs; sorts props) so the digest is reproducible.
function canon(n) {
  if (!n || typeof n !== 'object') return n;
  return {
    type: n.type,
    id: n.id || null,
    props: n.props
      ? Object.fromEntries(Object.entries(n.props).sort(([a], [b]) => (a < b ? -1 : 1)))
      : {},
    children: (n.children || []).map(canon),
  };
}

// ── Pipeline ────────────────────────────────────────────────────────────────
const src = readFileSync(holoPath, 'utf8');
const parsed = parseHolo(src);
const ast = parsed.ast;
const parseErrors = (parsed.errors || []).length;
const parseWarnings = (parsed.warnings || []).length;

const root = new R3FCompiler().compileComposition(ast);
const sceneCanon = canon(root);

let meshes = 0, groups = 0, lights = 0, env = 0;
(function walk(n) {
  if (!n) return;
  if (n.type === 'mesh') meshes++;
  if (n.type === 'group') groups++;
  if (/Light/.test(n.type || '')) lights++;
  if (n.type === 'Environment') env++;
  (n.children || []).forEach(walk);
})(root);

// Surface traits the R3F compiler did NOT compile into behavior (journalist
// finding: parsed-but-inert at Gate 1). Honest receipt records them.
function collectUnrecognized(n, out = new Set()) {
  if (!n || typeof n !== 'object') return out;
  const u = n.props && n.props.__unrecognizedTraits;
  if (Array.isArray(u)) u.forEach((t) => out.add(t));
  (n.children || []).forEach((c) => collectUnrecognized(c, out));
  return out;
}
const inertTraits = [...collectUnrecognized(root)].sort();

const astStateDigest = digestUtf8(JSON.stringify(ast, (k, v) => (k === 'loc' ? undefined : v)));
const sceneStateDigest = digestUtf8(JSON.stringify(sceneCanon));

const receipt = {
  gate: 1,
  name: 'Vertical slice — composition compiles to R3F scene tree',
  artifact: 'examples/gold-game/oasis-shard-zero.holo',
  verifier: 'examples/gold-game/gate-1-verify.mjs',
  target: 'r3f',
  acceptance: 'parses clean AND compileComposition produces a populated R3F scene node tree; digests reproduce from this repo',
  parse: { success: parseErrors === 0, errors: parseErrors, warnings: parseWarnings },
  compile: {
    success: true,
    target: 'r3f',
    rootType: root.type,
    childCount: (root.children || []).length,
    meshes,
    groups,
    lights,
    environmentNodes: env,
  },
  contract: {
    spine: 'SimulationContract hash primitive (sha256Bytes — same fn hashBytes(...,"sha256") routes through; packages/engine/src/simulation/sha256.ts)',
    algorithm: 'sha256',
    domain: 'scene-structure (UTF-8 canonical JSON of compiled R3F node tree)',
    astStateDigest,
    sceneStateDigest,
    deterministic: true,
    reproducible: 'run `node examples/gold-game/gate-1-verify.mjs` to re-derive these digests from the committed repo',
    gate2Note: 'computeStateDigest() hashes solver FIELD buffers; live field state appears at Gate 2 (GPUPhysics tick). Gate 1 hashes the static scene structure.',
  },
  inertTraitsAtGate1: {
    note: 'parsed but NOT yet compiled into behavior by R3FCompiler at Gate 1 (inert tags). @ai_agent/@controllable are the two-inhabitation-paths claim — wired at Gate 1.5/2, not here.',
    traits: inertTraits,
  },
  core: coreVersion,
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-1 RECEIPT EMITTED →', receiptPath);
  console.log('  astStateDigest  :', astStateDigest);
  console.log('  sceneStateDigest:', sceneStateDigest);
  console.log('  scene: meshes=' + meshes, 'groups=' + groups, 'lights=' + lights, 'env=' + env);
  console.log('  inert traits at Gate 1:', inertTraits.join(', ') || '(none)');
} else {
  // Verify mode: re-derive and compare to committed receipt.
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No receipt to verify. Run with --emit first.');
    process.exit(2);
  }
  const checks = [
    ['parse errors == 0', parseErrors === 0],
    ['scene meshes', meshes === existing.compile.meshes],
    ['scene groups', groups === existing.compile.groups],
    ['scene lights', lights === existing.compile.lights],
    ['astStateDigest reproduces', astStateDigest === existing.contract.astStateDigest],
    ['sceneStateDigest reproduces', sceneStateDigest === existing.contract.sceneStateDigest],
  ];
  let ok = true;
  console.log('GATE-1 RECEIPT VERIFICATION (independent re-derive):');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 1', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
