#!/usr/bin/env node
/**
 * check-doctrine-slots.mjs -- fail if a registered local doctrine slot never fired.
 *
 * The HoloCI dispatch breadcrumb lives in the ai-ecosystem checkout. Local hooks
 * write proof slots there; this gate catches "registered but unfired" hooks.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const REQUIRED_SLOTS = ['localPreflight'];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function workloadPath() {
  const explicit =
    argValue('--workload') || process.env.HOLOCI_WORKLOAD_PATH || process.env.HOLO_CI_WORKLOAD_PATH;
  if (explicit) return resolve(explicit);

  const root =
    process.env.AI_ECOSYSTEM_ROOT || process.env.HOLOMESH_ROOT || join(homedir(), '.ai-ecosystem');
  return join(root, '.holo-ci-last-workload');
}

function failSlot(slot, detail) {
  console.error(`DOCTRINE VIOLATION: ${slot} null -- hook registered but never fired`);
  if (detail) console.error(`[doctrine-slots] ${detail}`);
  process.exit(1);
}

const file = workloadPath();
if (!existsSync(file)) {
  if (
    process.env.HOLOCI_ALLOW_MISSING_WORKLOAD === '1' ||
    process.argv.includes('--allow-missing-workload')
  ) {
    console.log(`[doctrine-slots] SKIP -- workload breadcrumb missing: ${file}`);
    process.exit(0);
  }
  failSlot(REQUIRED_SLOTS[0], `workload breadcrumb missing: ${file}`);
}

let workload;
try {
  workload = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
  console.error(`[doctrine-slots] cannot parse ${file}: ${error.message}`);
  process.exit(2);
}

for (const slot of REQUIRED_SLOTS) {
  if (workload?.[slot] == null) {
    failSlot(slot, `workload ${file} has ${slot}=${workload?.[slot]}`);
  }
}

const summaries = REQUIRED_SLOTS.map((slot) => {
  const value = workload[slot];
  const status =
    value && typeof value === 'object' && 'status' in value ? ` status=${value.status}` : '';
  return `${slot}${status}`;
});

console.log(`[doctrine-slots] OK -- required slot(s) non-null in ${file}: ${summaries.join(', ')}`);
