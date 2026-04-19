#!/usr/bin/env node
/**
 * Founder/operator checklist: dual-path ingest defaults and env knobs.
 * Run: node scripts/check-ingest-path-status.mjs
 */

const ingest = process.env.HOLOSCRIPT_INGEST_PATH ?? '(unset — defaults to marble)';
const profile = process.env.HOLOSCRIPT_RECONSTRUCTION_PROFILE ?? '(unset)';
const caelAxis = process.env.CAEL_EXP1_SCENE_AXIS ?? '(unset — defaults marble-compatibility)';
const pin = process.env.CAEL_EXP1_HOLOMAP_BUILD_PIN ?? '(unset)';

console.log('## HoloMap / ingest path status\n');
console.log('| Check | Value |');
console.log('|-------|-------|');
console.log(`| HOLOSCRIPT_INGEST_PATH | ${ingest} |`);
console.log(`| HOLOSCRIPT_RECONSTRUCTION_PROFILE | ${profile} |`);
console.log(`| CAEL_EXP1_SCENE_AXIS | ${caelAxis} |`);
console.log(`| CAEL_EXP1_HOLOMAP_BUILD_PIN | ${pin} |`);
console.log('');
console.log('Rollback-safe default for papers: `marble` or unset.');
console.log('Docs: docs/holomap/RUNBOOK_PAPER_HARNESSES.md, docs/holomap/ROLLBACK_DEFAULTS.md');
console.log('');
