#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'holoshell-photo-backup-'));

function fail(message) {
  throw new Error(message);
}

function run(args) {
  const result = spawnSync(process.execPath, ['scripts/holoshell-photo-backup-custody.mjs', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

try {
  const albumDir = path.join(TMP, 'album-root');
  mkdirSync(path.join(albumDir, 'summer'), { recursive: true });
  mkdirSync(path.join(albumDir, 'winter'), { recursive: true });
  writeFileSync(path.join(albumDir, 'summer', 'img-001.jpg'), 'same-photo\n', 'utf8');
  writeFileSync(path.join(albumDir, 'summer', 'img-001-copy.jpg'), 'same-photo\n', 'utf8');
  writeFileSync(path.join(albumDir, 'winter', 'clip-001.mov'), 'movie-bytes\n', 'utf8');

  const output = path.join(TMP, 'custody.json');
  const jsOutput = path.join(TMP, 'custody.js');
  const receiptDir = path.join(TMP, 'receipts');
  run([
    '--album-dir', albumDir,
    '--output', output,
    '--js-output', jsOutput,
    '--receipt-dir', receiptDir,
    '--self-test',
    '--json',
  ]);

  const receipt = JSON.parse(readFileSync(output, 'utf8'));
  if (receipt.summary.photoCount !== 2) fail('expected two photos');
  if (receipt.summary.videoCount !== 1) fail('expected one video');
  if (receipt.summary.duplicateGroupCount !== 1) fail('expected one duplicate group');
  if (receipt.summary.originalsDeleted !== false) fail('expected originalsDeleted=false');
  if (receipt.summary.deleteBlocked !== true) fail('expected deleteBlocked=true');
  if (receipt.summary.restoreVerified !== false) fail('expected restoreVerified=false');
  if (JSON.stringify(receipt).includes(albumDir)) fail('public receipt leaked absolute album path');
  if (!readFileSync(jsOutput, 'utf8').includes('HOLOSHELL_PHOTO_BACKUP_CUSTODY')) {
    fail('expected browser bootstrap global');
  }

  console.log('holoshell-photo-backup-custody test passed');
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
