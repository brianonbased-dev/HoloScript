#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.account-task-custody.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'account-task-custody-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'account-task-custody-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'account-task-custody-receipts');

const ACCOUNT_MUTATION_KINDS = new Set([
  'send_email',
  'reply_email',
  'create_calendar_event',
  'update_calendar_event',
  'save_shared_document',
  'upload_cloud_file',
  'share_link',
  'download_private_attachment',
  'use_credential_bearing_browser_profile',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    intent: '',
    provider: 'unknown',
    accountLabel: 'not_declared',
    scopes: '',
    browserProfile: 'not_declared',
    browserSession: 'not_declared',
    cookiePolicy: 'not_declared',
    screenshotPolicy: 'local_only_redacted_or_manual_witness',
    selectedFiles: '',
    draft: '',
    recipients: '',
    calendar: '',
    document: '',
    mutations: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    ttlMinutes: 10,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--intent') args.intent = argv[++index] || '';
    else if (arg === '--provider') args.provider = argv[++index] || '';
    else if (arg === '--account-label') args.accountLabel = argv[++index] || '';
    else if (arg === '--scopes') args.scopes = argv[++index] || '';
    else if (arg === '--browser-profile') args.browserProfile = argv[++index] || '';
    else if (arg === '--browser-session') args.browserSession = argv[++index] || '';
    else if (arg === '--cookie-policy') args.cookiePolicy = argv[++index] || '';
    else if (arg === '--screenshot-policy') args.screenshotPolicy = argv[++index] || '';
    else if (arg === '--selected-files') args.selectedFiles = argv[++index] || '';
    else if (arg === '--draft') args.draft = argv[++index] || '';
    else if (arg === '--recipients') args.recipients = argv[++index] || '';
    else if (arg === '--calendar') args.calendar = argv[++index] || '';
    else if (arg === '--document') args.document = argv[++index] || '';
    else if (arg === '--mutations') args.mutations = argv[++index] || '';
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--ttl-minutes') args.ttlMinutes = Number(argv[++index] || args.ttlMinutes);
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) {
    args.intent = 'Prepare a follow-up email and tentative calendar hold from the selected note.';
    args.provider = 'gmail';
    args.accountLabel = 'j***@example.com';
    args.scopes = 'gmail.readonly,calendar.readonly';
    args.browserProfile = 'holoshell-fixture-profile';
    args.browserSession = 'draft-only';
    args.cookiePolicy = 'profile_cookies_visible_to_browser_only';
    args.selectedFiles = path.join('.tmp', 'holoshell', 'self-test', 'account-task-files.json');
    args.draft = JSON.stringify({
      emailDraft: {
        to: ['teammate@example.com'],
        subject: 'Follow-up',
        body: 'Draft only. Please review before send.',
      },
      calendarProposal: {
        title: 'Follow-up hold',
        timeZone: 'America/Phoenix',
      },
    });
    args.recipients = 'teammate@example.com';
    args.calendar = 'primary';
    args.mutations = 'send_email,create_calendar_event';
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'account-task-custody-latest.json');
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'account-task-custody-latest.js');
    args.receiptDir = path.join('.tmp', 'holoshell', 'self-test', 'account-task-custody-receipts');
    seedSelfTestFiles(args.selectedFiles);
  }

  if (!Number.isFinite(args.ttlMinutes) || args.ttlMinutes < 1) args.ttlMinutes = 10;
  return args;
}

function printHelp() {
  console.log(`HoloShell account task custody

Usage:
  node scripts/holoshell-account-task-custody.mjs --intent "draft follow-up" --provider gmail --account-label "j***@example.com" --scopes gmail.readonly --draft '{"emailDraft":{...}}'

Options:
  --intent <text>            Human task. Stored as a hash plus short redacted preview.
  --provider <name>          gmail, outlook, google-calendar, drive, local, etc.
  --account-label <text>     Redacted account label. Never pass raw secrets.
  --scopes <csv>             Provider/OAuth scopes already granted or requested.
  --browser-profile <text>   Browser/profile boundary label.
  --browser-session <text>   default, temporary, private, credential-bearing, draft-only.
  --cookie-policy <text>     Cookie/session policy.
  --screenshot-policy <text> Screenshot locality/redaction policy.
  --selected-files <path>    JSON array/object with local file paths to snapshot.
  --draft <json-or-text>     Draft proposal. Hashed and treated as immutable.
  --recipients <csv>         Email/message recipients for approval binding.
  --calendar <label>         Target calendar label for approval binding.
  --document <label>         Target document label for approval binding.
  --mutations <csv>          Proposed mutation kinds, e.g. send_email,create_calendar_event.
  --json                     Print the receipt.
  --self-test                Run fixture assertions.
`);
}

