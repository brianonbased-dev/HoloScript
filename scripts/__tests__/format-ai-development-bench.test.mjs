#!/usr/bin/env node
/**
 * Smoke test for benchmarks/format-ai-development/run.mjs.
 */

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'benchmarks', 'format-ai-development', 'run.mjs');

let testsRun = 0;
let testsFailed = 0;

const tmp = mkdtempSync(path.join(os.tmpdir(), 'format-ai-development-bench-'));
const resultPath = path.join(tmp, 'result.json');
const markdownPath = path.join(tmp, 'result.md');

try {
  writeFixture(tmp);
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT,
      '--repo',
      tmp,
      '--out',
      resultPath,
      '--markdown-out',
      markdownPath,
      '--generated-at',
      '2026-06-27T00:00:00.000Z',
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );

  assertEq(result.status, 0, 'benchmark exits 0');

  const summary = JSON.parse(readFileSync(resultPath, 'utf8'));
  const markdown = readFileSync(markdownPath, 'utf8');

  assertEq(summary.schema, 'holoscript.format-ai-development-benchmark.v0.1.0', 'schema is stable');
  assertEq(summary.corpus.files, 3, 'finds the three native fixture files');
  assertEq(summary.corpus.formats.holo, 1, 'counts .holo');
  assertEq(summary.corpus.formats.hsplus, 1, 'counts .hsplus');
  assertEq(summary.corpus.formats.hs, 1, 'counts .hs');
  assertEq(summary.baselineComparisons.length, 1, 'finds paired handwritten baseline');
  assertGt(
    summary.baselineComparisons[0].compression.tokenRatio,
    1,
    'native fixture is smaller than handwritten baseline'
  );
  assertContains(markdown, 'Claim Status', 'writes claim status section');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`FAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`PASS ${testsRun} assertions`);

function writeFixture(root) {
  const scenarioDir = path.join(root, 'benchmarks', 'scenarios', '01-basic-scene');
  const baselineDir = path.join(scenarioDir, 'unity-handwritten');
  const brainDir = path.join(root, 'compositions');
  const pipelineDir = path.join(root, 'pipelines');
  mkdirSync(baselineDir, { recursive: true });
  mkdirSync(brainDir, { recursive: true });
  mkdirSync(pipelineDir, { recursive: true });

  writeFileSync(
    path.join(scenarioDir, 'basic-scene.holo'),
    `metadata { title: "Fixture" }
environment { lighting: "studio" }
object Cube {
  @grabbable
  @rigidbody(mass: 1)
  position: [0, 1, 0]
}
behavior {
  on "grab" { emit "picked_up" }
}
`,
    'utf8'
  );

  writeFileSync(
    path.join(brainDir, 'agent-brain.hsplus'),
    `identity { name: "fixture-agent" capability_tags: ["scene"] }
state AgentState { mode: "idle" }
action choose_task { input: "board" output: "task" }
behavior on_task {
  recall
  llm_call
  reflect
}
`,
    'utf8'
  );

  writeFileSync(
    path.join(pipelineDir, 'ingest.hs'),
    `pipeline "Ingest" {
source "files" { path: "./data" }
transform "normalize" { into: "rows" }
sink "jsonl" { path: "./out.jsonl" }
}
`,
    'utf8'
  );

  writeFileSync(
    path.join(baselineDir, 'BasicSceneSetup.cs'),
    `using UnityEngine;
public class BasicSceneSetup : MonoBehaviour {
  public GameObject cube;
  void Start() {
    cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
    cube.transform.position = new Vector3(0, 1, 0);
    var rb = cube.AddComponent<Rigidbody>();
    rb.mass = 1.0f;
  }
  void Update() {
    if (Input.GetKeyDown(KeyCode.G)) {
      Debug.Log("picked_up");
    }
  }
}
`,
    'utf8'
  );
}

function assertEq(actual, expected, name) {
  testsRun++;
  if (actual === expected) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed++;
    console.error(
      `  not ok - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertGt(actual, threshold, name) {
  testsRun++;
  if (actual > threshold) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed++;
    console.error(`  not ok - ${name}: expected > ${threshold}, got ${actual}`);
  }
}

function assertContains(haystack, needle, name) {
  testsRun++;
  if (haystack.includes(needle)) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed++;
    console.error(`  not ok - ${name}: missing ${JSON.stringify(needle)}`);
  }
}
