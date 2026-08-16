/**
 * sync-examples-catalog.mjs
 *
 * Projects the canonical, audited example catalog from the repo's
 * `examples/examples-health.matrix.json` (SSOT for which examples are
 * public-supported / aspirational / internal, with link policy) into a
 * committed in-package TypeScript module that `get_examples` serves.
 *
 * WHY a generated committed file (not a runtime read):
 *  - The mcp-server build is tsup/esbuild; bundling a same-package .ts is
 *    reliable, a cross-package JSON import or runtime fs read of ../../examples
 *    is not (the examples/ tree does not ship to the Railway runtime CWD).
 *  - Committing the generated catalog means the build ALWAYS has a valid catalog
 *    even if this script is skipped — so it can never break the monorepo deploy.
 *
 * FAIL-SOFT: any error logs a warning and exits 0 WITHOUT overwriting the
 * committed catalog. This script runs in the build chain; it must never fail the
 * build (F.110 — a single broken build fails-to-ship every service).
 *
 * Regenerate after editing examples-health.matrix.json:
 *   pnpm --filter @holoscript/mcp-server sync:examples-catalog
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// packages/mcp-server -> repo root is two levels up
const repoRoot = resolve(pkgRoot, '..', '..');
const examplesDir = resolve(repoRoot, 'examples');
const matrixPath = resolve(examplesDir, 'examples-health.matrix.json');
const outPath = resolve(pkgRoot, 'src', 'examples-catalog.ts');

const EXAMPLE_EXTS = new Set(['hs', 'hsplus', 'holo']);
const preserveTrackedCatalog = process.env.HOLOSCRIPT_MCP_PRESERVE_TRACKED_CATALOG === '1';

/** Walk examples/ at build time and summarize the FULL tree (counts by format
 *  and category). Resolved here so the runtime never needs fs access. */
function buildInventory() {
  const byFormat = {};
  const byCategory = {};
  const files = [];
  let total = 0;
  const walk = (dir) => {
    let dirents;
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const full = resolve(dir, d.name);
      if (d.isDirectory()) {
        if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
        walk(full);
      } else if (d.isFile()) {
        const dot = d.name.lastIndexOf('.');
        const ext = dot >= 0 ? d.name.slice(dot + 1).toLowerCase() : '';
        if (!EXAMPLE_EXTS.has(ext)) continue;
        if (d.name.includes('.refreshed.')) continue; // refreshed siblings, not distinct examples
        total += 1;
        byFormat[ext] = (byFormat[ext] || 0) + 1;
        const rel = relative(examplesDir, full).split(/[\\/]/);
        const category = rel.length > 1 ? rel[0] : 'root';
        byCategory[category] = (byCategory[category] || 0) + 1;

        // Keep the file itself, not just the count. The inventory used to discard
        // these, which is how the tool ended up advertising 463 examples across 40
        // categories while its searchable catalog held 19 across 7 — a customer
        // asking for any advertised category got "No example matched".
        files.push({
          path: `examples/${rel.join('/')}`,
          format: ext,
          category,
          base: (dot >= 0 ? d.name.slice(0, dot) : d.name).toLowerCase(),
        });
      }
    }
  };
  try {
    statSync(examplesDir);
    walk(examplesDir);
  } catch {
    /* examples dir absent — inventory stays empty, fail-soft */
  }
  return { total, byFormat, byCategory, files };
}

