#!/usr/bin/env node
// Test: HoloShell founder prompt fixtures
//
// Verifies that:
//   1. The fixture generator extracts prompt anchors from docs, memory, and knowledge files.
//   2. Secret-like lines are skipped.
//   3. Brittney turn self-test receipts consume selected fixtures.
//   4. Source/deploy contracts reference the fixture lane.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE_ROOT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'founder-prompt-fixtures');
const DOCS_ROOT = path.join(FIXTURE_ROOT, 'docs');
const MEMORY_ROOT = path.join(FIXTURE_ROOT, 'memory');
const KNOWLEDGE_FILE = path.join(FIXTURE_ROOT, 'knowledge.ndjson');
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'founder-prompt-fixtures.json');

rmSync(FIXTURE_ROOT, { recursive: true, force: true });
mkdirSync(DOCS_ROOT, { recursive: true });
mkdirSync(MEMORY_ROOT, { recursive: true });

writeFileSync(
  path.join(DOCS_ROOT, 'vision.md'),
  [
    '# Founder Vision',
    '',
    '> "Brittney should operate the whole system through HoloShell receipts."',
    '',
    'Founder direction: HoloScript is the language for agents and 3D worlds.',
    '',
    'API_KEY="do-not-include-this-secret-like-line"',
  ].join('\n'),
  'utf8',
);

writeFileSync(
  path.join(MEMORY_ROOT, 'user_founder-vision.md'),
  [
    '---',
    'name: user_founder-vision',
    'type: user',
    '---',
    '',
    '> "Give humans and agents tools to earn the economies we build."',
    '',
    'Joseph wants the Jetson to keep Brittney sovereign and local-first.',
  ].join('\n'),
  'utf8',
);

writeFileSync(
  KNOWLEDGE_FILE,
  `${JSON.stringify({
    id: 'knowledge-founder-1',
    type: 'wisdom',
    content: 'Founder wisdom: HoloShell should prove actions with receipts before claiming autonomy.',
  })}\n`,
  'utf8',
);

const generator = spawnSync(
  process.execPath,
  [
    'scripts/holoshell-founder-prompt-fixtures.mjs',
    '--source', DOCS_ROOT,
    '--source', MEMORY_ROOT,
    '--source', KNOWLEDGE_FILE,
    '--out', OUTPUT,
    '--limit', '12',
    '--json',
  ],
  { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true },
);

assert.equal(generator.status, 0, `fixture generator failed:\n${generator.stderr || generator.stdout}`);
assert.ok(existsSync(OUTPUT), 'fixture JSON must be written');

const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));
assert.equal(receipt.schemaVersion, 'hololand.holoshell.founder-prompt-fixtures.v0.1.0');
assert.ok(receipt.sourceSummary.fixtureCount >= 3, `expected at least 3 fixtures, got ${receipt.sourceSummary.fixtureCount}`);
assert.ok(receipt.sourceSummary.sourceKinds.includes('documentation'), 'documentation fixture missing');
assert.ok(receipt.sourceSummary.sourceKinds.includes('memory'), 'memory fixture missing');
assert.ok(receipt.sourceSummary.sourceKinds.includes('knowledge'), 'knowledge fixture missing');
assert.equal(receipt.policy.trainingCorpus, false, 'fixtures must not be marked as training corpus');
assert.equal(receipt.policy.rawSecretsIncluded, false, 'fixtures must not include secrets');
assert.doesNotMatch(JSON.stringify(receipt), /do-not-include-this-secret-like-line/, 'secret-like line leaked into fixture output');
assert.match(receipt.sourceSummary.corpusHash, /^[a-f0-9]{64}$/, 'corpus hash must be sha256');

const turn = spawnSync(
  process.execPath,
  [
    'scripts/holoshell-brittney-turn.mjs',
    '--prompt', 'Brittney, use founder inspiration to inspect HoloShell and explain the next receipt.',
    '--self-test',
    '--json',
  ],
  { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 90_000 },
);

assert.equal(turn.status, 0, `brittney turn self-test failed:\n${turn.stderr || turn.stdout}`);
const turnReceipt = JSON.parse(turn.stdout.slice(turn.stdout.indexOf('{')));
assert.equal(turnReceipt.summary.status, 'completed', 'self-test turn must complete');
assert.equal(turnReceipt.summary.founderPromptFixtureStatus, 'ready', 'turn must see founder prompt fixtures');
assert.ok(turnReceipt.summary.founderPromptFixtureCount >= 1, 'turn must select at least one fixture');
assert.equal(turnReceipt.summary.founderPromptFixtureCorpusHash, receipt.sourceSummary.corpusHash, 'turn must report generated corpus hash');
assert.ok(turnReceipt.shellContext.founderPromptFixtures, 'shell context must include fixture selection');
assert.ok(turnReceipt.shellContext.founderPromptFixtures.items.length <= 3, 'runtime must select at most 3 fixtures');
assert.match(turnReceipt.sourceAnchors.founderPromptSource, /holoshell-founder-prompt-fixtures\.hsplus/);
assert.match(turnReceipt.sourceAnchors.founderPromptFixtures, /founder-prompt-fixtures\.json/);

const sourceContractPath = path.join(REPO_ROOT, 'apps', 'holoshell', 'source', 'holoshell-founder-prompt-fixtures.hsplus');
assert.ok(existsSync(sourceContractPath), 'source contract file must exist');
const sourceContract = readFileSync(sourceContractPath, 'utf8');
assert.match(sourceContract, /FixturesArePromptTestsNotTrainingData/, 'source contract must define training boundary policy');
assert.match(sourceContract, /FounderWordsStayLocalAndSourceHashed/, 'source contract must define locality/hash policy');
assert.match(sourceContract, /RuntimeConsumesSelectedFixturesOnly/, 'source contract must define selected-fixtures-only policy');

const deployScript = readFileSync(path.join(REPO_ROOT, 'scripts', 'deploy-holoshell-to-jetson.sh'), 'utf8');
assert.match(deployScript, /holoshell-founder-prompt-fixtures\.mjs/, 'deploy script must generate/copy fixture script');
assert.match(deployScript, /founder-prompt-fixtures\.json/, 'deploy script must copy fixture JSON');

console.log('Founder prompt fixture generator test: OK');
console.log(`Founder prompt fixtures: ${receipt.sourceSummary.fixtureCount} (corpus ${receipt.sourceSummary.corpusHash})`);
console.log('Brittney turn fixture consumption test: OK');
