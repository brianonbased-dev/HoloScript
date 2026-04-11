/**
 * Browser Pool Manager for HoloScript MCP Server
 * Manages lifecycle of browser sessions for AI agent control
 */

import { chromium, type _Browser, type _Page, type _BrowserContext } from 'playwright';
import { existsSync } from 'node:fs';
import type { BrowserSession, BrowserSessionConfig, BrowserPoolStats } from './types.js';

/**
 * Default browser configuration
 */
const DEFAULT_CONFIG: Required<BrowserSessionConfig> = {
  width: 1280,
  height: 720,
  headless: false, // Show browser for debugging
  deviceScaleFactor: 1,
  timeout: 30000, // 30 seconds
};

/**
 * Maximum session idle time before automatic cleanup (5 minutes)
 */
const MAX_IDLE_TIME = 5 * 60 * 1000;

/**
 * Manages a pool of browser sessions for HoloScript preview
 */
export class BrowserPool {
  private sessions: Map<string, BrowserSession> = new Map();
  private sessionCounter = 0;
  private stats = {
    totalCreated: 0,
    totalDestroyed: 0,
    lifetimes: [] as number[],
  };

  /**
   * Create a new browser session
   */
  async createSession(config: BrowserSessionConfig = {}): Promise<BrowserSession> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const sessionId = `holoscript-${Date.now()}-${++this.sessionCounter}`;

    // Use system Chromium when available (Railway/Docker/CI)
    const executablePath = this.resolveChromiumExecutablePath();
    const isServer = !!executablePath || process.env.CI === 'true' || !process.env.DISPLAY;

    // Launch browser
    const browser = await chromium.launch({
      headless: isServer ? true : mergedConfig.headless,
      executablePath: executablePath || undefined,
      args: [
        '--enable-webgl',
        '--enable-accelerated-2d-canvas',
        '--enable-features=WebXR',
        '--no-sandbox', // Required for some CI environments
        '--allow-file-access-from-files', // Allow loading local files via XHR
        '--disable-gpu-sandbox',
        '--disable-setuid-sandbox',
        ...(isServer ? ['--disable-dev-shm-usage', '--single-process'] : []),
      ],
    });

    // Create context with viewport
    const context = await browser.newContext({
      viewport: {
        width: mergedConfig.width,
        height: mergedConfig.height,
      },
      deviceScaleFactor: mergedConfig.deviceScaleFactor,
      permissions: ['clipboard-read', 'clipboard-write'], // For copying scene data
    });

    // Set default timeout
    context.setDefaultTimeout(mergedConfig.timeout);

    // Create page
    const page = await context.newPage();

    // Enable error logging
    page.on('pageerror', (error) => {
      console.error(`[Browser Error ${sessionId}]:`, error.message);
    });

    const session: BrowserSession = {
      id: sessionId,
      browser,
      context,
      page,
      config: mergedConfig,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.stats.totalCreated++;

    return session;
  }

  /**
   * Resolve a valid Chromium executable path from env or common Alpine/Linux locations.
   * Returns undefined when no installed binary is available, allowing Playwright defaults.
   */
  private resolveChromiumExecutablePath(): string | undefined {
    const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    if (fromEnv && existsSync(fromEnv)) {
      return fromEnv;
    }

    const candidates = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/lib/chromium/chrome',
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): BrowserSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * Destroy a session and cleanup resources
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      await session.context.close();
      await session.browser.close();

      const lifetime = Date.now() - session.createdAt;
      this.stats.lifetimes.push(lifetime);
      this.stats.totalDestroyed++;

      this.sessions.delete(sessionId);
      return true;
    } catch (error) {
      console.error(`Error destroying session ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup idle sessions
   */
  async cleanupIdleSessions(): Promise<number> {
    const now = Date.now();
    const toDestroy: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > MAX_IDLE_TIME) {
        toDestroy.push(sessionId);
      }
    }

    for (const sessionId of toDestroy) {
      await this.destroySession(sessionId);
    }

    return toDestroy.length;
  }

  /**
   * Destroy all sessions
   */
  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      await this.destroySession(sessionId);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): BrowserPoolStats {
    const activeSessions = this.sessions.size;
    const idleSessions = Array.from(this.sessions.values()).filter(
      (session) => Date.now() - session.lastActivity > 60000 // 1 minute
    ).length;

    const avgLifetime =
      this.stats.lifetimes.length > 0
        ? this.stats.lifetimes.reduce((a, b) => a + b, 0) / this.stats.lifetimes.length
        : 0;

    return {
      activeSessions,
      idleSessions,
      totalCreated: this.stats.totalCreated,
      totalDestroyed: this.stats.totalDestroyed,
      avgLifetime,
    };
  }

  /**
   * Start automatic cleanup timer
   */
  startCleanupTimer(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanupIdleSessions();
    }, intervalMs);
  }
}

/**
 * Global browser pool instance
 */
export const browserPool = new BrowserPool();
