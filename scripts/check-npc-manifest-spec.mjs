import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(repoRoot, 'docs', 'specs', 'hololand-npc-manifest.schema.json');
const holoPath = path.join(repoRoot, 'docs', 'specs', 'hololand-npc-manifest.holo');
const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findHoloScriptRoot() {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(repoRoot, '..', 'HoloScript')
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json')));
}

function findHoloScriptCli(holoscriptRoot) {
  if (!holoscriptRoot) return null;
  const cliPath = path.join(holoscriptRoot, 'packages', 'cli', 'bin', 'holoscript.cjs');
  return fs.existsSync(cliPath) ? cliPath : null;
}

function run(command, args, options = {}) {
  if (process.platform === 'win32' && command === 'pnpm') {
    const quote = (arg) => {
      const value = String(arg);
      return /\s/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    };
    return spawnSync('cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args.map(quote)].join(' ')], {
      encoding: 'utf8',
      windowsHide: true,
      ...options
    });
  }

  return spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options
  });
}

const schema = readJson(schemaPath);
check(schema.$id === 'https://hololand.dev/schemas/hololand-npc-manifest.schema.json', 'schema $id must stay stable');

const requiredTopLevel = [
  'verbalFingerprint',
  'vocabularyRegister',
  'autonomousAgenda',
  'reputationLedger',
  'speechAwareEncounter',
  'wontExplainTopic',
  'privacyDeletion',
  'costCeiling',
  'transcriptAttributionTest'
];

for (const field of ['wontExplainTopic', 'privacyDeletion', 'costCeiling', 'transcriptAttributionTest']) {
  check(schema.required?.includes(field), `top-level required field missing: ${field}`);
}

const traitRequired = schema.$defs?.traits?.required || [];
for (const trait of ['verbalFingerprint', 'vocabularyRegister', 'autonomousAgenda', 'reputationLedger', 'speechAwareEncounter']) {
  check(traitRequired.includes(trait), `traits.required missing ${trait}`);
}

for (const definition of requiredTopLevel) {
  check(Boolean(schema.$defs?.[definition] || schema.properties?.[definition]), `schema missing definition/property for ${definition}`);
}

const citations = schema.$defs?.source?.properties?.researchCitations?.items?.enum || [];
check(
  citations.includes('C:/Users/josep/.ai-ecosystem/research/2026-05-10_shangri-la-frontier-npc-feel-EVOLVED.md'),
  'schema must cite the Shangri-La NPC research path'
);

const transcript = schema.$defs?.transcriptAttributionTest?.properties || {};
check(transcript.sampleLineCount?.minimum === 20, 'transcriptAttributionTest.sampleLineCount minimum must be 20');
check(transcript.minBlindAccuracy?.minimum === 0.8, 'transcriptAttributionTest.minBlindAccuracy minimum must be 0.8');

const behaviorFactLog = schema.$defs?.reputationLedger?.properties?.behaviorFactLog?.properties || {};
check(behaviorFactLog.maxFacts?.default === 20, 'reputationLedger behaviorFactLog default maxFacts must be 20');
check(behaviorFactLog.ttlDays?.default === 90, 'reputationLedger behaviorFactLog default ttlDays must be 90');

const cost = schema.$defs?.costCeiling?.properties || {};
check(cost.dailyUsd?.default === 0.5, 'costCeiling.dailyUsd default must be 0.5');

const holoText = fs.readFileSync(holoPath, 'utf8');
for (const token of requiredTopLevel) {
  check(holoText.includes(token), `holo contract must mention ${token}`);
}

const holoscriptRoot = findHoloScriptRoot();
check(Boolean(holoscriptRoot), 'Unable to find HoloScript root. Set HOLOSCRIPT_ROOT.');
if (holoscriptRoot) {
  const cliPath = findHoloScriptCli(holoscriptRoot);
  const parseResult = cliPath
    ? run(process.execPath, [cliPath, 'parse', holoPath], {
        cwd: repoRoot,
        timeout: 120000
      })
    : run('pnpm', ['exec', 'holoscript', 'parse', holoPath], {
        cwd: holoscriptRoot,
        timeout: 120000
      });
  check(parseResult.status === 0, `HoloScript parse failed: ${(parseResult.stderr || parseResult.stdout || '').trim()}`);
}

if (failures.length > 0) {
  console.error('[npc-manifest-spec] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[npc-manifest-spec] PASS HoloLand NPC manifest schema and HoloScript contract validated.');
