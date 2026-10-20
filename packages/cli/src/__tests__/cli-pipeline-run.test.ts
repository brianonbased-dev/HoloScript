import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

      const result = await runCli(
        ['run', pipelinePath, '--json', '--allow-env', 'HOLOMESH_BOARD_SEED_URL'],
        { HOLOMESH_BOARD_SEED_URL: '' }
      );
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

// Board task task_1791176003202_obsc: a pipeline may read an environment variable
// only if the operator names it when running. The CLI expands ${env.*} inside
// endpoints/paths/URLs, so an un-named read must refuse the whole run.
describe('CLI pipeline env-read gate', () => {
  let server: Server;
  let hits: number;
  let sinkUrl: string;
  let tempDir: string;
  let pipelinePath: string;

  beforeEach(async () => {
    hits = 0;
    server = createServer((req, res) => {
      hits += 1;
      req.resume();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    sinkUrl = `http://127.0.0.1:${port}/ingest`;

    tempDir = mkdtempSync(path.join(tmpdir(), 'holoscript-envgate-cli-'));
    pipelinePath = path.join(tempDir, 'gate.hs');
    // The sink endpoint reads ${env.SINK_URL}. The host is 127.0.0.1 (the test server),
    // but the gate is about the env READ, not the host.
    writeFileSync(
      pipelinePath,
      `pipeline "EnvGateCli" {
        source Seed { type: "list" items: [{ id: 1 }] }
        sink Ingest {
          type: "webhook"
          endpoint: "\${env.SINK_URL}"
          method: "POST"
        }
      }`
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('refuses an un-allowed env read before any request is made', async () => {
    let err: (Error & { stdout?: string; stderr?: string; code?: number }) | null = null;
    try {
      await runCli(['run', pipelinePath], { SINK_URL: sinkUrl });
    } catch (e) {
      err = e as Error & { stdout?: string; stderr?: string };
    }
    expect(err, 'the run must fail').toBeTruthy();
    const out = `${err?.stdout ?? ''}${err?.stderr ?? ''}`;
    expect(out).toContain('SINK_URL');
    expect(out).toContain('--allow-env SINK_URL');
    expect(hits, 'the server must receive nothing').toBe(0);
  });

  it('runs and reaches the server once the variable is allowed', async () => {
    const result = await runCli(['run', pipelinePath, '--allow-env', 'SINK_URL'], {
      SINK_URL: sinkUrl,
    });
    expect(hits).toBe(1);
    // The run-start line names the read, on stderr. This endpoint's host comes from
    // ${env.SINK_URL}, so the summary flags it as a host from the environment rather
    // than enumerating it — static hosts are enumerated (see the unit test for that).
    expect(result.stderr).toContain('reads env: SINK_URL');
    expect(result.stderr).toContain('host(s) from ${env.*}');
  });

  it('accepts the non-interactive HOLOSCRIPT_PIPELINE_ALLOW_ENV list form', async () => {
    await runCli(['run', pipelinePath], {
      SINK_URL: sinkUrl,
      HOLOSCRIPT_PIPELINE_ALLOW_ENV: 'OTHER,SINK_URL',
    });
    expect(hits).toBe(1);
  });

  it('holoscript compile lists the env names a pipeline reads', async () => {
    const outPath = path.join(tempDir, 'out.mjs');
    const result = await runCli(['compile', pipelinePath, '--target', 'node', '-o', outPath]);
    expect(result.stdout).toContain('reads env: SINK_URL');
    // The generated module also documents the reads for a reviewer.
    expect(readFileSync(outPath, 'utf8')).toContain('const PIPELINE_ENV_READS = ["SINK_URL"]');
  });
});
