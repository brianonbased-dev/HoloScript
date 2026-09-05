#!/usr/bin/env node
/**
 * check:workspace-acyclic — enforce ARCHITECTURE.md dependency rules 1 and 7.
 *
 * Rule 1 (`ARCHITECTURE.md:111`) says "No cycles". Rule 7 (`:117`) says core must
 * never have a runtime dependency on engine. Until now neither had an enforcing
 * gate, unlike the structurally identical `no core -> uaal` invariant, which is
 * gated by scripts/holo-ci/check-language-strata.mjs. An ungated rule is the
 * failure mode this repo names as the deepest poison: commit 7f2ba28b3
 * (2026-07-07) silently reverted b53e815f9 and nothing caught it.
 *
 * WHAT THE CYCLE COST (measured 2026-08-05): the workspace could not be built
 * from a clean checkout. @holoscript/engine's build runs `tsc -p tsconfig.dts.json`
 * with `"paths": {}`, so it resolves @holoscript/framework through node_modules to
 * packages/framework/dist/*.d.ts — which does not exist yet, because pnpm could
 * not order framework before engine while core's devDependencies closed a
 * cycle back onto them. 14 TS2307 errors, build dead at 77/117 packages.
 *
 * WHICH EDGES COUNT. Only `workspace:`-spec edges. pnpm links and topologically
 * orders on those; a semver-ranged optional peer creates neither a link nor an
 * ordering constraint, which is precisely why an optional peer is the correct
 * declaration for a lazily-required sibling (see packages/core/src/barrel/lazy-peer.ts).
 * All four dependency fields are scanned, because pnpm's ordering honours
 * devDependencies too — that is how core's devDependencies closed the cycle.
 *
 * Usage:
 *   node scripts/holo-ci/check-workspace-acyclic.mjs
 *   node scripts/holo-ci/check-workspace-acyclic.mjs --json
 *   node scripts/holo-ci/check-workspace-acyclic.mjs --self-test
 *
 * Exit codes: 0 = acyclic, 1 = at least one cycle, 2 = setup error.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/** Minimal reader for the `packages:` block of pnpm-workspace.yaml. */
function workspaceGlobs(root) {
  const file = join(root, 'pnpm-workspace.yaml');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const globs = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
      if (m) {
        globs.push(m[1]);
        continue;
      }
      if (line.trim() !== '') break; // next top-level key
    }
  }
  return globs;
}

/** Resolve a one-level `a/b/*` (or literal) glob to package directories. */
function expandGlob(root, glob) {
  if (!glob.includes('*')) {
    const dir = join(root, glob);
    return existsSync(join(dir, 'package.json')) ? [dir] : [];
  }
  const parent = join(root, glob.slice(0, glob.lastIndexOf('/')));
  if (!existsSync(parent)) return [];
  const out = [];
  for (const entry of readdirSync(parent)) {
    const dir = join(parent, entry);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (existsSync(join(dir, 'package.json'))) out.push(dir);
  }
  return out;
}

/** Build {nodes, edges} over workspace-spec edges only. */
export function buildGraph(manifests) {
  const byName = new Map();
  for (const m of manifests) if (m.name) byName.set(m.name, m);

  const edges = [];
  for (const m of manifests) {
    if (!m.name) continue;
    for (const field of DEP_FIELDS) {
      const deps = m.pkg?.[field] ?? {};
      for (const [dep, spec] of Object.entries(deps)) {
        if (!byName.has(dep)) continue; // external package
        if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue;
        edges.push({ from: m.name, to: dep, field, spec });
      }
    }
  }
  return { nodes: [...byName.keys()], edges };
}

/** Tarjan. Returns only non-trivial SCCs (size > 1, or a genuine self-loop). */
export function findCycles({ nodes, edges }) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) adj.get(e.from)?.push(e.to);

  let index = 0;
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];

  // Iterative Tarjan — the graph is small, but recursion depth is not worth risking.
  for (const root of nodes) {
    if (idx.has(root)) continue;
    const work = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, pi] = frame;
      if (pi === 0) {
        idx.set(v, index);
        low.set(v, index);
        index++;
        stack.push(v);
        onStack.add(v);
      }
      const neighbours = adj.get(v) ?? [];
      if (pi < neighbours.length) {
        frame[1]++;
        const w = neighbours[pi];
        if (!idx.has(w)) work.push([w, 0]);
        else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
        continue;
      }
      if (low.get(v) === idx.get(v)) {
        const comp = [];
        for (;;) {
          const w = stack.pop();
          onStack.delete(w);
          comp.push(w);
          if (w === v) break;
        }
        const selfLoop = comp.length === 1 && (adj.get(comp[0]) ?? []).includes(comp[0]);
        if (comp.length > 1 || selfLoop) sccs.push(comp.sort());
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(v)));
      }
    }
  }
  return sccs;
}

