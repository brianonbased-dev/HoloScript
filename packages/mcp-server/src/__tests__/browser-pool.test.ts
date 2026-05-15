import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPage = {
  on: vi.fn(),
};

const mockContext = {
  close: vi.fn(async () => undefined),
  newPage: vi.fn(async () => mockPage),
  setDefaultTimeout: vi.fn(),
};

const mockBrowser = {
  close: vi.fn(async () => undefined),
  newContext: vi.fn(async () => mockContext),
};

vi.mock('playwright', () => ({
  chromium: {
    executablePath: vi.fn(() => '/missing-playwright-cache/chrome-headless-shell'),
    launch: vi.fn(async () => mockBrowser),
  },
}));

import { chromium } from 'playwright';
import { BrowserPool } from '../browser/BrowserPool';

const EXECUTABLE_ENV_KEYS = [
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  'CHROMIUM_BIN',
  'CHROME_BIN',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

describe('BrowserPool Chromium resolution', () => {
  let tempDir: string;
  let previousEnv: Partial<Record<(typeof EXECUTABLE_ENV_KEYS)[number] | 'DISPLAY' | 'CI', string | undefined>>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'browser-pool-test-'));
    previousEnv = {};

    for (const key of [...EXECUTABLE_ENV_KEYS, 'DISPLAY', 'CI'] as const) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }

    vi.mocked(chromium.executablePath).mockReturnValue(join(tempDir, 'missing-playwright-cache', 'chrome-headless-shell'));
    vi.mocked(chromium.launch).mockClear();
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as never);
    mockBrowser.close.mockClear();
    mockBrowser.newContext.mockClear();
    mockContext.close.mockClear();
    mockContext.newPage.mockClear();
    mockContext.setDefaultTimeout.mockClear();
    mockPage.on.mockClear();
  });

  afterEach(async () => {
    for (const key of [...EXECUTABLE_ENV_KEYS, 'DISPLAY', 'CI'] as const) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  it('launches with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when the executable exists', async () => {
    const executablePath = join(tempDir, 'chromium');
    await writeFile(executablePath, '');
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = executablePath;

    const pool = new BrowserPool();
    const session = await pool.createSession({ headless: true });

    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath,
        headless: true,
      })
    );
    expect(session.id).toMatch(/^holoscript-/);

    await pool.destroyAll();
  });

  it('accepts CHROME_BIN as a deployment-compatible Chromium path', async () => {
    const executablePath = join(tempDir, 'google-chrome');
    await writeFile(executablePath, '');
    process.env.CHROME_BIN = executablePath;

    const pool = new BrowserPool();
    await pool.createSession({ headless: true });

    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        executablePath,
      })
    );

    await pool.destroyAll();
  });

  it('turns a missing Playwright browser cache into an actionable deployment error', async () => {
    vi.mocked(chromium.launch).mockRejectedValueOnce(
      new Error("Executable doesn't exist at /home/nodejs/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell")
    );

    const pool = new BrowserPool();

    await expect(pool.createSession({ headless: true })).rejects.toThrow(
      /Playwright Chromium executable is unavailable/
    );
    const session = await pool.createSession({ headless: true });
    expect(session.id).toMatch(/^holoscript-/);
    await pool.destroyAll();
  });
});
