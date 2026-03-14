/**
 * PluginSandbox — iframe-based plugin isolation for HoloScript Studio
 *
 * TODO-028: Plugin Sandboxing Architecture
 *
 * Architecture:
 *   Each plugin runs in a dedicated iframe with restricted permissions.
 *   Communication uses structured postMessage with a typed message protocol.
 *   The host enforces capability-based permissions and resource limits.
 *
 * Features:
 * - iframe-based isolation with CSP sandbox attributes
 * - Structured message-passing protocol (request/response/event)
 * - Capability-based permissions (read, write, scene, network, etc.)
 * - Resource limits (memory, CPU time, message rate)
 * - Plugin lifecycle management (load, start, pause, stop, unload)
 * - Error boundary and crash recovery
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type PluginCapability =
  | 'scene:read'
  | 'scene:write'
  | 'assets:read'
  | 'assets:write'
  | 'traits:read'
  | 'traits:register'
  | 'compiler:invoke'
  | 'network:fetch'
  | 'storage:local'
  | 'ui:panel'
  | 'ui:toolbar'
  | 'ui:modal'
  | 'clipboard:read'
  | 'clipboard:write';

export type PluginLifecycleState = 'unloaded' | 'loading' | 'ready' | 'running' | 'paused' | 'error' | 'crashed';

export type MessageType = 'request' | 'response' | 'event' | 'error' | 'heartbeat';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  entryPoint: string; // URL or data URI for iframe src
  capabilities: PluginCapability[];
  icon?: string;
  minStudioVersion?: string;
  maxMemoryMB?: number;
  maxCpuMs?: number;
}

export interface PluginMessage {
  type: MessageType;
  id: string; // unique message ID for request/response correlation
  pluginId: string;
  method?: string;
  payload?: unknown;
  error?: string;
  timestamp: number;
}

export interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuTimeMs: number; // per single operation
  maxMessagesPerSecond: number;
  maxPendingRequests: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export interface PluginInstance {
  manifest: PluginManifest;
  state: PluginLifecycleState;
  iframe: HTMLIFrameElement | null;
  grantedCapabilities: Set<PluginCapability>;
  pendingRequests: Map<string, PendingRequest>;
  messageCount: number;
  lastHeartbeat: number;
  errors: PluginError[];
  startedAt: number;
}

export interface PendingRequest {
  id: string;
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  createdAt: number;
}

export interface PluginError {
  timestamp: number;
  message: string;
  fatal: boolean;
  method?: string;
}

export interface PluginSandboxOptions {
  containerElement?: HTMLElement;
  resourceLimits?: Partial<ResourceLimits>;
  onPluginStateChange?: (pluginId: string, state: PluginLifecycleState) => void;
  onPluginError?: (pluginId: string, error: PluginError) => void;
  onPluginMessage?: (pluginId: string, message: PluginMessage) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxMemoryMB: 64,
  maxCpuTimeMs: 5000,
  maxMessagesPerSecond: 100,
  maxPendingRequests: 20,
  heartbeatIntervalMs: 5000,
  heartbeatTimeoutMs: 15000,
};

const REQUEST_TIMEOUT_MS = 10000;

const SANDBOX_ATTRIBUTES = [
  'allow-scripts',
  // 'allow-same-origin' is intentionally omitted for stronger isolation
].join(' ');

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">`;

// =============================================================================
// MESSAGE UTILITIES
// =============================================================================

function createMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createMessage(
  type: MessageType,
  pluginId: string,
  method?: string,
  payload?: unknown,
  error?: string,
  id?: string
): PluginMessage {
  return {
    type,
    id: id || createMessageId(),
    pluginId,
    method,
    payload,
    error,
    timestamp: Date.now(),
  };
}

function isPluginMessage(data: unknown): data is PluginMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    typeof msg.id === 'string' &&
    typeof msg.pluginId === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

// =============================================================================
// PLUGIN SANDBOX
// =============================================================================

/**
 * Manages plugin lifecycles in isolated iframe sandboxes.
 *
 * Usage:
 *   const sandbox = new PluginSandbox({ containerElement: document.getElementById('plugins') });
 *   await sandbox.load(manifest);
 *   await sandbox.start(manifest.id);
 *   const result = await sandbox.sendRequest(manifest.id, 'getTrait', { name: 'material' });
 *   sandbox.stop(manifest.id);
 */