/**
 * Second defect class: a build-order INVERSION that is not a cycle.
 *
 * Acyclicity is necessary but not sufficient. Found 2026-08-05:
 *   core           --optionalDependencies (workspace:^)--> medical-plugin
 *   medical-plugin --peerDependencies (">=8.0.0", semver)--> core
 *   medical-plugin  build: tsup --dts        <- genuinely needs core's types
 *
 * The back-edge is semver, so pnpm neither links nor orders on it and there is
 * no cycle to detect — yet pnpm builds medical-plugin FIRST and its declaration
 * emit fails on a core/dist that does not exist yet. A gate that reported this
 * graph as clean would be exactly the kind of green-looking hole this repo keeps
 * getting burned by, so the invariant is checked here too:
 *
 *   if A declares a workspace: dependency on B, then B must not require A at
 *   build time via a non-workspace declaration.
 */
export function findInversions(manifests) {
  const byName = new Map();
  for (const m of manifests) if (m.name) byName.set(m.name, m);
  const NEEDS_TYPES = /--dts|\btsc\b/;
  const out = [];
  for (const a of manifests) {
    if (!a.name) continue;
    for (const field of DEP_FIELDS) {
      for (const [dep, spec] of Object.entries(a.pkg?.[field] ?? {})) {
        if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue;
        const b = byName.get(dep);
        if (!b) continue;
        const back = DEP_FIELDS.map((f) => (b.pkg?.[f] ?? {})[a.name]).find(Boolean);
        if (!back || String(back).startsWith('workspace:')) continue;
        const build = b.pkg?.scripts?.build ?? '';
        if (!NEEDS_TYPES.test(build)) continue;
        out.push({ from: a.name, to: dep, field, spec, backSpec: String(back), build });
      }
    }
  }
  return out;
}

/**
 * Third defect class: an UNORDERED build-time dependency.
 *
 * Found 2026-08-05, after fixing the first two — and it is the one that bites
 * when you fix a cycle carelessly. 15 plugins declared:
 *
 *   plugin --peerDependencies (">=8.0.0", semver)--> core
 *   plugin  build: tsup --dts     <- needs core's TYPES to emit declarations
 *
 * The semver peer is correct for a published consumer, but it gives pnpm no
 * ordering constraint at all, so `pnpm -r build` may build the plugin before
 * core and its declaration emit fails on a core/dist that does not exist yet.
 *
 * Removing a cycle by deleting the reverse edge does NOT fix this — it removes
 * the ordering information entirely. The repair is to ALSO declare the sibling
 * with a `workspace:` spec (devDependencies is the honest field: it is a
 * build-time need, not a runtime one), which restores the ordering edge without
 * changing what a published consumer must provide.
 *
 *   if B's build emits types and B names workspace sibling X in any dependency
 *   field, then at least one of those declarations must use a `workspace:` spec.
 */
export function findUnorderedBuildDeps(manifests) {
  const names = new Set(manifests.map((m) => m.name).filter(Boolean));
  const NEEDS_TYPES = /--dts|\btsc\b/;
  const out = [];
  for (const b of manifests) {
    if (!b.name) continue;
    if (!NEEDS_TYPES.test(b.pkg?.scripts?.build ?? '')) continue;
    const specsByDep = new Map();
    for (const field of DEP_FIELDS) {
      for (const [dep, spec] of Object.entries(b.pkg?.[field] ?? {})) {
        if (!names.has(dep) || typeof spec !== 'string') continue;
        if (!specsByDep.has(dep)) specsByDep.set(dep, []);
        specsByDep.get(dep).push({ field, spec });
      }
    }
    for (const [dep, decls] of specsByDep) {
      if (decls.some((d) => d.spec.startsWith('workspace:'))) continue;
      out.push({ pkg: b.name, dep, declarations: decls, build: b.pkg.scripts.build });
    }
  }
  return out;
}

