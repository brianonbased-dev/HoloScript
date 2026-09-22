/**
 * The quarantine lists have one home, and this is what keeps it that way.
 *
 * WHAT WENT WRONG. Which test files run serially instead of sharded was written
 * down in three places: `test-baseline.json` flakyFiles, a hardcoded array in
 * `run-vitest.mjs`, and another hardcoded array in `vitest.config.ts`. Two of
 * them carried a comment telling the reader to keep them in sync by hand. They
 * did not stay in sync. On 2026-09-21 `flakyFiles` was emptied and both arrays
 * kept their ten entries, so files believed un-quarantined were still being
 * routed down the protected serial path -- and eight clean runs that were
 * offered as evidence had exercised that protected path, not the sharded one
 * the gate actually uses. One entry named a file that had been deleted.
 *
 * A comment cannot keep two arrays equal. Reading one file can. Both consumers
 * now read `test-baseline.json` at runtime, and the assertions below fail if
 * anyone writes a test path back into either of them.
 *
 * THE TWO JOBS ARE STILL SEPARATE, and must not be merged:
 *   - `flakyFiles`      is a VERDICT list: whose failures the gate forgives.
 *     It is empty, and emptying it was the point.
 *   - `serialPassFiles` is a SCHEDULING list: which files run at maxWorkers=1.
 *     A failure in one of these is still a failure.
 * Folding the second into the first would silently re-arm the quarantine this
 * PR retired; folding the first into the second would make emptying the ignore
 * list stop running those files altogether.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_ROOT = resolve(__dirname, '..', '..');
const BASELINE = JSON.parse(readFileSync(resolve(CORE_ROOT, 'test-baseline.json'), 'utf-8'));

const CONSUMERS = [
  ['run-vitest.mjs', resolve(CORE_ROOT, 'run-vitest.mjs')],
  ['vitest.config.ts', resolve(CORE_ROOT, 'vitest.config.ts')],
] as const;

/**
 * A quoted concrete test path, e.g. 'src/__tests__/Foo.test.ts'. Globs such as
 * 'src/**\/*.test.ts' are excluded by forbidding '*' inside the match: a glob is
 * a rule, while a concrete path is a list entry, and only the second kind
 * duplicates the manifest.
 */
const CONCRETE_TEST_PATH = /'src\/[^'*]+\.(?:test|spec)\.tsx?'/g;

describe('the serial-pass quarantine has exactly one source of truth', () => {
  it('test-baseline.json declares the scheduling lists', () => {
    expect(Array.isArray(BASELINE.serialPassFiles?.files)).toBe(true);
    expect(Array.isArray(BASELINE.ciCoverageExclusions?.files)).toBe(true);
  });

  it.each(CONSUMERS)('%s hardcodes no test paths of its own', (_name, file) => {
    const found = readFileSync(file, 'utf-8').match(CONCRETE_TEST_PATH) ?? [];
    expect(
      found,
      `${_name} names test files directly instead of reading test-baseline.json. ` +
        `That is how the three lists diverged. Found: ${found.join(', ')}`
    ).toEqual([]);
  });

  it('every file in the scheduling lists exists', () => {
    // src/compiler/__tests__/VRRPerformanceBenchmark.spec.ts sat in both consumer
    // arrays after the file was deleted. Vitest silently matches nothing for a
    // stale positional filter, so the entry cost nothing and told nobody -- until
    // it is the last surviving name, when the pass exits 1 with no failures.
    const listed = [
      ...(BASELINE.serialPassFiles?.files ?? []),
      ...(BASELINE.ciCoverageExclusions?.files ?? []),
    ];
    const missing = listed.filter((f: string) => !existsSync(resolve(CORE_ROOT, f)));
    expect(missing, `listed but not on disk: ${missing.join(', ')}`).toEqual([]);
  });

  it('the scheduling list is not empty, because an empty one changes what pass 1 means', () => {
    // With no positional files, run-vitest.mjs pass 1 becomes an unfiltered
    // `vitest run --maxWorkers=1` over the WHOLE suite. The runner now guards
    // against that explicitly; this records the expectation so an accidental
    // emptying is noticed here rather than as an apparent hang.
    expect(BASELINE.serialPassFiles.files.length).toBeGreaterThan(0);
  });

  it('a scheduling entry is not silently also a forgiven failure', () => {
    // The two lists may legitimately overlap, but only on purpose. Today
    // flakyFiles is empty, so this pins the fact that scheduling a file
    // serially does not excuse it.
    const forgiven: string[] = BASELINE.flakyFiles?.files ?? [];
    const scheduled: string[] = BASELINE.serialPassFiles?.files ?? [];
    const both = scheduled.filter((f) => forgiven.includes(f));
    expect(
      both,
      `these files are both scheduled serially AND have their failures ignored: ${both.join(', ')}`
    ).toEqual([]);
  });
});
