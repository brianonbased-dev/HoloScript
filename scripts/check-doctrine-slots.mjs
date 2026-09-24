#!/usr/bin/env node
/**
 * check-doctrine-slots.mjs -- fail if a registered local doctrine slot never fired.
 *
 * The HoloCI dispatch breadcrumb lives in the ai-ecosystem checkout. Local hooks
 * write proof slots there; this gate catches "registered but unfired" hooks.
 *
 * WHAT "REGISTERED" MEANS (corrected 2026-08-06). This gate previously required
 * `localPreflight` unconditionally. Nothing ever populated it:
 * `ai-ecosystem/scripts/holo-ci/run.mjs` fills that slot ONLY when dispatched with
 * `--require-s23-receipt`, and the S23 hardware loop behind it was seeded and never
 * built -- `idea-seeds/2026-06-13_sync-hardware-loop-local-gpu-validation.md` states
 * plainly that "the schema slot already exists and is always null".
 *
 * So the gate was red whenever a breadcrumb existed at all, and green only while
 * none did. It blocked every HoloRepo candidate submit in the repo rather than
 * catching anything -- a check that cannot pass is not protecting anything, it is
 * just a wall. That is the same failure class as a check that cannot fail.
 *
 * The invariant is now what the name always claimed: a slot the dispatch ACTUALLY
 * registered must be non-null. `run.mjs` records `requiredSlots` alongside the slot
 * values, so "registered" is a fact in the breadcrumb rather than an assumption
 * here. A dispatch that requests the S23 receipt and then fails to produce it still
 * fails this gate, which is the case the gate exists for.
 *
 * A breadcrumb with no `requiredSlots` key predates that contract. It registers
 * nothing, so nothing is required -- reported explicitly, never silently.
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** Slots this gate understands. A slot is only enforced if the workload registered it. */
const KNOWN_SLOTS = ['localPreflight'];

/**
 * The --workload path, from `--workload <file>` or `--workload=<file>`. A flag with no
 * path is refused rather than ignored: ignored, it let a clean machine pass without
 * reading the file the caller named.
 */
function workloadFlag() {
  const at = process.argv.findIndex((arg) => arg === '--workload' || arg.startsWith('--workload='));
  if (at < 0) return undefined;
  const value = (
    process.argv[at] === '--workload'
      ? process.argv[at + 1]
      : process.argv[at].slice('--workload='.length)
  )?.trim();
  if (!value || value.startsWith('--')) {
    console.error('[doctrine-slots] --workload needs a path: --workload <file> or --workload=<file>.');
    process.exit(2);
  }
  return value;
}

