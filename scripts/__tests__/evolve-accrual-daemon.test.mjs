#!/usr/bin/env node
/**
 * Pure Node regression tests for scripts/evolve-accrual-daemon.mjs.
 *
 * Run via: node scripts/__tests__/evolve-accrual-daemon.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'evolve-accrual-daemon.mjs');

let testsRun = 0;

function test(name, fn) {
  fn();
  testsRun += 1;
  console.log(`  PASS ${name}`);
}

test('once mode fails loudly when an OpenAI-compatible endpoint is down', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evolve-accrual-daemon-'));
  const corpus = join(dir, 'trace.jsonl');
  const result = spawnSync(process.execPath, [SCRIPT, '--once'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      HOLOSCRIPT_AGENT_EVOLVE_CORPUS: corpus,
      HOLOSCRIPT_AGENT_EVOLVE_OPENAI_BASE_URL: 'http://127.0.0.1:9',
      HOLOSCRIPT_AGENT_EVOLVE_MODEL: 'offline-test-model',
      HOLOSCRIPT_AGENT_EVOLVE_PROTOCOL: 'openai-compatible',
      HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL: '',
      HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL: '',
      HOLOSCRIPT_AGENT_EVOLVE_MAX_TICKS: '',
    },
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /"ev":"accrual-daemon-start"/);
  assert.match(result.stdout, /"protocol":"openai-compatible"/);
  assert.match(result.stdout, /"ev":"accrual-error"/);
  assert.match(result.stdout, /"ev":"accrual-daemon-done"/);
  assert.match(result.stdout, /"errors":1/);
});

console.log(`\n${testsRun}/${testsRun} tests passed`);
