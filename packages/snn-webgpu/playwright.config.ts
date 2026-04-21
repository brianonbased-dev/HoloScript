import { defineConfig } from '@playwright/test';
import path from 'path';

/**
 * Playwright configuration for the SNN-WebGPU browser benchmark harness.
 *
 * Runs against `benchmark-gpu.html` locally via file:// URL.
 * Uses SwiftShader (software WebGPU) for headless CI environments.
 *
 * In CI with real GPU hardware, set BENCH_STRICT_ADAPTER=1 and BENCH_TARGET=rtx3060
 * to enable the adapter gate and capture certified throughput numbers.
 */
export default defineConfig({
  testDir: './tests',
  timeout: Number(process.env.BENCH_TIMEOUT_MS) || 120_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,

  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/playwright-results.json' }],
  ],

  use: {
    headless: process.env.BENCH_HEADLESS !== '0',
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-webgpu-developer-features',
        '--use-vulkan=swiftshader',
        '--disable-vulkan-fallback-to-gl-for-testing',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
      ],
    },
  },

  projects: [
    {
      name: 'chromium-webgpu',
      use: {
        browserName: 'chromium',
      },
    },
  ],

  /* Output directory for test artifacts (screenshots, traces) */
  outputDir: 'test-results',
});
