import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');
const outPath = resolve(repoRoot, '.scratch/paper-9-motion-neural-benchmark-test.json');
const tsxCli = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');

test('paper-9-motion-neural-benchmark writes required ONNX rows', () => {
  rmSync(outPath, { force: true });
  execFileSync(
    process.execPath,
    [
      tsxCli,
      'scripts/paper-9-motion-neural-benchmark.ts',
      `--out=${outPath}`,
      '--categories=locomotion,interaction',
      '--clips=3',
      '--frames=6',
      '--seed=99',
    ],
    { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' }
  );

  assert.equal(existsSync(outPath), true);
  const artifact = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(artifact.schema, 'holoscript.paper9.motion_neural_benchmark.v1');
  assert.equal(artifact.onnx.adapter, 'OnnxNodeInferenceAdapter');
  assert.match(artifact.onnx.modelSha256, /^[a-f0-9]{64}$/);
  assert.ok(artifact.onnx.outputNonZeroCount > 0);

  for (const category of ['locomotion', 'interaction']) {
    const contracted = artifact.rows.find(
      (row) => row.category === category && row.baseline_name === 'contracted_onnx_hard_reject'
    );
    assert.ok(contracted);
    assert.equal(contracted.n_frames, 18);
    assert.equal(contracted.plausibility_pass_rate, 1);
    assert.equal(contracted.baseline_fail_rate, 0);
  }

  const interaction = artifact.rows.find(
    (row) => row.category === 'interaction' && row.baseline_name === 'contracted_onnx_hard_reject'
  );
  assert.ok(interaction.hard_reject_count > 0);

  for (const baseline of ['AnimGAN', 'MotionVAE', 'MDM']) {
    const row = artifact.rows.find(
      (candidate) => candidate.category === 'locomotion' && candidate.baseline_name === baseline
    );
    assert.ok(row);
    assert.equal(typeof row.baseline_fail_rate, 'number');
  }
});
