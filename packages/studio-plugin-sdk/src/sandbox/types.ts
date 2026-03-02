/**
 * Plugin Sandbox Types
 *
 * Defines the type system for iframe-based plugin sandboxing with
 * capability-based permissions and typed postMessage communication.
 *
 * Architecture inspired by Figma's plugin system:
 * - Plugins run inside sandboxed iframes with restricted capabilities
 * - Communication happens via structured postMessage protocol
 * - Permissions are declared in plugin manifest and enforced at runtime
 * - Host validates all messages before dispatching to Studio APIs
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 */

// ── Sandbox Permissions ─────────────────────────────────────────────────────

/**
 * Granular permissions that a plugin can request.
 * Each permission gates access to a specific Studio API surface.
 *
 * Permissions follow the principle of least privilege:
 * plugins must explicitly declare what they need.
 */
export type SandboxPermission =
  // Scene access
  | 'scene:read'           // Read scene graph, nodes, properties
  | 'scene:write'          // Modify scene graph, add/remove nodes
  | 'scene:subscribe'      // Receive scene change notifications

  // Editor access
  | 'editor:selection'     // Read/write current selection
  | 'editor:viewport'      // Read/control viewport (camera, zoom)
  | 'editor:undo'          // Push operations to undo stack

  // UI access
  | 'ui:panel'             // Register custom panels
  | 'ui:toolbar'           // Register toolbar buttons
  | 'ui:menu'              // Register menu items
  | 'ui:modal'             // Show modal dialogs
  | 'ui:notification'      // Show toast notifications
  | 'ui:theme'             // Read current theme (for styling)

  // Storage access
  | 'storage:local'        // Read/write plugin-scoped local storage
  | 'storage:project'      // Read/write project-scoped storage

  // Network access
  | 'network:fetch'        // Make HTTP requests (domain-restricted)
  | 'network:websocket'    // Open WebSocket connections (domain-restricted)

  // Clipboard access
  | 'clipboard:read'       // Read clipboard content
  | 'clipboard:write'      // Write to clipboard

  // File system access (restricted)
  | 'fs:import'            // Import files via file picker
  | 'fs:export'            // Export/download files

  // User info
  | 'user:read'            // Read current user info (name, preferences)

  // Node types
  | 'nodes:workflow'       // Register custom workflow nodes
  | 'nodes:behaviortree'   // Register custom behavior tree nodes

  // Keyboard
  | 'keyboard:shortcuts';  // Register keyboard shortcuts

/**
 * Network access policy for domain-restricted fetch/WebSocket.
 * Plugins must declare which domains they need to access.
 */
export interface NetworkPolicy {
  /** Allowed domains for fetch requests (e.g., ['api.example.com', '*.example.com']) */
  allowedDomains: string[];
  /** Whether to allow localhost/127.0.0.1 access (default: false) */
  allowLocalhost?: boolean;
}

/**
 * Plugin security manifest declared in the plugin definition.
 * This is the "contract" between the plugin and the host.
 */
export interface PluginSandboxManifest {
  /** Permissions requested by the plugin */
  permissions: SandboxPermission[];

  /** Network access policy (required if 'network:fetch' or 'network:websocket' is requested) */
  networkPolicy?: NetworkPolicy;

  /**
   * Sandbox trust level:
   * - 'sandboxed': Full iframe isolation (default, for third-party plugins)
   * - 'trusted': Runs in main thread (first-party plugins only, requires signing)
   */
  trustLevel?: 'sandboxed' | 'trusted';

  /**
   * Content Security Policy directives for the plugin iframe.
   * The host merges these with its base CSP.
   */
  csp?: Partial<ContentSecurityPolicyDirectives>;

  /**
   * Maximum memory budget in MB for the plugin iframe (default: 64).
   * Enforced via performance monitoring; plugin is terminated if exceeded.
   */
  memoryBudget?: number;

  /**
   * Maximum CPU time per frame in ms (default: 16ms at 60fps).
   * Plugins exceeding this repeatedly get throttled or terminated.
   */
  cpuBudget?: number;
}

/**
 * CSP directives that can be customized per plugin.
 */
export interface ContentSecurityPolicyDirectives {
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'connect-src': string[];
  'font-src': string[];
  'media-src': string[];
  'worker-src': string[];
}

// ── Message Protocol ────────────────────────────────────────────────────────

/**
 * Unique message ID for request/response correlation.
 */
export type MessageId = string;

/**
 * Base message structure for all postMessage communication.
 * Every message includes a type discriminator, unique ID, and plugin source.
 */
export interface SandboxMessageBase {
  /** Protocol version for forward compatibility */
  protocol: 'holoscript-sandbox-v1';

