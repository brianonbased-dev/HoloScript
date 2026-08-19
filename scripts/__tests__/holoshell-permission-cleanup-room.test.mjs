/**
 * Tests for HoloShell Permission Cleanup Room
 *
 * Validates the .holo composition structure, policy state machine,
 * and pipeline data-flow for the unified permission cleanup room
 * covering shared drives, API tokens, and OAuth grants.
 *
 * Run: node scripts/__tests__/holoshell-permission-cleanup-room.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, '..', '..', 'apps', 'holoshell', 'source');

function readSource(filename) {
  return readFileSync(join(SOURCE_DIR, filename), 'utf-8');
}

// Minimal HoloScript composition parser for structural validation
function parseHoloComposition(source) {
  const objects = [];
  const templates = [];
  let compositionName = '';

  const compMatch = source.match(/composition\s+"([^"]+)"/);
  if (compMatch) compositionName = compMatch[1];

  // Extract templates
  const templateRegex = /template\s+"([^"]+)"\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let tmMatch;
  while ((tmMatch = templateRegex.exec(source)) !== null) {
    const name = tmMatch[1];
    const body = tmMatch[2];
    const traits = [];
    const traitRegex = /@(\w+)/g;
    let traitMatch;
    while ((traitMatch = traitRegex.exec(body)) !== null) traits.push(traitMatch[1]);
    const geomMatch = body.match(/geometry:\s*"(\w+)"/);
    templates.push({
      name,
      traits: traits.length > 0 ? traits : undefined,
      geometry: geomMatch?.[1],
    });
  }

  // Extract objects — use line-based matching since nested {} breaks simple regex.
  // Objects start with `object "Name" [using "Template"] {` and end with `  }` at 2-space indent.
  const objectBlocks = [];
  const objStartRegex = /object\s+"([^"]+)"(?:\s+using\s+"([^"]+)")?\s*\{/g;
  let startMatch;
  while ((startMatch = objStartRegex.exec(source)) !== null) {
    const name = startMatch[1];
    const template = startMatch[2] || undefined;
    // Find the matching closing brace at 2-space indent
    const startPos = startMatch.index + startMatch[0].length;
    let depth = 1;
    let pos = startPos;
    while (pos < source.length && depth > 0) {
      if (source[pos] === '{') depth++;
      else if (source[pos] === '}') depth--;
      pos++;
    }
    const body = source.substring(startPos, pos - 1);
    objectBlocks.push({ name, template, body });
  }

  for (const { name, template, body } of objectBlocks) {

    const posMatch = body.match(/position:\s*\[([^\]]+)\]/);
    const position = posMatch
      ? posMatch[1].split(',').map((n) => parseFloat(n.trim()))
      : undefined;

    const labelMatch = body.match(/label:\s*"([^"]+)"/);
    const label = labelMatch?.[1];

    // Parse properties block
    const propsMatch = body.match(/properties:\s*\{([\s\S]*?)\}/);
    let properties;
    if (propsMatch) {
      properties = {};
      const propSource = propsMatch[1];
      // Array properties
      const arrayPropRegex = /(\w+):\s*\[([^\]]*)\]/g;
      let arrMatch;
      while ((arrMatch = arrayPropRegex.exec(propSource)) !== null) {
        const key = arrMatch[1];
        const values = arrMatch[2]
          .split(',')
          .map((v) => v.trim().replace(/"/g, ''))
          .filter((v) => v.length > 0);
        properties[key] = values;
      }
      // String properties
      const strPropRegex = /(\w+):\s*"([^"]+)"/g;
      let strMatch;
      while ((strMatch = strPropRegex.exec(propSource)) !== null) {
        properties[strMatch[1]] = strMatch[2];
      }
      // Boolean properties
      const boolPropRegex = /(\w+):\s*(true|false)/g;
      let boolMatch;
      while ((boolMatch = boolPropRegex.exec(propSource)) !== null) {
        properties[boolMatch[1]] = boolMatch[2] === 'true';
      }
      // Numeric properties
      const numPropRegex = /(\w+):\s*(\d+(?:\.\d+)?)/g;
      let numMatch;
      while ((numMatch = numPropRegex.exec(propSource)) !== null) {
        properties[numMatch[1]] = parseFloat(numMatch[2]);
      }
    }

    objects.push({ name, template, position, label, properties });
  }

  return { objects, templates, compositionName };
}

function parsePolicyState(source) {
  const states = [];
  const transitions = [];
  const policies = [];

  const smMatch = source.match(/states:\s*\[([^\]]+)\]/s);
  if (smMatch) {
    smMatch[1].split(',').forEach((s) => {
      const trimmed = s.trim().replace(/"/g, '');
      if (trimmed.length > 0) states.push(trimmed);
    });
  }

  const transRegex = /transition\s+"([^"]+)"\s*\{\s*from:\s*"([^"]+)",\s*to:\s*"([^"]+)"\s*\}/g;
  let tMatch;
  while ((tMatch = transRegex.exec(source)) !== null) {
    transitions.push({ name: tMatch[1], from: tMatch[2], to: tMatch[3] });
  }

  const polRegex = /policy\s+"([^"]+)"/g;
  let pMatch;
  while ((pMatch = polRegex.exec(source)) !== null) policies.push(pMatch[1]);

  return { states, transitions, policies };
}

// ============================================================================
// Room composition tests
// ============================================================================

const roomSource = readSource('holoshell-permission-cleanup-room.holo');
const parsed = parseHoloComposition(roomSource);

// Composition name
assert.equal(parsed.compositionName, 'HoloShell Permission Cleanup Room', 'composition name matches');

// Templates
const panel = parsed.templates.find((t) => t.name === 'PermissionPanel');
assert.ok(panel, 'PermissionPanel template exists');
assert.ok(panel.traits.includes('billboard'), 'PermissionPanel has billboard trait');
assert.ok(panel.traits.includes('anchor'), 'PermissionPanel has anchor trait');
assert.equal(panel.geometry, 'plane', 'PermissionPanel uses plane geometry');

const orb = parsed.templates.find((t) => t.name === 'CategoryOrb');
assert.ok(orb, 'CategoryOrb template exists');
assert.ok(orb.traits.includes('glowing'), 'CategoryOrb has glowing trait');
assert.ok(orb.traits.includes('collidable'), 'CategoryOrb has collidable trait');
assert.equal(orb.geometry, 'sphere', 'CategoryOrb uses sphere geometry');

const token = parsed.templates.find((t) => t.name === 'RevocationToken');
assert.ok(token, 'RevocationToken template exists');
assert.ok(token.traits.includes('owned'), 'RevocationToken has owned trait');
assert.ok(token.traits.includes('grabbable'), 'RevocationToken has grabbable trait');
assert.equal(token.geometry, 'icosahedron', 'RevocationToken uses icosahedron geometry');

// Three category gates
const categoryGates = ['SharedDriveGate', 'ApiTokenGate', 'OAuthGrantGate'];
const categoryMap = {
  SharedDriveGate: 'shared_drives',
  ApiTokenGate: 'api_tokens',
  OAuthGrantGate: 'oauth_grants',
};

for (const gateName of categoryGates) {
  const obj = parsed.objects.find((o) => o.name === gateName);
  assert.ok(obj, `${gateName} exists`);
  assert.equal(obj.template, 'PermissionPanel', `${gateName} uses PermissionPanel`);
  assert.equal(obj.properties.category, categoryMap[gateName], `${gateName} has correct category`);
  assert.ok(Array.isArray(obj.properties.reads), `${gateName} has reads array`);
  assert.ok(Array.isArray(obj.properties.blocks), `${gateName} has blocks array`);
  assert.ok(obj.properties.reads.length > 0, `${gateName} reads non-empty`);
  assert.ok(obj.properties.blocks.length > 0, `${gateName} blocks non-empty`);
}

// BatchRevokeGate
const batchGate = parsed.objects.find((o) => o.name === 'BatchRevokeGate');
assert.ok(batchGate, 'BatchRevokeGate exists');
assert.ok(batchGate.properties.controls.includes('confirmBatchRevoke'), 'BatchRevokeGate has confirmBatchRevoke');
assert.ok(batchGate.properties.blockedActions.includes('bulkRevokeWithoutReview'), 'BatchRevokeGate blocks bulkRevokeWithoutReview');

// VerifyGate
const verify = parsed.objects.find((o) => o.name === 'VerifyGate');
assert.ok(verify, 'VerifyGate exists');
assert.ok(verify.properties.proves.includes('providerStateVerified'), 'VerifyGate proves providerStateVerified');
assert.ok(verify.properties.proves.includes('readyToClaimClean'), 'VerifyGate proves readyToClaimClean');

// Category orbs with risk levels
const orbChecks = [
  { name: 'SharedDriveOrb', risk: 'critical', category: 'shared_drives' },
  { name: 'ApiTokenOrb', risk: 'high', category: 'api_tokens' },
  { name: 'OAuthGrantOrb', risk: 'medium', category: 'oauth_grants' },
];

for (const check of orbChecks) {
  const obj = parsed.objects.find((o) => o.name === check.name);
  assert.ok(obj, `${check.name} exists`);
  assert.equal(obj.properties.risk, check.risk, `${check.name} has correct risk`);
  assert.equal(obj.properties.category, check.category, `${check.name} has correct category`);
  assert.ok(Array.isArray(obj.properties.examples), `${check.name} has examples`);
  assert.ok(obj.template === 'CategoryOrb', `${check.name} uses CategoryOrb`);
}

// CleanClaimOrb requires verification
const cleanOrb = parsed.objects.find((o) => o.name === 'CleanClaimOrb');
assert.ok(cleanOrb, 'CleanClaimOrb exists');
assert.ok(cleanOrb.properties.requires.includes('providerStateVerified'), 'CleanClaimOrb requires verification');
assert.ok(cleanOrb.properties.requires.includes('zeroResidualAccess'), 'CleanClaimOrb requires zero residual access');

// Revocation tokens
const selected = parsed.objects.find((o) => o.name === 'SelectedRevokeToken');
assert.ok(selected, 'SelectedRevokeToken exists');
assert.equal(selected.properties.selectionMode, 'itemized', 'SelectedRevokeToken is itemized');
assert.equal(selected.properties.requiresFreshGesture, true, 'SelectedRevokeToken requires fresh gesture');

const stale = parsed.objects.find((o) => o.name === 'StaleRevokeToken');
assert.ok(stale, 'StaleRevokeToken exists');
assert.equal(stale.properties.selectionMode, 'stale_flagged', 'StaleRevokeToken auto-flags stale');
assert.ok(typeof stale.properties.staleThresholdDays === 'number', 'StaleRevokeToken has threshold');

const rollback = parsed.objects.find((o) => o.name === 'RollbackToken');
assert.ok(rollback, 'RollbackToken exists');
assert.equal(rollback.properties.rollbackRequiresReapproval, true, 'RollbackToken requires reapproval');

// Timeline
const timeline = parsed.objects.find((o) => o.name === 'PermissionCleanupTimeline');
assert.ok(timeline, 'PermissionCleanupTimeline exists');
assert.ok(timeline.label.includes('inventory by category'), 'Timeline includes inventory step');
assert.ok(timeline.label.includes('revoke'), 'Timeline includes revoke step');
assert.ok(timeline.label.includes('verify'), 'Timeline includes verify step');
assert.ok(timeline.label.includes('replay'), 'Timeline includes replay step');

// Receipt references
const receiptMap = {
  SharedDriveGate: 'PermissionSubjectReceipt',
  ApiTokenGate: 'ApiTokenInventoryReceipt',
  OAuthGrantGate: 'OAuthGrantInventoryReceipt',
  BatchRevokeGate: 'PermissionBatchRevocationReceipt',
  VerifyGate: 'PermissionCleanupVerificationReceipt',
};

for (const [gateName, expectedReceipt] of Object.entries(receiptMap)) {
  const obj = parsed.objects.find((o) => o.name === gateName);
  assert.ok(obj, `${gateName} exists`);
  assert.equal(obj.properties.receipt, expectedReceipt, `${gateName} has correct receipt`);
}

// Reads never contain credential extrusion fields — those belong in blocks
const dangerousReads = ['rawTokenValue', 'rawAccessToken', 'cookieExport', 'backgroundConsent', 'rawAccountLabel'];
for (const obj of parsed.objects) {
  if (obj.properties?.reads && Array.isArray(obj.properties.reads)) {
    for (const dangerous of dangerousReads) {
      assert.ok(
        !obj.properties.reads.includes(dangerous),
        `${obj.name} reads should not contain ${dangerous} (it belongs in blocks)`
      );
    }
  }
}

// Category gates must block credential extrusion in their blocks
const sharedDrive = parsed.objects.find((o) => o.name === 'SharedDriveGate');
assert.ok(sharedDrive.properties.blocks.includes('rawAccountLabel'), 'SharedDriveGate blocks rawAccountLabel');

const apiToken = parsed.objects.find((o) => o.name === 'ApiTokenGate');
assert.ok(apiToken.properties.blocks.includes('rawTokenValue'), 'ApiTokenGate blocks rawTokenValue');

const oauthGrant = parsed.objects.find((o) => o.name === 'OAuthGrantGate');
assert.ok(oauthGrant.properties.blocks.includes('rawAccessToken'), 'OAuthGrantGate blocks rawAccessToken');

// ============================================================================
// Policy tests
// ============================================================================

const policySource = readSource('holoshell-permission-cleanup-policy.hsplus');
const policy = parsePolicyState(policySource);

// Workflow states
const requiredStates = [
  'idle', 'account_confirmed', 'inventory_written', 'exposure_classified',
  'approval_required', 'batch_revocation_running', 'verification_written',
  'clean', 'residual_access_warning', 'blocked',
];

for (const state of requiredStates) {
  assert.ok(policy.states.includes(state), `Policy includes state: ${state}`);
}

// Transitions
const transNames = policy.transitions.map((t) => t.name);
assert.ok(transNames.includes('confirm_account'), 'Has confirm_account transition');
assert.ok(transNames.includes('write_inventory'), 'Has write_inventory transition');
assert.ok(transNames.includes('classify_exposure'), 'Has classify_exposure transition');
assert.ok(transNames.includes('require_approval'), 'Has require_approval transition');
assert.ok(transNames.includes('batch_revoke_selected'), 'Has batch_revoke_selected transition');
assert.ok(transNames.includes('verify_provider_state'), 'Has verify_provider_state transition');
assert.ok(transNames.includes('claim_clean'), 'Has claim_clean transition');

// Block transition from wildcard
const blockTrans = policy.transitions.find((t) => t.name === 'block');
assert.ok(blockTrans, 'Has block transition');
assert.equal(blockTrans.from, '*', 'Block transition from wildcard');
assert.equal(blockTrans.to, 'blocked', 'Block transition to blocked state');

// Policies
assert.ok(policy.policies.includes('ReadOnlyPermissionDiscovery'), 'Has ReadOnlyPermissionDiscovery policy');
assert.ok(policy.policies.includes('GuardedPermissionRevocation'), 'Has GuardedPermissionRevocation policy');
assert.ok(policy.policies.includes('BreakGlassPermissionMutation'), 'Has BreakGlassPermissionMutation policy');

// State tracking for all three categories
assert.ok(policySource.includes('sharedDrivePermissionCount'), 'Policy tracks shared drive count');
assert.ok(policySource.includes('apiTokenCount'), 'Policy tracks API token count');
assert.ok(policySource.includes('oAuthGrantCount'), 'Policy tracks OAuth grant count');
assert.ok(policySource.includes('stalePermissionCount'), 'Policy tracks stale permission count');
assert.ok(policySource.includes('selectedForRevocationCount'), 'Policy tracks selected for revocation');
assert.ok(policySource.includes('revokedCount'), 'Policy tracks revoked count');
assert.ok(policySource.includes('batchRevokeInProgress'), 'Policy tracks batch revoke state');
assert.ok(policySource.includes('rollbackAvailable'), 'Policy tracks rollback availability');

// Category filter policy
assert.ok(policySource.includes('CategoryFilterPolicy'), 'Has CategoryFilterPolicy');
assert.ok(policySource.includes('staleThresholdDays'), 'CategoryFilterPolicy has stale thresholds');

// Guarded revocation requires fresh gesture
assert.ok(policySource.includes('requiresFreshUserGesture: true'), 'Guarded revocation requires fresh gesture');

// Break-glass blocks dangerous mutations
assert.ok(policySource.includes('revoke_admin_token'), 'Break-glass blocks revoke_admin_token');
assert.ok(policySource.includes('bulk_revoke_without_review'), 'Break-glass blocks bulk_revoke_without_review');
assert.ok(policySource.includes('change_org_policy'), 'Break-glass blocks change_org_policy');

// Receipt contract forbids credential extrusion and hidden automation
assert.ok(policySource.includes('rawCredentialCaptureAllowed: false'), 'Receipt contract forbids credential capture');
assert.ok(policySource.includes('hiddenAutomationAllowed: false'), 'Receipt contract forbids hidden automation');

// ============================================================================
// Pipeline tests
// ============================================================================

const pipelineSource = readSource('holoshell-permission-cleanup-pipeline.hs');

assert.ok(pipelineSource.includes('provider_account_receipt'), 'Pipeline has provider account receipt input');
assert.ok(pipelineSource.includes('PermissionSubjectReceipt'), 'Pipeline references PermissionSubjectReceipt');

assert.ok(pipelineSource.includes('shared_drive_inventory_reader'), 'Pipeline has shared drive reader');
assert.ok(pipelineSource.includes('CloudShareInventoryReceipt'), 'Pipeline emits CloudShareInventoryReceipt');
assert.ok(pipelineSource.includes('category: "shared_drives"'), 'Shared drive reader has category');

assert.ok(pipelineSource.includes('api_token_inventory_reader'), 'Pipeline has API token reader');
assert.ok(pipelineSource.includes('ApiTokenInventoryReceipt'), 'Pipeline emits ApiTokenInventoryReceipt');
assert.ok(pipelineSource.includes('category: "api_tokens"'), 'API token reader has category');

assert.ok(pipelineSource.includes('oauth_grant_inventory_reader'), 'Pipeline has OAuth grant reader');
assert.ok(pipelineSource.includes('OAuthGrantInventoryReceipt'), 'Pipeline emits OAuthGrantInventoryReceipt');
assert.ok(pipelineSource.includes('category: "oauth_grants"'), 'OAuth grant reader has category');

assert.ok(pipelineSource.includes('cross_category_exposure_classifier'), 'Pipeline has cross-category classifier');
assert.ok(pipelineSource.includes('PermissionExposureDiffReceipt'), 'Pipeline emits PermissionExposureDiffReceipt');

assert.ok(pipelineSource.includes('batch_revocation_planner'), 'Pipeline has batch revocation planner');
assert.ok(pipelineSource.includes('PermissionBatchRevocationReceipt'), 'Pipeline emits batch revocation receipt');
assert.ok(pipelineSource.includes('permissionEnvelope: "guarded_execute"'), 'Batch planner uses guarded execute');
assert.ok(pipelineSource.includes('batchCap: 50'), 'Batch planner has cap of 50');

assert.ok(pipelineSource.includes('post_revoke_verifier'), 'Pipeline has post-revoke verifier');
assert.ok(pipelineSource.includes('PermissionCleanupVerificationReceipt'), 'Pipeline emits verification receipt');
assert.ok(pipelineSource.includes('PermissionCleanupReplayReceipt'), 'Pipeline emits replay receipt');

// Each reader redacts sensitive data
const readers = [
  'shared_drive_inventory_reader',
  'api_token_inventory_reader',
  'oauth_grant_inventory_reader',
];
for (const reader of readers) {
  assert.ok(pipelineSource.includes(reader), `Pipeline has ${reader}`);
  assert.ok(pipelineSource.includes('redacts:'), `${reader} has redacts field`);
  assert.ok(pipelineSource.includes('permissionEnvelope: "read_only"'), `${reader} uses read_only envelope`);
}

// ============================================================================
// Cross-file consistency tests
// ============================================================================

// Receipt types referenced in room exist across the three files
const receiptTypes = [
  'PermissionSubjectReceipt',
  'ApiTokenInventoryReceipt',
  'OAuthGrantInventoryReceipt',
  'PermissionBatchRevocationReceipt',
  'PermissionCleanupVerificationReceipt',
];

for (const receipt of receiptTypes) {
  const found =
    roomSource.includes(receipt) ||
    policySource.includes(receipt) ||
    pipelineSource.includes(receipt);
  assert.ok(found, `Receipt type ${receipt} referenced in at least one file`);
}

// Workflow name consistent across room and policy
assert.ok(roomSource.includes('permission') && roomSource.includes('cleanup'), 'Room references permission cleanup');
assert.ok(policySource.includes('permission-cleanup'), 'Policy references permission-cleanup workflow');

// Pipeline category labels match room category properties
const categories = ['shared_drives', 'api_tokens', 'oauth_grants'];
for (const cat of categories) {
  assert.ok(roomSource.includes(cat), `Room has category: ${cat}`);
  assert.ok(pipelineSource.includes(cat), `Pipeline has category: ${cat}`);
}

console.log('holoshell permission cleanup room tests passed');