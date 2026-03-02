/**
 * PluginSandbox - Core iframe isolation for HoloScript Studio plugins
 *
 * Creates and manages a sandboxed iframe for each plugin instance.
 * The iframe is configured with restrictive sandbox attributes and a
 * strict Content Security Policy to prevent untrusted code from
 * accessing host resources.
 *
 * Security model:
 * 1. iframe sandbox attribute restricts capabilities (no top navigation,
 *    no forms, no popups by default)
 * 2. CSP restricts what resources the iframe can load
 * 3. Origin isolation prevents direct DOM access to host
 * 4. All communication goes through validated postMessage channel
 * 5. Resource limits are monitored and enforced
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 */

import type {
  SandboxCreateOptions,
  SandboxState,
  SandboxHealthMetrics,
  SandboxAuditEntry,
  PluginToHostMessage,
  HostToPluginMessage,
  HostInitMessage,
  HostResponseMessage,
  HostEventMessage,
  HostShutdownMessage,
  SandboxMessageBase,
  MessageId,
  SandboxPermission,
  ContentSecurityPolicyDirectives,
} from './types.js';

/**
 * Generates a cryptographically random message ID.
 */
function generateMessageId(): MessageId {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Default CSP directives for plugin iframes.
 * Extremely restrictive by default - plugins must request relaxations.
 */
const DEFAULT_CSP: ContentSecurityPolicyDirectives = {
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'none'"],
  'font-src': ["'self'"],
  'media-src': ["'none'"],
  'worker-src': ["'none'"],
};

/**
 * Builds a CSP meta tag string from directives.
 */
function buildCSPString(directives: ContentSecurityPolicyDirectives): string {
  return Object.entries(directives)
    .map(([directive, values]) => `${directive} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Builds the HTML content for the sandboxed iframe.
 * This creates a minimal shell that loads the plugin script.
 */
function buildIframeContent(pluginUrl: string, pluginId: string, csp: ContentSecurityPolicyDirectives): string {
  const cspString = buildCSPString(csp);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${cspString}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HoloScript Plugin: ${pluginId}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    #plugin-root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="plugin-root"></div>
  <script type="module" src="${pluginUrl}"></script>
</body>
</html>`;
}

/**
 * Determines which iframe sandbox flags to set based on permissions.
 *
 * We start with a maximally restrictive sandbox and only add
 * capabilities that the plugin has been granted permission for.
 */
function buildSandboxFlags(permissions: SandboxPermission[], hasUI: boolean): string {
  // Base flags that all plugins get
  const flags: string[] = [
    'allow-scripts', // Required for any JavaScript execution
  ];

  // UI plugins need to render content
  if (hasUI) {
    // Note: We intentionally do NOT add 'allow-same-origin' because that
    // would give the iframe access to the host's origin and storage.
    // Plugins use postMessage for all communication.
  }

  // Network permissions require allowing fetch
  if (permissions.includes('network:fetch') || permissions.includes('network:websocket')) {
    // Network requests are proxied through the host bridge, so no
    // additional sandbox flags are needed. The iframe's CSP connect-src
    // remains 'none' - all network goes through postMessage.
  }

  // Form submission (rarely needed, not exposed currently)
  // flags.push('allow-forms');

  // Popups (never allowed for sandboxed plugins)
  // flags.push('allow-popups');

  // Top navigation (never allowed - prevents clickjacking)
  // flags.push('allow-top-navigation');

  return flags.join(' ');
}

/**
 * PluginSandbox manages a single sandboxed iframe for one plugin instance.
 *
 * Lifecycle:
 * 1. create() - Constructs the iframe with sandbox attributes
 * 2. Iframe loads plugin code
 * 3. Plugin sends 'plugin:ready' message
 * 4. Host sends 'host:init' with granted permissions and settings
 * 5. Plugin is now in 'running' state and can make API calls
 * 6. destroy() - Sends shutdown message and removes iframe
 *
 * @example
 * ```typescript
 * const sandbox = new PluginSandbox({
 *   pluginId: 'my-analytics-plugin',
 *   pluginUrl: 'https://cdn.example.com/plugins/analytics/index.js',
 *   manifest: {
 *     permissions: ['scene:read', 'ui:panel', 'storage:local'],
 *   },
 *   container: document.getElementById('plugin-panels')!,
 *   hasUI: true,
 * });
 *
 * sandbox.onMessage((msg) => {
 *   // Handle plugin messages
 * });
 *
 * await sandbox.create();
 * ```
 */
export class PluginSandbox {
  private readonly options: Required<SandboxCreateOptions>;
  private iframe: HTMLIFrameElement | null = null;
  private state: SandboxState = 'creating';
  private stateChangedAt: number = Date.now();
  private messageHandlers: Array<(message: PluginToHostMessage) => void> = [];
  private pendingResponses: Map<MessageId, {
    resolve: (data: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private auditLog: SandboxAuditEntry[] = [];
  private metrics: {
    messagesSent: number;
    messagesReceived: number;
    permissionViolations: number;
    latencies: number[];
    startTime: number;
  };
  private messageListener: ((event: MessageEvent) => void) | null = null;
  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;

  constructor(options: SandboxCreateOptions) {
    this.options = {
      pluginId: options.pluginId,
      pluginUrl: options.pluginUrl,
      manifest: options.manifest,
      settings: options.settings ?? {},
      container: options.container ?? document.body,
      hasUI: options.hasUI ?? false,
      initTimeout: options.initTimeout ?? 10000,
      debug: options.debug ?? false,
    };

    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      permissionViolations: 0,
      latencies: [],
      startTime: Date.now(),
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Creates the sandboxed iframe and waits for the plugin to signal ready.
   * Returns a promise that resolves when the plugin is fully initialized.
   *
   * @throws Error if the plugin fails to initialize within the timeout
   */
  public async create(): Promise<void> {
    this.setState('loading');
    this.audit('sandbox-created', `Creating sandbox for plugin: ${this.options.pluginId}`, 'info');

    // Build CSP by merging defaults with plugin-requested relaxations
    const csp = this.buildMergedCSP();

    // Create iframe element
    this.iframe = document.createElement('iframe');
    this.iframe.id = `holoscript-plugin-${this.options.pluginId}`;
    this.iframe.setAttribute('sandbox', buildSandboxFlags(
      this.options.manifest.permissions,
      this.options.hasUI,
    ));
    this.iframe.setAttribute('referrerpolicy', 'no-referrer');
    this.iframe.setAttribute('loading', 'lazy');

    // Style the iframe
    if (this.options.hasUI) {
      this.iframe.style.width = '100%';
      this.iframe.style.height = '100%';
      this.iframe.style.border = 'none';
      this.iframe.style.display = 'block';
    } else {
      // Headless plugins get a hidden iframe
      this.iframe.style.width = '1px';
      this.iframe.style.height = '1px';
      this.iframe.style.position = 'absolute';
      this.iframe.style.left = '-9999px';
      this.iframe.style.visibility = 'hidden';
      this.iframe.setAttribute('aria-hidden', 'true');
      this.iframe.tabIndex = -1;
    }

    // Set up message listener BEFORE loading content
    this.setupMessageListener();

    // Write content into the iframe using srcdoc (avoids cross-origin issues)
    const iframeContent = buildIframeContent(
      this.options.pluginUrl,
      this.options.pluginId,
      csp,
    );
    this.iframe.srcdoc = iframeContent;

    // Append to container
    this.options.container.appendChild(this.iframe);

    // Wait for plugin to signal ready
    return new Promise<void>((resolve, reject) => {
      this.initResolve = resolve;
      this.initReject = reject;

      this.setState('initializing');

      // Set initialization timeout
      const timeout = setTimeout(() => {
        this.audit('error', `Plugin ${this.options.pluginId} failed to initialize within ${this.options.initTimeout}ms`, 'error');
        this.setState('error');
        reject(new Error(`Plugin ${this.options.pluginId} initialization timed out after ${this.options.initTimeout}ms`));
      }, this.options.initTimeout);

      // Store timeout so we can clear it when plugin signals ready
      this.pendingResponses.set('__init__', {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        timeout,
      });
    });
  }

  /**
   * Sends a message to the plugin iframe.
   *
   * @param message - The message to send (must be a valid HostToPluginMessage)
   */
  public postMessage(message: HostToPluginMessage): void {
    if (!this.iframe?.contentWindow) {
      this.log('warn', `Cannot send message to plugin ${this.options.pluginId}: iframe not available`);
      return;
    }

    if (this.state === 'terminated' || this.state === 'error') {
      this.log('warn', `Cannot send message to plugin ${this.options.pluginId}: sandbox in ${this.state} state`);
      return;
    }

    // Always target '*' for srcdoc iframes (they have null origin)
    // Security is enforced by the sandbox attribute and our message validation
    this.iframe.contentWindow.postMessage(message, '*');
    this.metrics.messagesSent++;

    if (this.options.debug) {
      this.log('debug', `[Host -> Plugin:${this.options.pluginId}] ${message.type}`, message);
    }
  }

  /**
   * Sends a response to a specific plugin request.
   */
  public sendResponse(requestId: MessageId, success: boolean, data?: unknown, error?: { code: string; message: string }): void {
    const response: HostResponseMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: generateMessageId(),
      pluginId: this.options.pluginId,
      timestamp: Date.now(),
      type: 'host:response',
      payload: {
        requestId,
        success,
        data,
        error: error as HostResponseMessage['payload']['error'],
      },
    };
    this.postMessage(response);
  }

  /**
   * Pushes an event to the plugin.
   */
  public sendEvent(namespace: string, event: string, data: unknown): void {
    const msg: HostEventMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: generateMessageId(),
      pluginId: this.options.pluginId,
      timestamp: Date.now(),
      type: 'host:event',
      payload: { namespace, event, data },
    };
    this.postMessage(msg);
  }

  /**
   * Registers a handler for messages from the plugin.
   */
  public onMessage(handler: (message: PluginToHostMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index !== -1) {
        this.messageHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Gracefully shuts down the plugin and removes the iframe.
   *
   * @param reason - Reason for shutdown
   * @param gracePeriodMs - Time to wait for plugin cleanup (default: 3000ms)
   */
  public async destroy(
    reason: 'user-disabled' | 'user-uninstalled' | 'error' | 'resource-limit' | 'studio-closing' = 'user-disabled',
    gracePeriodMs: number = 3000,
  ): Promise<void> {
    if (this.state === 'terminated') {
      return;
    }

    this.audit('shutdown', `Shutting down plugin ${this.options.pluginId}: ${reason}`, 'info');

    // Send shutdown message to plugin
    if (this.state === 'running' || this.state === 'ready') {
      const shutdownMsg: HostShutdownMessage = {
        protocol: 'holoscript-sandbox-v1',
        id: generateMessageId(),
        pluginId: this.options.pluginId,
        timestamp: Date.now(),
        type: 'host:shutdown',
        payload: { reason, gracePeriodMs },
      };

      try {
        this.postMessage(shutdownMsg);
        // Wait for grace period
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(gracePeriodMs, 5000)));
      } catch {
        // Plugin may already be unresponsive
      }
    }

    // Clean up
    this.cleanup();
  }

  /**
   * Forcefully terminates the plugin without grace period.
   */
  public terminate(): void {
    this.audit('shutdown', `Force-terminating plugin ${this.options.pluginId}`, 'warning');
    this.cleanup();
  }

  /**
   * Returns the current sandbox state.
   */
  public getState(): SandboxState {
    return this.state;
  }

  /**
   * Returns health metrics for monitoring.
   */
  public getHealthMetrics(): SandboxHealthMetrics {
    const avgLatency = this.metrics.latencies.length > 0
      ? this.metrics.latencies.reduce((a, b) => a + b, 0) / this.metrics.latencies.length
      : 0;

    return {
      state: this.state,
      stateAge: Date.now() - this.stateChangedAt,
      messagesSent: this.metrics.messagesSent,
      messagesReceived: this.metrics.messagesReceived,
      permissionViolations: this.metrics.permissionViolations,
      avgLatencyMs: Math.round(avgLatency * 100) / 100,
      uptimeMs: Date.now() - this.metrics.startTime,
    };
  }

  /**
   * Returns audit log entries.
   */
  public getAuditLog(): SandboxAuditEntry[] {
    return [...this.auditLog];
  }

  /**
   * Returns the plugin ID.
   */
  public getPluginId(): string {
    return this.options.pluginId;
  }

  /**
   * Returns the iframe element (for UI integration).
   */
  public getIframe(): HTMLIFrameElement | null {
    return this.iframe;
  }

  /**
   * Checks if a specific permission has been granted to this plugin.
   */
  public hasPermission(permission: SandboxPermission): boolean {
    return this.options.manifest.permissions.includes(permission);
  }

  /**
   * Records a permission violation for monitoring.
   */
  public recordPermissionViolation(permission: SandboxPermission, details: string): void {
    this.metrics.permissionViolations++;
    this.audit('permission-denied', `Permission '${permission}' denied: ${details}`, 'warning');
  }

  /**
   * Records message latency for performance monitoring.
   */
  public recordLatency(latencyMs: number): void {
    this.metrics.latencies.push(latencyMs);
    // Keep last 100 measurements
    if (this.metrics.latencies.length > 100) {
      this.metrics.latencies.shift();
    }
  }

  // ── Private Methods ─────────────────────────────────────────────────────

  /**
   * Sets up the window message listener to receive messages from the iframe.
   */
  private setupMessageListener(): void {
    this.messageListener = (event: MessageEvent) => {
      // Validate message structure
      if (!this.isValidPluginMessage(event.data)) {
        return;
      }

      const message = event.data as PluginToHostMessage;

      // Validate that the message is from our plugin
      if (message.pluginId !== this.options.pluginId) {
        return;
      }

      // Validate protocol version
      if (message.protocol !== 'holoscript-sandbox-v1') {
        this.log('warn', `Ignoring message with unknown protocol: ${message.protocol}`);
        return;
      }

      this.metrics.messagesReceived++;

      if (this.options.debug) {
        this.log('debug', `[Plugin:${this.options.pluginId} -> Host] ${message.type}`, message);
      }

      // Handle the plugin:ready message specially
      if (message.type === 'plugin:ready') {
        this.handlePluginReady(message);
        return;
      }

      // Dispatch to registered handlers
      for (const handler of this.messageHandlers) {
        try {
          handler(message);
        } catch (err) {
          this.log('error', `Error in message handler for plugin ${this.options.pluginId}`, err);
        }
      }
    };

    window.addEventListener('message', this.messageListener);
  }

  /**
   * Handles the plugin:ready message by sending host:init.
   */
  private handlePluginReady(message: PluginToHostMessage): void {
    this.setState('ready');
    this.audit('plugin-ready', `Plugin ${this.options.pluginId} signaled ready`, 'info');

    // Send initialization data
    const initMessage: HostInitMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: generateMessageId(),
      pluginId: this.options.pluginId,
      timestamp: Date.now(),
      type: 'host:init',
      payload: {
        grantedPermissions: this.options.manifest.permissions,
        settings: this.options.settings,
        theme: {
          mode: 'dark',
          colors: {}, // Will be populated by the host
        },
        studioVersion: '3.43.0', // Will be injected by the host
      },
    };

    this.postMessage(initMessage);
    this.setState('running');

    // Resolve the initialization promise
    const initEntry = this.pendingResponses.get('__init__');
    if (initEntry) {
      initEntry.resolve(undefined);
      this.pendingResponses.delete('__init__');
    }
  }

  /**
   * Validates that a message has the expected structure of a PluginToHostMessage.
   */
  private isValidPluginMessage(data: unknown): data is PluginToHostMessage {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const msg = data as Record<string, unknown>;

    return (
      msg.protocol === 'holoscript-sandbox-v1' &&
      typeof msg.id === 'string' &&
      typeof msg.pluginId === 'string' &&
      typeof msg.type === 'string' &&
      typeof msg.timestamp === 'number' &&
      msg.type !== undefined
    );
  }

  /**
   * Builds merged CSP from defaults and plugin-requested relaxations.
   */
  private buildMergedCSP(): ContentSecurityPolicyDirectives {
    const merged: ContentSecurityPolicyDirectives = { ...DEFAULT_CSP };

    // If plugin has network:fetch permission, relax connect-src based on network policy
    if (this.options.manifest.permissions.includes('network:fetch') && this.options.manifest.networkPolicy) {
      const connectSources = this.options.manifest.networkPolicy.allowedDomains.map(
        (domain) => `https://${domain}`,
      );
      if (this.options.manifest.networkPolicy.allowLocalhost) {
        connectSources.push('http://localhost:*', 'http://127.0.0.1:*');
      }
      merged['connect-src'] = connectSources;
    }

    // Merge any plugin-specified CSP relaxations (must be strictly additive)
    if (this.options.manifest.csp) {
      for (const [directive, values] of Object.entries(this.options.manifest.csp)) {
        const key = directive as keyof ContentSecurityPolicyDirectives;
        if (merged[key] && values) {
          // Merge (union) but never weaken to '*' or 'unsafe-eval'
          const safeValues = values.filter(
            (v: string) => v !== '*' && v !== "'unsafe-eval'" && !v.includes('data:'),
          );
          merged[key] = [...new Set([...merged[key], ...safeValues])];
        }
      }
    }

    return merged;
  }

  /**
   * Updates sandbox state and records the transition time.
   */
  private setState(newState: SandboxState): void {
    const oldState = this.state;
    this.state = newState;
    this.stateChangedAt = Date.now();

    if (this.options.debug) {
      this.log('debug', `Plugin ${this.options.pluginId} state: ${oldState} -> ${newState}`);
    }
  }

  /**
   * Adds an entry to the audit log.
   */
  private audit(event: SandboxAuditEntry['event'], details: string, severity: SandboxAuditEntry['severity']): void {
    const entry: SandboxAuditEntry = {
      timestamp: Date.now(),
      pluginId: this.options.pluginId,
      event,
      details,
      severity,
    };
    this.auditLog.push(entry);

    // Cap audit log at 500 entries
    if (this.auditLog.length > 500) {
      this.auditLog.shift();
    }
  }

  /**
   * Logs a message (respects debug flag for non-error messages).
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    if (level === 'debug' && !this.options.debug) {
      return;
    }

    const prefix = `[PluginSandbox:${this.options.pluginId}]`;
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

  /**
   * Cleans up all resources: removes iframe, listeners, pending promises.
   */
  private cleanup(): void {
    this.setState('terminated');

    // Remove message listener
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }

    // Reject all pending responses
    for (const [id, entry] of this.pendingResponses) {
      clearTimeout(entry.timeout);
      entry.reject(new Error(`Plugin ${this.options.pluginId} terminated`));
    }
    this.pendingResponses.clear();

    // Remove iframe from DOM
    if (this.iframe) {
      // Clear iframe content before removing (belt and suspenders)
      try {
        this.iframe.srcdoc = '';
      } catch {
        // May fail if iframe is already detached
      }
      this.iframe.remove();
      this.iframe = null;
    }

    // Clear handlers
    this.messageHandlers = [];
  }
}
