/**
 * Plugin Sandbox System
 *
 * Provides iframe-based isolation for HoloScript Studio plugins with:
 * - Capability-based permission model
 * - Typed postMessage communication protocol
 * - Rate limiting and resource monitoring
 * - Audit logging for security review
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    HoloScript Studio (Host)                  │
 * │                                                              │
 * │  ┌──────────────────────┐    ┌─────────────────────────┐    │
 * │  │ SandboxedPluginHost  │    │     Studio APIs          │    │
 * │  │  (orchestrator)      │◄──►│  (scene, editor, ui...)  │    │
 * │  └──────────┬───────────┘    └─────────────────────────┘    │
 * │             │                                                │
 * │  ┌──────────▼───────────┐                                   │
 * │  │    PluginBridge       │  Permission checks + rate limits  │
 * │  │  (message handler)    │  + audit logging                  │
 * │  └──────────┬───────────┘                                   │
 * │             │ postMessage                                    │
 * │  ┌──────────▼───────────┐                                   │
 * │  │   PluginSandbox       │  iframe sandbox + CSP             │
 * │  │  (iframe manager)     │                                   │
 * │  └──────────┬───────────┘                                   │
 * │             │                                                │
 * ├─────────────┼────────────────────────────────────────────────┤
 * │  ┌──────────▼───────────┐     Sandboxed iframe              │
 * │  │  PluginGuestSDK       │     (restricted capabilities)     │
 * │  │  (plugin-facing API)  │                                   │
 * │  └──────────┬───────────┘                                   │
 * │             │                                                │
 * │  ┌──────────▼───────────┐                                   │
 * │  │    Plugin Code        │                                   │
 * │  │  (third-party)        │                                   │
 * │  └──────────────────────┘                                   │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Usage (Host Side)
 *
 * ```typescript
 * import { SandboxedPluginHost } from '@holoscript/studio-plugin-sdk/sandbox';
 *
 * const host = new SandboxedPluginHost({
 *   onAPICall: (pluginId, ns, method, args) => studioAPI.dispatch(ns, method, args),
 *   onStorage: (pluginId, scope, op, key, val) => storageService.operate(pluginId, scope, op, key, val),
 * });
 *
 * await host.loadPlugin({
 *   pluginId: 'my-plugin',
 *   pluginUrl: 'https://cdn.example.com/plugins/my-plugin/index.js',
 *   manifest: { permissions: ['scene:read', 'ui:panel'] },
 *   hasUI: true,
 * });
 *
 * host.broadcastEvent('scene', 'nodesChanged', { ids: ['node-1'] });
 * ```
 *
 * ## Usage (Plugin Side / Guest)
 *
 * ```typescript
 * import { PluginGuestSDK } from '@holoscript/studio-plugin-sdk/sandbox/guest';
 *
 * const sdk = new PluginGuestSDK('my-plugin', '1.0.0');
 *
 * sdk.onInit((data) => console.log('Initialized:', data));
 * sdk.scene.onNodesChanged((data) => console.log('Changed:', data));
 *
 * const nodes = await sdk.scene.getNodes();
 * await sdk.storage.set('key', 'value');
 *
 * sdk.ready();
 * ```
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 */

// Types
export type {
  SandboxPermission,
  NetworkPolicy,
  PluginSandboxManifest,
  ContentSecurityPolicyDirectives,
  SandboxMessageBase,
  MessageId,
  PluginToHostMessage,
  PluginReadyMessage,
  PluginAPICallMessage,
  PluginUIEventMessage,
  PluginRegisterMessage,
  PluginStorageMessage,
  PluginFetchMessage,
  PluginClipboardMessage,
  PluginLogMessage,
  PluginErrorMessage,
  HostToPluginMessage,
  HostInitMessage,
  HostResponseMessage,
  HostEventMessage,
  HostShutdownMessage,
  SandboxState,
  SandboxHealthMetrics,
  SandboxAuditEntry,
  SandboxCreateOptions,
  SandboxCallResult,
  SandboxEventHandler,
} from './types.js';

export {
  assertSafePluginModuleUrl,
  escapeHtmlDoubleQuotedAttr,
  escapeHtmlTextContent,
} from './pluginIframeSecurity.js';

// Host-side classes
export { PluginSandbox } from './PluginSandbox.js';
export { PluginBridge } from './PluginBridge.js';
export type {
  APIHandler,
  StorageHandler,
  FetchHandler,
  RegisterHandler,
  PluginBridgeOptions,
} from './PluginBridge.js';
export { SandboxedPluginHost } from './SandboxedPluginHost.js';
export type { SandboxedPluginHostOptions, PluginHostHealthSummary } from './SandboxedPluginHost.js';

// Guest-side classes (for use inside iframe)
export { PluginGuestSDK } from './PluginGuestSDK.js';
export type { GuestInitData, GuestSDKOptions } from './PluginGuestSDK.js';
