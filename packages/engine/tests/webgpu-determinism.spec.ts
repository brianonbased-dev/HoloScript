/**
 * Playwright driver for the Paper-3 WebGPU determinism harness.
 *
 * Loads scripts/webgpu-determinism-harness.html, waits for the browser-side
 * WebGPU run to settle, asserts production evidence is not mock-backed, and
 * writes the protocol-shaped artifact to .bench-logs.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

interface HarnessArtifact {
  protocol: '2026-04-20_webgpu-determinism-protocol';
  protocolCommit: string;
  executionMode: 'webgpu' | 'mock';
  browser: string;
  host: string;
  adapter: {
    tag: string;
    vendor: string;
    device: string;
    driver: string;
    userAgent: string;
  };
  kernel: {
    name: string;
    workgroupSize: number;
    wgslBytes: number;
  };
  scenarios: Record<
    string,
    {
      scenario: string;
      traceLength: number;
      replications: Array<{
        finalStateDigest: string;
        wallMs: number;
        wgslCompileMs: number;
        finalStateFields?: Record<string, number[]>;
      }>;
    }
  >;
  collectedAtMs: number;
}

interface BrowserHarnessError {
  name: string;
  message: string;
  stack?: string;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const SCRIPT_ASSETS = new Set(['webgpu-determinism-harness.html', 'webgpu-determinism-harness.js']);

function buildHarnessUrl(port: number): string {
  const query = new URLSearchParams({
    adapterTag:
      process.env.WEBGPU_DETERMINISM_ADAPTER_TAG ??
      (process.env.WEBGPU_DETERMINISM_NATIVE === '1' ? 'nvidia-rtx3060' : 'swiftshader'),
    host: process.env.WEBGPU_DETERMINISM_HOST ?? 'codex-hardware',
    protocolCommit: process.env.WEBGPU_DETERMINISM_PROTOCOL_COMMIT ?? 'local',
    replications: process.env.WEBGPU_DETERMINISM_REPLICATIONS ?? '2',
    captureFields: process.env.WEBGPU_DETERMINISM_CAPTURE_FIELDS ?? '1',
    productionEvidence: boolEnv('WEBGPU_DETERMINISM_PRODUCTION', true) ? '1' : '0',
  });

  if (boolEnv('WEBGPU_HARNESS_MOCK', false)) {
    query.set('mock', '1');
  }

  return `http://127.0.0.1:${port}/webgpu-determinism-harness.html?${query.toString()}`;
}

async function resolveOutputPath(): Promise<string> {
  return process.env.WEBGPU_DETERMINISM_OUTPUT_PATH
    ? path.resolve(process.env.WEBGPU_DETERMINISM_OUTPUT_PATH)
    : path.join(repoRoot, '.bench-logs', 'webgpu-determinism-harness.json');
}

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fileName.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function createHarnessServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const fileName = path.basename(url.pathname === '/' ? 'webgpu-determinism-harness.html' : url.pathname);
      if (!SCRIPT_ASSETS.has(fileName)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }

      const filePath = path.join(repoRoot, 'scripts', fileName);
      const body = await fs.readFile(filePath);
      res.writeHead(200, { 'content-type': contentTypeFor(fileName) });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(error instanceof Error ? error.message : String(error));
    }
  });
}

function listen(server: http.Server): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to bind harness server'));
        return;
      }
      resolve({ port: address.port });
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test.describe('Paper-3 WebGPU determinism harness', () => {
  test('runs a CAEL trace through browser WebGPU and writes evidence', async ({ page }) => {
    const server = createHarnessServer();
    const address = await listen(server);
    const harnessUrl = buildHarnessUrl(address.port);
    let settled = false;
    let resolveResult!: (result: { artifact?: HarnessArtifact; error?: BrowserHarnessError }) => void;
    const resultPromise = new Promise<{ artifact?: HarnessArtifact; error?: BrowserHarnessError }>((resolve) => {
      resolveResult = resolve;
    });

    await page.exposeFunction(
      '__playwrightDeterminismDone__',
      (result: { artifact?: HarnessArtifact; error?: BrowserHarnessError }) => {
        if (settled) return;
        settled = true;
        resolveResult(result);
      },
    );

    await page.addInitScript(`
      const poll = setInterval(() => {
        if (window.__WEBGPU_DETERMINISM_ARTIFACT__) {
          clearInterval(poll);
          window.__playwrightDeterminismDone__({ artifact: window.__WEBGPU_DETERMINISM_ARTIFACT__ });
        } else if (window.__WEBGPU_DETERMINISM_ERROR__) {
          clearInterval(poll);
          window.__playwrightDeterminismDone__({ error: window.__WEBGPU_DETERMINISM_ERROR__ });
        }
      }, 100);
    `);

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[browser:error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      console.log(`[browser:pageerror] ${err.message}`);
    });

    try {
      console.log(`\n[harness] Loading: ${harnessUrl}`);
      await page.goto(harnessUrl);
      const result = await resultPromise;

      if (result.error) {
        throw new Error(`${result.error.name}: ${result.error.message}`);
      }

      const artifact = result.artifact!;
      expect(artifact.protocol).toBe('2026-04-20_webgpu-determinism-protocol');
      expect(artifact.executionMode).toBe('webgpu');
      expect(artifact.kernel.name).toBe('cael-trace-fold-v1');
      expect(artifact.kernel.workgroupSize).toBe(64);
      expect(artifact.adapter.userAgent.length).toBeGreaterThan(0);

      const scenario = artifact.scenarios['cael-crdt-smoke'];
      expect(scenario).toBeDefined();
      expect(scenario.traceLength).toBeGreaterThan(0);
      expect(scenario.replications.length).toBeGreaterThan(0);

      const digests = new Set(scenario.replications.map((r) => r.finalStateDigest));
      expect(digests.size).toBe(1);

      for (const replication of scenario.replications) {
        expect(replication.finalStateDigest).toMatch(/^(sha256|fnv1a-64):/);
        expect(replication.wallMs).toBeGreaterThanOrEqual(0);
        expect(replication.wgslCompileMs).toBeGreaterThanOrEqual(0);
        if (replication.finalStateFields?.u32_state) {
          expect(replication.finalStateFields.u32_state.length).toBe(8);
        }
      }

      const outputPath = await resolveOutputPath();
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2), 'utf-8');
      console.log(`[harness] Artifact saved -> ${outputPath}`);
    } finally {
      await close(server);
    }
  });
});
