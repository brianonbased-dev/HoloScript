/**
 * PluginGuestSDK - SDK that runs inside the sandboxed iframe
 *
 * This is the API surface that plugin developers interact with.
 * It provides a clean, promise-based API for communicating with
 * the host Studio through the postMessage bridge.
 *
 * Plugin code never directly accesses the host DOM or APIs.
 * Instead, all operations are serialized as messages and sent
 * to the host for validation and execution.
 *
 * @module @holoscript/studio-plugin-sdk/sandbox/guest
 *
 * @example
 * ```typescript
 * // Inside plugin code (runs in iframe)
 * import { PluginGuestSDK } from '@holoscript/studio-plugin-sdk/sandbox/guest';
 *
 * const sdk = new PluginGuestSDK('my-plugin', '1.0.0');
 *
 * sdk.onInit((initData) => {
 *   console.log('Plugin initialized with permissions:', initData.grantedPermissions);
 *   console.log('Settings:', initData.settings);
 * });
 *
 * sdk.onShutdown((reason) => {
 *   console.log('Shutting down:', reason);
 *   // Cleanup resources
 * });
 *
 * // Read scene data
 * const nodes = await sdk.scene.getNodes();
 *
 * // Listen for events
 * sdk.on('scene', 'nodesChanged', (data) => {
 *   console.log('Scene changed:', data);
 * });
 *
 * // Store data
 * await sdk.storage.set('lastOpenedTab', 'analytics');
 *
 * // Make network request (proxied through host)
 * const response = await sdk.fetch('https://api.example.com/data');
 *
 * // Signal ready to the host
 * sdk.ready();
 * ```
 */

import type {
  SandboxPermission,
  SandboxMessageBase,
  PluginToHostMessage,
  HostToPluginMessage,
  HostInitMessage,
  HostResponseMessage,
  HostEventMessage,
  HostShutdownMessage,
  MessageId,
} from './types.js';

/**
 * Generates a unique message ID.
 */