// --- self-test: a gate never observed rejecting cannot be trusted to reject ---
if (process.argv.includes('--self-test')) {
  const mk = (name, deps, field = 'dependencies') => ({
    name,
    dir: name,
    pkg: { [field]: Object.fromEntries(deps.map((d) => [d, 'workspace:^'])) },
  });
  const cases = [
    ['acyclic chain is clean', [mk('a', ['b']), mk('b', ['c']), mk('c', [])], 0],
    ['two-node cycle is caught', [mk('a', ['b']), mk('b', ['a'])], 1],
    [
      'cycle closed through devDependencies is caught (the real case)',
      [mk('core', ['engine'], 'devDependencies'), mk('engine', ['core'])],
      1,
    ],
    [
      'semver optional peer creates NO edge, so no cycle',
      [
        { name: 'core', dir: 'core', pkg: { peerDependencies: { engine: '^1.0.0' } } },
        mk('engine', ['core']),
      ],
      0,
    ],
    [
      'workspace: optional peer DOES create an edge, so it is caught',
      [
        { name: 'core', dir: 'core', pkg: { peerDependencies: { engine: 'workspace:^' } } },
        mk('engine', ['core']),
      ],
      1,
    ],
    ['edge to a non-workspace package is ignored', [mk('a', ['external-thing'])], 0],
    ['three-node cycle is caught', [mk('a', ['b']), mk('b', ['c']), mk('c', ['a'])], 1],
  ];
  let failed = 0;
  for (const [name, manifests, expected] of cases) {
    const got = findCycles(buildGraph(manifests)).length;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} (expected ${expected} cycle(s), got ${got})`);
  }

  // The inversion half — the real medical-plugin shape, plus its near-misses.
  const inv = (backSpec, build) => [
    {
      name: 'host',
      dir: 'host',
      pkg: { optionalDependencies: { plug: 'workspace:^' } },
    },
    { name: 'plug', dir: 'plug', pkg: { peerDependencies: { host: backSpec }, scripts: { build } } },
  ];
  const invCases = [
    ['catches semver back-edge + --dts build (the medical-plugin shape)', inv('>=8.0.0', 'tsup --dts'), 1],
    ['catches semver back-edge + tsc build', inv('^8.0.0', 'tsc'), 1],
    ['ignores it when the back-edge is workspace: (a real cycle, caught above)', inv('workspace:^', 'tsup --dts'), 0],
    ['ignores it when the dependent needs no types at build', inv('>=8.0.0', 'esbuild src/index.ts'), 0],
    ['ignores it when there is no back-edge at all', [
      { name: 'host', dir: 'host', pkg: { optionalDependencies: { plug: 'workspace:^' } } },
      { name: 'plug', dir: 'plug', pkg: { scripts: { build: 'tsc' } } },
    ], 0],
  ];
  for (const [name, manifests, expected] of invCases) {
    const got = findInversions(manifests).length;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} (expected ${expected} inversion(s), got ${got})`);
  }

  // The unordered-build-dep half — the 15-plugin shape.
  const ubd = (decls, build, depName = 'core') => [
    { name: 'core', dir: 'core', pkg: {} },
    {
      name: 'plug',
      dir: 'plug',
      pkg: { ...decls, scripts: { build } },
    },
  ];
  const ubdCases = [
    [
      'catches semver-only peer + --dts build (the 15-plugin shape)',
      ubd({ peerDependencies: { core: '>=8.0.0' } }, 'tsup --dts'),
      1,
    ],
    [
      'accepts it once a workspace: declaration exists alongside',
      ubd(
        { peerDependencies: { core: '>=8.0.0' }, devDependencies: { core: 'workspace:^' } },
        'tsup --dts'
      ),
      0,
    ],
    ['ignores a package whose build emits no types', ubd({ peerDependencies: { core: '>=8.0.0' } }, 'esbuild src'), 0],
    [
      'ignores an external (non-workspace) dependency',
      [{ name: 'plug', dir: 'plug', pkg: { peerDependencies: { react: '^19.0.0' }, scripts: { build: 'tsc' } } }],
      0,
    ],
  ];
  for (const [name, manifests, expected] of ubdCases) {
    const got = findUnorderedBuildDeps(manifests).length;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name} (expected ${expected}, got ${got})`);
  }

  console.log(
    failed === 0
      ? '\n[workspace-acyclic] self-test PASS — catches cycles, non-cycle build-order inversions, and unordered build-time deps; invents none of them from a semver optional peer or a types-free build.'
      : `\n[workspace-acyclic] self-test FAIL — ${failed} case(s) wrong.`
  );
  process.exit(failed === 0 ? 0 : 1);
}

let manifests;
try {
  const dirs = workspaceGlobs(REPO_ROOT).flatMap((g) => expandGlob(REPO_ROOT, g));
  manifests = dirs.map((dir) => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    return { name: pkg.name, dir: relative(REPO_ROOT, dir).replace(/\\/g, '/'), pkg };
  });
} catch (e) {
  console.error(`[workspace-acyclic] cannot read workspace manifests: ${e.message}`);
  process.exit(2);
}

const graph = buildGraph(manifests);
const cycles = findCycles(graph);
const inversions = findInversions(manifests);
const unordered = findUnorderedBuildDeps(manifests);
const asJson = process.argv.includes('--json');

if (asJson) {
  console.log(
    JSON.stringify(
      {
        schema: 'holoscript.workspace-acyclic.v1',
        packages: graph.nodes.length,
        workspaceEdges: graph.edges.length,
        cycles: cycles.map((members) => ({
          members,
          edges: graph.edges.filter(
            (e) => members.includes(e.from) && members.includes(e.to)
          ),
        })),
        inversions,
        unorderedBuildDeps: unordered,
      },
      null,
      2
    )
  );
} else {
  console.log(
    `[workspace-acyclic] ${graph.nodes.length} workspace packages, ${graph.edges.length} workspace: edges`
  );
  for (const members of cycles) {
    const intra = graph.edges.filter((e) => members.includes(e.from) && members.includes(e.to));
    console.error(`\n[workspace-acyclic] CYCLE (${members.length} packages, ${intra.length} edges):`);
    for (const m of members) console.error(`    ${m}`);
    console.error('  edges:');
    for (const e of intra) console.error(`    ${e.from} --${e.field}--> ${e.to}  (${e.spec})`);
  }
}

if (!asJson) {
  for (const i of inversions) {
    console.error(`\n[workspace-acyclic] BUILD-ORDER INVERSION (not a cycle):`);
    console.error(`    ${i.from} --${i.field} (${i.spec})--> ${i.to}`);
    console.error(`    but ${i.to} declares ${i.from} back as "${i.backSpec}" (non-workspace, so pnpm does not order on it)`);
    console.error(`    and builds with: ${i.build}`);
    console.error(`    => pnpm builds ${i.to} first, and its type emit needs ${i.from}'s dist, which does not exist yet.`);
  }
}

