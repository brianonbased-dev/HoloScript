import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPage = {
  on: vi.fn(),
  goto: vi.fn(async (url: string) => {
    currentUrl = url;
  }),
  url: vi.fn(() => currentUrl),
  click: vi.fn(async () => undefined),
  fill: vi.fn(async () => undefined),
  press: vi.fn(async () => undefined),
  waitForTimeout: vi.fn(async () => undefined),
  screenshot: vi.fn(async () => Buffer.from('browser-image')),
  mouse: {
    wheel: vi.fn(async () => undefined),
  },
};

let currentUrl = 'about:blank';

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
import { HoloScriptPlusParser } from '../../../core/src/parser/HoloScriptPlusParser';
import { BrowserPool, browserPool } from '../browser/BrowserPool';
import { browserSession } from '../browser/browser-tools';

const EXECUTABLE_ENV_KEYS = [
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  'CHROMIUM_BIN',
  'CHROME_BIN',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

describe('BrowserPool Chromium resolution', () => {
  let tempDir: string;
  let previousEnv: Partial<
    Record<(typeof EXECUTABLE_ENV_KEYS)[number] | 'DISPLAY' | 'CI', string | undefined>
  >;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'browser-pool-test-'));
    previousEnv = {};

    for (const key of [...EXECUTABLE_ENV_KEYS, 'DISPLAY', 'CI'] as const) {
      previousEnv[key] = process.env[key];
      delete process.env[key];
    }

    vi.mocked(chromium.executablePath).mockReturnValue(
      join(tempDir, 'missing-playwright-cache', 'chrome-headless-shell')
    );
    vi.mocked(chromium.launch).mockClear();
    vi.mocked(chromium.launch).mockResolvedValue(mockBrowser as never);
    mockBrowser.close.mockClear();
    mockBrowser.close.mockResolvedValue(undefined);
    mockBrowser.newContext.mockClear();
    mockContext.close.mockClear();
    mockContext.close.mockResolvedValue(undefined);
    mockContext.newPage.mockClear();
    mockContext.setDefaultTimeout.mockClear();
    mockPage.on.mockClear();
    mockPage.goto.mockClear();
    mockPage.url.mockClear();
    mockPage.click.mockClear();
    mockPage.fill.mockClear();
    mockPage.press.mockClear();
    mockPage.waitForTimeout.mockClear();
    mockPage.screenshot.mockClear();
    mockPage.mouse.wheel.mockClear();
    currentUrl = 'about:blank';
  });

  afterEach(async () => {
    for (const key of [...EXECUTABLE_ENV_KEYS, 'DISPLAY', 'CI'] as const) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    await rm(tempDir, { recursive: true, force: true });
    await browserPool.destroyAll();
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

  it('does not mistake a system Chromium path for a headless server on Windows', async () => {
    const executablePath = join(tempDir, 'chrome.exe');
    await writeFile(executablePath, '');
    process.env.CHROME_BIN = executablePath;

    const pool = new BrowserPool();
    await pool.createSession({ headless: false });

    expect(chromium.launch).toHaveBeenCalledWith(
      expect.objectContaining({ executablePath, headless: false })
    );
    await pool.destroyAll();
  });

  it('turns a missing Playwright browser cache into an actionable deployment error', async () => {
    vi.mocked(chromium.launch).mockRejectedValueOnce(
      new Error(
        "Executable doesn't exist at /home/nodejs/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell"
      )
    );

    const pool = new BrowserPool();

    await expect(pool.createSession({ headless: true })).rejects.toThrow(
      /Playwright Chromium executable is unavailable/
    );
    const session = await pool.createSession({ headless: true });
    expect(session.id).toMatch(/^holoscript-/);
    await pool.destroyAll();
  });

  it('binds a session to a hashed lease and rejects the wrong bearer token', async () => {
    const pool = new BrowserPool();
    const { session, leaseToken } = await pool.createLeasedSession({
      ownerId: 'agent-browser-test',
      config: { headless: true },
    });

    expect(session.lease.tokenHash).not.toBe(leaseToken);
    expect(session.lease.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => pool.requireLease(session.id, 'x'.repeat(32))).toThrow(/lease rejected/);
    expect(pool.requireLease(session.id, leaseToken)).toBe(session);
    await pool.destroyAll();
  });

  it('guards human takeover with a monotonic epoch and verifies close leaves no pool residue', async () => {
    process.env.DISPLAY = 'local-test-display';
    const pool = new BrowserPool();
    const { session, leaseToken } = await pool.createLeasedSession({
      ownerId: 'agent-browser-test',
      config: { headless: false },
    });

    pool.recordOperation(session, 'open', { url: 'about:blank' });
    const takeover = pool.takeOver(session.id, leaseToken);
    expect(takeover.session.controlMode).toBe('human');
    expect(takeover.session.controlEpoch).toBe(1);
    expect(() => pool.requireLease(session.id, leaseToken)).toThrow(/human control/);
    expect(() => pool.resume(session.id, leaseToken, 0)).toThrow(/epoch mismatch/);

    const resumed = pool.resume(session.id, leaseToken, 1);
    expect(resumed.session.controlMode).toBe('agent');
    expect(resumed.session.controlEpoch).toBe(2);
    expect(resumed.receipt.details.previousDigest).toBe(takeover.receipt.digest);

    const closed = await pool.closeLeasedSession(session.id, leaseToken);
    expect(closed).toMatchObject({ closed: true, residue: false });
    expect(pool.getStats().activeSessions).toBe(0);
  });

  it('executes the complete leased browser tracer slice through one MCP surface', async () => {
    process.env.DISPLAY = 'local-test-display';
    const opened = await browserSession({
      operation: 'open',
      ownerId: 'agent-browser-test',
      url: 'data:text/html,<button id="go">go</button>',
      width: 800,
      height: 600,
      headless: false,
      leaseTtlMs: 60_000,
    });
    expect(opened.success).toBe(true);
    if (!('leaseToken' in opened)) throw new Error('open did not return a lease');

    const sessionId = opened.session.sessionId;
    const leaseToken = opened.leaseToken;
    await browserSession({
      operation: 'navigate',
      sessionId,
      leaseToken,
      url: 'data:text/html,<input id="name">',
    });
    await browserSession({
      operation: 'act',
      sessionId,
      leaseToken,
      action: { type: 'fill', selector: '#name', value: 'HoloBrowser' },
    });
    const screenshot = await browserSession({
      operation: 'screenshot',
      sessionId,
      leaseToken,
      type: 'png',
      quality: 90,
      fullPage: false,
    });
    expect('image' in screenshot && screenshot.image).toMatch(/^data:image\/png;base64,/);

    const takeover = await browserSession({ operation: 'takeover', sessionId, leaseToken });
    expect(takeover.session.controlMode).toBe('human');
    const resumed = await browserSession({
      operation: 'resume',
      sessionId,
      leaseToken,
      expectedControlEpoch: takeover.session.controlEpoch,
    });
    expect(resumed.session.controlMode).toBe('agent');

    const closed = await browserSession({ operation: 'close', sessionId, leaseToken });
    expect(closed).toMatchObject({ success: true, closed: true, residue: false });
    expect(browserPool.getStats().activeSessions).toBe(0);
  });

  it('fails closed on cross-origin navigation and reports teardown residue on close failure', async () => {
    const opened = await browserSession({
      operation: 'open',
      ownerId: 'agent-browser-test',
      url: 'https://example.com/start',
      width: 800,
      height: 600,
      headless: true,
      leaseTtlMs: 60_000,
    });
    if (!('leaseToken' in opened)) throw new Error('open did not return a lease');

    await expect(
      browserSession({
        operation: 'navigate',
        sessionId: opened.session.sessionId,
        leaseToken: opened.leaseToken,
        url: 'https://other.example/path',
      })
    ).rejects.toThrow(/origin is not leased/);

    mockContext.close.mockRejectedValueOnce(new Error('context still owns a page'));
    const closed = await browserSession({
      operation: 'close',
      sessionId: opened.session.sessionId,
      leaseToken: opened.leaseToken,
    });
    expect(closed).toMatchObject({ success: false, closed: false, residue: true });
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('keeps the runtime operation surface bound to valid HoloScript source', () => {
    const source = readFileSync(
      new URL('../browser/HoloBrowserSession.hsplus', import.meta.url),
      'utf8'
    );
    const parsed = new HoloScriptPlusParser().parse(source);
    expect(parsed.errors).toEqual([]);
    for (const operation of [
      'open',
      'navigate',
      'act',
      'screenshot',
      'takeover',
      'resume',
      'status',
      'close',
    ]) {
      expect(source).toContain(`"${operation}"`);
    }
  });
});
