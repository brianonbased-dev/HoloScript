/**
 * Sandboxed plugin template (iframe-isolated, third-party safe)
 */

export const sandboxedPluginTemplate = `import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';

export const {{pluginName}}Plugin: HoloScriptPlugin = {
  metadata: {
    id: '{{pluginId}}',
    name: '{{pluginDisplayName}}',
    version: '1.0.0',
    description: '{{pluginDescription}}',
    author: {
      name: '{{authorName}}',
      email: '{{authorEmail}}',
    },
    license: 'MIT',
    icon: 'Shield',
  },

  // ── Sandbox Security Manifest ─────────────────────────────────
  // Declares the permissions this plugin needs.
  // The host will enforce these at runtime via postMessage bridge.
  sandbox: {
    permissions: [
      'scene:read',         // Read scene nodes and properties
      'ui:panel',           // Register a custom panel
      'ui:notification',    // Show toast notifications
      'storage:local',      // Persist plugin data locally
    ],
    trustLevel: 'sandboxed',   // Runs in iframe isolation
    memoryBudget: 64,          // Max 64MB memory
    cpuBudget: 16,             // Max 16ms per frame
  },

  // ── Lifecycle Hooks ───────────────────────────────────────────
  // These run inside the sandboxed iframe.

  onLoad: () => {
    console.log('{{pluginDisplayName}} loaded in sandbox!');
  },

  onUnload: () => {
    console.log('{{pluginDisplayName}} unloaded');
  },
};

export default {{pluginName}}Plugin;
`;

export const sandboxedPluginGuestTemplate = `/**
 * Guest SDK usage example for sandboxed plugin.
 *
 * This file runs inside the sandboxed iframe and uses the
 * PluginGuestSDK to communicate with the host Studio.
 */
import { PluginGuestSDK } from '@holoscript/studio-plugin-sdk/sandbox/guest';

// Create the guest SDK instance
const sdk = new PluginGuestSDK('{{pluginId}}', '1.0.0');

// ── Initialization ────────────────────────────────────────────────────────

sdk.onInit((initData) => {
  console.log('Plugin initialized!');
  console.log('Granted permissions:', initData.grantedPermissions);
  console.log('Settings:', initData.settings);
  console.log('Theme:', initData.theme.mode);
});

// ── Shutdown Handler ──────────────────────────────────────────────────────

sdk.onShutdown((reason) => {
  console.log('Plugin shutting down:', reason);
  // Cleanup resources here
});

// ── Scene Events ──────────────────────────────────────────────────────────

sdk.scene.onNodesChanged((data) => {
  console.log('Scene changed:', data);
});

// ── Example: Read Scene Data ──────────────────────────────────────────────

async function loadSceneData() {
  try {
    const nodes = await sdk.scene.getNodes();
    console.log('Scene nodes:', nodes);
  } catch (err) {
    console.error('Failed to read scene:', err);
  }
}

// ── Example: Store Data ───────────────────────────────────────────────────

async function savePreferences(prefs: Record<string, unknown>) {
  try {
    await sdk.storage.set('preferences', prefs);
    await sdk.ui.showNotification('Preferences saved!', { type: 'success' });
  } catch (err) {
    console.error('Failed to save preferences:', err);
  }
}

// ── Register UI Panel ─────────────────────────────────────────────────────

async function registerUI() {
  await sdk.registerPanel({
    id: '{{pluginId}}-panel',
    label: '{{pluginDisplayName}}',
    icon: 'Shield',
    position: 'right',
    width: 400,
  });
}

// ── Main Startup ──────────────────────────────────────────────────────────

async function main() {
  await registerUI();
  await loadSceneData();

  // Signal ready to the host
  sdk.ready();
}

main().catch((err) => {
  sdk.reportError('STARTUP_FAILED', err.message, err.stack);
});
`;
