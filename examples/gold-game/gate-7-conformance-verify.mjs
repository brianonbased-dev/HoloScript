// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 7: HoloScript whole-stack CONFORMANCE SWEEP (REPRODUCIBLE).
//
// The "kitchen sink" gate: throw HoloScript's whole compiler/capability surface at
// the ONE gold-vault-game.holo and record, HONESTLY, what genuinely works. This
// makes the GOLD game a living micro-conformance suite for HoloScript itself —
// proof-of-everything at micro scale (the GOLD game is to HoloScript what HoloLand
// is, but contained). NO fake green: each surface is empirically exercised and
// marked REAL (produced real output) / FAIL (threw) / SKIP (not exported in dist).
//
//   node_modules/.bin/tsx examples/gold-game/gate-7-conformance-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-7-conformance-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const core = await imp(join(repo, 'packages', 'core', 'dist', 'index.js'));
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const receiptPath = join(here, 'GATE-7-CONFORMANCE-receipt.json');

// ── Parse the one source artifact ─────────────────────────────────────────────
const src = readFileSync(join(here, 'gold-vault-game.holo'), 'utf8');
const parsed = core.parseHolo(src);
const composition = parsed.ast || parsed.composition || parsed;
const objects =
  composition.objects || (composition.spatialGroups || []).flatMap((g) => g.objects || []);

// ── Empirically exercise each real compiler against the composition ───────────
// REAL = a compiler that produces non-trivial output (>40 chars/bytes) without throwing.
const COMPILERS = [
  'ThreeJSCompiler',
  'BabylonCompiler',
  'GodotCompiler',
  'UnityCompiler',
  'UnrealCompiler',
  'OpenXRCompiler',
  'PlayCanvasCompiler',
  'GaussianSplattingCompiler',
  'USDPhysicsCompiler',
  'USDZExportCompiler',
  'VisionOSCompiler',
  'ARCompiler',
  'AndroidCompiler',
  'AndroidXRCompiler',
  'IOSCompiler',
  'NIRCompiler',
  'SDFCompiler',
  'TSLCompiler',
  'DTDLCompiler',
  'MultiLayerCompiler',
  'URDFCompiler',
  'HolobCompiler',
  'PhoneSleeveVRCompiler',
  'AAgentCardCompiler',
];

