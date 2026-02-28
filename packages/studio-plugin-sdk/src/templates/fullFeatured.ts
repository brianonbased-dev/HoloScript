/**
 * Full-featured plugin template (all capabilities)
 */

export const fullFeaturedPluginTemplate = `import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';
import { {{panelComponentName}} } from './components/{{panelComponentName}}';

export const {{pluginName}}Plugin: HoloScriptPlugin = {
  metadata: {
    id: '{{pluginId}}',
    name: '{{pluginDisplayName}}',
    version: '1.0.0',
    description: '{{pluginDescription}}',
    author: {
      name: '{{authorName}}',
      email: '{{authorEmail}}',
      url: '{{authorUrl}}',
    },
    homepage: '{{homepage}}',
    license: 'MIT',
    icon: '{{iconName}}',
    keywords: [{{keywords}}],
  },

  // ── Lifecycle Hooks ────────────────────────────────────────────

  onLoad: async () => {
    console.log('{{pluginDisplayName}} loaded!');
    // Initialize plugin resources
  },

  onUnload: async () => {
    console.log('{{pluginDisplayName}} unloaded');
    // Cleanup plugin resources
  },

  onInstall: async () => {
    console.log('{{pluginDisplayName}} installed!');
    // One-time setup (e.g., create config files, download data)
  },

  onUninstall: async () => {
    console.log('{{pluginDisplayName}} uninstalled');
    // One-time cleanup (e.g., remove config files, data)
  },

  // ── Settings ───────────────────────────────────────────────────

  settingsSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'text',
      description: 'Your API key for external service integration',
      required: true,
    },
    {
      key: 'refreshInterval',
      label: 'Refresh Interval (ms)',
      type: 'number',
      description: 'How often to refresh data',
      defaultValue: 5000,
      min: 1000,
      max: 60000,
    },
    {
      key: 'enableNotifications',
      label: 'Enable Notifications',
      type: 'boolean',
      description: 'Show desktop notifications',
      defaultValue: true,
    },
    {
      key: 'theme',
      label: 'Panel Theme',
      type: 'select',
      description: 'Choose panel color theme',
      options: [
        { label: 'Dark', value: 'dark' },
        { label: 'Light', value: 'light' },
        { label: 'Auto', value: 'auto' },
      ],
      defaultValue: 'dark',
    },
  ],

  // ── Custom Nodes ───────────────────────────────────────────────

  nodeTypes: {
    workflow: [
      {
        type: '{{nodeType}}',
        label: '{{nodeLabel}}',
        category: '{{nodeCategory}}',
        icon: 'Zap',
        color: '#8b5cf6',
        description: 'Custom workflow node',
        inputs: [
          { id: 'input', label: 'Input', type: 'any' },
        ],
        outputs: [
          { id: 'output', label: 'Output', type: 'any' },
          { id: 'error', label: 'Error', type: 'error' },
        ],
      },
    ],

    behaviorTree: [
      {
        type: '{{btNodeType}}',
        label: '{{btNodeLabel}}',
        category: '{{nodeCategory}}',
        icon: 'GitBranch',
        color: '#10b981',
        description: 'Custom behavior tree node',
      },
    ],
  },

  // ── UI Extensions ──────────────────────────────────────────────

  panels: [
    {
      id: '{{panelId}}',
      label: '{{panelLabel}}',
      icon: '{{iconName}}',
      position: 'right',
      width: 400,
      component: {{panelComponentName}},
      shortcut: '{{keyboardShortcut}}',
    },
  ],

  toolbarButtons: [
    {
      id: '{{buttonId}}',
      label: '{{buttonLabel}}',
      icon: '{{iconName}}',
      tooltip: '{{buttonTooltip}}',
      position: 'right',
      color: 'accent',
      onClick: () => {
        console.log('Toolbar button clicked!');
      },
    },
  ],

  keyboardShortcuts: [
    {
      id: '{{shortcutId}}',
      keys: '{{keyboardShortcut}}',
      description: '{{shortcutDescription}}',
      scope: 'global',
      handler: () => {
        console.log('Keyboard shortcut triggered!');
      },
    },
  ],

  menuItems: [
    {
      id: '{{menuItemId}}',
      label: '{{menuItemLabel}}',
      path: 'Tools/{{pluginDisplayName}}',
      icon: '{{iconName}}',
      onClick: () => {
        console.log('Menu item clicked!');
      },
    },
  ],

  // ── Content Types ──────────────────────────────────────────────

  contentTypes: [
    {
      type: '{{contentType}}',
      label: '{{contentTypeLabel}}',
      extension: '{{fileExtension}}',
      icon: 'FileText',
      category: 'Custom',
      import: async (file: File) => {
        const text = await file.text();
        return JSON.parse(text);
      },
      export: async (data: any) => {
        const json = JSON.stringify(data, null, 2);
        return new Blob([json], { type: 'application/json' });
      },
    },
  ],

  // ── MCP Servers ────────────────────────────────────────────────

  mcpServers: [
    {
      id: '{{mcpServerId}}',
      name: '{{mcpServerName}}',
      url: '{{mcpServerUrl}}',
      description: '{{mcpServerDescription}}',
      autoConnect: true,
    },
  ],
};

export default {{pluginName}}Plugin;
`;
