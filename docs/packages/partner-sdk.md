# Partner SDK

**Webhooks, API keys, and analytics integration for HoloScript partners.** Enables third-party platforms to build on top of HoloScript with authenticated API access.

## Overview

Partner SDK provides webhooks for real-time events, REST API access with API keys, and analytics dashboards for monitoring usage.

## Installation

```bash
npm install @holoscript/partner-sdk
```

## Quick Start

### Register as Partner

```typescript
import { PartnerSDK } from '@holoscript/partner-sdk';

const partner = new PartnerSDK({
  organizationId: 'my-org',
  apiKey: process.env.HOLOSCRIPT_PARTNER_KEY,
  webhookSecret: process.env.WEBHOOK_SECRET,
});

// Verify credentials
const verified = await partner.verify();
console.log(verified.organization); // 'my-org'
console.log(verified.tier); // 'professional', 'enterprise'
```

## API Key Management

### Create API Key

```typescript
const key = await partner.createApiKey({
  name: 'Production Key',
  scopes: ['read:scenes', 'write:scenes', 'export:marketplace'],
  expiresIn: 31536000, // 1 year
});

console.log(key.token); // sk_live_***
console.log(key.rotationDate); // When to rotate
```

### Use API Key

```typescript
import fetch from 'node-fetch';

const response = await fetch('https://api.holoscript.dev/scenes', {
  headers: {
    Authorization: `Bearer sk_live_***`,
    'Content-Type': 'application/json',
  },
});

const scenes = await response.json();
```

### Revoke API Key

```typescript
await partner.revokeApiKey('key-uuid');
// All requests using this key will fail immediately
```

## REST API Endpoints

### Scenes

```typescript
// List scenes
const scenes = await partner.api.scenes.list({
  limit: 50,
  skip: 0,
  filter: { visibility: 'public' },
});

// Get scene
const scene = await partner.api.scenes.get(sceneId);

// Create scene
const newScene = await partner.api.scenes.create({
  name: 'My Scene',
  description: 'A test scene',
  visibility: 'private',
});

// Update scene
await partner.api.scenes.update(sceneId, {
  name: 'Updated Name',
});

// Delete scene
await partner.api.scenes.delete(sceneId);

// Export scene
const exported = await partner.api.scenes.export(sceneId, {
  format: 'godot', // godot, unity, unreal, webgpu
  includeAssets: true,
});
```

### Objects & Templates

```typescript
// List objects in scene
const objects = await partner.api.scenes.objects.list(sceneId);

// Get object
const obj = await partner.api.scenes.objects.get(sceneId, objectId);

// Update object
await partner.api.scenes.objects.update(sceneId, objectId, {
  position: [0, 1, 0],
  color: '#ff0000',
});
```

### Marketplace

```typescript
// Get marketplace listings
const listings = await partner.api.marketplace.list({
  category: 'vr-games',
  sort: 'downloads',
});

// Publish scene to marketplace
const published = await partner.api.marketplace.publish(sceneId, {
  category: 'vr-games',
  tags: ['multiplayer', 'action'],
  price: 9.99,
});

// Get sales analytics
const analytics = await partner.api.marketplace.analytics(publishedId, {
  period: '30d', // '7d', '30d', '90d', 'all'
});
console.log(analytics.downloads);
console.log(analytics.revenue);
```

## Webhooks

### Subscribe to Events

```typescript
const webhook = await partner.createWebhook({
  url: 'https://myapp.com/webhooks/holoscript',
  events: ['scene.created', 'scene.updated', 'scene.published', 'marketplace.purchase'],
  secret: 'webhook-secret-key',
});

console.log(webhook.id); // webhook-***
console.log(webhook.signedUrl); // With signature
```

### Handle Webhook Events

```typescript
import express from 'express';
import { PartnerSDK } from '@holoscript/partner-sdk';

const app = express();
const partner = new PartnerSDK();

app.post('/webhooks/holoscript', express.json(), async (req, res) => {
  const signature = req.headers['x-holoscript-signature'];
  const payload = req.body;

  // Verify webhook signature
  const valid = partner.verifyWebhookSignature(
    JSON.stringify(payload),
    signature,
    process.env.WEBHOOK_SECRET
  );

  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle event
  switch (payload.event) {
    case 'scene.created':
      console.log('New scene:', payload.data.sceneId);
      break;
    case 'marketplace.purchase':
      console.log('Purchase:', payload.data.orderId);
      break;
  }

  res.json({ received: true });
});
```

