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
  partnerId: process.env.PARTNER_ID,
  apiKey: process.env.PARTNER_API_KEY,
  webhookSecret: process.env.PARTNER_WEBHOOK_SECRET,
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

## Package boundary & release posture

**Audience.** This SDK targets external partners, operators, and founder-run agent frameworks that integrate with the HoloScript registry, webhook, and analytics APIs from their own services — it is not an internal-only utility.

**Configuration is caller-owned.** Every client is constructed from credentials the caller supplies — `partnerId`, `apiKey`, `webhookSecret` — normally read from your own environment variables and pointed at the registry host you choose. The SDK does not ship any credentials, founder-local paths, or private workspace defaults; nothing here is the package default endpoint you must trust blindly.

**Release posture: v0-preview.** The registry client and webhook/analytics APIs are exercised by the test suite; the Unity/Unreal/Godot export adapters and branding kit carry known limitations around target-engine version drift and should be treated as unsupported for production export pipelines until promoted past this release boundary. Pin your version and be ready to rollback if an upgrade regresses your integration. Run `npm run test` locally to validate a new SDK version against your integration before upgrading in production.

## License

MIT
