# @holoscript/partner-sdk

Official SDK for partners integrating with the HoloScript ecosystem.

## Installation

```bash
npm install @holoscript/partner-sdk
```

## Quick Start

```typescript
import { createPartnerSDK } from '@holoscript/partner-sdk';

const sdk = createPartnerSDK({
  partnerId: 'your-partner-id',
  apiKey: 'your-api-key',
  webhookSecret: 'your-webhook-secret',
});

// Use the API client
const pkg = await sdk.api.getPackage('@your-org/package');

// Handle webhooks
sdk.webhooks?.onPackagePublished((event) => {
  console.log('New package:', event.data.name);
});

// Access analytics
const stats = await sdk.analytics.getDownloadStats('@your-org/package', 'month');
```

## Features

### Registry API

```typescript
import { createRegistryClient } from '@holoscript/partner-sdk';

const client = createRegistryClient({
  credentials: { partnerId: 'id', apiKey: 'key' },
});

// Search packages
const results = await client.searchPackages('vr physics');

// Get package info
const info = await client.getPackage('@scope/name');

// Publish package
await client.publishPackage(tarball, metadata);
```

### Webhooks

```typescript
import { createWebhookHandler } from '@holoscript/partner-sdk';

const webhooks = createWebhookHandler({
  signingSecret: 'secret',
  partnerId: 'id',
});

webhooks.onPackagePublished((e) => console.log(e));
webhooks.onVersionDeprecated((e) => console.log(e));
webhooks.onSecurityAlert((e) => console.log(e));

// Use with Express
app.post('/webhooks', webhooks.middleware());
```

### Analytics

```typescript
import { createPartnerAnalytics } from '@holoscript/partner-sdk';

const analytics = createPartnerAnalytics({
  partnerId: 'id',
  apiKey: 'key',
});

const downloads = await analytics.getDownloadStats('@pkg/name', 'month');
const health = await analytics.getPackageHealth('@pkg/name');
```

### Runtime Embedding

```typescript
import { createRuntime } from '@holoscript/partner-sdk';

const runtime = createRuntime({
  sandbox: true,
  permissions: ['audio', 'physics'],
});

await runtime.load(holoScriptSource);
runtime.start();
```

### Export Adapters

Export to game engines:

```typescript
import {
  createUnityAdapter,
  createUnrealAdapter,
  createGodotAdapter,
} from '@holoscript/partner-sdk';

// Unity
const unity = createUnityAdapter({
  unityVersion: '2023',
  renderPipeline: 'urp',
  xrSupport: true,
  outputDir: './unity-export',
});
const unityAssets = unity.export(sceneGraph);

// Unreal
const unreal = createUnrealAdapter({
  engineVersion: '5.4',
  projectName: 'MyProject',
  vrSupport: true,
  outputDir: './unreal-export',
});
const unrealAssets = unreal.export(sceneGraph);

// Godot
const godot = createGodotAdapter({
  godotVersion: '4.3',
  projectName: 'MyProject',
  useGDScript: true,
  outputDir: './godot-export',
});
const godotAssets = godot.export(sceneGraph);
```

### Branding Kit

```typescript
import { createBrandingKit, BRAND_COLORS } from '@holoscript/partner-sdk';

const branding = createBrandingKit();

// Generate partner badge
const badgeHtml = branding.generateBadge({
  tier: 'certified',
  style: 'badge',
  theme: 'dark',
  size: 'medium',
});

// Get CSS variables
const css = branding.generateCSSVariables();

// Use brand colors
console.log(BRAND_COLORS.primary.hex); // #6366F1
```

## License

MIT
