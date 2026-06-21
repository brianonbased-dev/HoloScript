#!/usr/bin/env node
/**
 * Local HoloShell download-recovery runtime.
 *
 * Mirrors the public MCP holoshell_download_recovery_* surface for the local
 * stdio server, but stays runnable under plain `node` by avoiding TS/Zod imports.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
const SHELF_DIR =
  process.env.HOLOSHELL_DOWNLOAD_SHELF || join(HOME, '.ai-ecosystem', 'holoshell', 'downloads');
const TEAM_RECEIPT_FILE =
  process.env.HOLOSHELL_TEAM_AUTOMATION_RECEIPTS ||
  join(
    HOME,
    '.ai-ecosystem',
    'runtime',
    'shared',
    'holoshell',
    'team-automations',
    'receipts.jsonl'
  );

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function ensureShelf() {
  ensureDir(SHELF_DIR);
}

function loadReceipts(filterStatus) {
  ensureShelf();
  const statusSet =
    Array.isArray(filterStatus) && filterStatus.length > 0 ? new Set(filterStatus) : null;
  return readdirSync(SHELF_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return { ...JSON.parse(readFileSync(join(SHELF_DIR, file), 'utf8')), _file: file };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((receipt) => !statusSet || statusSet.has(receipt.status));
}

function persistReceipt(receipt) {
  ensureShelf();
  const id = receipt.id || `rec-${Date.now()}`;
  const file = join(SHELF_DIR, `${id}.json`);
  const { _file, ...persisted } = receipt;
  writeFileSync(
    file,
    JSON.stringify({ ...persisted, id, updatedAt: new Date().toISOString() }, null, 2)
  );
  return { id, file };
}

function findReceipt(id) {
  const receipt = loadReceipts().find((item) => item.id === id || item._file?.includes(id));
  if (!receipt) throw new Error('Receipt not found');
  return receipt;
}

function freshGestureGuard(input) {
  if (!input.freshUserGesture) {
    throw new Error('freshUserGesture=true is required for this mutating action');
  }
}

function randomHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function appendTeamReceipt(tool, result, ok = true) {
  ensureDir(dirname(TEAM_RECEIPT_FILE));
  const envelope = {
    schema: 'holoshell.download-recovery.receipt.v1',
    skill: 'holoshell',
    holoGateStages: ['identify', 'scope', 'log'],
    tool,
    ok,
    loggedAt: new Date().toISOString(),
    result,
  };
  appendFileSync(TEAM_RECEIPT_FILE, `${JSON.stringify(envelope)}\n`, 'utf8');
}

async function listDownloads(input) {
  const receipts = loadReceipts(input.statusFilter);
  return {
    success: true,
    count: receipts.length,
    receipts,
    shelfPath: SHELF_DIR,
  };
}

async function resumeDownload(input) {
  freshGestureGuard(input);
  const receipt = findReceipt(String(input.id));
  if (receipt.status !== 'interrupted') {
    throw new Error('Only interrupted downloads can be resumed');
  }

  const updated = {
    ...receipt,
    status: 'pending_consent',
    resume: {
      offset: input.offset ?? receipt.bytesReceived,
      startedAt: new Date().toISOString(),
    },
  };
  persistReceipt(updated);

  return {
    success: true,
    resumeReceipt: {
      type: 'holoshell_download_resume_receipt',
      downloadId: receipt.id,
      offset: input.offset ?? receipt.bytesReceived,
      consentTimestamp: new Date().toISOString(),
      substrateMetadata: {
        hardwareSeat: process.env.HOLOSHELL_HARDWARE_SEAT || 'local-holoshell',
        witnessHash: randomHex(8),
      },
    },
    updatedShelfEntry: updated,
  };
}

async function quarantineDownload(input) {
  freshGestureGuard(input);
  const receipt = findReceipt(String(input.id));
  const updated = {
    ...receipt,
    status: 'quarantined',
    quarantineReason: input.reason,
  };
  persistReceipt(updated);

  return {
    success: true,
    quarantineReceipt: {
      type: 'holoshell_download_quarantine_receipt',
      downloadId: receipt.id,
      reason: input.reason,
      timestamp: new Date().toISOString(),
      substrateMetadata: { hardwareSeat: process.env.HOLOSHELL_HARDWARE_SEAT || 'local-holoshell' },
    },
    updatedShelfEntry: updated,
  };
}

async function forensicExport(input) {
  const receipt = findReceipt(String(input.id));
  const exportDir = join(SHELF_DIR, 'forensic-exports');
  ensureDir(exportDir);

  const bundlePath = join(exportDir, `forensic-${receipt.id}-${Date.now()}.json`);
  const bundle = {
    originalReceipt: receipt,
    exportedAt: new Date().toISOString(),
    hardwareSeat: process.env.HOLOSHELL_HARDWARE_SEAT || 'local-holoshell',
    fullTraceIncluded: Boolean(input.includeFullTrace),
  };
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

  const hash = sha256File(bundlePath);
  return {
    success: true,
    bundlePath,
    bundleHash: hash,
    receipt: {
      type: 'holoshell_download_forensic_export_receipt',
      downloadId: receipt.id,
      hash,
    },
  };
}

async function importHandoff(input) {
  freshGestureGuard(input);
  const receipt = findReceipt(String(input.id));
  if (receipt.status !== 'complete' || receipt.integrityBadge !== 'green') {
    throw new Error('Only green complete downloads can be handed off to Import Shelf');
  }

  const handoffReceipt = {
    type: 'holoshell_download_import_handoff_receipt',
    downloadId: receipt.id,
    targetShardOrAssetId: input.targetShardOrAssetId || `import-${Date.now()}`,
    provenanceLink: receipt.lastChunkHash,
    witnessHash: randomHex(16),
    timestamp: new Date().toISOString(),
    substrateMetadata: {
      hardwareSeat: process.env.HOLOSHELL_HARDWARE_SEAT || 'local-holoshell',
      continuousParticipation: true,
    },
  };

  const updated = { ...receipt, status: 'handed_off', handoff: handoffReceipt };
  persistReceipt(updated);

  return { success: true, handoffReceipt, updatedShelfEntry: updated };
}

export const holoshellDownloadRecoveryToolDefinitions = [
  {
    name: 'holoshell_download_recovery_list',
    description:
      'List interrupted, quarantined, pending_consent, or complete downloads from the local HoloShell shelf.',
    inputSchema: {
      type: 'object',
      properties: {
        statusFilter: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['interrupted', 'quarantined', 'pending_consent', 'complete'],
          },
        },
      },
    },
  },
  {
    name: 'holoshell_download_recovery_resume',
    description:
      'Resume an interrupted download. Requires freshUserGesture and emits a local custody receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        freshUserGesture: { type: 'boolean' },
        offset: { type: 'number' },
      },
      required: ['id', 'freshUserGesture'],
    },
  },
  {
    name: 'holoshell_download_recovery_quarantine',
    description:
      'Quarantine a suspect download. Requires freshUserGesture and records the quarantine reason.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        freshUserGesture: { type: 'boolean' },
        reason: {
          type: 'string',
          enum: ['exec', 'mime_mismatch', 'size_anomaly', 'provider_revoke', 'manual'],
        },
      },
      required: ['id', 'freshUserGesture', 'reason'],
    },
  },
  {
    name: 'holoshell_download_recovery_forensic_export',
    description: 'Export a quarantined download bundle for forensic replay and hashing.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        includeFullTrace: { type: 'boolean' },
      },
      required: ['id'],
    },
  },
  {
    name: 'holoshell_download_recovery_import_handoff',
    description:
      'Hand off a green complete download to the Import Shelf. Requires freshUserGesture.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        freshUserGesture: { type: 'boolean' },
        targetShardOrAssetId: { type: 'string' },
      },
      required: ['id', 'freshUserGesture'],
    },
  },
];

const handlers = new Map([
  ['holoshell_download_recovery_list', listDownloads],
  ['holoshell_download_recovery_resume', resumeDownload],
  ['holoshell_download_recovery_quarantine', quarantineDownload],
  ['holoshell_download_recovery_forensic_export', forensicExport],
  ['holoshell_download_recovery_import_handoff', importHandoff],
]);

export async function callHoloshellDownloadRecoveryTool(name, args = {}) {
  const handler = handlers.get(name);
  if (!handler) throw new Error(`Unknown HoloShell download recovery tool: ${name}`);

  try {
    const result = await handler(args);
    appendTeamReceipt(name, result, true);
    return result;
  } catch (error) {
    const result = { error: error instanceof Error ? error.message : String(error) };
    appendTeamReceipt(name, result, false);
    throw error;
  }
}