if (!asJson) {
  for (const u of unordered) {
    console.error(`
[workspace-acyclic] UNORDERED BUILD-TIME DEPENDENCY:`);
    console.error(`    ${u.pkg} builds with: ${u.build}`);
    console.error(`    and needs workspace sibling ${u.dep}, declared only as ${u.declarations.map((d) => `${d.field}="${d.spec}"`).join(', ')}`);
    console.error(`    A semver spec creates no pnpm ordering edge, so ${u.dep} may build after ${u.pkg}.`);
    console.error(`    Fix: also declare "${u.dep}": "workspace:^" in devDependencies (a build-time need).`);
  }
}

if (cycles.length === 0 && inversions.length === 0 && unordered.length === 0) {
  if (!asJson) {
    console.log(
      '[workspace-acyclic] OK — 0 cycles, 0 build-order inversions, 0 unordered build-time deps. ARCHITECTURE.md rule 1 holds.'
    );
  }
  process.exit(0);
}

if (!asJson) {
  console.error(
    `\n[workspace-acyclic] FAIL — ${cycles.length} cycle(s), ${inversions.length} inversion(s), ${unordered.length} unordered build dep(s).`
  );
  console.error('  Either shape makes the workspace unbuildable from a clean checkout: pnpm cannot');
  console.error("  order a package before something that depends back on it, so a dts step reading a");
  console.error("  sibling's dist/ finds nothing there. Fix the manifest edge, not the build order.");
}
process.exit(1);
