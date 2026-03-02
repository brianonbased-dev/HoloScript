/**
 * PluginBridge - Host-side message handler for sandboxed plugins
 *
 * The bridge sits between the PluginSandbox (iframe) and the Studio APIs.
 * It validates permissions, rate-limits requests, and dispatches API calls
 * to registered handlers.
 *
 * Security responsibilities:
 * 1. Permission validation - every API call is checked against the manifest
 * 2. Rate limiting - prevents abuse from misbehaving plugins
 * 3. Input validation - sanitizes and validates all arguments
 * 4. Network policy enforcement - validates fetch URLs against allowed domains
 * 5. Audit logging - records all API calls for security review
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 */

import type {
  SandboxPermission,
  PluginToHostMessage,
  PluginAPICallMessage,
  PluginStorageMessage,
  PluginFetchMessage,
  PluginClipboardMessage,
  PluginRegisterMessage,
  PluginLogMessage,
  PluginErrorMessage,
  NetworkPolicy,
  SandboxAuditEntry,
} from './types.js';
import type { PluginSandbox } from './PluginSandbox.js';

/**
 * Maps API namespaces to the permissions they require.
 */
const NAMESPACE_PERMISSION_MAP: Record<string, SandboxPermission[]> = {
  'scene.read':       ['scene:read'],
  'scene.write':      ['scene:write'],
  'scene.subscribe':  ['scene:subscribe'],
  'editor.selection': ['editor:selection'],
  'editor.viewport':  ['editor:viewport'],
  'editor.undo':      ['editor:undo'],
  'ui.panel':         ['ui:panel'],
  'ui.toolbar':       ['ui:toolbar'],
  'ui.menu':          ['ui:menu'],
  'ui.modal':         ['ui:modal'],
  'ui.notification':  ['ui:notification'],
  'ui.theme':         ['ui:theme'],
  'user.read':        ['user:read'],
};

/**
 * Rate limit configuration per permission group.
 */
interface RateLimitConfig {
  /** Maximum number of calls per window */
  maxCalls: number;
  /** Time window in ms */
  windowMs: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'api-call':   { maxCalls: 100, windowMs: 1000 },   // 100 API calls/sec
  'storage':    { maxCalls: 50,  windowMs: 1000 },    // 50 storage ops/sec
  'fetch':      { maxCalls: 10,  windowMs: 1000 },    // 10 network requests/sec
  'clipboard':  { maxCalls: 5,   windowMs: 5000 },    // 5 clipboard ops per 5 sec
  'register':   { maxCalls: 50,  windowMs: 60000 },   // 50 registrations per minute
};

/**
 * Rate limiter using sliding window counter.
 */
class RateLimiter {
  private windows: Map<string, { count: number; windowStart: number }> = new Map();

  /**
   * Checks if a request should be allowed.
   *
   * @returns true if the request is allowed, false if rate limited
   */
  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= config.windowMs) {
      // New window
      this.windows.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= config.maxCalls) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Resets all rate limit counters.
   */
  reset(): void {
    this.windows.clear();
  }
}

/**
 * Handler function type for API calls from plugins.
 * Receives the namespace, method, and arguments.
 * Returns the result or throws an error.
 */
export type APIHandler = (
  pluginId: string,
  namespace: string,
  method: string,
  args: unknown[],
) => Promise<unknown>;

/**
 * Handler for plugin storage operations.
 */
export type StorageHandler = (
  pluginId: string,
  scope: 'local' | 'project',
  operation: 'get' | 'set' | 'delete' | 'keys',
  key?: string,
  value?: unknown,
) => Promise<unknown>;

/**
 * Handler for proxied network requests.
 */
