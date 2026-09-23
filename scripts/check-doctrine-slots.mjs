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

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * Where the dispatch breadcrumb should be, and what says a lane should have written
 * it. `askedBy` names that input, so a failure can say what asked for the proof; it
 * is null only when nothing on this machine marks a dispatch lane.
 */
function workloadLocation() {
  const flag = argValue('--workload');
  if (flag) return { file: resolve(flag), askedBy: `--workload ${flag}` };
  for (const name of ['HOLOCI_WORKLOAD_PATH', 'HOLO_CI_WORKLOAD_PATH']) {
    const value = process.env[name];
    if (value) return { file: resolve(value), askedBy: `${name}=${value}` };
  }
  for (const name of ['AI_ECOSYSTEM_ROOT', 'HOLOMESH_ROOT']) {
    const value = process.env[name];
    if (value) return { file: join(value, '.holo-ci-last-workload'), askedBy: `${name}=${value}` };
  }

  const root = join(homedir(), '.ai-ecosystem');
  const file = join(root, '.holo-ci-last-workload');
  // lstat, not exists: a junction or symlink whose target moved is still a lane. It
  // is the laptop layout after the ai-ecosystem checkout moves, and it must not read
  // as a clean machine.
  if (lstatSync(root, { throwIfNoEntry: false })) {
    return { file, askedBy: `the dispatch lane at ${root}` };
  }
  // ai-ecosystem's own root resolver (scripts/lib/ecosystem-root.mjs) reads this
  // name first; the slot writers do not. Set, it marks a lane whose writers cannot
  // reach this path -- an alarm worth keeping, not a clean machine.
  if (process.env.AI_ECOSYSTEM_DIR) {
    return {
      file,
      askedBy: `AI_ECOSYSTEM_DIR=${process.env.AI_ECOSYSTEM_DIR} (set AI_ECOSYSTEM_ROOT to it so the slot writers and this gate look in the same place)`,
    };
  }
  return { file, askedBy: null, root };
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
// and no entry at all at the default root (a dangling link counts as an entry).
// Anywhere a lane is marked, a missing breadcrumb still fails, and the failure names
// the input that asked for the proof.
const { file, askedBy, root } = workloadLocation();
if (!existsSync(file)) {
  if (
    process.env.HOLOCI_ALLOW_MISSING_WORKLOAD === '1' ||
    process.argv.includes('--allow-missing-workload')
  ) {
    console.log(`[doctrine-slots] SKIP -- workload breadcrumb missing: ${file}`);
    process.exit(0);
  }
  if (!askedBy) {
    console.log(
      `[doctrine-slots] OK -- no HoloCI dispatch lane on this machine (nothing at ${root}, and no workload or root variable set); nothing registered, nothing to prove.`
    );
    process.exit(0);
  }
  console.error(`DOCTRINE VIOLATION: workload breadcrumb missing: ${file}`);
  console.error(`[doctrine-slots] ${askedBy} marks a dispatch lane, so its proof should exist here.`);
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
