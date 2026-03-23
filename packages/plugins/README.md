# @holoscript/plugins

> Sandboxed plugin system for extending HoloScript with community modules.

## Overview

Provides the plugin loading, sandboxing, and lifecycle management infrastructure. Plugins can add new traits, custom compilers, tool integrations, and asset loaders.

## Key Components

| Component | Purpose |
|-----------|---------|
| `PluginLoader` | Dynamic plugin loading and validation |
| `ModRegistry` | Module registration for loaded plugins |
| `PluginSandbox` | Permission-based execution isolation |

## Usage

```typescript
import { PluginLoader } from '@holoscript/plugins';

const loader = new PluginLoader();
await loader.load('holoscript-plugin-weather', {
  permissions: ['traits:register', 'assets:read'],
});
```

## Plugin Structure

```text
holoscript-plugin-example/
├── package.json            # name, holoscript.permissions
├── src/
│   └── index.ts            # export default plugin object
└── traits/
    └── custom-traits.ts    # Optional custom trait definitions
```

## Related

- [Extension System](../../docs/architecture/EXTENSION_SYSTEM.md) — Architecture overview
- [Plugin Ecosystem docs](../../docs/PLUGIN_ECOSYSTEM.md)

## License

MIT