  /** Unique message ID for request/response correlation */
  id: MessageId;

  /** Plugin ID that sent/receives this message */
  pluginId: string;

  /** Timestamp of message creation */
  timestamp: number;
}

/**
 * Messages sent FROM plugin iframe TO host (requests).
 * These are the "API calls" that plugins make.
 */
export type PluginToHostMessage =
  | PluginReadyMessage
  | PluginAPICallMessage
  | PluginUIEventMessage
  | PluginRegisterMessage
  | PluginStorageMessage
  | PluginFetchMessage
  | PluginClipboardMessage
  | PluginLogMessage
  | PluginErrorMessage;

/**
 * Plugin signals it has finished loading and is ready to receive messages.
 */
export interface PluginReadyMessage extends SandboxMessageBase {
  type: 'plugin:ready';
  payload: {
    /** Plugin version reported by the guest */
    version: string;
  };
}

/**
 * Plugin makes an API call to Studio (e.g., read scene, modify nodes).
 */
export interface PluginAPICallMessage extends SandboxMessageBase {
  type: 'plugin:api-call';
  payload: {
    /** API namespace (e.g., 'scene', 'editor', 'ui') */
    namespace: string;
    /** Method name within namespace (e.g., 'getNodes', 'setSelection') */
    method: string;
    /** Method arguments (must be structured-cloneable) */
    args: unknown[];
  };
}

/**
 * Plugin sends a UI event to the host (e.g., panel resize, button state change).
 */
export interface PluginUIEventMessage extends SandboxMessageBase {
  type: 'plugin:ui-event';
  payload: {
    /** Event type (e.g., 'panel-resize', 'toolbar-state-change') */
    event: string;
    /** Event data */
    data: unknown;
  };
}

/**
 * Plugin registers extensions (panels, nodes, toolbar buttons, etc.).
 */
export interface PluginRegisterMessage extends SandboxMessageBase {
  type: 'plugin:register';
  payload: {
    /** What is being registered */
    kind: 'panel' | 'toolbar-button' | 'menu-item' | 'keyboard-shortcut' | 'node-type' | 'content-type';
    /** Registration descriptor (serializable subset of the full type) */
    descriptor: Record<string, unknown>;
  };
}

/**
 * Plugin reads/writes to its scoped storage.
 */
export interface PluginStorageMessage extends SandboxMessageBase {
  type: 'plugin:storage';
  payload: {
    /** Storage operation */
    operation: 'get' | 'set' | 'delete' | 'keys';
    /** Storage scope */
    scope: 'local' | 'project';
    /** Storage key (for get/set/delete) */
    key?: string;
    /** Storage value (for set) */
    value?: unknown;
  };
}

/**
 * Plugin makes a network request (proxied through host for domain validation).
 */
export interface PluginFetchMessage extends SandboxMessageBase {
  type: 'plugin:fetch';
  payload: {
    /** Request URL */
    url: string;
    /** Request options (subset of RequestInit) */
    options?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    };
  };
}

/**
 * Plugin reads/writes clipboard (proxied through host).
 */
export interface PluginClipboardMessage extends SandboxMessageBase {
  type: 'plugin:clipboard';
  payload: {
    /** Clipboard operation */
    operation: 'read' | 'write';
    /** Data to write (for write operation) */
    data?: string;
    /** MIME type */
    mimeType?: string;
  };
}

/**
 * Plugin sends a log message (for developer tools / debugging).
 */
export interface PluginLogMessage extends SandboxMessageBase {
  type: 'plugin:log';
  payload: {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    data?: unknown;
  };
}

/**
 * Plugin reports an error to the host.
 */
export interface PluginErrorMessage extends SandboxMessageBase {
  type: 'plugin:error';
  payload: {
    /** Error code */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Stack trace (if available) */
    stack?: string;
  };
}

// ── Host to Plugin Messages (responses + events) ────────────────────────────

/**
 * Messages sent FROM host TO plugin iframe (responses and push events).
 */
export type HostToPluginMessage =
  | HostInitMessage
  | HostResponseMessage
  | HostEventMessage
  | HostShutdownMessage;

/**
 * Host sends initialization data to the plugin after it signals ready.
 */
export interface HostInitMessage extends SandboxMessageBase {
  type: 'host:init';
  payload: {
    /** Granted permissions (may be a subset of what was requested) */
    grantedPermissions: SandboxPermission[];
    /** Plugin settings (from user configuration) */
    settings: Record<string, unknown>;
    /** Current theme info */
    theme: {
      mode: 'light' | 'dark';
      colors: Record<string, string>;
    };
    /** Studio version */
    studioVersion: string;
  };
}

