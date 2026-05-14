import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const cliSource = path.join(packageRoot, 'src/cli.ts');
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

function pipelinePathLiteral(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, [tsxCli, cliSource, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer: 1024 * 1024,
    timeout: 90_000,
  });
}

describe('CLI pipeline run', () => {
  it('executes pipeline .hs sources through runPipeline()', async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-cli-pipeline-'));

    try {
      const manifestPath = path.join(tempDir, 'manifest.json');
      const sinkRoot = path.join(tempDir, 'artifacts');
      const pipelinePath = path.join(tempDir, 'capture.hs');

      writeFileSync(
        manifestPath,
        JSON.stringify({
          schema: 'format-realism-gauntlet-v1',
          flagship: 'humanoid-rock-throw',
          segments: [{ id: '00_scene_loaded' }],
          artifactRoot: '.bench-logs/format-stress',
        })
      );

      writeFileSync(
        pipelinePath,
        `pipeline "CliCapture" {
          source Manifest {
            type: "filesystem"
            path: "${pipelinePathLiteral(manifestPath)}"
            format: "json"
          }

          transform BuildRunPlan {
            schema       -> schemaVersion
            flagship    -> scenarioId
            segments    -> captureSegments
            artifactRoot -> artifactRoot
          }

          validate RunPlan {
            schemaVersion   : required, string
            scenarioId      : required, string
            captureSegments : required
            artifactRoot    : required, string
          }

          sink LocalArtifacts {
            type: "filesystem"
            path: "${pipelinePathLiteral(sinkRoot)}/\${date}/humanoid-rock-throw"
            method: "write"
            format: "json"
          }

          sink HoloMeshTaskSeed {
            type: "webhook"
            endpoint: "\${env.HOLOMESH_BOARD_SEED_URL}"
            method: "POST"
          }
        }`
      );

      const result = await runCli(['run', pipelinePath, '--json'], {
        HOLOMESH_BOARD_SEED_URL: '',
      });
      const payload = JSON.parse(result.stdout);

      expect(payload.success).toBe(true);
      expect(payload.result.count).toBe(1);
      expect(payload.result.data[0]).toMatchObject({
        schemaVersion: 'format-realism-gauntlet-v1',
        scenarioId: 'humanoid-rock-throw',
        artifactRoot: '.bench-logs/format-stress',
      });
      expect(result.stdout).not.toContain('No valid AST nodes');
      expect(result.stderr).toContain('skipping empty webhook/rest sink endpoint');

      const runDate = new Date().toISOString().slice(0, 10);
      const outputPath = path.join(
        sinkRoot,
        runDate,
        'humanoid-rock-throw',
        'pipeline-output.json'
      );
      expect(statSync(outputPath).size).toBeGreaterThan(0);
      expect(readFileSync(outputPath, 'utf8')).toContain('humanoid-rock-throw');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