function generateMessageId(): MessageId {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Initialization data received from the host.
 */
export interface GuestInitData {
  grantedPermissions: SandboxPermission[];
  settings: Record<string, unknown>;
  theme: {
    mode: 'light' | 'dark';
    colors: Record<string, string>;
  };
  studioVersion: string;
}

/**
 * Options for creating a PluginGuestSDK instance.
 */
export interface GuestSDKOptions {
  /** Default timeout for API calls in ms (default: 5000) */
  defaultTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Pending request waiting for a response from the host.
 */
interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  sentAt: number;
}

/**
 * PluginGuestSDK provides the plugin-facing API inside the sandboxed iframe.
 *
 * This SDK handles:
 * - Lifecycle management (ready, init, shutdown)
 * - Promise-based API calls to the host
 * - Event subscription from the host
 * - Storage access (scoped to plugin)
 * - Network requests (proxied through host)
 * - Clipboard access
 * - Extension registration (panels, nodes, etc.)
 *
 * All communication is done via postMessage - the plugin never has
 * direct access to the host's DOM, storage, or network.
 */
export class PluginGuestSDK {
  private readonly pluginId: string;
  private readonly version: string;
  private readonly options: Required<GuestSDKOptions>;
  private pendingRequests: Map<MessageId, PendingRequest> = new Map();
  private eventHandlers: Map<string, Array<(data: unknown) => void>> = new Map();
  private initHandler: ((data: GuestInitData) => void) | null = null;
  private shutdownHandler: ((reason: string) => void) | null = null;
  private isReady: boolean = false;
  private initData: GuestInitData | null = null;

  /** Scene API namespace */
  public readonly scene: SceneAPI;
  /** Editor API namespace */
  public readonly editor: EditorAPI;
  /** UI API namespace */
  public readonly ui: UIAPI;
  /** Storage API namespace */
  public readonly storage: StorageAPI;
  /** User API namespace */
  public readonly user: UserAPI;

  constructor(pluginId: string, version: string, options: GuestSDKOptions = {}) {
    this.pluginId = pluginId;
    this.version = version;
    this.options = {
      defaultTimeout: options.defaultTimeout ?? 5000,
      debug: options.debug ?? false,
    };

    // Initialize API namespaces
    this.scene = new SceneAPI(this);
    this.editor = new EditorAPI(this);
    this.ui = new UIAPI(this);
    this.storage = new StorageAPI(this);
    this.user = new UserAPI(this);

    // Set up message listener
    this.setupMessageListener();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Signals to the host that the plugin is ready to receive messages.
   * This MUST be called after the plugin has finished its initial setup.
   */
  public ready(): void {
    if (this.isReady) {
      this.log('warn', 'Plugin already signaled ready');
      return;
    }

    this.sendToHost({
      protocol: 'holoscript-sandbox-v1',
      id: generateMessageId(),
      pluginId: this.pluginId,
      timestamp: Date.now(),
      type: 'plugin:ready',
      payload: {
        version: this.version,
      },
    } as PluginToHostMessage);

    this.isReady = true;
  }

  /**
   * Registers a handler for initialization data from the host.
   * Called after ready() when the host sends permissions and settings.
   */
  public onInit(handler: (data: GuestInitData) => void): void {
    this.initHandler = handler;
    // If init data was already received, call immediately
    if (this.initData) {
      handler(this.initData);
    }
  }

  /**
   * Registers a handler for shutdown signals from the host.
   */
  public onShutdown(handler: (reason: string) => void): void {
    this.shutdownHandler = handler;
  }

  /**
   * Returns the granted permissions (available after init).
   */
  public getPermissions(): SandboxPermission[] {
    return this.initData?.grantedPermissions ?? [];
  }

  /**
   * Checks if a specific permission was granted.
   */
  public hasPermission(permission: SandboxPermission): boolean {
    return this.getPermissions().includes(permission);
  }

  /**
   * Returns plugin settings (available after init).
   */
  public getSettings(): Record<string, unknown> {
    return this.initData?.settings ?? {};
  }

  /**
   * Returns theme info (available after init).
   */
  public getTheme(): GuestInitData['theme'] | null {
    return this.initData?.theme ?? null;
  }

  // ── Event System ────────────────────────────────────────────────────────

  /**
   * Subscribes to an event from the host.
   *
   * @param namespace - Event namespace (e.g., 'scene', 'editor')
   * @param event - Event name (e.g., 'nodesChanged', 'selectionChanged')
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  public on(namespace: string, event: string, handler: (data: unknown) => void): () => void {
    const key = `${namespace}:${event}`;
    const handlers = this.eventHandlers.get(key) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(key, handlers);

    return () => {
      const current = this.eventHandlers.get(key);
      if (current) {
        const index = current.indexOf(handler);
        if (index !== -1) {
          current.splice(index, 1);
        }
      }
    };
  }

  // ── Network ─────────────────────────────────────────────────────────────

  /**
   * Makes a network request proxied through the host.
   * The host validates the URL against the plugin's network policy.
   *
   * @param url - Request URL
   * @param options - Request options
   * @returns Response data
   */
  public async fetch(
    url: string,
    options?: { method?: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    return this.callHost('plugin:fetch', { url, options }) as Promise<{
      status: number;
      headers: Record<string, string>;
      body: string;
    }>;
  }

  // ── Clipboard ───────────────────────────────────────────────────────────

  /**
   * Reads text from the clipboard (requires clipboard:read permission).
   */
  public async clipboardRead(): Promise<string> {
    const result = await this.callHost('plugin:clipboard', {
      operation: 'read',
    });
    return (result as { text: string }).text;
  }

  /**
   * Writes text to the clipboard (requires clipboard:write permission).
   */
  public async clipboardWrite(text: string): Promise<void> {
    await this.callHost('plugin:clipboard', {
      operation: 'write',
      data: text,
    });
  }

  // ── Registration ────────────────────────────────────────────────────────

  /**
   * Registers a UI panel with the host.
   */
  public async registerPanel(descriptor: {
    id: string;
    label: string;
    icon?: string;
    position?: 'left' | 'right' | 'bottom' | 'modal';
    width?: number;
    height?: number;
    shortcut?: string;
  }): Promise<void> {
    await this.callHost('plugin:register', {
      kind: 'panel',
      descriptor,
    });
  }

  /**
   * Registers a toolbar button with the host.
   */
  public async registerToolbarButton(descriptor: {
    id: string;
    label: string;
    icon?: string;
    tooltip?: string;
    position?: 'left' | 'center' | 'right';
    color?: string;
  }): Promise<void> {
    await this.callHost('plugin:register', {
      kind: 'toolbar-button',
      descriptor,
    });
  }

  /**
   * Registers a menu item with the host.
   */
  public async registerMenuItem(descriptor: {
    id: string;
    label: string;
    path: string;
    icon?: string;
    shortcut?: string;
  }): Promise<void> {
    await this.callHost('plugin:register', {
      kind: 'menu-item',
      descriptor,
    });
  }

  /**
   * Registers a keyboard shortcut with the host.
   */
  public async registerKeyboardShortcut(descriptor: {
    id: string;
    keys: string;
    description: string;
    scope?: 'global' | 'editor' | 'panel';
  }): Promise<void> {
    await this.callHost('plugin:register', {
      kind: 'keyboard-shortcut',
      descriptor,
    });
  }

  /**
   * Registers a custom node type with the host.
   */
  public async registerNodeType(descriptor: {
    type: string;
    label: string;
    category?: string;
    icon?: string;
    color?: string;
    description?: string;
    inputs?: Array<{ id: string; label: string; type?: string }>;
    outputs?: Array<{ id: string; label: string; type?: string }>;
  }): Promise<void> {
    await this.callHost('plugin:register', {
      kind: 'node-type',
      descriptor,
    });
  }

  // ── Logging ─────────────────────────────────────────────────────────────

  /**
   * Sends a log message to the host (appears in Studio developer tools).
   */
  public log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    this.sendToHost({
      protocol: 'holoscript-sandbox-v1',
      id: generateMessageId(),
      pluginId: this.pluginId,
      timestamp: Date.now(),
      type: 'plugin:log',
      payload: { level, message, data },
    } as PluginToHostMessage);
  }

  /**
   * Reports an error to the host.
   */
  public reportError(code: string, message: string, stack?: string): void {
    this.sendToHost({
      protocol: 'holoscript-sandbox-v1',
      id: generateMessageId(),
      pluginId: this.pluginId,
      timestamp: Date.now(),
      type: 'plugin:error',
      payload: { code, message, stack },
    } as PluginToHostMessage);
  }

  // ── Core Communication ──────────────────────────────────────────────────

  /**
   * Makes an API call to the host via the specified message type.
   * Returns a promise that resolves with the response data.
   *
   * @internal Used by API namespace classes
   */
  public callHost(type: string, payload: Record<string, unknown>, timeout?: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const messageId = generateMessageId();
      const timeoutMs = timeout ?? this.options.defaultTimeout;

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`API call timed out after ${timeoutMs}ms: ${type}`));
      }, timeoutMs);

      // Store pending request
      this.pendingRequests.set(messageId, {
        resolve,
        reject,
        timeout: timeoutHandle,
        sentAt: Date.now(),
      });

      // Send message to host
      this.sendToHost({
        protocol: 'holoscript-sandbox-v1',
        id: messageId,
        pluginId: this.pluginId,
        timestamp: Date.now(),
        type,
        payload,
      } as unknown as PluginToHostMessage);
    });
  }

  /**
   * Makes an API call to a specific namespace.method on the host.
   *
   * @internal Used by API namespace classes
   */
  public callAPI(namespace: string, method: string, args: unknown[] = []): Promise<unknown> {
    return this.callHost('plugin:api-call', { namespace, method, args });
  }

  // ── Private Methods ─────────────────────────────────────────────────────

  /**
   * Sends a message to the host via postMessage.
   */
  private sendToHost(message: PluginToHostMessage): void {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      // We're inside an iframe - send to parent
      window.parent.postMessage(message, '*');
    } else {
      // Not in an iframe (e.g., testing) - log warning
      if (this.options.debug) {
        console.debug('[GuestSDK] Not in iframe, message not sent:', message.type);
      }
    }
  }

  /**
   * Sets up the message listener for host messages.
   */
  private setupMessageListener(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data;

      // Validate message structure
      if (!this.isValidHostMessage(data)) {
        return;
      }

      const message = data as HostToPluginMessage;

      // Validate it's for our plugin
      if (message.pluginId !== this.pluginId) {
        return;
      }

      switch (message.type) {
        case 'host:init':
          this.handleHostInit(message as HostInitMessage);
          break;
        case 'host:response':
          this.handleHostResponse(message as HostResponseMessage);
          break;
        case 'host:event':
          this.handleHostEvent(message as HostEventMessage);
          break;
        case 'host:shutdown':
          this.handleHostShutdown(message as HostShutdownMessage);
          break;
      }
    });
  }

  /**
   * Handles host:init message.
   */
  private handleHostInit(message: HostInitMessage): void {
    this.initData = message.payload;
    if (this.initHandler) {
      this.initHandler(message.payload);
    }
  }

  /**
   * Handles host:response message - resolves/rejects pending request.
   */
  private handleHostResponse(message: HostResponseMessage): void {
    const { requestId, success, data, error } = message.payload;
    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      if (this.options.debug) {
        console.debug('[GuestSDK] Received response for unknown request:', requestId);
      }
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (success) {
      pending.resolve(data);
    } else {
      pending.reject(new Error(`${error?.code}: ${error?.message}`));
    }
  }

  /**
   * Handles host:event message - dispatches to registered handlers.
   */
  private handleHostEvent(message: HostEventMessage): void {
    const { namespace, event, data } = message.payload;
    const key = `${namespace}:${event}`;
    const handlers = this.eventHandlers.get(key);

    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[GuestSDK] Error in event handler ${key}:`, err);
        }
      }
    }
  }

  /**
   * Handles host:shutdown message.
   */
  private handleHostShutdown(message: HostShutdownMessage): void {
    const { reason } = message.payload;
    if (this.shutdownHandler) {
      this.shutdownHandler(reason);
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Plugin shutting down'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Validates that a message has the expected structure of a HostToPluginMessage.
   */
  private isValidHostMessage(data: unknown): data is HostToPluginMessage {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const msg = data as Record<string, unknown>;
    return (
      msg.protocol === 'holoscript-sandbox-v1' &&
      typeof msg.id === 'string' &&
      typeof msg.pluginId === 'string' &&
      typeof msg.type === 'string' &&
      typeof msg.timestamp === 'number'
    );
  }
}

// ── API Namespace Classes ─────────────────────────────────────────────────────

/**
 * Scene API - read and modify the scene graph.
 */
class SceneAPI {
  constructor(private sdk: PluginGuestSDK) {}

  /** Get all nodes in the scene */
  async getNodes(): Promise<unknown[]> {
    return this.sdk.callAPI('scene', 'getNodes') as Promise<unknown[]>;
  }

  /** Get a specific node by ID */
  async getNode(nodeId: string): Promise<unknown> {
    return this.sdk.callAPI('scene', 'getNode', [nodeId]);
  }

  /** Get node children */
  async getChildren(nodeId: string): Promise<unknown[]> {
    return this.sdk.callAPI('scene', 'getChildren', [nodeId]) as Promise<unknown[]>;
  }

  /** Get the root node */
  async getRoot(): Promise<unknown> {
    return this.sdk.callAPI('scene', 'getRoot');
  }

  /** Create a new node */
  async createNode(parentId: string, nodeData: Record<string, unknown>): Promise<unknown> {
    return this.sdk.callAPI('scene', 'createNode', [parentId, nodeData]);
  }

  /** Update a node's properties */
  async updateNode(nodeId: string, properties: Record<string, unknown>): Promise<void> {
    await this.sdk.callAPI('scene', 'updateNode', [nodeId, properties]);
  }

  /** Delete a node */
  async deleteNode(nodeId: string): Promise<void> {
    await this.sdk.callAPI('scene', 'deleteNode', [nodeId]);
  }

  /** Subscribe to scene changes */
  onNodesChanged(handler: (data: unknown) => void): () => void {
    return this.sdk.on('scene', 'nodesChanged', handler);
  }

  /** Subscribe to node addition */
  onNodeAdded(handler: (data: unknown) => void): () => void {
    return this.sdk.on('scene', 'nodeAdded', handler);
  }

  /** Subscribe to node removal */
  onNodeRemoved(handler: (data: unknown) => void): () => void {
    return this.sdk.on('scene', 'nodeRemoved', handler);
  }
}

/**
 * Editor API - control the editor state.
 */
class EditorAPI {
  constructor(private sdk: PluginGuestSDK) {}

  /** Get current selection */
  async getSelection(): Promise<string[]> {
    return this.sdk.callAPI('editor', 'getSelection') as Promise<string[]>;
  }

  /** Set current selection */
  async setSelection(nodeIds: string[]): Promise<void> {
    await this.sdk.callAPI('editor', 'setSelection', [nodeIds]);
  }

  /** Get viewport state */
  async getViewport(): Promise<{ position: number[]; zoom: number; rotation: number[] }> {
    return this.sdk.callAPI('editor', 'getViewport') as Promise<{
      position: number[];
      zoom: number;
      rotation: number[];
    }>;
  }

  /** Set viewport state */
  async setViewport(viewport: { position?: number[]; zoom?: number; rotation?: number[] }): Promise<void> {
    await this.sdk.callAPI('editor', 'setViewport', [viewport]);
  }

  /** Focus on specific nodes */
  async focusNodes(nodeIds: string[]): Promise<void> {
    await this.sdk.callAPI('editor', 'focusNodes', [nodeIds]);
  }

  /** Push an undo operation */
  async pushUndo(label: string, undoFn: string, redoFn: string): Promise<void> {
    await this.sdk.callAPI('editor', 'pushUndo', [label, undoFn, redoFn]);
  }

  /** Subscribe to selection changes */
  onSelectionChanged(handler: (data: unknown) => void): () => void {
    return this.sdk.on('editor', 'selectionChanged', handler);
  }

  /** Subscribe to viewport changes */
  onViewportChanged(handler: (data: unknown) => void): () => void {
    return this.sdk.on('editor', 'viewportChanged', handler);
  }
}

/**
 * UI API - interact with Studio's UI system.
 */
class UIAPI {
  constructor(private sdk: PluginGuestSDK) {}

  /** Show a notification toast */
  async showNotification(message: string, options?: {
    type?: 'info' | 'success' | 'warning' | 'error';
    duration?: number;
  }): Promise<void> {
    await this.sdk.callAPI('ui', 'showNotification', [message, options]);
  }

  /** Show a modal dialog */
  async showModal(options: {
    title: string;
    message: string;
    buttons?: Array<{ label: string; value: string; variant?: 'primary' | 'secondary' | 'danger' }>;
  }): Promise<string> {
    return this.sdk.callAPI('ui', 'showModal', [options]) as Promise<string>;
  }

  /** Get current theme */
  async getTheme(): Promise<{ mode: 'light' | 'dark'; colors: Record<string, string> }> {
    return this.sdk.callAPI('ui', 'getTheme') as Promise<{
      mode: 'light' | 'dark';
      colors: Record<string, string>;
    }>;
  }

  /** Subscribe to theme changes */
  onThemeChanged(handler: (data: unknown) => void): () => void {
    return this.sdk.on('ui', 'themeChanged', handler);
  }
}

/**
 * Storage API - plugin-scoped data persistence.
 */
class StorageAPI {
  constructor(private sdk: PluginGuestSDK) {}

  /** Get a value from local storage */
  async get(key: string): Promise<unknown> {
    return this.sdk.callHost('plugin:storage', {
      operation: 'get',
      scope: 'local',
      key,
    });
  }

  /** Set a value in local storage */
  async set(key: string, value: unknown): Promise<void> {
    await this.sdk.callHost('plugin:storage', {
      operation: 'set',
      scope: 'local',
      key,
      value,
    });
  }

  /** Delete a value from local storage */
  async delete(key: string): Promise<void> {
    await this.sdk.callHost('plugin:storage', {
      operation: 'delete',
      scope: 'local',
      key,
    });
  }

  /** Get all keys in local storage */
  async keys(): Promise<string[]> {
    return this.sdk.callHost('plugin:storage', {
      operation: 'keys',
      scope: 'local',
    }) as Promise<string[]>;
  }

  /** Get a value from project storage */
  async getProject(key: string): Promise<unknown> {
    return this.sdk.callHost('plugin:storage', {
      operation: 'get',
      scope: 'project',
      key,
    });
  }

  /** Set a value in project storage */
  async setProject(key: string, value: unknown): Promise<void> {
    await this.sdk.callHost('plugin:storage', {
      operation: 'set',
      scope: 'project',
      key,
      value,
    });
  }

  /** Delete a value from project storage */
  async deleteProject(key: string): Promise<void> {
    await this.sdk.callHost('plugin:storage', {
      operation: 'delete',
      scope: 'project',
      key,
    });
  }

  /** Get all keys in project storage */
  async keysProject(): Promise<string[]> {
    return this.sdk.callHost('plugin:storage', {
      operation: 'keys',
      scope: 'project',
    }) as Promise<string[]>;
  }
}

/**
 * User API - read current user information.
 */
class UserAPI {
  constructor(private sdk: PluginGuestSDK) {}

  /** Get current user info */
  async getUser(): Promise<{
    name: string;
    id: string;
    preferences: Record<string, unknown>;
  }> {
    return this.sdk.callAPI('user', 'getUser') as Promise<{
      name: string;
      id: string;
      preferences: Record<string, unknown>;
    }>;
  }
}