/**
 * Host sends a response to a plugin API call.
 */
export interface HostResponseMessage extends SandboxMessageBase {
  type: 'host:response';
  payload: {
    /** The message ID this is responding to */
    requestId: MessageId;
    /** Whether the call succeeded */
    success: boolean;
    /** Response data (if success) */
    data?: unknown;
    /** Error info (if failure) */
    error?: {
      code: 'PERMISSION_DENIED' | 'INVALID_ARGS' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
      message: string;
    };
  };
}

/**
 * Host pushes an event to the plugin (e.g., scene changed, selection changed).
 */
export interface HostEventMessage extends SandboxMessageBase {
  type: 'host:event';
  payload: {
    /** Event namespace (e.g., 'scene', 'editor', 'user') */
    namespace: string;
    /** Event name (e.g., 'nodesChanged', 'selectionChanged') */
    event: string;
    /** Event data */
    data: unknown;
  };
}

/**
 * Host tells the plugin to shut down gracefully.
 */
export interface HostShutdownMessage extends SandboxMessageBase {
  type: 'host:shutdown';
  payload: {
    /** Reason for shutdown */
    reason: 'user-disabled' | 'user-uninstalled' | 'error' | 'resource-limit' | 'studio-closing';
    /** Grace period in ms before forceful termination */
    gracePeriodMs: number;
  };
}

// ── Sandbox State ───────────────────────────────────────────────────────────

/**
 * Runtime state of a sandboxed plugin.
 */
export type SandboxState =
  | 'creating'      // iframe being constructed
  | 'loading'       // iframe loading plugin code
  | 'initializing'  // plugin code loaded, waiting for ready signal
  | 'ready'         // plugin signaled ready, host sent init
  | 'running'       // plugin is actively running
  | 'suspended'     // plugin temporarily suspended (background tab, resource limit)
  | 'error'         // plugin encountered a fatal error
  | 'terminated';   // plugin has been shut down

/**
 * Health metrics for a sandboxed plugin.
 */
export interface SandboxHealthMetrics {
  /** Current state */
  state: SandboxState;
  /** Time spent in current state (ms) */
  stateAge: number;
  /** Total number of messages sent to host */
  messagesSent: number;
  /** Total number of messages received from host */
  messagesReceived: number;
  /** Number of permission violations (blocked calls) */
  permissionViolations: number;
  /** Estimated memory usage in bytes (from performance.measureUserAgentSpecificMemory if available) */
  memoryEstimate?: number;
  /** Average message processing latency in ms */
  avgLatencyMs: number;
  /** Last error (if any) */
  lastError?: string;
  /** Uptime in ms */
  uptimeMs: number;
}

/**
 * Audit log entry for sandbox security events.
 */
export interface SandboxAuditEntry {
  /** Timestamp */
  timestamp: number;
  /** Plugin ID */
  pluginId: string;
  /** Event type */
  event:
    | 'sandbox-created'
    | 'plugin-loaded'
    | 'plugin-ready'
    | 'permission-granted'
    | 'permission-denied'
    | 'api-call'
    | 'api-call-blocked'
    | 'network-request'
    | 'network-request-blocked'
    | 'resource-warning'
    | 'resource-terminated'
    | 'error'
    | 'shutdown';
  /** Event details */
  details: string;
  /** Severity level */
  severity: 'info' | 'warning' | 'error' | 'critical';
}

/**
 * Options for creating a plugin sandbox.
 */
export interface SandboxCreateOptions {
  /** Plugin ID */
  pluginId: string;

  /** URL to the plugin's entry point (loaded into iframe) */
  pluginUrl: string;

  /** Sandbox manifest (permissions, policies) */
  manifest: PluginSandboxManifest;

  /** Plugin settings */
  settings?: Record<string, unknown>;

  /**
   * Container element where the iframe will be appended.
   * For panel plugins, this is the panel container.
   * For headless plugins, a hidden container is used.
   */
  container?: HTMLElement;

  /**
   * Whether the plugin has visible UI (panel, modal).
   * If false, iframe is hidden (1x1px, no visibility).
   */
  hasUI?: boolean;

  /** Timeout for plugin initialization in ms (default: 10000) */
  initTimeout?: number;

  /** Enable verbose logging for development */
  debug?: boolean;
}

/**
 * Result of a plugin API call made through the sandbox bridge.
 */
export interface SandboxCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  /** Round-trip time in ms */
  latencyMs: number;
}

/**
 * Event handler registration for sandbox events.
 */
export interface SandboxEventHandler {
  /** Event namespace */
  namespace: string;
  /** Event name */
  event: string;
  /** Handler function */
  handler: (data: unknown) => void;
}
