import { defineConfig } from '@playwright/test';
import { existsSync } from 'fs';
import path from 'path';

const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const useNativeWebGPU =
  process.env.WEBGPU_DETERMINISM_NATIVE === '1' || process.env.BENCH_VULKAN_BACKEND === 'native';
const nativeChrome =
  process.env.WEBGPU_CHROME && existsSync(process.env.WEBGPU_CHROME)
    ? process.env.WEBGPU_CHROME
    : existsSync(DEFAULT_CHROME)
      ? DEFAULT_CHROME
      : undefined;
const swiftShaderArgs = [
  '--use-vulkan=swiftshader',
  '--disable-vulkan-fallback-to-gl-for-testing',
  '--disable-gpu-sandbox',
];

/**
 * Playwright configuration for the Paper-6 WebGPU cross-backend matrix benchmark.
 *
 * Runs against benchmark-paper6-webgpu.html locally via file:// URL.
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
      ...(useNativeWebGPU && nativeChrome ? { executablePath: nativeChrome } : {}),
      args: [
        '--enable-unsafe-webgpu',
        '--enable-webgpu-developer-features',
        '--ignore-gpu-blocklist',
        ...(useNativeWebGPU ? [] : swiftShaderArgs),
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

  outputDir: 'test-results',
});
