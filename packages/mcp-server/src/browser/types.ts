/**
 * Browser Control Types for HoloScript MCP Server
 * Enables AI agents to control HoloScript browser preview programmatically
 */

import type { Browser, Page, BrowserContext, CDPSession } from 'playwright';

/**
 * Browser session configuration
 */
export interface BrowserSessionConfig {
  /** Browser viewport width */
  width?: number;
  /** Browser viewport height */
  height?: number;
  /** Whether to run in headless mode */
  headless?: boolean;
  /** Device pixel ratio for high-DPI displays */
  deviceScaleFactor?: number;
  /** Browser timeout in milliseconds */
  timeout?: number;
}

export type BrowserControlMode = 'agent' | 'human';

export interface BrowserSessionLease {
  ownerId: string;
  tokenHash: string;
  issuedAt: number;
  expiresAt: number;
}

export interface BrowserOperationReceipt {
  schema: 'holoscript.browser-operation.v1';
  operation: string;
  sessionId: string;
  ownerId: string;
  controlMode: BrowserControlMode;
  controlEpoch: number;
  at: string;
  digest: string;
  details: Record<string, unknown>;
}

export interface BrowserSessionSnapshot {
  sessionId: string;
  ownerId: string;
  controlMode: BrowserControlMode;
  controlEpoch: number;
  createdAt: number;
  lastActivity: number;
  leaseExpiresAt: number;
  url: string;
  receiptCount: number;
}

/**
 * HoloScript scene validation result
 */
export interface SceneValidationResult {
  /** Whether the scene is valid */
  valid: boolean;
  /** Number of objects in the scene */
  objectCount: number;
  /** Performance metrics */
  performance: {
    fps: number;
    frameTime: number;
  };
  /** Errors encountered during validation */
  errors: string[];
  /** Warnings encountered during validation */
  warnings: string[];
}

/**
 * Trait validation result
 */
export interface TraitValidationResult {
  /** Object name */
  objectName: string;
  /** Trait being validated */
  trait: string;
  /** Whether the trait is properly applied */
  valid: boolean;
  /** Expected value */
  expected?: unknown;
  /** Actual value */
  actual?: unknown;
  /** Validation message */
  message?: string;
}

/**
 * Material validation result
 */
export interface MaterialValidationResult {
  /** Object name */
  objectName: string;
  /** Material property */
  property: string;
  /** Expected value */
  expected: number | string;
  /** Actual value */
  actual: number | string;
  /** Whether values match */
  matches: boolean;
  /** Tolerance for numeric comparisons */
  tolerance?: number;
}

/**
 * One captured console/log entry for read-only observation. Populated from CDP's
 * Runtime.consoleAPICalled (page-authored console.* calls) and Log.entryAdded (browser-level
 * warnings/errors, e.g. CSP violations, deprecated API use) — the same two sources DevTools'
 * own Console panel merges.
 */
export interface BrowserConsoleEntry {
  /** console.* method name (log/warn/error/...) or Log domain level (info/warning/error) */
  type: string;
  text: string;
  url?: string;
  lineNumber?: number;
  timestamp: string;
}

/**
 * One captured network request/response for read-only observation, populated from CDP's
 * Network domain (requestWillBeSent / responseReceived / loadingFailed).
 */
export interface BrowserNetworkEntry {
  requestId: string;
  url: string;
  method: string;
  resourceType?: string;
  status?: number;
  statusText?: string;
  failed?: boolean;
  failureText?: string;
  timestamp: string;
}

/**
 * Bounded, session-scoped buffers a CDP session pushes into as it observes; read (never
 * mutated) by the browser_session 'observe' operation. Bounded (see BrowserPool's
 * OBSERVATION_BUFFER_LIMIT) so a long-lived session can't grow this without limit.
 */
export interface BrowserObservationBuffers {
  console: BrowserConsoleEntry[];
  network: BrowserNetworkEntry[];
}

/**
 * Browser session state
 */
export interface BrowserSession {
  /** Unique session ID */
  id: string;
  /** Playwright browser instance */
  browser: Browser;
  /** Browser context */
  context: BrowserContext;
  /** Active page */
  page: Page;
  /** Session configuration */
  config: BrowserSessionConfig;
  /** Timestamp when session was created */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Lease custody; only a hash of the bearer token is retained. */
  lease: BrowserSessionLease;
  /** Whether the agent or a local human currently owns interaction. */
  controlMode: BrowserControlMode;
  /** Monotonic takeover/resume generation used to reject stale resumes. */
  controlEpoch: number;
  /** In-memory causal operation chain for the session. */
  receipts: BrowserOperationReceipt[];
  /** Origins the agent may navigate or resume into. */
  allowedOrigins: string[];
  /**
   * Raw CDP session backing read-only observation (DOM/console/network). Chromium-only,
   * matching this pool's chromium.launch() — undefined if CDP attachment failed, in which
   * case observation buffers stay empty rather than the whole session failing to open.
   */
  cdpSession?: CDPSession;
  /** Console/network history accumulated since session creation, newest last. */
  observation: BrowserObservationBuffers;
}

/**
 * Browser pool statistics
 */
export interface BrowserPoolStats {
  /** Number of active sessions */
  activeSessions: number;
  /** Number of idle sessions */
  idleSessions: number;
  /** Total sessions created */
  totalCreated: number;
  /** Total sessions destroyed */
  totalDestroyed: number;
  /** Average session lifetime in milliseconds */
  avgLifetime: number;
}

/**
 * Screenshot options
 */
export interface ScreenshotOptions {
  /** Output format */
  type?: 'png' | 'jpeg';
  /** JPEG quality (0-100) */
  quality?: number;
  /** Full page screenshot */
  fullPage?: boolean;
  /** Clip area */
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Browser execute result
 */
export interface BrowserExecuteResult {
  /** Whether execution was successful */
  success: boolean;
  /** Execution result value */
  result?: unknown;
  /** Error message if execution failed */
  error?: string;
  /** Console logs captured during execution */
  logs?: string[];
}
