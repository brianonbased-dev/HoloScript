# @holoscript/studio-plugin-sdk

Official SDK for creating HoloScript Studio plugins.

## Features

- 🎨 **Custom UI Panels** - Add sidebars, modals, and custom views
- 🔧 **Custom Nodes** - Extend workflow and behavior tree editors
- ⌨️ **Keyboard Shortcuts** - Register global and scoped shortcuts
- 🎯 **Toolbar Buttons** - Add custom toolbar actions
- 📦 **Content Types** - Support new file formats in marketplace
- 🔌 **MCP Servers** - Integrate custom MCP servers
- ⚙️ **Settings** - Schema-based configuration UI
- 🔄 **Lifecycle Hooks** - onLoad, onUnload, onInstall, onUninstall

## Installation

```bash
npm install @holoscript/studio-plugin-sdk
```

## Quick Start

### Create a Plugin with CLI

```bash
npx create-holoscript-plugin my-plugin
cd my-plugin
npm install
npm run build
```

### Manual Plugin Creation

```typescript
import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';

export const myPlugin: HoloScriptPlugin = {
  metadata: {
    id: 'my-awesome-plugin',
    name: 'My Awesome Plugin',
    version: '1.0.0',
    description: 'Does awesome things in HoloScript Studio',
    author: {
      name: 'Your Name',
      email: 'your@email.com',
    },
    license: 'MIT',
    icon: 'Sparkles', // Lucide icon name
  },

  onLoad: () => {
    console.log('Plugin loaded!');
  },

  onUnload: () => {
    console.log('Plugin unloaded');
  },
};

export default myPlugin;
```

## Examples

### Add a Custom Panel

```typescript
import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';
import { MyPanel } from './components/MyPanel';

export const panelPlugin: HoloScriptPlugin = {
  metadata: {
    id: 'my-panel-plugin',
    name: 'My Panel Plugin',
    version: '1.0.0',
    description: 'Adds a custom panel',
    author: { name: 'Your Name' },
  },

  panels: [
    {
      id: 'my-custom-panel',
      label: 'My Panel',
      icon: 'BarChart2',
      position: 'right',
      width: 400,
      component: MyPanel,
      shortcut: 'Ctrl+Shift+M',
    },
  ],
};
```

### Add Custom Workflow Nodes

```typescript
import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';

export const nodePlugin: HoloScriptPlugin = {
  metadata: {
    id: 'custom-nodes',
    name: 'Custom Nodes',
    version: '1.0.0',
    description: 'Adds custom workflow nodes',
    author: { name: 'Your Name' },
  },

  nodeTypes: {
    workflow: [
      {
        type: 'custom-transform',
        label: 'Transform Data',
        category: 'Data Processing',
        icon: 'Zap',
        color: '#8b5cf6',
        description: 'Transform input data using custom logic',
        inputs: [
          { id: 'data', label: 'Input Data', type: 'any' },
        ],
        outputs: [
          { id: 'result', label: 'Output', type: 'any' },
        ],
      },
    ],
  },
};
```

### Add Settings

```typescript
import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';

export const settingsPlugin: HoloScriptPlugin = {
  metadata: {
    id: 'configurable-plugin',
    name: 'Configurable Plugin',
    version: '1.0.0',
    description: 'Plugin with settings',
    author: { name: 'Your Name' },
  },

  settingsSchema: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'text',
      description: 'Your API key for external service',
      required: true,
    },
    {
      key: 'refreshInterval',
      label: 'Refresh Interval (ms)',
      type: 'number',
      defaultValue: 5000,
      min: 1000,
      max: 60000,
    },
    {
      key: 'enableNotifications',
      label: 'Enable Notifications',
      type: 'boolean',
      defaultValue: true,
    },
  ],

  onLoad: function() {
    const apiKey = this.settings?.apiKey;
    const interval = this.settings?.refreshInterval || 5000;
    console.log(`Loaded with API key: ${apiKey}, interval: ${interval}ms`);
  },
};
```

## API Reference

### Plugin Interface

```typescript
interface HoloScriptPlugin {
  metadata: PluginMetadata;
  nodeTypes?: {
    workflow?: CustomNodeType[];
    behaviorTree?: CustomNodeType[];
  };
  panels?: CustomPanel[];
  toolbarButtons?: CustomToolbarButton[];
  contentTypes?: CustomContentType[];
  mcpServers?: CustomMCPServer[];
  keyboardShortcuts?: CustomKeyboardShortcut[];
  menuItems?: CustomMenuItem[];
  settingsSchema?: PluginSetting[];
  settings?: Record<string, any>;
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  onInstall?: () => void | Promise<void>;
  onUninstall?: () => void | Promise<void>;
}
```

## Helper Functions

### createPlugin

```typescript
import { createPlugin } from '@holoscript/studio-plugin-sdk';

export const myPlugin = createPlugin({
  metadata: { /* ... */ },
  onLoad: () => { /* ... */ },
});
```

### validatePlugin

```typescript
import { validatePlugin } from '@holoscript/studio-plugin-sdk';

const validation = validatePlugin(myPlugin);

if (!validation.valid) {
  console.error('Plugin validation errors:', validation.errors);
}
```

### mergePlugins

```typescript
import { mergePlugins } from '@holoscript/studio-plugin-sdk';

const bundle = mergePlugins([plugin1, plugin2, plugin3]);
```

## Templates

The CLI provides 4 templates:

1. **basic** - Simple plugin with lifecycle hooks
2. **panel** - Plugin with custom UI panel
3. **nodeType** - Plugin with custom workflow/BT nodes
4. **fullFeatured** - All plugin capabilities

```bash
npx create-holoscript-plugin my-plugin --template=panel
```

## Development Workflow

1. **Create plugin**:
   ```bash
   npx create-holoscript-plugin my-plugin
   cd my-plugin
   npm install
   ```

2. **Develop with watch mode**:
   ```bash
   npm run dev
   ```

3. **Build for distribution**:
   ```bash
   npm run build
   ```

4. **Install in Studio**:
   - Open HoloScript Studio
   - Press `Ctrl+P` for Plugin Manager
   - Click "Install from File"
   - Select `dist/index.js`

## Publishing to npm

```bash
npm publish --access public
```

Then users can install via:

```bash
npm install @holoscript-plugins/my-plugin
```

## TypeScript Support

The SDK provides full TypeScript types:

```typescript
import type {
  HoloScriptPlugin,
  CustomPanel,
  CustomNodeType,
  PluginSetting,
} from '@holoscript/studio-plugin-sdk';
```

## Best Practices

1. **Unique IDs** - Use namespaced IDs (e.g., `yourname-pluginname`)
2. **Semver** - Follow semantic versioning
3. **Cleanup** - Always implement `onUnload` to clean up resources
4. **Error Handling** - Wrap async operations in try-catch
5. **Settings** - Validate settings before use
6. **Icons** - Use [Lucide](https://lucide.dev) icon names
7. **Testing** - Test plugins in isolation before publishing

## Examples

See `packages/studio/src/lib/plugins/examples/` for reference implementations:

- `analyticsPlugin.ts` - Panel with real-time data
- `brittney-advanced.ts` - Custom Brittney nodes
- `cloudSyncPlugin.ts` - Settings and external API integration

## License

MIT © HoloScript Team

## Resources

- [Plugin Development Guide](https://holoscript.net/docs/plugins)
- [API Documentation](https://holoscript.net/docs/plugins/api)
- [Example Plugins](https://github.com/holoscript/plugins)
- [Community Plugins](https://marketplace.holoscript.net)
