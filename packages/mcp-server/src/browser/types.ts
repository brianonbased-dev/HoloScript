/**
 * Browser Control Types for HoloScript MCP Server
 * Enables AI agents to control HoloScript browser preview programmatically
 */

import type { Browser, Page, BrowserContext } from 'playwright';

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
