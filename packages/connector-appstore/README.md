# @holoscript/connector-appstore

Dual-platform app store connector for HoloScript Studio Integration Hub.

Integrates with **Apple App Store Connect** and **Google Play Developer API** for automated build deployment from Unity/HoloScript compiler output to production app stores.

## Features

### Apple App Store Connect

- ✅ JWT authentication with App Store Connect API
- ✅ iOS and visionOS build upload (.ipa)
- ✅ TestFlight beta distribution
- ✅ Build processing status monitoring
- ✅ App metadata management
- ✅ Beta review tracking

### Google Play Developer

- ✅ Service account authentication
- ✅ Android build upload (.apk, .aab)
- ✅ Internal/Alpha/Beta/Production track management
- ✅ Staged rollout control
- ✅ Release promotion between tracks
- ✅ Store listing metadata updates

### Cross-Platform

- ✅ Unified API for both platforms
- ✅ Unity build artifact auto-detection
- ✅ Webhook notifications for build status
- ✅ MCP tool integration for Studio workflows

## Installation

```bash
pnpm add @holoscript/connector-appstore
```

## Setup

### Apple App Store Connect

1. **Create App Store Connect API Key**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/access/api)
   - Create a new API key with "Developer" role
   - Download the `.p8` private key file
   - Note the **Key ID** and **Issuer ID**

2. **Set Environment Variables**
   ```bash
   export APPLE_KEY_ID="ABC123XYZ"
   export APPLE_ISSUER_ID="12345678-1234-1234-1234-123456789012"
   export APPLE_PRIVATE_KEY="/path/to/AuthKey_ABC123XYZ.p8"
   # OR provide key content directly
   export APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   ```

### Google Play Developer

1. **Create Service Account**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a service account with "Service Account User" role
   - Enable Google Play Developer API
   - Download the JSON key file