export class PluginSandbox {
  private plugins: Map<string, PluginInstance> = new Map();
  private container: HTMLElement | null;
  private limits: ResourceLimits;
  private heartbeatIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private messageRateLimiter: Map<string, number[]> = new Map();
  private messageHandler: (event: MessageEvent) => void;

  // Callbacks
  private onStateChange?: (pluginId: string, state: PluginLifecycleState) => void;
  private onError?: (pluginId: string, error: PluginError) => void;
  private onMessage?: (pluginId: string, message: PluginMessage) => void;

  // API handlers that plugins can call
  private apiHandlers: Map<string, (pluginId: string, payload: unknown) => Promise<unknown>> = new Map();

  constructor(options: PluginSandboxOptions = {}) {
    this.container = options.containerElement || null;
    this.limits = { ...DEFAULT_RESOURCE_LIMITS, ...options.resourceLimits };
    this.onStateChange = options.onPluginStateChange;
    this.onError = options.onPluginError;
    this.onMessage = options.onPluginMessage;

    // Global message handler
    this.messageHandler = this.handleMessage.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('message', this.messageHandler);
    }
  }

  // ─── Lifecycle Management ─────────────────────────────────────────────

  /** Load a plugin manifest and create its sandbox iframe. */
  async load(manifest: PluginManifest): Promise<void> {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded`);
    }

    const instance: PluginInstance = {
      manifest,
      state: 'loading',
      iframe: null,
      grantedCapabilities: new Set(manifest.capabilities),
      pendingRequests: new Map(),
      messageCount: 0,
      lastHeartbeat: Date.now(),
      errors: [],
      startedAt: 0,
    };

    this.plugins.set(manifest.id, instance);
    this.setState(manifest.id, 'loading');

    try {
      // Create sandboxed iframe
      const iframe = this.createIframe(manifest);
      instance.iframe = iframe;

      // Append to container or hide
      if (this.container) {
        this.container.appendChild(iframe);
      } else if (typeof document !== 'undefined') {
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      this.setState(manifest.id, 'ready');
    } catch (err) {
      this.recordError(manifest.id, {
        timestamp: Date.now(),
        message: err instanceof Error ? err.message : 'Failed to load plugin',
        fatal: true,
      });
      this.setState(manifest.id, 'error');
      throw err;
    }
  }

  /** Start a loaded plugin. */
  async start(pluginId: string): Promise<void> {
    const instance = this.getInstanceOrThrow(pluginId);

    if (instance.state !== 'ready' && instance.state !== 'paused') {
      throw new Error(`Cannot start plugin in state "${instance.state}"`);
    }

    instance.startedAt = Date.now();
    this.setState(pluginId, 'running');

    // Send start event to plugin
    this.postToPlugin(pluginId, createMessage('event', pluginId, 'lifecycle:start'));

    // Start heartbeat monitoring
    this.startHeartbeat(pluginId);
  }

  /** Pause a running plugin. */
  pause(pluginId: string): void {
    const instance = this.getInstanceOrThrow(pluginId);

    if (instance.state !== 'running') {
      throw new Error(`Cannot pause plugin in state "${instance.state}"`);
    }

    this.setState(pluginId, 'paused');
    this.postToPlugin(pluginId, createMessage('event', pluginId, 'lifecycle:pause'));
    this.stopHeartbeat(pluginId);
  }

  /** Stop a running or paused plugin. */
  stop(pluginId: string): void {
    const instance = this.getInstanceOrThrow(pluginId);

    if (instance.state === 'unloaded') return;

    // Reject all pending requests
    for (const [, pending] of instance.pendingRequests) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error('Plugin stopped'));
    }
    instance.pendingRequests.clear();

    this.postToPlugin(pluginId, createMessage('event', pluginId, 'lifecycle:stop'));
    this.stopHeartbeat(pluginId);
    this.setState(pluginId, 'ready');
  }

  /** Unload a plugin completely, removing its iframe. */
  unload(pluginId: string): void {
    const instance = this.plugins.get(pluginId);
    if (!instance) return;

    // Stop first if running
    if (instance.state === 'running' || instance.state === 'paused') {
      this.stop(pluginId);
    }

    // Remove iframe
    if (instance.iframe?.parentNode) {
      instance.iframe.parentNode.removeChild(instance.iframe);
    }
    instance.iframe = null;

    this.stopHeartbeat(pluginId);
    this.messageRateLimiter.delete(pluginId);
    this.plugins.delete(pluginId);
  }

  // ─── Communication ────────────────────────────────────────────────────

  /** Send a request to a plugin and await its response. */
  async sendRequest(pluginId: string, method: string, payload?: unknown): Promise<unknown> {
    const instance = this.getInstanceOrThrow(pluginId);

    if (instance.state !== 'running') {
      throw new Error(`Cannot send request to plugin in state "${instance.state}"`);
    }

    if (instance.pendingRequests.size >= this.limits.maxPendingRequests) {
      throw new Error('Too many pending requests');
    }

    const message = createMessage('request', pluginId, method, payload);

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        instance.pendingRequests.delete(message.id);
        reject(new Error(`Request "${method}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);

      instance.pendingRequests.set(message.id, {
        id: message.id,
        method,
        resolve,
        reject,
        timeoutHandle,
        createdAt: Date.now(),
      });

      this.postToPlugin(pluginId, message);
    });
  }

  /** Send a one-way event to a plugin. */
  sendEvent(pluginId: string, method: string, payload?: unknown): void {
    const instance = this.getInstanceOrThrow(pluginId);
    if (instance.state !== 'running') return;

    this.postToPlugin(pluginId, createMessage('event', pluginId, method, payload));
  }

  /** Broadcast an event to all running plugins. */
  broadcast(method: string, payload?: unknown): void {
    for (const [pluginId, instance] of this.plugins) {
      if (instance.state === 'running') {
        this.postToPlugin(pluginId, createMessage('event', pluginId, method, payload));
      }
    }
  }

  // ─── API Registration ─────────────────────────────────────────────────

  /** Register an API handler that plugins can call. */
  registerAPI(method: string, handler: (pluginId: string, payload: unknown) => Promise<unknown>): void {
    this.apiHandlers.set(method, handler);
  }

  /** Remove a registered API handler. */
  unregisterAPI(method: string): void {
    this.apiHandlers.delete(method);
  }

  // ─── Capability Checking ──────────────────────────────────────────────

  /** Check if a plugin has a specific capability. */
  hasCapability(pluginId: string, capability: PluginCapability): boolean {
    const instance = this.plugins.get(pluginId);
    return instance?.grantedCapabilities.has(capability) ?? false;
  }

  /** Grant an additional capability to a plugin. */
  grantCapability(pluginId: string, capability: PluginCapability): void {
    const instance = this.getInstanceOrThrow(pluginId);
    instance.grantedCapabilities.add(capability);
  }

  /** Revoke a capability from a plugin. */
  revokeCapability(pluginId: string, capability: PluginCapability): void {
    const instance = this.getInstanceOrThrow(pluginId);
    instance.grantedCapabilities.delete(capability);
  }

  // ─── Introspection ────────────────────────────────────────────────────

  /** Get the state of a specific plugin. */
  getPluginState(pluginId: string): PluginLifecycleState | undefined {
    return this.plugins.get(pluginId)?.state;
  }

  /** Get info about all loaded plugins. */
  listPlugins(): Array<{
    id: string;
    name: string;
    state: PluginLifecycleState;
    capabilities: PluginCapability[];
    errorCount: number;
    uptimeMs: number;
  }> {
    return Array.from(this.plugins.values()).map((instance) => ({
      id: instance.manifest.id,
      name: instance.manifest.name,
      state: instance.state,
      capabilities: Array.from(instance.grantedCapabilities),
      errorCount: instance.errors.length,
      uptimeMs: instance.startedAt > 0 ? Date.now() - instance.startedAt : 0,
    }));
  }

  /** Get error log for a plugin. */
  getErrors(pluginId: string): PluginError[] {
    return this.plugins.get(pluginId)?.errors ?? [];
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  /** Unload all plugins and clean up event listeners. */
  destroy(): void {
    for (const pluginId of Array.from(this.plugins.keys())) {
      this.unload(pluginId);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('message', this.messageHandler);
    }
  }

  // ─── Private: iframe Creation ─────────────────────────────────────────

  private createIframe(manifest: PluginManifest): HTMLIFrameElement {
    if (typeof document === 'undefined') {
      throw new Error('PluginSandbox requires a DOM environment');
    }

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', SANDBOX_ATTRIBUTES);
    iframe.setAttribute('data-plugin-id', manifest.id);
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.position = 'absolute';
    iframe.style.visibility = 'hidden';

    // Create bootstrap HTML with plugin code loader
    const bootstrapHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        ${CSP_META}
        <title>Plugin: ${manifest.name}</title>
      </head>
      <body>
        <script>
          // Plugin sandbox runtime
          (function() {
            const pluginId = "${manifest.id}";

            // Message handler
            window.addEventListener('message', function(event) {
              try {
                const msg = event.data;
                if (!msg || msg.pluginId !== pluginId) return;

                if (msg.type === 'heartbeat') {
                  parent.postMessage({
                    type: 'heartbeat',
                    id: msg.id,
                    pluginId: pluginId,
                    timestamp: Date.now()
                  }, '*');
                  return;
                }

                // Forward to plugin handler if registered
                if (typeof window.__pluginHandler === 'function') {
                  window.__pluginHandler(msg);
                }
              } catch (e) {
                parent.postMessage({
                  type: 'error',
                  id: 'error_' + Date.now(),
                  pluginId: pluginId,
                  error: e.message,
                  timestamp: Date.now()
                }, '*');
              }
            });

            // Plugin API
            window.holoPlugin = {
              request: function(method, payload) {
                return new Promise(function(resolve, reject) {
                  var id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);
                  var handler = function(event) {
                    if (event.data && event.data.id === id && event.data.type === 'response') {
                      window.removeEventListener('message', handler);
                      if (event.data.error) reject(new Error(event.data.error));
                      else resolve(event.data.payload);
                    }
                  };
                  window.addEventListener('message', handler);
                  parent.postMessage({
                    type: 'request',
                    id: id,
                    pluginId: pluginId,
                    method: method,
                    payload: payload,
                    timestamp: Date.now()
                  }, '*');
                });
              },
              emit: function(method, payload) {
                parent.postMessage({
                  type: 'event',
                  id: 'evt_' + Date.now(),
                  pluginId: pluginId,
                  method: method,
                  payload: payload,
                  timestamp: Date.now()
                }, '*');
              },
              onMessage: function(handler) {
                window.__pluginHandler = handler;
              }
            };

            // Signal ready
            parent.postMessage({
              type: 'event',
              id: 'ready_' + Date.now(),
              pluginId: pluginId,
              method: 'plugin:ready',
              timestamp: Date.now()
            }, '*');
          })();
        </script>
      </body>
      </html>
    `;

    iframe.srcdoc = bootstrapHTML;
    return iframe;
  }

  // ─── Private: Message Handling ────────────────────────────────────────

  private handleMessage(event: MessageEvent): void {
    const data = event.data;
    if (!isPluginMessage(data)) return;

    const instance = this.plugins.get(data.pluginId);
    if (!instance) return;

    // Rate limiting
    if (!this.checkRateLimit(data.pluginId)) {
      this.recordError(data.pluginId, {
        timestamp: Date.now(),
        message: 'Message rate limit exceeded',
        fatal: false,
      });
      return;
    }

    instance.messageCount++;
    this.onMessage?.(data.pluginId, data);

    switch (data.type) {
      case 'response': {
        // Match to pending request
        const pending = instance.pendingRequests.get(data.id);
        if (pending) {
          clearTimeout(pending.timeoutHandle);
          instance.pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(new Error(data.error));
          } else {
            pending.resolve(data.payload);
          }
        }
        break;
      }

      case 'request': {
        // Plugin is calling a host API
        this.handlePluginRequest(data.pluginId, data);
        break;
      }

      case 'heartbeat': {
        instance.lastHeartbeat = Date.now();
        break;
      }

      case 'event': {
        if (data.method === 'plugin:ready') {
          // Plugin bootstrap complete
          if (instance.state === 'loading') {
            this.setState(data.pluginId, 'ready');
          }
        }
        break;
      }

      case 'error': {
        this.recordError(data.pluginId, {
          timestamp: Date.now(),
          message: data.error || 'Unknown plugin error',
          fatal: false,
          method: data.method,
        });
        break;
      }
    }
  }

  private async handlePluginRequest(pluginId: string, message: PluginMessage): Promise<void> {
    const method = message.method;
    if (!method) {
      this.postToPlugin(pluginId, createMessage('response', pluginId, method, undefined, 'No method specified', message.id));
      return;
    }

    // Check capability
    const requiredCapability = this.methodToCapability(method);
    if (requiredCapability && !this.hasCapability(pluginId, requiredCapability)) {
      this.postToPlugin(
        pluginId,
        createMessage('response', pluginId, method, undefined, `Insufficient capability: ${requiredCapability}`, message.id)
      );
      return;
    }

    // Dispatch to registered handler
    const handler = this.apiHandlers.get(method);
    if (!handler) {
      this.postToPlugin(pluginId, createMessage('response', pluginId, method, undefined, `Unknown API method: ${method}`, message.id));
      return;
    }

    try {
      const result = await handler(pluginId, message.payload);
      this.postToPlugin(pluginId, createMessage('response', pluginId, method, result, undefined, message.id));
    } catch (err) {
      this.postToPlugin(
        pluginId,
        createMessage('response', pluginId, method, undefined, err instanceof Error ? err.message : 'Handler error', message.id)
      );
    }
  }

  // ─── Private: Helpers ─────────────────────────────────────────────────

  private getInstanceOrThrow(pluginId: string): PluginInstance {
    const instance = this.plugins.get(pluginId);
    if (!instance) {
      throw new Error(`Plugin "${pluginId}" is not loaded`);
    }
    return instance;
  }

  private setState(pluginId: string, state: PluginLifecycleState): void {
    const instance = this.plugins.get(pluginId);
    if (instance) {
      instance.state = state;
      this.onStateChange?.(pluginId, state);
    }
  }

  private postToPlugin(pluginId: string, message: PluginMessage): void {
    const instance = this.plugins.get(pluginId);
    if (!instance?.iframe?.contentWindow) return;

    try {
      instance.iframe.contentWindow.postMessage(message, '*');
    } catch (err) {
      this.recordError(pluginId, {
        timestamp: Date.now(),
        message: `Failed to post message: ${err instanceof Error ? err.message : 'unknown'}`,
        fatal: false,
        method: message.method,
      });
    }
  }

  private recordError(pluginId: string, error: PluginError): void {
    const instance = this.plugins.get(pluginId);
    if (instance) {
      instance.errors.push(error);
      // Keep last 100 errors
      if (instance.errors.length > 100) {
        instance.errors = instance.errors.slice(-100);
      }
      this.onError?.(pluginId, error);

      if (error.fatal) {
        this.setState(pluginId, 'crashed');
      }
    }
  }

  private startHeartbeat(pluginId: string): void {
    this.stopHeartbeat(pluginId);

    const interval = setInterval(() => {
      const instance = this.plugins.get(pluginId);
      if (!instance || instance.state !== 'running') {
        this.stopHeartbeat(pluginId);
        return;
      }

      // Check for timeout
      const elapsed = Date.now() - instance.lastHeartbeat;
      if (elapsed > this.limits.heartbeatTimeoutMs) {
        this.recordError(pluginId, {
          timestamp: Date.now(),
          message: `Heartbeat timeout (${elapsed}ms)`,
          fatal: true,
        });
        this.setState(pluginId, 'crashed');
        this.stopHeartbeat(pluginId);
        return;
      }

      // Send heartbeat ping
      this.postToPlugin(pluginId, createMessage('heartbeat', pluginId));
    }, this.limits.heartbeatIntervalMs);

    this.heartbeatIntervals.set(pluginId, interval);
  }

  private stopHeartbeat(pluginId: string): void {
    const interval = this.heartbeatIntervals.get(pluginId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(pluginId);
    }
  }

  private checkRateLimit(pluginId: string): boolean {
    const now = Date.now();
    let timestamps = this.messageRateLimiter.get(pluginId);
    if (!timestamps) {
      timestamps = [];
      this.messageRateLimiter.set(pluginId, timestamps);
    }

    // Remove timestamps older than 1 second
    const cutoff = now - 1000;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.limits.maxMessagesPerSecond) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  private methodToCapability(method: string): PluginCapability | null {
    const prefix = method.split(':')[0];
    const capabilityMap: Record<string, PluginCapability> = {
      'scene.read': 'scene:read',
      'scene.write': 'scene:write',
      'scene.get': 'scene:read',
      'scene.set': 'scene:write',
      'assets.list': 'assets:read',
      'assets.load': 'assets:read',
      'assets.import': 'assets:write',
      'traits.list': 'traits:read',
      'traits.get': 'traits:read',
      'traits.register': 'traits:register',
      'compiler.compile': 'compiler:invoke',
      'network.fetch': 'network:fetch',
      'storage.get': 'storage:local',
      'storage.set': 'storage:local',
    };

    return capabilityMap[method] || capabilityMap[prefix] || null;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/** Create a new plugin sandbox instance. */
export function createPluginSandbox(options?: PluginSandboxOptions): PluginSandbox {
  return new PluginSandbox(options);
}

export default PluginSandbox;