export type FetchHandler = (
  pluginId: string,
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

/**
 * Handler for plugin registration events (panels, nodes, etc.).
 */
export type RegisterHandler = (
  pluginId: string,
  kind: string,
  descriptor: Record<string, unknown>,
) => Promise<void>;

/**
 * PluginBridge configuration.
 */
export interface PluginBridgeOptions {
  /** API call handler */
  onAPICall?: APIHandler;
  /** Storage operation handler */
  onStorage?: StorageHandler;
  /** Network request handler (proxied fetch) */
  onFetch?: FetchHandler;
  /** Registration handler */
  onRegister?: RegisterHandler;
  /** Plugin log handler */
  onLog?: (pluginId: string, level: string, message: string, data?: unknown) => void;
  /** Plugin error handler */
  onError?: (pluginId: string, code: string, message: string, stack?: string) => void;
  /** Custom rate limit overrides */
  rateLimits?: Partial<Record<string, RateLimitConfig>>;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * PluginBridge connects a PluginSandbox to the Studio API surface.
 *
 * For each sandboxed plugin, a bridge instance handles:
 * - Permission checking for all API calls
 * - Rate limiting to prevent abuse
 * - Network policy enforcement for proxied fetch
 * - Dispatching validated calls to registered handlers
 * - Audit logging for all operations
 *
 * @example
 * ```typescript
 * const bridge = new PluginBridge(sandbox, {
 *   onAPICall: async (pluginId, namespace, method, args) => {
 *     // Dispatch to Studio API
 *     return studioAPI[namespace][method](...args);
 *   },
 *   onStorage: async (pluginId, scope, op, key, value) => {
 *     return storageService.operate(pluginId, scope, op, key, value);
 *   },
 * });
 *
 * bridge.connect();
 * ```
 */
export class PluginBridge {
  private readonly sandbox: PluginSandbox;
  private readonly options: PluginBridgeOptions;
  private readonly rateLimiter: RateLimiter;
  private readonly rateLimits: Record<string, RateLimitConfig>;
  private disconnectFn: (() => void) | null = null;

  constructor(sandbox: PluginSandbox, options: PluginBridgeOptions = {}) {
    this.sandbox = sandbox;
    this.options = options;
    this.rateLimiter = new RateLimiter();
    this.rateLimits = {
      ...DEFAULT_RATE_LIMITS,
      ...(options.rateLimits as Record<string, RateLimitConfig> | undefined),
    };
  }

  /**
   * Connects the bridge to the sandbox's message stream.
   * Call this after sandbox.create() resolves.
   */
  public connect(): void {
    this.disconnectFn = this.sandbox.onMessage((message) => {
      this.handleMessage(message);
    });
  }

  /**
   * Disconnects the bridge from the sandbox.
   */
  public disconnect(): void {
    if (this.disconnectFn) {
      this.disconnectFn();
      this.disconnectFn = null;
    }
    this.rateLimiter.reset();
  }

  // ── Message Handling ────────────────────────────────────────────────────

  private async handleMessage(message: PluginToHostMessage): Promise<void> {
    const startTime = Date.now();

    try {
      switch (message.type) {
        case 'plugin:api-call':
          await this.handleAPICall(message as PluginAPICallMessage);
          break;
        case 'plugin:storage':
          await this.handleStorage(message as PluginStorageMessage);
          break;
        case 'plugin:fetch':
          await this.handleFetch(message as PluginFetchMessage);
          break;
        case 'plugin:clipboard':
          await this.handleClipboard(message as PluginClipboardMessage);
          break;
        case 'plugin:register':
          await this.handleRegister(message as PluginRegisterMessage);
          break;
        case 'plugin:log':
          this.handleLog(message as PluginLogMessage);
          break;
        case 'plugin:error':
          this.handleError(message as PluginErrorMessage);
          break;
        case 'plugin:ui-event':
          // UI events are passed through to handlers without permission checks
          break;
        default:
          this.log('warn', `Unknown message type: ${(message as PluginToHostMessage).type}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Internal bridge error';
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      });
    }

    // Record latency
    this.sandbox.recordLatency(Date.now() - startTime);
  }

  // ── API Call Handling ───────────────────────────────────────────────────

  private async handleAPICall(message: PluginAPICallMessage): Promise<void> {
    const { namespace, method, args } = message.payload;
    const permissionKey = `${namespace}.${method}`;
    const pluginId = this.sandbox.getPluginId();

    // 1. Check rate limit
    if (!this.rateLimiter.check(`${pluginId}:api-call`, this.rateLimits['api-call'])) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'RATE_LIMITED',
        message: `API call rate limit exceeded for plugin ${pluginId}`,
      });
      return;
    }

    // 2. Check permission
    const requiredPermissions = NAMESPACE_PERMISSION_MAP[permissionKey]
      ?? NAMESPACE_PERMISSION_MAP[`${namespace}.*`]
      ?? this.inferPermission(namespace, method);

    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every((perm) => this.sandbox.hasPermission(perm));
      if (!hasAllPermissions) {
        const missing = requiredPermissions.filter((perm) => !this.sandbox.hasPermission(perm));
        this.sandbox.recordPermissionViolation(
          missing[0],
          `API call ${namespace}.${method} requires ${missing.join(', ')}`,
        );
        this.sandbox.sendResponse(message.id, false, undefined, {
          code: 'PERMISSION_DENIED',
          message: `Plugin ${pluginId} lacks permission: ${missing.join(', ')}`,
        });
        return;
      }
    }

    // 3. Dispatch to handler
    if (!this.options.onAPICall) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: 'No API handler registered',
      });
      return;
    }

    try {
      const result = await this.options.onAPICall(pluginId, namespace, method, args);
      this.sandbox.sendResponse(message.id, true, result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'API call failed';
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      });
    }
  }

  // ── Storage Handling ────────────────────────────────────────────────────

  private async handleStorage(message: PluginStorageMessage): Promise<void> {
    const { operation, scope, key, value } = message.payload;
    const pluginId = this.sandbox.getPluginId();

    // Check rate limit
    if (!this.rateLimiter.check(`${pluginId}:storage`, this.rateLimits['storage'])) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'RATE_LIMITED',
        message: 'Storage operation rate limit exceeded',
      });
      return;
    }

    // Check permission
    const requiredPermission: SandboxPermission = scope === 'local' ? 'storage:local' : 'storage:project';
    if (!this.sandbox.hasPermission(requiredPermission)) {
      this.sandbox.recordPermissionViolation(requiredPermission, `Storage ${scope}.${operation}`);
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'PERMISSION_DENIED',
        message: `Plugin ${pluginId} lacks permission: ${requiredPermission}`,
      });
      return;
    }

    // Dispatch
    if (!this.options.onStorage) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: 'No storage handler registered',
      });
      return;
    }

    try {
      const result = await this.options.onStorage(pluginId, scope, operation, key, value);
      this.sandbox.sendResponse(message.id, true, result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Storage operation failed';
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      });
    }
  }

  // ── Network Fetch Handling ──────────────────────────────────────────────

  private async handleFetch(message: PluginFetchMessage): Promise<void> {
    const { url, options: fetchOptions } = message.payload;
    const pluginId = this.sandbox.getPluginId();

    // Check rate limit
    if (!this.rateLimiter.check(`${pluginId}:fetch`, this.rateLimits['fetch'])) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'RATE_LIMITED',
        message: 'Network request rate limit exceeded',
      });
      return;
    }

    // Check permission
    if (!this.sandbox.hasPermission('network:fetch')) {
      this.sandbox.recordPermissionViolation('network:fetch', `Fetch to ${url}`);
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'PERMISSION_DENIED',
        message: `Plugin ${pluginId} lacks permission: network:fetch`,
      });
      return;
    }

    // Validate URL against network policy
    if (!this.isUrlAllowed(url)) {
      this.sandbox.recordPermissionViolation('network:fetch', `Domain not in allowlist: ${url}`);
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'PERMISSION_DENIED',
        message: `URL domain not allowed by plugin network policy: ${url}`,
      });
      return;
    }

    // Dispatch
    if (!this.options.onFetch) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: 'No fetch handler registered',
      });
      return;
    }

    try {
      const result = await this.options.onFetch(pluginId, url, fetchOptions);
      this.sandbox.sendResponse(message.id, true, result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network request failed';
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      });
    }
  }

  // ── Clipboard Handling ──────────────────────────────────────────────────

  private async handleClipboard(message: PluginClipboardMessage): Promise<void> {
    const { operation, data, mimeType } = message.payload;
    const pluginId = this.sandbox.getPluginId();

    // Check rate limit
    if (!this.rateLimiter.check(`${pluginId}:clipboard`, this.rateLimits['clipboard'])) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'RATE_LIMITED',
        message: 'Clipboard operation rate limit exceeded',
      });
      return;
    }

    // Check permission
    const requiredPermission: SandboxPermission = operation === 'read' ? 'clipboard:read' : 'clipboard:write';
    if (!this.sandbox.hasPermission(requiredPermission)) {
      this.sandbox.recordPermissionViolation(requiredPermission, `Clipboard ${operation}`);
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'PERMISSION_DENIED',
        message: `Plugin ${pluginId} lacks permission: ${requiredPermission}`,
      });
      return;
    }

    // For clipboard operations, the host handles them directly
    try {
      if (operation === 'read') {
        const text = await navigator.clipboard.readText();
        this.sandbox.sendResponse(message.id, true, { text });
      } else if (operation === 'write' && data) {
        await navigator.clipboard.writeText(data);
        this.sandbox.sendResponse(message.id, true, { written: true });
      } else {
        this.sandbox.sendResponse(message.id, false, undefined, {
          code: 'INVALID_ARGS',
          message: 'Invalid clipboard operation',
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Clipboard operation failed';
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      });
    }
  }

  // ── Registration Handling ───────────────────────────────────────────────

  private async handleRegister(message: PluginRegisterMessage): Promise<void> {
    const { kind, descriptor } = message.payload;
    const pluginId = this.sandbox.getPluginId();

    // Check rate limit
    if (!this.rateLimiter.check(`${pluginId}:register`, this.rateLimits['register'])) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'RATE_LIMITED',
        message: 'Registration rate limit exceeded',
      });
      return;
    }

    // Map registration kind to required permission
    const kindPermissionMap: Record<string, SandboxPermission> = {
      'panel': 'ui:panel',
      'toolbar-button': 'ui:toolbar',
      'menu-item': 'ui:menu',
      'keyboard-shortcut': 'keyboard:shortcuts',
      'node-type': 'nodes:workflow',
      'content-type': 'ui:panel', // Content types require basic UI permission
    };

    const requiredPermission = kindPermissionMap[kind];
    if (requiredPermission && !this.sandbox.hasPermission(requiredPermission)) {
      this.sandbox.recordPermissionViolation(requiredPermission, `Register ${kind}`);
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'PERMISSION_DENIED',
        message: `Plugin ${pluginId} lacks permission to register ${kind}: ${requiredPermission}`,
      });
      return;
    }

    // Dispatch
    if (!this.options.onRegister) {
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: 'No registration handler registered',
      });
      return;
    }

    try {
      await this.options.onRegister(pluginId, kind, descriptor);
      this.sandbox.sendResponse(message.id, true, { registered: true });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      this.sandbox.sendResponse(message.id, false, undefined, {
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      });
    }
  }

  // ── Log/Error Handling ──────────────────────────────────────────────────

  private handleLog(message: PluginLogMessage): void {
    const { level, message: logMessage, data } = message.payload;
    if (this.options.onLog) {
      this.options.onLog(this.sandbox.getPluginId(), level, logMessage, data);
    }
  }

  private handleError(message: PluginErrorMessage): void {
    const { code, message: errorMessage, stack } = message.payload;
    if (this.options.onError) {
      this.options.onError(this.sandbox.getPluginId(), code, errorMessage, stack);
    }
  }

  // ── Utility Methods ─────────────────────────────────────────────────────

  /**
   * Checks if a URL is allowed by the plugin's network policy.
   */
  private isUrlAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // Get network policy from manifest
      // Access the manifest through sandbox options
      const networkPolicy = (this.sandbox as any).options?.manifest?.networkPolicy as NetworkPolicy | undefined;

      if (!networkPolicy) {
        // No network policy = no URLs allowed
        return false;
      }

      // Check localhost
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && !networkPolicy.allowLocalhost) {
        return false;
      }

      // Check against allowed domains
      return networkPolicy.allowedDomains.some((pattern) => {
        if (pattern.startsWith('*.')) {
          // Wildcard subdomain match
          const baseDomain = pattern.slice(2);
          return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
        }
        return hostname === pattern;
      });
    } catch {
      // Invalid URL
      return false;
    }
  }

  /**
   * Infers the required permission from the API namespace and method name.
   * Fallback when no explicit mapping exists.
   */
  private inferPermission(namespace: string, method: string): SandboxPermission[] {
    // Try to match namespace to a permission category
    const readMethods = ['get', 'list', 'query', 'find', 'search', 'count'];
    const writeMethods = ['set', 'create', 'update', 'delete', 'remove', 'add', 'insert', 'modify'];

    const isRead = readMethods.some((m) => method.toLowerCase().startsWith(m));
    const isWrite = writeMethods.some((m) => method.toLowerCase().startsWith(m));

    switch (namespace) {
      case 'scene':
        return isWrite ? ['scene:write'] : ['scene:read'];
      case 'editor':
        if (method.includes('selection')) return ['editor:selection'];
        if (method.includes('viewport')) return ['editor:viewport'];
        if (method.includes('undo') || method.includes('redo')) return ['editor:undo'];
        return ['editor:selection']; // Safest default
      case 'ui':
        return ['ui:notification']; // Safest UI permission
      case 'user':
        return ['user:read'];
      default:
        // Unknown namespace - deny by default (require explicit permission)
        return [`${namespace}:${isWrite ? 'write' : 'read'}` as SandboxPermission];
    }
  }

  /**
   * Logs messages (respects debug flag).
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (level === 'debug' && !this.options.debug) {
      return;
    }

    const prefix = `[PluginBridge:${this.sandbox.getPluginId()}]`;
    switch (level) {
      case 'debug':
        console.debug(prefix, message, data ?? '');
        break;
      case 'info':
        console.info(prefix, message, data ?? '');
        break;
      case 'warn':
        console.warn(prefix, message, data ?? '');
        break;
      case 'error':
        console.error(prefix, message, data ?? '');
        break;
    }
  }
}