2. **Grant Access in Play Console**
   - Go to [Google Play Console](https://play.google.com/console)
   - Settings → API access
   - Link the service account
   - Grant "Release manager" permissions

3. **Set Environment Variable**
   ```bash
   export GOOGLE_SERVICE_ACCOUNT="/path/to/service-account.json"
   # OR provide JSON directly
   export GOOGLE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"..."}'
   ```

## Usage

### Basic Example

```typescript
import { AppStoreConnector } from '@holoscript/connector-appstore';

const connector = new AppStoreConnector();

// Connect to both platforms
await connector.connect();

// Check health
const health = await connector.health();
console.log('Connected:', health);

// Upload iOS build to Apple
await connector.executeTool('apple_build_upload', {
  filePath: '/path/to/build.ipa',
  bundleId: 'com.company.app',
  version: '1.0.0',
  buildNumber: '42',
  platform: 'ios',
});

// Upload Android build to Google Play
await connector.executeTool('google_build_upload', {
  filePath: '/path/to/build.aab',
  packageName: 'com.company.app',
  version: '1.0.0',
  buildNumber: '42',
  track: 'internal',
});

// Disconnect
await connector.disconnect();
```

### Unity Build Publishing

Automatically detect and publish Unity build output:

```typescript
// Publish Unity builds to both platforms
const result = await connector.executeTool('appstore_unity_publish', {
  unityOutputPath: '/path/to/unity/builds',
  platforms: ['ios', 'android'],
  version: '1.0.0',
  buildNumber: '42',
  releaseNotes: 'Bug fixes and improvements',
  appleBundleId: 'com.company.app',
  googlePackageName: 'com.company.app',
  androidTrack: 'internal',
  submitToTestFlight: true,
});

console.log('Summary:', result.summary);
// { total: 2, successful: 2, failed: 0 }
```

### Webhook Notifications

Listen for build status updates:

```typescript
const handler = connector.getWebhookHandler();

// Listen for build ready events
handler.on('build.ready', (notification) => {
  console.log(`Build ready on ${notification.platform}:`, notification.payload);
});

// Listen for review results
handler.on('review.approved', (notification) => {
  console.log('Review approved!', notification.payload);
});

handler.on('review.rejected', (notification) => {
  console.error('Review rejected:', notification.payload);
});

// Listen to all events
handler.on('*', (notification) => {
  console.log('Event:', notification.event, notification.platform);
});

// Handle incoming webhooks (e.g., in Express route)
app.post('/webhooks/apple', async (req, res) => {
  await handler.handleAppleWebhook(req.body);
  res.sendStatus(200);
});

app.post('/webhooks/google', async (req, res) => {
  await handler.handleGoogleWebhook(req.body);
  res.sendStatus(200);
});
```

### Track Management (Google Play)

```typescript
// Get track status
const track = await connector.executeTool('google_track_get', {
  packageName: 'com.company.app',
  track: 'internal',
});

console.log('Version codes:', track.versionCodes);
console.log('Status:', track.status);

// Promote from internal to alpha
await connector.executeTool('google_release_promote', {
  packageName: 'com.company.app',
  fromTrack: 'internal',
  toTrack: 'alpha',
  versionCodes: [42, 43],
});

// Update production rollout to 50%
await connector.executeTool('google_rollout_update', {
  packageName: 'com.company.app',
  versionCodes: [42],
  percentage: 50,
});
```

### TestFlight Management (Apple)

```typescript
// List all builds
const builds = await connector.executeTool('apple_builds_list', {
  bundleId: 'com.company.app',
  limit: 10,
});

console.log('Recent builds:', builds);

// Submit to TestFlight
await connector.executeTool('apple_testflight_submit', {
  buildId: 'build-123',
});

// Check beta review status
const status = await connector.executeTool('apple_beta_review_status', {
  buildId: 'build-123',
});

console.log('Beta review status:', status);
```

## MCP Tools

This connector provides 16 MCP tools for use in HoloScript Studio:

### Apple Tools

- `apple_app_get` - Get app information
- `apple_build_upload` - Upload iOS/visionOS build
- `apple_build_get` - Get build details
- `apple_builds_list` - List all builds
- `apple_testflight_submit` - Submit to TestFlight
- `apple_beta_review_status` - Get beta review status
- `apple_metadata_update` - Update app metadata

### Google Tools

- `google_app_get` - Get app information
- `google_build_upload` - Upload Android build
- `google_track_get` - Get track information
- `google_tracks_list` - List all tracks
- `google_release_promote` - Promote between tracks
- `google_rollout_update` - Update staged rollout
- `google_listing_update` - Update store listing

### Cross-Platform Tools

- `appstore_health` - Check platform health
- `appstore_unity_publish` - Publish Unity builds

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to App Stores

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Build Unity project
        run: # Your Unity build commands here

      - name: Publish to App Stores
        env:
          APPLE_KEY_ID: ${{ secrets.APPLE_KEY_ID }}
          APPLE_ISSUER_ID: ${{ secrets.APPLE_ISSUER_ID }}
          APPLE_PRIVATE_KEY: ${{ secrets.APPLE_PRIVATE_KEY }}
          GOOGLE_SERVICE_ACCOUNT: ${{ secrets.GOOGLE_SERVICE_ACCOUNT }}
        run: |
          node scripts/publish-to-stores.js
```

### Script Example (`scripts/publish-to-stores.js`)

```javascript
import { AppStoreConnector } from '@holoscript/connector-appstore';

const connector = new AppStoreConnector();
await connector.connect();

const result = await connector.executeTool('appstore_unity_publish', {
  unityOutputPath: './build',
  platforms: ['ios', 'android'],
  version: process.env.VERSION,
  buildNumber: process.env.BUILD_NUMBER,
  releaseNotes: process.env.RELEASE_NOTES,
  appleBundleId: 'com.company.app',
  googlePackageName: 'com.company.app',
  androidTrack: 'internal',
});

if (result.summary.failed > 0) {
  process.exit(1);
}
```

## Pipeline Integration

This connector integrates seamlessly with UnityCompiler output:

```typescript
import { UnityCompiler } from '@holoscript/core';
import { AppStoreConnector } from '@holoscript/connector-appstore';

// 1. Compile HoloScript to Unity
const compiler = new UnityCompiler();
const output = await compiler.compile(scene, userToken);

// 2. Build Unity project (using CI artifact)
// ... your Unity build process ...

// 3. Upload to stores
const connector = new AppStoreConnector();
await connector.connect();

await connector.executeTool('appstore_unity_publish', {
  unityOutputPath: output.buildPath,
  platforms: ['ios', 'android'],
  version: '1.0.0',
  buildNumber: '42',
  appleBundleId: 'com.company.app',
  googlePackageName: 'com.company.app',
});
```

## API Reference

See [API Documentation](./docs/api.md) for full TypeScript API reference.

## Webhook Events

Both platforms send notifications for build status changes:

| Event              | Description                     | Platforms     |
| ------------------ | ------------------------------- | ------------- |
| `build.processing` | Build is being processed        | Apple, Google |
| `build.ready`      | Build is ready for distribution | Apple, Google |
| `build.invalid`    | Build failed validation         | Apple         |
| `review.approved`  | App review approved             | Apple, Google |
| `review.rejected`  | App review rejected             | Apple, Google |

## Security

- **Apple**: JWT tokens are auto-renewed every 20 minutes (Apple's maximum)
- **Google**: Service account credentials use OAuth 2.0 with auto-refresh
- **Webhooks**: Implement signature verification in production (placeholders provided)

## Troubleshooting

### Apple Upload Fails

- Verify your `.p8` key file is valid and matches the Key ID
- Ensure the bundle ID exists in App Store Connect
- Check that the API key has "Developer" or "Admin" role

### Google Upload Fails

- Verify service account has "Release manager" permissions
- Ensure package name matches your app in Play Console
- Check that the service account is linked in API access settings

### Build Processing Timeout

- Apple builds can take 10-30 minutes to process
- Google builds are usually instant for APK, 5-10 minutes for AAB
- Increase `maxWaitMinutes` parameter if needed

## License

MIT

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Related Packages

- [@holoscript/connector-core](../connector-core) - Base connector interfaces
- [@holoscript/connector-github](../connector-github) - GitHub CI/CD integration
- [@holoscript/connector-railway](../connector-railway) - Railway deployment
- [@holoscript/core](../core) - HoloScript compiler (UnityCompiler)
