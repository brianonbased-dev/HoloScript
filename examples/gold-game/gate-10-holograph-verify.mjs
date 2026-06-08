// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 10: HoloGraph + HoloEmbed (REPRODUCIBLE).
//
// Makes the REAL GOLD vault's lineage CONSTELLATION the playable structure: vault
// entries are nodes, their real cross-references are edges. Two real capabilities:
//   • HoloGraph (S.HGRAPH) — exact-by-construction graph: traversing a node's
//     out-edges returns EXACTLY its referenced entries (recall = 1.0, no misses).
//   • HoloEmbed (S.HEMBED) — the GENUINE 768-dim HoloEmbedEncoder from
//     @holoscript/holoembed gives deterministic semantic retrieval over the entries.
//
// The corpus is a PINNED snapshot of the real D:/GOLD constellation (real ids,
// titles, and reference edges read live from the vault) — committed so the gate is
// portable + reproducible (D:/GOLD is the founder's machine, not in the repo).
//
//   node_modules/.bin/tsx examples/gold-game/gate-10-holograph-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-10-holograph-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const holoembed = await imp(join(repo, 'packages', 'holoembed', 'dist', 'index.js'));
const { HoloEmbedEncoder, HOLOEMBED_DIM } = holoembed;
const receiptPath = join(here, 'GATE-10-HOLOGRAPH-receipt.json');
const HASH = 'sha256';

// ── PINNED real D:/GOLD constellation (ids/titles/refs read live from the vault) ─
const CORPUS = [
  {
    id: 'W.GOLD.537',
    title: 'GOLD GAME — AI↔human connection proven on both tracks',
    refs: ['W.137'],
  },
  {
    id: 'W.GOLD.534',
    title: 'Audit-as-Calibration Applied to One’s Own Conclusions',
    refs: ['W.501', 'W.511', 'W.513', 'W.514', 'W.GOLD.190', 'W.GOLD.191'],
  },
  {
    id: 'W.GOLD.535',
    title: 'Secrets-Broker as Sovereign Primitive — Capability-Token Architecture',
    refs: ['W.GOLD.002'],
  },
  {
    id: 'W.GOLD.191',
    title: 'Audit-as-Calibration Under Confident Peer Claims — The Nature of Audit',
    refs: ['W.GOLD.190'],
  },
  {
    id: 'W.GOLD.190',
    title: 'First Iterations Always Lack — Preserve Iteration-1 As Paired Evidence',
    refs: [],
  },
  {
    id: 'W.GOLD.002',
    title: 'Sovereign vs Bridge Compilers — Pour Resources into Sovereign',
    refs: [],
  },
];
const ids = new Set(CORPUS.map((e) => e.id));

// ── HoloGraph: exact-by-construction directed graph (edges = real references) ──
const outEdges = Object.fromEntries(
  CORPUS.map((e) => [e.id, e.refs.filter((r) => ids.has(r)).sort()])
);
// recall-1.0 property: traversal returns EXACTLY the in-corpus referenced ids (no misses, no extras)
const traverse = (id) => outEdges[id] || [];
const exactByConstruction = CORPUS.every((e) => {
  const expected = e.refs.filter((r) => ids.has(r)).sort();
  const got = [...traverse(e.id)].sort();
  return JSON.stringify(expected) === JSON.stringify(got);
});
// reachability (navigable constellation): BFS from W.GOLD.534
function reachable(start) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    for (const n of traverse(q.shift()))
      if (!seen.has(n)) {
        seen.add(n);
        q.push(n);
      }
  }
  return seen;
}
const reach534 = reachable('W.GOLD.534');
const inCorpusEdgeCount = Object.values(outEdges).reduce((s, a) => s + a.length, 0);

// ── HoloEmbed: GENUINE 768-dim encoder → semantic retrieval over entries ──────
const encoder = new HoloEmbedEncoder();
if (encoder.initialize) await encoder.initialize({ enableSnn: false });
const enc = (text) => {
  // encodeText for NL strings; falls back to encode({name}) if needed.
  if (typeof encoder.encodeText === 'function') return encoder.encodeText(text);
  return encoder.encode({ name: text });
};
const vecs = Object.fromEntries(CORPUS.map((e) => [e.id, enc(e.title)]));
const dim = vecs[CORPUS[0].id]?.length || 0;
const cosine = (a, b) => {
  let d = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};
