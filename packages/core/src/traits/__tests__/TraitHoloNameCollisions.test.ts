/**
 * TraitHoloNameCollisions.test.ts — regression guard for task_1784182188049_7xzd.
 *
 * Board task: "[follow-up][bug?] Three .holo files all declare an at-transaction
 * trait under different categories/paths" — packages/core/src/traits/transaction.holo,
 * packages/core/src/traits/economics/transaction.holo, and
 * packages/core/src/traits/core_transaction.holo all declared `name: "@transaction"`.
 *
 * INVESTIGATION FINDINGS (see task closure notes / commit message for the full
 * writeup):
 *   - Nothing in the running system loads these `.holo` trait descriptor files
 *     into a runtime trait registry by directory scan. `explain_trait` is backed
 *     by a hardcoded `TRAIT_DOCS` map (packages/mcp-server/src/documentation.ts)
 *     that does not even contain "transaction" (verified live: calling
 *     `explain_trait({ trait: "transaction" })` returns `Unknown trait:
 *     @transaction`). The D.104 native-authoring ratchet
 *     (scripts/holo-ci/check-native-coverage.mjs) counts these files by
 *     extension only; scripts/holo-ci/audit-native-parseability.mjs only checks
 *     syntactic parseability. So the 3-way collision had zero live behavioral
 *     effect today — it is a corpus/documentation-layer bug, not a runtime one.
 *   - The REAL runtime trait-handler collision guard is
 *     `HoloScriptRuntime.registerTrait` (keep-first + warn, keyed by explicit
 *     registration call order — see `registerTrait-collision.test.ts` a few
 *     directories up). That guard is untouched by this fix.
 *   - Git history shows the 3 files were authored independently across 3
 *     different D.104 porting-batch commits (acf5fef74, 34accff12, 96c178cd6)
 *     with no cross-batch duplicate check — the systemic root cause. The same
 *     2-file collision pattern exists for many other trait names across this
 *     ~1491-file corpus (e.g. @hot_reload: hot_reload.holo + devops/hot_reload.holo);
 *     fixing all of those is out of scope for this task and tracked separately.
 *   - `core_transaction.holo`'s own sibling `zk_private.holo` (written in the
 *     SAME commit, 34accff12) already referenced `@core_transaction` as a
 *     `behaviors` dependency — concrete same-commit evidence for what its name
 *     was always supposed to be.
 *   - 7 independent files (mostly in `traits/economics/`) reference bare
 *     `@transaction` as a `behaviors` dependency, establishing it as the
 *     de-facto expected identity for the on-chain/economics concept.
 *
 * Fix: disambiguate the 3 into distinct names —
 *   - `economics/transaction.holo`  -> stays `@transaction` (canonical; matches
 *     the 7 external `behaviors` cross-references and the economics category).
 *   - `core_transaction.holo`       -> `@core_transaction` (matches its own
 *     filename and zk_private.holo's cross-reference; closest native
 *     description of the actually-shipped packages/core/src/traits/
 *     TransactionTrait.ts `transactionHandler`).
 *   - `transaction.holo` (renamed to `atomic_transaction.holo`) -> `@atomic_transaction`
 *     (a generic 2PC-style begin/commit/rollback coordinator, unrelated to
 *     money movement; its old "Port of TransactionTrait.ts" claim was
 *     inaccurate and has been corrected).
 *
 * This test scans the corpus directly off disk (no build step required) so it
 * runs the same way audit-native-parseability.mjs does, and guards two things:
 *   1. The specific transaction-family fix (each of the 3 concepts is unique).
 *   2. A corpus-wide ratchet: the total number of duplicate-name groups must
 *      not INCREASE beyond today's baseline (mirrors the D.104
 *      check-native-coverage.mjs ratchet convention — ok to fall as more
 *      duplicates get cleaned up over time, never ok to rise).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TRAITS_DIR = path.resolve(__dirname, '..');

/** Known pre-existing duplicate-name-group count as of this fix (2026-07-16).
 * Do not raise this number to "fix" a failing test — a rise means a NEW
 * collision was introduced. Lowering it (as other duplicates get cleaned up)
 * is welcome and expected over time. */
