#!/usr/bin/env node
/**
 * Hardware-native WebGPU probe for Codex and local agents.
 *
 * WebGPU is secure-context gated, so this script serves a tiny localhost page
 * before probing. It exits non-zero when no adapter/device is available or the
 * smoke compute shader fails.
 */

import http from 'node:http';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath =
  process.env.WEBGPU_PROBE_CHROME && existsSync(process.env.WEBGPU_PROBE_CHROME)
    ? process.env.WEBGPU_PROBE_CHROME
    : existsSync(DEFAULT_CHROME)
      ? DEFAULT_CHROME
      : undefined;

const headless = process.env.WEBGPU_PROBE_HEADLESS !== '0';
const launchArgs = [
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  ...(process.env.WEBGPU_PROBE_ANGLE ? [`--use-angle=${process.env.WEBGPU_PROBE_ANGLE}`] : []),
];

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>HoloScript WebGPU Probe</title><body>webgpu probe</body>');
});

const result = await runProbe();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.ok ? 0 : 1);

async function runProbe() {
  const address = await listen(server);
  let browser;
  try {
    browser = await chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
      args: launchArgs,
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
    const pageResult = await page.evaluate(probeWebGpuInPage);
    return {
      ok: pageResult.ok,
      runtime: {
        browser: executablePath ?? 'playwright-bundled-chromium',
        headless,
        launchArgs,
      },
      page: pageResult,
    };
  } catch (error) {
    return {
      ok: false,
      runtime: {
        browser: executablePath ?? 'playwright-bundled-chromium',
        headless,
        launchArgs,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
    await close(server);
  }
}

function listen(instance) {
  return new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(0, '127.0.0.1', () => {
      instance.off('error', reject);
      const address = instance.address();
      if (!address || typeof address === 'string') {
        reject(new Error('WebGPU probe failed to bind localhost server'));
        return;
      }
      resolve(address);
    });
  });
}

function close(instance) {
  return new Promise((resolve, reject) => {
    instance.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function probeWebGpuInPage() {
  async function runComputeSmoke(device) {
    const shader = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read_write> data: array<f32>;
        @compute @workgroup_size(1)
        fn main() {
          data[0] = data[0] + 41.0;
        }
      `,
    });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: shader,
        entryPoint: 'main',
      },
    });
    const storage = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const readback = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    device.queue.writeBuffer(storage, 0, new Float32Array([1]));

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: storage } }],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, readback, 0, 4);
    device.queue.submit([encoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const value = new Float32Array(readback.getMappedRange().slice(0))[0] ?? Number.NaN;
    readback.unmap();
    storage.destroy();
    readback.destroy();
    return value;
  }

  const base = {
    secureContext: window.isSecureContext,
    hasNavigatorGpu: Boolean(navigator.gpu),
    userAgent: navigator.userAgent,
  };

  if (!navigator.gpu) {
    return { ok: false, ...base, reason: 'navigator.gpu unavailable' };
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    return { ok: false, ...base, reason: 'requestAdapter returned null' };
  }

  const device = await adapter.requestDevice();
  try {
    const smokeValue = await runComputeSmoke(device);
    const ok = Math.abs(smokeValue - 42) < 0.001;
    return {
      ok,
      ...base,
      adapter: {
        features: [...adapter.features].sort(),
        limits: {
          maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
          maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
          maxComputeWorkgroupSizeX: adapter.limits.maxComputeWorkgroupSizeX,
          maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        },
      },
      device: {
        features: [...device.features].sort(),
      },
      smoke: {
        expected: 42,
        actual: smokeValue,
      },
      ...(ok ? {} : { reason: 'compute smoke value mismatch' }),
    };
  } finally {
    device.destroy();
  }
}
