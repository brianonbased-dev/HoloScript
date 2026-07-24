import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../../..');
const assets = new Set([
  'n4-residual-webgpu-parity.html',
  'n4-residual-webgpu-parity.js',
]);

function server(): http.Server {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const name = path.basename(
      url.pathname === '/' ? 'n4-residual-webgpu-parity.html' : url.pathname
    );
    if (!assets.has(name)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    const body = await fs.readFile(path.join(repoRoot, 'scripts', name));
    response.writeHead(200, {
      'content-type': name.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : 'text/javascript; charset=utf-8',
    });
    response.end(body);
  });
}

async function listen(instance: http.Server): Promise<number> {
  return await new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', () => {
      const address = instance.address();
      if (!address || typeof address === 'string') reject(new Error('server bind failed'));
      else resolve(address.port);
    });
  });
}

async function close(instance: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    instance.close((error) => (error ? reject(error) : resolve()))
  );
}

test('runs N4 tensor inference on live browser WebGPU with CPU parity', async ({ page }) => {
  const instance = server();
  const port = await listen(instance);
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[n4-browser:error] ${message.text()}`);
  });
  try {
    await page.goto(`http://127.0.0.1:${port}/n4-residual-webgpu-parity.html`);
    await page.waitForFunction(
      () =>
        window.__N4_WEBGPU_PARITY_ARTIFACT__ !== undefined ||
        window.__N4_WEBGPU_PARITY_ERROR__ !== undefined,
      undefined,
      { timeout: 60_000 }
    );
    const result = await page.evaluate(() => ({
      artifact: window.__N4_WEBGPU_PARITY_ARTIFACT__,
      error: window.__N4_WEBGPU_PARITY_ERROR__,
    }));
    if (result.error) throw new Error(`${result.error.name}: ${result.error.message}`);
    const artifact = result.artifact!;

    expect(artifact.executionMode).toBe('webgpu');
    expect(artifact.navigatorGpu).toBe(true);
    expect(artifact.adapterAcquired).toBe(true);
    expect(artifact.deviceAcquired).toBe(true);
    expect(artifact.dispatchCompleted).toBe(true);
    expect(artifact.readbackCompleted).toBe(true);
    expect(artifact.parity.valid).toBe(true);
    expect(artifact.parity.maxAbsoluteError).toBeLessThanOrEqual(1e-5);
    expect(artifact.cpu.weightsManifestDigest).toBe(artifact.webgpu.weightsManifestDigest);
    expect(artifact.tensorChecksum).toMatch(/^fnv1a64:/);
    expect(artifact.userAgent.length).toBeGreaterThan(0);

    const output = path.join(repoRoot, '.bench-logs', 'n4-residual-webgpu-parity.json');
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(artifact, null, 2), 'utf8');
    console.log(`[n4-webgpu] adapter=${JSON.stringify(artifact.adapter)} receipt=${output}`);
  } finally {
    await close(instance);
  }
});