const DUPLICATE_GROUP_BASELINE = 448;

interface HoloTraitFile {
  absPath: string;
  relPath: string;
  name: string | null;
}

function walkHoloFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkHoloFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.holo')) {
      out.push(full);
    }
  }
  return out;
}

function readTraitName(absPath: string): string | null {
  const src = fs.readFileSync(absPath, 'utf8');
  const match = src.match(/@trait\s*\{[^}]*?name:\s*"([^"]+)"/s);
  return match ? match[1] : null;
}

function loadAllTraitFiles(): HoloTraitFile[] {
  return walkHoloFiles(TRAITS_DIR).map((absPath) => ({
    absPath,
    relPath: path.relative(TRAITS_DIR, absPath).split(path.sep).join('/'),
    name: readTraitName(absPath),
  }));
}

function groupByName(files: HoloTraitFile[]): Map<string, HoloTraitFile[]> {
  const byName = new Map<string, HoloTraitFile[]>();
  for (const f of files) {
    if (!f.name) continue;
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name)!.push(f);
  }
  return byName;
}

describe('trait .holo name collisions (task_1784182188049_7xzd)', () => {
  it('the three transaction-family descriptors each declare a distinct @trait name', () => {
    const files = loadAllTraitFiles();
    const byRelPath = new Map(files.map((f) => [f.relPath, f]));

    const economicsTransaction = byRelPath.get('economics/transaction.holo');
    const coreTransaction = byRelPath.get('core_transaction.holo');
    const atomicTransaction = byRelPath.get('atomic_transaction.holo');
    const oldFlatTransaction = byRelPath.get('transaction.holo');

    expect(economicsTransaction, 'economics/transaction.holo must exist').toBeTruthy();
    expect(coreTransaction, 'core_transaction.holo must exist').toBeTruthy();
    expect(atomicTransaction, 'atomic_transaction.holo must exist (renamed from transaction.holo)').toBeTruthy();
    expect(oldFlatTransaction, 'transaction.holo must no longer exist at its old path').toBeUndefined();

    expect(economicsTransaction!.name).toBe('@transaction');
    expect(coreTransaction!.name).toBe('@core_transaction');
    expect(atomicTransaction!.name).toBe('@atomic_transaction');

    // The three names must be pairwise distinct.
    const names = [economicsTransaction!.name, coreTransaction!.name, atomicTransaction!.name];
    expect(new Set(names).size).toBe(3);
  });

  it('no .holo file anywhere in traits/ still declares the bare "@transaction" name more than once', () => {
    const files = loadAllTraitFiles();
    const byName = groupByName(files);
    const transactionOwners = byName.get('@transaction') ?? [];
    expect(
      transactionOwners.map((f) => f.relPath),
      '@transaction must be declared by exactly economics/transaction.holo'
    ).toEqual(['economics/transaction.holo']);
  });

  it('corpus-wide duplicate-name-group count does not regress past the known baseline (ratchet)', () => {
    const files = loadAllTraitFiles();
    const byName = groupByName(files);
    const duplicateGroups = [...byName.entries()].filter(([, owners]) => owners.length > 1);

    // A rise means some edit introduced a NEW same-name collision (like the one
    // this task fixed). A fall is fine and expected as the pre-existing 449
    // groups get cleaned up over time — see the module docstring.
    expect(
      duplicateGroups.length,
      `duplicate @trait name groups rose above the ${DUPLICATE_GROUP_BASELINE} baseline — ` +
        `a new collision was likely introduced. Sample: ${JSON.stringify(
          duplicateGroups.slice(0, 5).map(([name, owners]) => ({ name, owners: owners.map((o) => o.relPath) }))
        )}`
    ).toBeLessThanOrEqual(DUPLICATE_GROUP_BASELINE);
  });
});
