#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const docPath = resolve(root, 'docs/BRITTNEY_ACCESS_CONTRACT.md');
const doc = readFileSync(docPath, 'utf8');

const requiredModeLabels = [
  'Local GGUF',
  'Local/LAN Ollama',
  'BYOK cloud',
  'Managed HoloLand service',
  'HoloScript CLI/MCP',
  'In-world NPC/steward embodiment',
];

const requiredModeSlugs = [
  'local_gguf',
  'local_lan_ollama',
  'byok_cloud',
  'managed_hololand_service',
  'holoscript_cli_mcp',
  'in_world_npc_steward',
];

const requiredDeclarationFields = [
  'supported_modes',
  'unsupported_modes',
  'receipt_behavior',
  'fallback_order',
  'cost_ceiling',
  'privacy_boundary',
  'source_contract',
];

const requiredReceiptFields = [
  'actor',
  'source',
  'route',
  'world_effect',
  'storage',
];

const failures = [];

for (const label of requiredModeLabels) {
  if (!doc.includes(label)) {
    failures.push(`missing access mode label: ${label}`);
  }
}

for (const slug of requiredModeSlugs) {
  if (!doc.includes(slug)) {
    failures.push(`missing feature declaration mode slug: ${slug}`);
  }
}

for (const field of requiredDeclarationFields) {
  if (!doc.includes(`${field}:`)) {
    failures.push(`missing declaration field: ${field}`);
  }
}

for (const field of requiredReceiptFields) {
  if (!doc.includes(`${field}:`)) {
    failures.push(`missing receipt behavior field: ${field}`);
  }
}

for (const requiredPhrase of [
  'Brittney is an intelligence lineage, not a monopoly endpoint',
  'Managed HoloLand service must never be the only documented access path',
  'Reject a new Brittney feature if it only describes a remote chat endpoint',
]) {
  if (!doc.includes(requiredPhrase)) {
    failures.push(`missing contract phrase: ${requiredPhrase}`);
  }
}

if (failures.length > 0) {
  console.error('[brittney-access-contract] failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[brittney-access-contract] ok');
console.log(`checked ${requiredModeLabels.length} modes and ${requiredDeclarationFields.length} declaration fields`);
