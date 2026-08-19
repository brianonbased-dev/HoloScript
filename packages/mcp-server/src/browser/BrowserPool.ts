/**
 * Browser Pool Manager for HoloScript MCP Server
 * Manages lifecycle of browser sessions for AI agent control
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { chromium, type Browser, type CDPSession, type Page } from 'playwright';
import type {
  BrowserConsoleEntry,
  BrowserNetworkEntry,
  BrowserObservationBuffers,
  BrowserOperationReceipt,
  BrowserPoolStats,
  BrowserSession,
  BrowserSessionConfig,
  BrowserSessionSnapshot,
} from './types.js';
import {
  createChromiumLaunchError,
  isMissingChromiumExecutableError,
  resolveChromiumExecutable,
} from './chromium-executable.js';

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
const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;

function hashLeaseToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function sameToken(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function receiptDigest(receipt: Omit<BrowserOperationReceipt, 'digest'>): string {
  return createHash('sha256').update(JSON.stringify(receipt), 'utf8').digest('hex');
}

/** Bound on each observation buffer so a long-lived session can't grow it without limit. */
const OBSERVATION_BUFFER_LIMIT = 200;

function pushBounded<T>(buffer: T[], entry: T): void {
  buffer.push(entry);
  if (buffer.length > OBSERVATION_BUFFER_LIMIT) buffer.shift();
}

/**
 * Attach a raw CDP session to `page` and wire Network/Runtime/Log domain listeners into
 * `observation`'s bounded buffers — the backing for the browser_session 'observe' operation
 * (read-only DOM/console/network instrumentation, CDP/BiDi-backed per the P0 gap-matrix ask).
 * Chromium-only (this pool only launches chromium), so CDP — not WebDriver BiDi — is the
 * real transport here; BiDi would be the analogous path for a non-Chromium engine this pool
 * does not use. Failure to attach is non-fatal: the session still opens, observation buffers
 * just stay empty, so a CDP hiccup can never block the (already-working) launch/navigate/act
 * path this shares a session with.
 */