try {
  if (preserveTrackedCatalog) {
    console.warn(
      '[sync-examples-catalog] repair-build mode preserves the committed catalog source.'
    );
    process.exit(0);
  }
  if (!existsSync(matrixPath)) {
    console.warn(
      `[sync-examples-catalog] health matrix not found at ${matrixPath}; keeping committed catalog.`
    );
    process.exit(0);
  }

  const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
  const entries = Array.isArray(matrix?.examples) ? matrix.examples : [];
  if (entries.length === 0) {
    console.warn('[sync-examples-catalog] matrix has 0 examples; keeping committed catalog.');
    process.exit(0);
  }

  // Derive a stable slug + format + category from each example path so a query
  // like "physics" or "robot-training" can fuzzy-match against the real repo set.
  const catalog = entries.map((e) => {
    const path = String(e.path || '');
    const file = path.split('/').pop() || path;
    const dot = file.lastIndexOf('.');
    const format = dot >= 0 ? file.slice(dot + 1) : '';
    const base = (dot >= 0 ? file.slice(0, dot) : file).toLowerCase();
    // category = first subdir under examples/, else "root"
    const parts = path.split('/').filter(Boolean);
    const category = parts.length > 2 ? parts[1] : 'root';
    const slug = `${category === 'root' ? '' : category + '/'}${base}`.replace(
      /[^a-z0-9/_-]+/g,
      '-'
    );
    return {
      slug,
      path,
      format,
      category,
      status: String(e.status || 'unknown'),
      linkPolicy: String(e.linkPolicy || ''),
      reason: String(e.reason || ''),
      priority: e.priority === true,
    };
  });

  const inventory = buildInventory();

  // Everything the tree actually holds becomes findable. The audit stays meaningful:
  // the matrix's verdicts win where they exist, and anything the audit has not
  // reached is served plainly marked "unaudited" rather than hidden behind a "No
  // example matched" for a category the same response just advertised.
  const audited = new Set(catalog.map((e) => e.path.replace(/^\.\//, '')));
  const slugFor = (category, base) =>
    `${category === 'root' ? '' : category + '/'}${base}`.replace(/[^a-z0-9/_-]+/g, '-');

  const unaudited = inventory.files
    .filter((f) => !audited.has(f.path))
    .map((f) => ({
      slug: slugFor(f.category, f.base),
      path: f.path,
      format: f.format,
      category: f.category,
      status: 'unaudited',
      linkPolicy: 'unaudited',
      reason: 'Present in the examples tree; the health matrix has not reviewed it yet. Usable as a reference, not certified.',
      priority: false,
    }));

  const fullCatalog = [...catalog, ...unaudited];
  console.log(
    `[sync-examples-catalog] ${catalog.length} audited + ${unaudited.length} unaudited = ${fullCatalog.length} findable (tree holds ${inventory.total})`
  );

  const header = `/**
 * AUTO-GENERATED by scripts/sync-examples-catalog.mjs — DO NOT EDIT BY HAND.
 * Source of truth: examples/examples-health.matrix.json (repo root) + the
 * examples/ tree (full inventory counts).
 * Regenerate: pnpm --filter @holoscript/mcp-server sync:examples-catalog
 *
 * This is the audited PUBLIC example catalog (status + link policy per example)
 * plus a full-tree inventory summary, projected so the get_examples MCP tool
 * serves real repo state instead of a stale hardcoded shadow library.
 */
export interface ExampleCatalogEntry {
  slug: string;
  path: string;
  format: string;
  category: string;
  status: string;
  linkPolicy: string;
  reason: string;
  priority: boolean;
}

export interface ExampleInventory {
  /** Total .hs/.hsplus/.holo example files in examples/ (excludes .refreshed.* siblings). */
  total: number;
  byFormat: Record<string, number>;
  byCategory: Record<string, number>;
}

export const EXAMPLE_CATALOG: ExampleCatalogEntry[] = ${JSON.stringify(fullCatalog, null, 2)};

/** Full-tree inventory of examples/, resolved at build time (no runtime fs). */
export const EXAMPLE_INVENTORY: ExampleInventory = ${JSON.stringify(
    // `files` is build-time scratch — it exists so the unaudited entries above can be
    // computed, and every one of those paths is already in EXAMPLE_CATALOG. Emitting
    // it shipped ~500 duplicate paths in the bundle AND broke the type, since
    // ExampleInventory declares no such field. Caught by the pre-commit typecheck.
    { total: inventory.total, byFormat: inventory.byFormat, byCategory: inventory.byCategory },
    null,
    2
  )};

/** Link policies safe to surface as working/featured examples. */
export const PUBLIC_LINK_POLICIES = new Set<string>([
  'public-supported',
  'public-aspirational-label-required',
]);
`;

  writeFileSync(outPath, header, 'utf8');
  console.log(
    `[sync-examples-catalog] wrote ${fullCatalog.length} catalog entries (${catalog.length} audited) -> src/examples-catalog.ts`
  );
} catch (err) {
  console.warn(
    `[sync-examples-catalog] non-fatal: ${err instanceof Error ? err.message : String(err)}; keeping committed catalog.`
  );
  process.exit(0);
}
