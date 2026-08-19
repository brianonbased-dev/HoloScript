import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.tmp', 'holoshell', 'test-account-task-custody');
const sourceNote = path.join(testRoot, 'follow-up-note.txt');
const filesManifest = path.join(testRoot, 'selected-files.json');
const latest = path.join(testRoot, 'account-task-custody-latest.json');
const latestJs = path.join(testRoot, 'account-task-custody-latest.js');
const receiptDir = path.join(testRoot, 'receipts');

function resetTestRoot() {
  rmSync(testRoot, { recursive: true, force: true });
  mkdirSync(testRoot, { recursive: true });
  writeFileSync(sourceNote, 'Meeting notes. Draft only. No credentials.\n', 'utf8');
  writeFileSync(
    filesManifest,
    `${JSON.stringify({ files: [{ path: sourceNote, privacyClass: 'local_note' }] }, null, 2)}\n`,
    'utf8'
  );
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

resetTestRoot();

runNode(['scripts/holoshell-account-task-custody.mjs', '--self-test', '--json']);

const receipt = runNode([
  'scripts/holoshell-account-task-custody.mjs',
  '--intent',
  'Draft a follow-up email and calendar hold from my note, but do not send anything.',
  '--provider',
  'outlook',
  '--account-label',
  'j***@example.com',
  '--scopes',
  'mail.read,calendars.read',
  '--browser-profile',
  'work-profile-redacted',
  '--browser-session',
  'draft-only',
  '--cookie-policy',
  'profile_cookies_visible_to_browser_only',
  '--selected-files',
  filesManifest,
  '--draft',
  JSON.stringify({
    emailDraft: {
      to: ['person@example.com'],
      subject: 'Follow-up',
      body: 'Draft only.',
    },
    calendarProposal: {
      title: 'Follow-up hold',
      timeZone: 'America/Phoenix',
    },
  }),
  '--recipients',
  'person@example.com',
  '--calendar',
  'primary',
  '--mutations',
  'send_email,create_calendar_event',
  '--output',
  latest,
  '--js-output',
  latestJs,
  '--receipt-dir',
  receiptDir,
  '--json',
]);

assert.equal(receipt.summary.status, 'draft_ready_approval_required');
assert.equal(receipt.summary.provider, 'outlook');
assert.equal(receipt.summary.accountMutationPerformed, false);
assert.equal(receipt.summary.sourceFileMutationPerformed, false);
assert.equal(receipt.accountBoundary.redactedAccountLabel, 'j***@example.com');
assert.equal(receipt.accountBoundary.credentialExtrusionAllowed, false);
assert.deepEqual(receipt.accountBoundary.scopes, ['mail.read', 'calendars.read']);
assert.equal(receipt.sourceFiles.fileCount, 1);
assert.ok(receipt.sourceFiles.files[0].sha256);
assert.equal(receipt.draft.accountMutationPerformed, false);
assert.ok(receipt.draft.draftHash);
assert.equal(receipt.approval.draftHash, receipt.draft.draftHash);
assert.equal(receipt.approval.requiresFreshUserGesture, true);
assert.equal(receipt.approval.executionAllowed, false);
assert.equal(receipt.policy.approvalBoundToImmutableDraft, true);
assert.equal(receipt.policy.latestMutableActionBindingAllowed, false);
assert.ok(receipt.approval.rollbackLimits.some((item) => item.mutation === 'send_email'));
assert.match(readFileSync(latestJs, 'utf8'), /HOLOSHELL_ACCOUNT_TASK_CUSTODY/);
assert.ok(existsSync(receipt.output.receiptPath));

console.log('holoshell account task custody regression passed');