/** A variable's value, with blank treated as unset, as scripts/lib/ecosystem-root.mjs does. */
function envValue(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/**
 * Refuse when the gate cannot tell whether this machine is a dispatch lane. An answer
 * it cannot give must not read as a clean machine, and one readable line tells the
 * pusher more than a stack trace does.
 */
function cannotInspect(what, error) {
  console.error(
    `[doctrine-slots] cannot inspect ${what}: ${error?.code ?? error?.message ?? String(error)}. ` +
      'This gate cannot tell whether the machine is a HoloCI dispatch lane, so it refuses instead of passing.'
  );
  process.exit(1);
}

/**
 * Is there an entry at `path`, WITHOUT following a link? A junction or symlink whose
 * target moved is still an entry. ENOENT and ENOTDIR mean nothing is there (a home that
 * is a file, such as /dev/null, holds no .ai-ecosystem). Any other error (EACCES when the
 * home belongs to another user, ENAMETOOLONG) means the gate cannot tell.
 */
function hasEntry(path) {
  try {
    return Boolean(lstatSync(path, { throwIfNoEntry: false }));
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
    return cannotInspect(path, error);
  }
}

/**
 * Where the dispatch breadcrumb should be, and what says a lane should have written
 * it. `markedBy` names that input, so a failure can say what asked for the proof; it
 * is null only when nothing marks a dispatch lane for this user.
 */
function workloadLocation() {
  const flag = workloadFlag();
  if (flag) return { file: resolve(flag), markedBy: `--workload ${flag} names it` };
  for (const name of ['HOLOCI_WORKLOAD_PATH', 'HOLO_CI_WORKLOAD_PATH']) {
    const value = envValue(name);
    if (value) return { file: resolve(value), markedBy: `${name}=${value} names it` };
  }
  for (const name of ['AI_ECOSYSTEM_ROOT', 'HOLOMESH_ROOT']) {
    const value = envValue(name);
    if (value) {
      return {
        file: join(value, '.holo-ci-last-workload'),
        markedBy: `${name}=${value} marks a dispatch lane`,
      };
    }
  }

  let home;
  try {
    home = homedir();
  } catch (error) {
    // os.homedir() throws when the user has no passwd entry and HOME is unset.
    return cannotInspect('the home directory', error);
  }
  const root = join(home, '.ai-ecosystem');
  const file = join(root, '.holo-ci-last-workload');
  // lstat, not exists: a junction or symlink whose target moved is still a lane. It
  // is the laptop layout after the ai-ecosystem checkout moves, and it must not read
  // as a clean machine.
  if (hasEntry(root)) {
    return { file, markedBy: `${root} exists, which marks this machine as a dispatch lane` };
  }
  // ai-ecosystem's own root resolver (scripts/lib/ecosystem-root.mjs) reads this
  // name first; the slot writers do not. Set, it marks a lane whose writers cannot
  // reach this path -- an alarm worth keeping, not a clean machine.
  const dir = envValue('AI_ECOSYSTEM_DIR');
  if (dir) {
    return {
      file,
      markedBy: `AI_ECOSYSTEM_DIR=${dir} marks a dispatch lane whose slot writers look elsewhere (set AI_ECOSYSTEM_ROOT to it so they and this gate look in the same place)`,
    };
  }
  return { file, markedBy: null, root };
}

function failSlot(slot, detail) {
  console.error(`DOCTRINE VIOLATION: ${slot} null -- hook registered but never fired`);
  if (detail) console.error(`[doctrine-slots] ${detail}`);
  process.exit(1);
}

// NO DISPATCH LANE, NOTHING REGISTERED (corrected 2026-09-23). A missing breadcrumb
// used to fail as "localPreflight null -- hook registered but never fired" on every
// machine. On a machine with no HoloCI dispatch lane at all -- a fresh clone, a
// Claude Code cloud session, an outside contributor -- that sentence is false:
// nothing there can have registered a slot. The gate blocked every push from such a
// machine while proving nothing, the same wall the 2026-08-06 correction removed for
// breadcrumbs that register nothing. The first HoloScript cloud session hit it on its
// first push.
//
// The line is drawn where a dispatch lane is marked. The gate passes, and says so,
// only when nothing marks one: no --workload, no HOLOCI_WORKLOAD_PATH or
// HOLO_CI_WORKLOAD_PATH, no AI_ECOSYSTEM_ROOT or HOLOMESH_ROOT, no AI_ECOSYSTEM_DIR,
// and no entry at all at the default root (a dangling link counts as an entry). A
// blank variable counts as unset. Anywhere a lane is marked, a missing breadcrumb
// still fails, and the failure names the input that asked for the proof and the fix.
// Where the gate cannot tell (the home cannot be found or inspected), it refuses:
// "cannot tell" must never read as a clean machine.
//
// What "no lane is marked" covers, and what it does not: only this user's home and
// these variables. A machine whose checkout sits elsewhere, reached by none of them,
// looks clean here.
const { file, markedBy, root } = workloadLocation();
if (!existsSync(file)) {
  if (
    process.env.HOLOCI_ALLOW_MISSING_WORKLOAD === '1' ||
    process.argv.includes('--allow-missing-workload')
  ) {
    console.log(`[doctrine-slots] SKIP -- workload breadcrumb missing: ${file}`);
    process.exit(0);
  }
  if (!markedBy) {
    console.log(
      `[doctrine-slots] OK -- no dispatch lane is marked for this user: nothing at ${root}, and none of --workload, HOLOCI_WORKLOAD_PATH, HOLO_CI_WORKLOAD_PATH, AI_ECOSYSTEM_ROOT, HOLOMESH_ROOT or AI_ECOSYSTEM_DIR is set. Nothing registered, nothing to prove.`
    );
    process.exit(0);
  }
  console.error(`DOCTRINE VIOLATION: workload breadcrumb missing: ${file}`);
  console.error(`[doctrine-slots] ${markedBy}, so a dispatch should have written this file, and none did.`);
  console.error(
    '[doctrine-slots] Fix: run a HoloCI dispatch so it writes the file, or point --workload or HOLOCI_WORKLOAD_PATH at the breadcrumb it wrote. A machine that does not dispatch can skip this check for one push with HOLOCI_ALLOW_MISSING_WORKLOAD=1.'
  );
  process.exit(1);
}

let workload;
try {
  workload = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`[doctrine-slots] cannot parse ${file}: ${error.message}`);
  process.exit(2);
}

// Only slots the dispatch actually registered are enforced. See the header: an
// unconditional requirement here was permanently unsatisfiable.
const declared = Array.isArray(workload?.requiredSlots) ? workload.requiredSlots : null;

if (declared === null) {
  console.log(
    `[doctrine-slots] OK -- breadcrumb ${file} declares no requiredSlots (pre-2026-08-06 contract); nothing registered, nothing to prove.`
  );
  process.exit(0);
}

const required = declared.filter((slot) => KNOWN_SLOTS.includes(slot));
const unknown = declared.filter((slot) => !KNOWN_SLOTS.includes(slot));
if (unknown.length) {
  // Fail closed: a slot this gate cannot evaluate must not read as satisfied.
  console.error(
    `[doctrine-slots] workload registers slot(s) this gate does not know how to check: ${unknown.join(', ')}`
  );
  process.exit(1);
}

if (required.length === 0) {
  console.log(`[doctrine-slots] OK -- workload ${file} registered no doctrine slots.`);
  process.exit(0);
}

for (const slot of required) {
  if (workload?.[slot] == null) {
    failSlot(slot, `workload ${file} registered ${slot} but has ${slot}=${workload?.[slot]}`);
  }
}

const summaries = required.map((slot) => {
  const value = workload[slot];
  const status =
    value && typeof value === 'object' && 'status' in value ? ` status=${value.status}` : '';
  return `${slot}${status}`;
});

console.log(
  `[doctrine-slots] OK -- every registered slot is non-null in ${file}: ${summaries.join(', ')}`
);