async function attachObservation(
  page: Page,
  sessionId: string
): Promise<{ cdpSession?: CDPSession; observation: BrowserObservationBuffers }> {
  const observation: BrowserObservationBuffers = { console: [], network: [] };
  try {
    const cdpSession = await page.context().newCDPSession(page);
    const pendingRequests = new Map<string, { url: string; method: string; timestamp: string }>();

    await cdpSession.send('Network.enable');
    await cdpSession.send('Runtime.enable');
    await cdpSession.send('Log.enable');

    cdpSession.on('Network.requestWillBeSent', (event) => {
      pendingRequests.set(event.requestId, {
        url: event.request.url,
        method: event.request.method,
        timestamp: new Date().toISOString(),
      });
    });
    cdpSession.on('Network.responseReceived', (event) => {
      const pending = pendingRequests.get(event.requestId);
      const entry: BrowserNetworkEntry = {
        requestId: event.requestId,
        url: event.response.url,
        method: pending?.method ?? '',
        resourceType: event.type,
        status: event.response.status,
        statusText: event.response.statusText,
        timestamp: pending?.timestamp ?? new Date().toISOString(),
      };
      pushBounded(observation.network, entry);
      pendingRequests.delete(event.requestId);
    });
    cdpSession.on('Network.loadingFailed', (event) => {
      const pending = pendingRequests.get(event.requestId);
      const entry: BrowserNetworkEntry = {
        requestId: event.requestId,
        url: pending?.url ?? '',
        method: pending?.method ?? '',
        resourceType: event.type,
        failed: true,
        failureText: event.errorText,
        timestamp: pending?.timestamp ?? new Date().toISOString(),
      };
      pushBounded(observation.network, entry);
      pendingRequests.delete(event.requestId);
    });
    cdpSession.on('Runtime.consoleAPICalled', (event) => {
      const text = (event.args ?? [])
        .map((arg) => (arg.value !== undefined ? String(arg.value) : (arg.description ?? '')))
        .join(' ');
      const entry: BrowserConsoleEntry = {
        type: event.type,
        text,
        timestamp: new Date().toISOString(),
      };
      pushBounded(observation.console, entry);
    });
    cdpSession.on('Log.entryAdded', (event) => {
      const entry: BrowserConsoleEntry = {
        type: event.entry.level,
        text: event.entry.text,
        url: event.entry.url,
        lineNumber: event.entry.lineNumber,
        timestamp: new Date(event.entry.timestamp).toISOString(),
      };
      pushBounded(observation.console, entry);
    });

    return { cdpSession, observation };
  } catch (error) {
    console.error(`[Browser Observation ${sessionId}]: CDP attach failed, observation buffers will stay empty:`, error);
    return { observation };
  }
}

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
  private async createSessionWithLease(
    config: BrowserSessionConfig,
    ownerId: string,
    leaseTtlMs: number,
    allowedOrigins: string[]
  ): Promise<{ session: BrowserSession; leaseToken: string }> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const sessionId = `holoscript-${Date.now()}-${++this.sessionCounter}`;

    // Use system Chromium when available (Railway/Docker/CI)
    const executableResolution = resolveChromiumExecutable();
    const isServer =
      process.env.CI === 'true' || (process.platform !== 'win32' && !process.env.DISPLAY);
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: isServer ? true : mergedConfig.headless,
      args: [
        '--enable-webgl',
        '--enable-accelerated-2d-canvas',
        '--enable-features=WebXR',
        '--no-sandbox', // Required for some CI environments
        '--allow-file-access-from-files', // Allow loading local files via XHR
        '--disable-gpu-sandbox',
        '--disable-setuid-sandbox',
        ...(isServer
          ? [
              '--disable-dev-shm-usage',
              // Containers (e.g. infrastructure/Dockerfile.mcp-server's Alpine `chromium`
              // package) ship no Vulkan ICD and no dbus session bus, and `--single-process`
              // (removed here) is independently fragile under software rendering. Without
              // this fix ANGLE probes a Vulkan backend by default, finds no VK_KHR_surface
              // extension, and the browser process crashes before Playwright gets a page
              // handle ("Target page, context or browser has been closed") — reproduced
              // live 2026-08-18 against the deployed mcp-server host, then reproduced AND
              // fixed locally in a from-scratch Alpine+chromium container matching the
              // production image (no dbus, no mesa-vulkan): unpatched args crash identically;
              // dropping --single-process and forcing ANGLE's swiftshader-webgl backend
              // (software rasterization, no external Vulkan ICD needed) launches cleanly and
              // reaches a real page — verified with a live newPage()+setContent()+evaluate()
              // round trip, not just a launch() that doesn't throw.
              //
              // Residual, separate gap (not required for DOM/console/network observation,
              // only for WebGL/3D-canvas rendering): actual WebGL context creation still
              // returns null in this same repro even with these flags AND with Alpine's
              // mesa-dri-gallium/mesa-gl + LIBGL_ALWAYS_SOFTWARE=1 installed alongside —
              // Alpine's `chromium` apk appears to ship without a working software WebGL
              // backend at all. Needs its own follow-up (e.g. Playwright's own bundled
              // Chromium instead of Alpine's system package, or a different software-GL
              // path) if/when 3D preview verification inside this container is required.
              '--disable-gpu',
              '--disable-vulkan',
              '--use-gl=angle',
              '--use-angle=swiftshader-webgl',
            ]
          : []),
      ],
    };
    if (executableResolution.executablePath) {
      launchOptions.executablePath = executableResolution.executablePath;
    }
    if (isServer) {
      // Defensive: Chromium logs repeated "Failed to connect to the bus" errors when no
      // dbus session bus is present (also true of this container). --password-store=basic
      // (Playwright's own default) already avoids needing the secret-service dbus API for
      // credential storage, so this isn't what crashes the process — but pointing it at a
      // no-op address keeps the noise out of stderr instead of leaving it to fail-and-retry.
      launchOptions.env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'disabled:' } as Record<
        string,
        string
      >;
    }

    let browser: Browser;
    try {
      browser = await chromium.launch(launchOptions);
    } catch (error) {
      if (isMissingChromiumExecutableError(error) || executableResolution.source === 'missing') {
        throw createChromiumLaunchError(error, executableResolution);
      }
      throw error;
    }

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

    // Attach CDP-backed read-only observation BEFORE any navigation happens (the caller
    // navigates right after createSession/createLeasedSession returns), so console/network
    // activity from the very first page load is captured, not just activity after the fact.
    const { cdpSession, observation } = await attachObservation(page, sessionId);

    const now = Date.now();
    const leaseToken = randomBytes(32).toString('base64url');
    const session: BrowserSession = {
      id: sessionId,
      cdpSession,
      observation,
      browser,
      context,
      page,
      config: { ...mergedConfig, headless: launchOptions.headless === true },
      createdAt: now,
      lastActivity: now,
      lease: {
        ownerId,
        tokenHash: hashLeaseToken(leaseToken),
        issuedAt: now,
        expiresAt: now + leaseTtlMs,
      },
      controlMode: 'agent',
      controlEpoch: 0,
      receipts: [],
      allowedOrigins,
    };

    this.sessions.set(sessionId, session);
    this.stats.totalCreated++;

    return { session, leaseToken };
  }

  async createSession(config: BrowserSessionConfig = {}): Promise<BrowserSession> {
    return (
      await this.createSessionWithLease(config, 'legacy-browser-tool', DEFAULT_LEASE_TTL_MS, [])
    ).session;
  }

  async createLeasedSession(options: {
    ownerId: string;
    leaseTtlMs?: number;
    config?: BrowserSessionConfig;
    allowedOrigins?: string[];
  }): Promise<{ session: BrowserSession; leaseToken: string }> {
    const ownerId = options.ownerId.trim();
    if (!ownerId) throw new Error('Browser session ownerId is required');
    const leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    if (!Number.isSafeInteger(leaseTtlMs) || leaseTtlMs < 10_000 || leaseTtlMs > 3_600_000) {
      throw new Error('Browser session leaseTtlMs must be an integer between 10000 and 3600000');
    }
    return this.createSessionWithLease(options.config ?? {}, ownerId, leaseTtlMs, [
      ...new Set(options.allowedOrigins ?? []),
    ]);
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

  requireLease(
    sessionId: string,
    leaseToken: string,
    options: { allowHumanControl?: boolean } = {}
  ): BrowserSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Browser session not found: ${sessionId}`);
    if (!sameToken(session.lease.tokenHash, hashLeaseToken(leaseToken))) {
      throw new Error(`Browser session lease rejected: ${sessionId}`);
    }
    if (Date.now() >= session.lease.expiresAt) {
      throw new Error(`Browser session lease expired: ${sessionId}`);
    }
    if (session.controlMode === 'human' && !options.allowHumanControl) {
      throw new Error(`Browser session is under human control: ${sessionId}`);
    }
    session.lastActivity = Date.now();
    return session;
  }

  recordOperation(
    session: BrowserSession,
    operation: string,
    details: Record<string, unknown> = {}
  ): BrowserOperationReceipt {
    const body: Omit<BrowserOperationReceipt, 'digest'> = {
      schema: 'holoscript.browser-operation.v1',
      operation,
      sessionId: session.id,
      ownerId: session.lease.ownerId,
      controlMode: session.controlMode,
      controlEpoch: session.controlEpoch,
      at: new Date().toISOString(),
      details: {
        previousDigest: session.receipts.at(-1)?.digest ?? null,
        ...details,
      },
    };
    const receipt = { ...body, digest: receiptDigest(body) };
    session.receipts.push(receipt);
    return receipt;
  }

  snapshot(session: BrowserSession): BrowserSessionSnapshot {
    return {
      sessionId: session.id,
      ownerId: session.lease.ownerId,
      controlMode: session.controlMode,
      controlEpoch: session.controlEpoch,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      leaseExpiresAt: session.lease.expiresAt,
      url: session.page.url(),
      receiptCount: session.receipts.length,
    };
  }

  takeOver(
    sessionId: string,
    leaseToken: string
  ): {
    session: BrowserSessionSnapshot;
    receipt: BrowserOperationReceipt;
  } {
    const session = this.requireLease(sessionId, leaseToken);
    if (session.config.headless) {
      throw new Error(`Browser session cannot enter human control while headless: ${sessionId}`);
    }
    session.controlMode = 'human';
    session.controlEpoch += 1;
    const receipt = this.recordOperation(session, 'takeover', {
      visible: !session.config.headless,
    });
    return { session: this.snapshot(session), receipt };
  }

  resume(
    sessionId: string,
    leaseToken: string,
    expectedControlEpoch: number
  ): { session: BrowserSessionSnapshot; receipt: BrowserOperationReceipt } {
    const session = this.requireLease(sessionId, leaseToken, { allowHumanControl: true });
    if (session.controlMode !== 'human') {
      throw new Error(`Browser session is not awaiting human handback: ${sessionId}`);
    }
    if (session.controlEpoch !== expectedControlEpoch) {
      throw new Error(
        `Browser session control epoch mismatch: expected ${expectedControlEpoch}, current ${session.controlEpoch}`
      );
    }
    session.controlMode = 'agent';
    session.controlEpoch += 1;
    const receipt = this.recordOperation(session, 'resume', {
      previousControlEpoch: expectedControlEpoch,
    });
    return { session: this.snapshot(session), receipt };
  }

  async closeLeasedSession(
    sessionId: string,
    leaseToken: string
  ): Promise<{
    closed: boolean;
    residue: boolean;
    receipt: BrowserOperationReceipt;
  }> {
    const session = this.requireLease(sessionId, leaseToken, { allowHumanControl: true });
    const receipt = this.recordOperation(session, 'close', {
      receiptCount: session.receipts.length + 1,
    });
    const closed = await this.destroySession(sessionId);
    return { closed, residue: this.sessions.has(sessionId), receipt };
  }

  /**
   * Destroy a session and cleanup resources
   */
  async destroySession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const errors: unknown[] = [];
    if (session.cdpSession) {
      // Best-effort: context.close() below tears this down regardless, but detaching first
      // avoids noisy "session closed" errors from any in-flight CDP command.
      await session.cdpSession.detach().catch(() => {});
    }
    try {
      await session.context.close();
    } catch (error) {
      errors.push(error);
      console.error(`Error closing browser context ${sessionId}:`, error);
    }
    try {
      await session.browser.close();
    } catch (error) {
      errors.push(error);
      console.error(`Error closing browser process ${sessionId}:`, error);
    }
    if (errors.length === 0) {
      const lifetime = Date.now() - session.createdAt;
      this.stats.lifetimes.push(lifetime);
      this.stats.totalDestroyed++;
      this.sessions.delete(sessionId);
      return true;
    }
    return false;
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