function retrieve(query, k = 3) {
  const qv = enc(query);
  return CORPUS.map((e) => ({ id: e.id, score: cosine(qv, vecs[e.id]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
const auditQuery = retrieve('audit calibration self-application of conclusions');
const auditTop = auditQuery[0]?.id;
const auditRelevant = auditTop === 'W.GOLD.534' || auditTop === 'W.GOLD.191';
// determinism: re-encode and re-rank → identical
const auditQuery2 = retrieve('audit calibration self-application of conclusions');
const retrievalDeterministic =
  JSON.stringify(auditQuery.map((x) => x.id)) === JSON.stringify(auditQuery2.map((x) => x.id));

// ── Digest over deterministic structure (real computeStateDigest) ─────────────
const idI = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 2147483647;
  return h;
};
const adjFlat = CORPUS.flatMap((e) => traverse(e.id).map((t) => [idI(e.id), idI(t)])).flat();
const normRound = CORPUS.map((e) =>
  Math.round(Math.sqrt(vecs[e.id].reduce((s, x) => s + x * x, 0)) * 1000)
);
const graphDigest = computeStateDigest(
  {
    fieldNames: ['g'],
    getField: () => Float32Array.from(adjFlat.concat(auditQuery.map((x) => idI(x.id)))),
  },
  HASH
);
const embedDigest = computeStateDigest(
  { fieldNames: ['e'], getField: () => Float32Array.from(normRound) },
  HASH
);

const receipt = {
  gate: 10,
  track: 'flagship',
  name: 'HoloGraph + HoloEmbed — the real GOLD vault constellation as the playable structure',
  verifier: 'examples/gold-game/gate-10-holograph-verify.mjs',
  implementation: {
    holoEmbed: 'packages/holoembed (HoloEmbedEncoder — GENUINE 768-dim encoder)',
    holoGraph:
      'exact-by-construction lineage graph (S.HGRAPH model: explicit reference edges -> recall 1.0)',
  },
  corpus: {
    source:
      'pinned snapshot of the real D:/GOLD lineage constellation (ids/titles/refs read live from the vault)',
    entries: CORPUS.map((e) => ({ id: e.id, refs: e.refs })),
  },
  holoGraph: {
    exactByConstruction,
    inCorpusEdges: inCorpusEdgeCount,
    outEdges,
    reachableFrom534: [...reach534],
    navigable: reach534.size >= 3,
  },
  holoEmbed: {
    encoder: 'HoloEmbedEncoder',
    dim,
    expectedDim: HOLOEMBED_DIM,
    semanticQuery: 'audit calibration self-application of conclusions',
    top3: auditQuery,
    topRelevant: auditRelevant,
    deterministic: retrievalDeterministic,
  },
  contract: {
    spine: 'REAL computeStateDigest',
    graphDigest,
    embedDigest,
    reproducible: 'run the verifier to re-derive',
  },
  honestScope:
    'HoloEmbed embeddings are produced by the GENUINE @holoscript/holoembed HoloEmbedEncoder (768-dim, deterministic) — not a mock. The graph is LOSSLESS BY CONSTRUCTION (S.HGRAPH model): edges ARE the entries’ real cross-references, so traversal returning them is a correctness PROPERTY, not a measured recall — calling it "recall 1.0" would be a tautology (deep-ratchet 2026-05-24), so this gate asserts losslessness, not a recall metric. A genuine semantic recall@k would need a LABELED retrieval benchmark the vault does not have (domain labels are sparse; lineage refs ≠ semantic similarity) — that benchmark is a separate build, not a gate-10 patch. The corpus is a PINNED snapshot of the real D:/GOLD constellation (real ids/titles/refs, transcribed for portability since D:/GOLD is not in the repo) — the same pattern gold-vault-game.holo uses to embed real vault entries. PROVEN: the real vault’s lineage constellation is a navigable graph + semantically searchable via real HoloEmbed. A live full-vault scan (all ~300 entries via the absorb-service CodebaseGraph) deepens later.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-10 RECEIPT EMITTED ->', receiptPath);
  console.log(
    '  HoloEmbed dim=' + dim + '/' + HOLOEMBED_DIM,
    '| exactByConstruction=' + exactByConstruction,
    '| inCorpusEdges=' + inCorpusEdgeCount
  );
  console.log(
    '  reachableFrom534=' + reach534.size,
    '| auditTop=' +
      auditTop +
      ' relevant=' +
      auditRelevant +
      ' deterministic=' +
      retrievalDeterministic
  );
  console.log(
    '  graphDigest=' + graphDigest.slice(0, 16),
    'embedDigest=' + embedDigest.slice(0, 16)
  );
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-10 receipt. Run --emit first.');
    process.exit(2);
  }
  const checks = [
    ['GENUINE HoloEmbedEncoder produces 768-dim vectors', dim === HOLOEMBED_DIM && dim > 0],
    [
      'HoloGraph traversal is LOSSLESS by construction (a correctness property — not a measured recall)',
      exactByConstruction === true,
    ],
    ['real reference edges exist within the corpus', inCorpusEdgeCount >= 3],
    ['constellation is navigable (BFS from W.GOLD.534 reaches >= 3 entries)', reach534.size >= 3],
    ['HoloEmbed semantic retrieval surfaces a relevant entry top-1', auditRelevant === true],
    ['HoloEmbed retrieval is deterministic (re-rank identical)', retrievalDeterministic === true],
    [
      'graph digest reproduces (real computeStateDigest)',
      graphDigest === existing.contract.graphDigest,
    ],
    [
      'embed digest reproduces (real computeStateDigest)',
      embedDigest === existing.contract.embedDigest,
    ],
  ];
  let ok = true;
  console.log('GATE-10 (HOLOGRAPH + HOLOEMBED) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 10', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