### Webhook Events

| Event                  | Payload                                 | Sent When             |
| ---------------------- | --------------------------------------- | --------------------- |
| `scene.created`        | `{ sceneId, userId, timestamp }`        | New scene created     |
| `scene.updated`        | `{ sceneId, changes, timestamp }`       | Scene modified        |
| `scene.deleted`        | `{ sceneId, timestamp }`                | Scene removed         |
| `scene.published`      | `{ sceneId, visibility, timestamp }`    | Made public           |
| `scene.exported`       | `{ sceneId, format, timestamp }`        | Exported to target    |
| `marketplace.listed`   | `{ sceneId, listingId, price }`         | Listed in marketplace |
| `marketplace.purchase` | `{ listingId, orderId, buyer, amount }` | Item purchased        |
| `marketplace.refund`   | `{ orderId, reason, amount }`           | Refund issued         |

## Analytics

### Get Usage Metrics

```typescript
const metrics = await partner.analytics.getMetrics({
  period: '30d',
  metrics: ['api_calls', 'scenes_created', 'exports', 'monthly_active_users'],
});

console.log(metrics.api_calls); // 45230
console.log(metrics.scenes_created); // 128
console.log(metrics.exports); // { godot: 45, unity: 32, webgpu: 87 }
```

### Billing

```typescript
// Get current plan
const plan = await partner.billing.getPlan();
console.log(plan.tier); // 'professional'
console.log(plan.apiCallQuota); // 100000/month
console.log(plan.costPerCall); // $0.0001

// Get usage
const usage = await partner.billing.getUsage();
console.log(usage.apiCallsUsed); // 45230
console.log(usage.estimatedCost); // $4.52
console.log(usage.renewsAt); // Date

// Upgrade plan
await partner.billing.upgradePlan({
  newTier: 'enterprise',
});
```

## Error Handling

```typescript
try {
  const scene = await partner.api.scenes.get(sceneId);
} catch (error) {
  if (error.code === 'SCENE_NOT_FOUND') {
    console.error('Scene does not exist');
  } else if (error.code === 'UNAUTHORIZED') {
    console.error('API key is invalid or expired');
  } else if (error.code === 'RATE_LIMITED') {
    console.error('Rate limit exceeded, retry after:', error.retryAfter);
  } else if (error.code === 'QUOTA_EXCEEDED') {
    console.error('Monthly quota exceeded');
  } else if (error.code === 'INVALID_REQUEST') {
    console.error('Invalid parameters:', error.details);
  }
}
```

## Rate Limiting

```
Standard Tier:
- 10 requests/second
- 100,000 requests/month

Professional Tier:
- 100 requests/second
- 1,000,000 requests/month

Enterprise Tier:
- Custom limits
- Dedicated support
```

Check rate limit headers:

```typescript
const response = await fetch('https://api.holoscript.dev/...');
console.log(response.headers.get('x-ratelimit-limit')); // 100000
console.log(response.headers.get('x-ratelimit-remaining')); // 99950
console.log(response.headers.get('x-ratelimit-reset')); // Unix timestamp
```

## Environment Variables

```bash
# Partner credentials
HOLOSCRIPT_PARTNER_ID=***
HOLOSCRIPT_PARTNER_KEY=***
HOLOSCRIPT_WEBHOOK_SECRET=***

# API configuration
HOLOSCRIPT_API_BASE_URL=https://api.holoscript.dev
HOLOSCRIPT_API_TIMEOUT=30000

# Webhook
WEBHOOK_URL=https://myapp.com/webhooks/holoscript
```

## Best Practices

1. **Store API keys securely** — Never commit to version control
2. **Rotate keys regularly** — Every 90 days minimum
3. **Verify webhook signatures** — Always validate incoming events
4. **Implement exponential backoff** — Retry failed API calls
5. **Cache responses** — Reduce API calls with intelligent caching
6. **Monitor rate limits** — Stay below quota to avoid service disruption
7. **Use webhooks instead of polling** — More efficient, real-time updates
8. **Document API usage** — Track which endpoints you call and why

## See Also

- [Auth](../packages/auth.md) — API key authentication details
- [Security Sandbox](../packages/security-sandbox.md) — Safely execute partner code
- [MCP Server](../packages/mcp-server.md) — Tool discovery for partners