function seedSelfTestFiles(manifestPath) {
  const notePath = path.join('.tmp', 'holoshell', 'self-test', 'account-note.txt');
  writeText(notePath, 'Fixture note for account custody. No secrets.\n');
  writeText(manifestPath, `${JSON.stringify({ files: [notePath] }, null, 2)}\n`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function relativeRepoPath(filePath) {
  const resolved = resolveRepoPath(filePath);
  const rel = path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
  return rel.startsWith('..') ? '[outside-hololand-root]' : rel;
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  atomicWriteFile(resolved, text);
  return resolved;
}

function atomicWriteFile(resolvedPath, text) {
  const tempPath = `${resolvedPath}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolvedPath);
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function redactedPreview(value, max = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function parseDraft(value) {
  if (!value) return { kind: 'empty', value: {}, textPreview: '' };
  try {
    return { kind: 'json', value: JSON.parse(value), textPreview: '' };
  } catch {
    return { kind: 'text', value: { text: value }, textPreview: redactedPreview(value) };
  }
}

function fileListFromManifest(manifestPath) {
  if (!manifestPath) return [];
  const manifest = readJson(manifestPath, null);
  if (!manifest) return [];
  if (Array.isArray(manifest)) return manifest;
  if (Array.isArray(manifest.files)) return manifest.files;
  if (Array.isArray(manifest.selectedFiles)) return manifest.selectedFiles;
  return [];
}

function snapshotFiles(manifestPath) {
  return fileListFromManifest(manifestPath).map((entry) => {
    const rawPath = typeof entry === 'string' ? entry : entry.path || entry.file || '';
    const resolved = resolveRepoPath(rawPath);
    const visible = existsSync(resolved);
    const buffer = visible ? readFileSync(resolved) : Buffer.alloc(0);
    return {
      redactedPath: relativeRepoPath(resolved),
      visible,
      byteLength: visible ? buffer.length : 0,
      sha256: visible ? hashBuffer(buffer) : '',
      privacyClass: typeof entry === 'object' && entry.privacyClass ? entry.privacyClass : 'local_user_file',
      sourceMutationPerformed: false,
    };
  });
}

function classifyIntent(args, mutations) {
  const text = `${args.intent} ${mutations.join(' ')}`.toLowerCase();
  const kinds = [];
  if (/email|mail|reply|send/.test(text)) kinds.push('email');
  if (/calendar|meeting|event|schedule|hold/.test(text)) kinds.push('calendar');
  if (/doc|document|file|attachment|drive|sheet|spreadsheet/.test(text)) kinds.push('document');
  if (!kinds.length) kinds.push('general_account_task');
  return kinds;
}

function accountBoundary(args) {
  const scopes = splitCsv(args.scopes);
  const scopeClass = scopes.some((scope) => /(send|write|modify|calendar\.events|drive\.file)/i.test(scope))
    ? 'mutation_capable_scope'
    : scopes.length
      ? 'read_or_draft_scope'
      : 'scope_not_declared';
  const credentialAdjacent =
    args.provider !== 'local' || /credential|profile|cookie|account/i.test(`${args.browserSession} ${args.cookiePolicy}`);
  return {
    receiptType: 'account_boundary_receipt',
    boundaryVersion: 'hololand.holoshell.account-boundary.v0.1.0',
    provider: args.provider || 'unknown',
    redactedAccountLabel: args.accountLabel || 'not_declared',
    scopes,
    scopeClass,
    browserProfile: args.browserProfile || 'not_declared',
    browserSession: args.browserSession || 'not_declared',
    cookiePolicy: args.cookiePolicy || 'not_declared',
    screenshotPolicy: args.screenshotPolicy || 'local_only_redacted_or_manual_witness',
    credentialAdjacent,
    credentialExtrusionAllowed: false,
    accountMutationAllowedWithoutApproval: false,
    receiptsRequired: [
      'account_boundary_receipt',
      'draft_proposal_receipt',
      'immutable_draft_approval_receipt',
    ],
  };
}

function buildDraftReceipt(args, snapshots) {
  const parsedDraft = parseDraft(args.draft);
  const sourceHashes = snapshots.map((file) => file.sha256).filter(Boolean);
  const draftPayload = {
    kind: parsedDraft.kind,
    draft: parsedDraft.value,
    sourceHashes,
    provider: args.provider || 'unknown',
    targets: {
      recipients: splitCsv(args.recipients),
      calendar: args.calendar || '',
      document: args.document || '',
    },
  };
  return {
    receiptType: 'draft_proposal_receipt',
    draftKind: parsedDraft.kind,
    draftHash: hashValue(draftPayload),
    sourceHashes,
    textPreview: parsedDraft.textPreview,
    targets: draftPayload.targets,
    accountMutationPerformed: false,
    sourceFileMutationPerformed: false,
  };
}

function buildApproval(args, boundary, draftReceipt, mutations) {
  const approvalId = `acctap-${Date.now().toString(36)}-${shortHash({
    boundary,
    draftHash: draftReceipt.draftHash,
    mutations,
  })}`;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + args.ttlMinutes * 60 * 1000).toISOString();
  const needsApproval = mutations.some((mutation) => ACCOUNT_MUTATION_KINDS.has(mutation));
  return {
    receiptType: 'immutable_draft_approval_receipt',
    approvalId,
    nonce,
    status: needsApproval ? 'pending_user_approval' : 'not_required',
    expiresAt,
    requiresFreshUserGesture: needsApproval,
    executionAllowed: false,
    executionDefault: 'draft_only_no_connector_mutation',
    draftHash: draftReceipt.draftHash,
    provider: boundary.provider,
    redactedAccountLabel: boundary.redactedAccountLabel,
    targetRecipients: draftReceipt.targets.recipients,
    targetCalendar: draftReceipt.targets.calendar,
    targetDocument: draftReceipt.targets.document,
    proposedMutations: mutations,
    rollbackLimits: rollbackLimitsFor(mutations),
    blockedReason: needsApproval
      ? 'Account mutation is draft-bound but no connector execution path is enabled by this adapter.'
      : '',
  };
}

function rollbackLimitsFor(mutations) {
  return mutations.map((mutation) => {
    if (mutation === 'send_email' || mutation === 'reply_email') {
      return { mutation, rollback: 'follow_up_only_after_send' };
    }
    if (mutation === 'share_link') return { mutation, rollback: 'revoke_link_if_provider_allows' };
    if (mutation === 'upload_cloud_file') return { mutation, rollback: 'delete_uploaded_copy_if_provider_allows' };
    if (mutation.includes('calendar')) return { mutation, rollback: 'cancel_or_update_event_if_provider_allows' };
    if (mutation.includes('document')) return { mutation, rollback: 'version_restore_if_provider_allows' };
    return { mutation, rollback: 'provider_specific' };
  });
}

function buildReceipt(args) {
  const generatedAt = new Date().toISOString();
  const mutations = splitCsv(args.mutations);
  const snapshots = snapshotFiles(args.selectedFiles);
  const boundary = accountBoundary(args);
  const draftReceipt = buildDraftReceipt(args, snapshots);
  const approval = buildApproval(args, boundary, draftReceipt, mutations);
  const intentKinds = classifyIntent(args, mutations);
  const status = approval.status === 'pending_user_approval' ? 'draft_ready_approval_required' : 'draft_ready';

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    custodyId: `acct-${Date.now().toString(36)}-${shortHash({ args, draftHash: draftReceipt.draftHash })}`,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-account-task-custody.hsplus',
      adapter: 'scripts/holoshell-account-task-custody.mjs',
      experimentRoom: 'experiments/holoshell-human-os-frontier/account-task-custody-room.holo',
      experimentPolicy: 'experiments/holoshell-human-os-frontier/account-task-custody-policy.hsplus',
      experimentPipeline: 'experiments/holoshell-human-os-frontier/account-task-custody-pipeline.hs',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    intent: {
      preview: redactedPreview(args.intent),
      sha256: hashValue(args.intent || ''),
      kinds: intentKinds,
    },
    accountBoundary: boundary,
    sourceFiles: {
      manifestPath: args.selectedFiles ? relativeRepoPath(args.selectedFiles) : '',
      fileCount: snapshots.length,
      files: snapshots,
      sourceMutationPerformed: false,
    },
    draft: draftReceipt,
    approval,
    policy: {
      readOnlyAndDraftAllowed: true,
      accountMutationPerformed: false,
      connectorMutationEnabled: false,
      credentialExtrusionAllowed: false,
      approvalBoundToImmutableDraft: true,
      latestMutableActionBindingAllowed: false,
    },
    witness: {
      receiptHash: '',
      secretsCaptured: false,
    },
    summary: {
      status,
      provider: boundary.provider,
      accountBoundaryStatus: boundary.scopeClass,
      credentialAdjacent: boundary.credentialAdjacent,
      draftHash: draftReceipt.draftHash,
      proposedMutationCount: mutations.length,
      approvalRequired: approval.status === 'pending_user_approval',
      approvalId: approval.approvalId,
      executionAllowed: approval.executionAllowed,
      accountMutationPerformed: false,
      sourceFileMutationPerformed: false,
      fileCount: snapshots.length,
    },
  };
}

function writeBrowserBootstrap(filePath, receipt) {
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_ACCOUNT_TASK_CUSTODY = ${payload};\n`);
}

function writeOutputs(args, receipt) {
  const receiptHash = hashValue({ ...receipt, witness: { ...receipt.witness, receiptHash: '' } });
  const withHash = {
    ...receipt,
    witness: {
      ...receipt.witness,
      receiptHash,
    },
  };
  const receiptPath = path.join(resolveRepoPath(args.receiptDir), `${withHash.custodyId}.json`);
  const outputPath = writeText(args.output, `${JSON.stringify(withHash, null, 2)}\n`);
  const jsOutputPath = writeBrowserBootstrap(args.jsOutput, withHash);
  writeText(receiptPath, `${JSON.stringify(withHash, null, 2)}\n`);
  return {
    ...withHash,
    output: {
      latestPath: outputPath,
      receiptPath,
      browserBootstrap: jsOutputPath,
    },
  };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schema version mismatch');
  if (receipt.summary.status !== 'draft_ready_approval_required') failures.push('expected approval-required draft');
  if (!receipt.accountBoundary.scopes.includes('gmail.readonly')) failures.push('expected scopes in account boundary');
  if (receipt.accountBoundary.credentialExtrusionAllowed !== false) failures.push('credential extrusion must stay false');
  if (!receipt.draft.draftHash) failures.push('missing draft hash');
  if (receipt.approval.draftHash !== receipt.draft.draftHash) failures.push('approval must bind to draft hash');
  if (!receipt.approval.requiresFreshUserGesture) failures.push('account mutation should require human gesture');
  if (receipt.approval.executionAllowed !== false) failures.push('adapter should not enable connector mutation');
  if (receipt.policy.latestMutableActionBindingAllowed !== false) failures.push('must reject latest mutable binding');
  if (!receipt.approval.rollbackLimits.some((limit) => limit.rollback === 'follow_up_only_after_send')) {
    failures.push('sent email rollback limit should be visible');
  }
  if (receipt.summary.accountMutationPerformed) failures.push('self-test must not mutate accounts');
  if (receipt.summary.sourceFileMutationPerformed) failures.push('self-test must not mutate source files');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const receipt = buildReceipt(args);
  const written = writeOutputs(args, receipt);
  if (args.selfTest) assertSelfTest(written);

  if (args.json) {
    console.log(JSON.stringify(written, null, 2));
  } else {
    console.log(`HoloShell account task custody: ${written.output.latestPath}`);
    console.log(`Receipt: ${written.output.receiptPath}`);
    console.log(`Status: ${written.summary.status}`);
    console.log(`Provider: ${written.summary.provider}`);
    console.log(`Approval required: ${written.summary.approvalRequired ? 'yes' : 'no'}`);
  }
} catch (error) {
  console.error(`holoshell-account-task-custody failed: ${error.message}`);
  process.exit(1);
}
