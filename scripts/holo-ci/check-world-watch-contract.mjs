#!/usr/bin/env node
// @ts-check
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = process.cwd();
const contractPath = resolve(repo, 'docs/handbooks/world-watch-trait-contract.json');
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`failed to read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function hasAll(label, actual, required) {
  const set = new Set(Array.isArray(actual) ? actual : []);
  for (const item of required) {
    if (!set.has(item)) fail(`${label} missing ${item}`);
  }
}

function hasMapping(contract, surface) {
  return Array.isArray(contract.executionMappings)
    && contract.executionMappings.some((mapping) => mapping?.surface === surface);
}

const contract = readJson(contractPath);
const docPath = resolve(repo, String(contract.contractDoc || ''));

if (contract.schema !== 'holoscript.world-watch-trait-contract.v1') {
  fail('schema must be holoscript.world-watch-trait-contract.v1');
}
if (contract.phase !== 'phase_1_contract_only') fail('phase must be phase_1_contract_only');
if (contract.traitName !== 'WorldWatchTrait') fail('traitName must be WorldWatchTrait');
if (!existsSync(docPath)) fail(`contractDoc not found: ${contract.contractDoc}`);

hasAll('allowedEvents', contract.allowedEvents, ['commit', 'push', 'schedule', 'trait_change']);
hasAll('allowedAgentActions', contract.allowedAgentActions, [
  'validate_holoscript',
  'conformance_check_artifact',
  'fairness_sweep',
  'holo_critic',
]);
hasAll('triggerFields', contract.triggerFields, [
  'id',
  'file_pattern',
  'event',
  'agent_action',
  'mode',
  'receipt_sink',
]);
hasAll('receiptFields', contract.receiptFields, [
  'triggerId',
  'event',
  'filePattern',
  'matchedFiles',
  'agentAction',
  'policyDecision',
  'status',
  'sourceCommit',
  'worldHash',
  'caelTraceId',
  'receiptDigest',
]);
hasAll('nonGoals', contract.nonGoals, [
  'live_webhook_mutation',
  'automatic_production_write',
  'direct_github_lock_in',
  'provider_cloud_dependence',
  'paid_cloud_spend',
  'local_accelerator_proof',
  'studio_trigger_editor',
  'world_review_fix_branch_generation',
]);

for (const surface of ['SchedulerTrait', 'HoloCI', 'HoloShellTeamRegistry']) {
  if (!hasMapping(contract, surface)) fail(`executionMappings missing ${surface}`);
}

for (const source of contract.sourceFiles || []) {
  if (String(source).startsWith('ai-ecosystem:')) continue;
  const full = resolve(repo, source);
  if (!existsSync(full)) fail(`source file not found: ${source}`);
}

const policy = contract.policy || {};
if (policy.defaultMode !== 'dry_run') fail('policy.defaultMode must be dry_run');
if (policy.requireHumanReviewForWrite !== true) fail('policy.requireHumanReviewForWrite must be true');
for (const key of [
  'allowAutomaticProductionWrite',
  'allowProviderCloudDependence',
  'allowGitHubLockIn',
  'allowPaidCloudSpend',
  'allowAcceleratorTelemetryClaim',
]) {
  if (policy[key] !== false) fail(`policy.${key} must be false`);
}

if (!contract.cg093Boundary?.worldReviewTrait || !contract.cg093Boundary?.worldWatchTrait) {
  fail('cg093Boundary must distinguish WorldReviewTrait from WorldWatchTrait');
}

if (existsSync(docPath)) {
  const doc = readFileSync(docPath, 'utf8');
  for (const needle of [
    'SchedulerTrait',
    'holo_ci_dispatch',
    'HoloShell Team registry',
    'WorldReviewTrait',
    'Non-Goals',
  ]) {
    if (!doc.includes(needle)) fail(`contract doc missing "${needle}"`);
  }
}

if (errors.length) {
  console.error('[check-world-watch-contract] FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('[check-world-watch-contract] OK');