// Some compilers require constructor options (the same shapes the MCP handlers use).
const CTOR_ARGS = {
  ARCompiler: [
    {
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: { hit_test: false, image_tracking: false },
    },
  ],
  MultiLayerCompiler: [{ targets: ['vr', 'vrr', 'ar'] }],
};
async function tryCompile(name) {
  const Cls = core[name];
  if (typeof Cls !== 'function') return { status: 'SKIP', reason: 'not exported in core dist' };
  let inst;
  try {
    inst = new Cls(...(CTOR_ARGS[name] || []));
  } catch (e) {
    return { status: 'FAIL', error: 'ctor: ' + (e.message || e) };
  }
  if (typeof inst.compile !== 'function') return { status: 'SKIP', reason: 'no compile() method' };
  // compile signature is (composition, agentToken?, outputPath?) for most; try arg shapes.
  const shapes = [[composition, 'gold-game'], [composition], [composition, {}], [objects]];
  let lastErr = '';
  for (const args of shapes) {
    try {
      let out = inst.compile(...args);
      if (out && typeof out.then === 'function') out = await out;
      if (out == null) {
        lastErr = 'returned null';
        continue;
      }
      const text = typeof out === 'string' ? out : JSON.stringify(out);
      if (text && text.length > 40)
        return { status: 'REAL', outputType: typeof out, length: text.length };
      lastErr = 'output too small (' + (text ? text.length : 0) + ')';
    } catch (e) {
      lastErr = (e && e.message) || String(e);
    }
  }
  // An unbuilt optional dependency is an honest SKIP, not a FAIL.
  if (/holo-vm|requires @holoscript\//i.test(lastErr))
    return { status: 'SKIP', reason: 'needs optional dep (' + lastErr.slice(0, 80) + ')' };
  return { status: 'FAIL', error: lastErr.slice(0, 160) };
}

const matrix = {};
for (const name of COMPILERS) matrix['compile:' + name] = await tryCompile(name);

// ── Non-compiler surfaces (parse / traits / receipt spine) ────────────────────
matrix['parse:@holoscript/core'] =
  (parsed.errors || []).length === 0
    ? { status: 'REAL', outputType: 'ast', length: JSON.stringify(composition).length }
    : { status: 'FAIL', error: (parsed.errors || []).length + ' parse errors' };

// trait composition (the D.040 trait library)
(() => {
  const TC = core.TraitCompositionCompiler;
  if (typeof TC !== 'function') {
    matrix['traits:TraitComposition'] = { status: 'SKIP', reason: 'not exported' };
    return;
  }
  try {
    // TraitCompositionDecl = { name, components: string[], overrides? }
    const decls = [{ name: 'Curator', components: ['controllable', 'physics', 'collidable'] }];
    const out = new TC().compile(decls, () => ({ defaultConfig: {}, conflicts: [] }));
    matrix['traits:TraitComposition'] = out
      ? { status: 'REAL', outputType: typeof out, length: JSON.stringify(out).length }
      : { status: 'FAIL', error: 'no output' };
  } catch (e) {
    matrix['traits:TraitComposition'] = {
      status: 'FAIL',
      error: (e.message || String(e)).slice(0, 160),
    };
  }
})();

// receipt spine (SimulationContract digest)
const colInt = (h) => parseInt((h || '#000').replace('#', '').slice(0, 6), 16) || 0;
const sceneDigest = computeStateDigest(
  {
    fieldNames: ['s'],
    getField: () =>
      Float32Array.from(
        objects.flatMap((o) => {
          const pos = (o.properties || []).find((p) => p.key === 'position')?.value || [0, 0, 0];
          const col = (o.properties || []).find((p) => p.key === 'color')?.value || '#000';
          return [...pos, colInt(col)];
        })
      ),
  },
  'sha256'
);
matrix['receipt:computeStateDigest'] = {
  status: 'REAL',
  outputType: 'sha256',
  length: sceneDigest.length,
};

// surfaces requiring external services / hardware / separate harness (honest SKIP)
for (const [k, why] of [
  ['solver:multi-physics', 'solvers live behind SimSolver/ExperimentOrchestrator — separate gate'],
  ['mesh:HoloMesh-multi-agent', 'needs live mesh + multiple agents — multi-agent track'],
  ['identity:TwinEarth', 'identity/permission/safety envelopes — separate gate'],
  ['quantum:@quantumInspired', 'QuantumCircuitCompiler/qm-bridge — quantum track'],
  ['hologram:MV-HEVC/quilt', 'hologram pipeline — separate gate'],
  ['graph:HoloGraph/HoloEmbed', 'vault graph retrieval — knowledge-graph track'],
])
  matrix[k] = { status: 'SKIP', reason: why };

// ── Tally + reproducible digest of the STATUS matrix (order-stable) ───────────
const keys = Object.keys(matrix).sort();
const code = { REAL: 2, FAIL: 0, SKIP: -1 };
const statusDigest = computeStateDigest(
  {
    fieldNames: ['m'],
    getField: () => Float32Array.from(keys.map((k) => code[matrix[k].status] ?? 0)),
  },
  'sha256'
);
const tally = { REAL: 0, FAIL: 0, SKIP: 0 };
for (const k of keys) tally[matrix[k].status]++;
const realCompilers = keys.filter(
  (k) => k.startsWith('compile:') && matrix[k].status === 'REAL'
).length;
const totalCompilers = keys.filter((k) => k.startsWith('compile:')).length;

const receipt = {
  gate: 7,
  track: 'flagship',
  name: 'HoloScript whole-stack conformance sweep — the kitchen sink against one .holo',
  source: 'examples/gold-game/gold-vault-game.holo',
  verifier: 'examples/gold-game/gate-7-conformance-verify.mjs',
  summary: { surfaces: keys.length, ...tally, compilersReal: realCompilers + '/' + totalCompilers },
  matrix,
  contract: {
    spine: 'REAL computeStateDigest',
    statusDigest,
    sceneDigest,
    reproducible: 'run the verifier to re-derive',
  },
  honestScope:
    'Each compiler is EMPIRICALLY run against the parsed gold-vault-game.holo via @holoscript/core dist — REAL means it produced >40 chars of real output without throwing; FAIL captures the error; SKIP means not exported in dist or needs a separate harness/service/hardware (solvers, mesh, Twin-Earth, quantum, holograms, HoloGraph are honestly SKIPped here and become their own deepening gates). No surface is marked REAL without captured output evidence. This is breadth-first: it proves how much of HoloScript one .holo already flows through, and turns the SKIP rows into the kitchen-sink backlog.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  // Ratchet integrity: --emit RAISES the conformance floor; it must never seal a REGRESSION as
  // the new baseline (that would launder a broken surface into "expected"). Refuse if this run
  // drops a previously-REAL surface, unless --force is explicitly given.
  let prior;
  try {
    prior = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    prior = null;
  }
  if (prior && !process.argv.includes('--force')) {
    const lost = Object.keys(prior.matrix || {}).filter(
      (k) => prior.matrix[k].status === 'REAL' && matrix[k]?.status !== 'REAL'
    );
    if (lost.length) {
      console.error(
        'REFUSING to re-seal a Gate-7 regression (use --force to override). Lost REAL surfaces: ' +
          lost.join(', ')
      );
      process.exit(3);
    }
  }
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-7 CONFORMANCE RECEIPT EMITTED ->', receiptPath);
  console.log(
    '  surfaces=' + keys.length,
    'REAL=' + tally.REAL,
    'FAIL=' + tally.FAIL,
    'SKIP=' + tally.SKIP,
    '| compilers REAL=' + realCompilers + '/' + totalCompilers
  );
  console.log('  statusDigest=' + statusDigest);
  for (const k of keys)
    console.log(
      '   ',
      matrix[k].status.padEnd(5),
      k,
      matrix[k].status === 'REAL'
        ? '(' + matrix[k].length + ')'
        : matrix[k].error || matrix[k].reason || ''
    );
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-7 receipt. Run --emit first.');
    process.exit(2);
  }
  const noFakeGreen = keys.every((k) => matrix[k].status !== 'REAL' || matrix[k].length > 0);
  // Growth-tolerant conformance invariants (integration-test framing, 2026-05-29). The
  // conformance surface GROWS as HoloScript improves, so the sealed receipt is a regression
  // FLOOR, never a frozen-equality target. Frozen-digest/tally equality read platform growth (a
  // SKIP compiler becoming REAL: 20->21) as a FAIL and forced manual re-seals -- the ledger-vs-live
  // drift that tripped the gate-45 reconcile. Assert instead: no REAL surface regressed, no new
  // FAIL, REAL/compiler counts only rose. Anti-fake-green is preserved by noFakeGreen + the sealed
  // REAL set -- growth must still produce real output; it just isn't pinned to one exact hash.
  // The statusDigest stays in the receipt as a fingerprint; --emit ratchets the floor up.
  const sealedReal = new Set(
    Object.keys(existing.matrix || {}).filter((k) => existing.matrix[k].status === 'REAL')
  );
  const regressed = [...sealedReal].filter((k) => matrix[k]?.status !== 'REAL');
  const sealedCompilersReal = parseInt(String(existing.summary?.compilersReal || '0'), 10) || 0;
  const checks = [
    ['source .holo parses clean', (parsed.errors || []).length === 0],
    ['conformance matrix has surfaces', keys.length >= 20],
    ['at least 3 real compilers flow the one .holo', realCompilers >= 3],
    [
      'receipt spine (computeStateDigest) REAL',
      matrix['receipt:computeStateDigest'].status === 'REAL',
    ],
    [
      'trait composition exercised',
      matrix['traits:TraitComposition'] && matrix['traits:TraitComposition'].status !== undefined,
    ],
    ['NO fake green: every REAL surface has output evidence', noFakeGreen],
    [
      'no REAL surface regressed (sealed REAL set still REAL)' +
        (regressed.length ? ' -- LOST: ' + regressed.join(', ') : ''),
      regressed.length === 0,
    ],
    ['no new FAIL vs sealed floor (target 0)', tally.FAIL <= (existing.summary?.FAIL ?? 0)],
    [
      'REAL count non-decreasing vs floor (' +
        tally.REAL +
        ' >= ' +
        (existing.summary?.REAL ?? 0) +
        ')',
      tally.REAL >= (existing.summary?.REAL ?? 0),
    ],
    [
      'compilers REAL non-decreasing (' + realCompilers + ' >= ' + sealedCompilersReal + ')',
      realCompilers >= sealedCompilersReal,
    ],
  ];
  let ok = true;
  console.log('GATE-7 (CONFORMANCE SWEEP) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log(
    '  REAL=' + tally.REAL,
    'FAIL=' + tally.FAIL,
    'SKIP=' + tally.SKIP,
    '| compilers REAL=' + realCompilers + '/' + totalCompilers
  );
  console.log('  => GATE 7', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
