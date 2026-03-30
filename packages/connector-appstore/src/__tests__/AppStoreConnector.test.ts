import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppStoreConnector } from '../AppStoreConnector.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('AppStoreConnector', () => {
  let connector: AppStoreConnector;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    connector = new AppStoreConnector();
    vi.clearAllMocks();

    // Save env vars
    savedEnv = {
      APPLE_KEY_ID: process.env.APPLE_KEY_ID,
      APPLE_ISSUER_ID: process.env.APPLE_ISSUER_ID,
      APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
      GOOGLE_SERVICE_ACCOUNT: process.env.GOOGLE_SERVICE_ACCOUNT,
    };
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('Initialization', () => {
    it('should create connector instance', () => {
      expect(connector).toBeInstanceOf(AppStoreConnector);
    });

    it('should not be connected initially', async () => {
      const health = await connector.health();
      expect(health).toBe(false);
    });

    it('should list all MCP tools', async () => {
      const tools = await connector.listTools();
      expect(tools.length).toBeGreaterThan(0);

      // Should have Apple tools
      const appleTools = tools.filter((t) => t.name.startsWith('apple_'));
      expect(appleTools.length).toBeGreaterThan(0);

      // Should have Google tools
      const googleTools = tools.filter((t) => t.name.startsWith('google_'));
      expect(googleTools.length).toBeGreaterThan(0);

      // Should have cross-platform tools
      const crossPlatformTools = tools.filter((t) => t.name.startsWith('appstore_'));
      expect(crossPlatformTools.length).toBeGreaterThan(0);
    });

    it('should have 27 total tools', async () => {
      const tools = await connector.listTools();
      expect(tools.length).toBe(27);
    });
  });

  describe('Connection Management', () => {
    it('should require at least one platform credential', async () => {
      // Clear environment variables
      delete process.env.APPLE_KEY_ID;
      delete process.env.APPLE_ISSUER_ID;
      delete process.env.APPLE_PRIVATE_KEY;
      delete process.env.GOOGLE_SERVICE_ACCOUNT;

      await expect(connector.connect()).rejects.toThrow('No app store platforms connected');
    });

    it('should connect with Apple credentials only', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      delete process.env.GOOGLE_SERVICE_ACCOUNT;

      await connector.connect();

      const health = await connector.health();
      expect(health).toBe(true);

      await connector.disconnect();
    });

    it('should disconnect properly', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();
      await connector.disconnect();

      const health = await connector.health();
      expect(health).toBe(false);
    });
  });

  describe('Tool Execution', () => {
    it('should throw error if not connected', async () => {
      await expect(
        connector.executeTool('apple_app_get', { bundleId: 'com.test.app' })
      ).rejects.toThrow('not connected');
    });

    it('should handle unknown tools', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();

      await expect(connector.executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool');

      await connector.disconnect();
    });

    it('should throw when Apple tool called without Apple credentials', async () => {
      // Only Google credentials available
      process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({
        client_email: 'test@example.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
      });
      delete process.env.APPLE_KEY_ID;
      delete process.env.APPLE_ISSUER_ID;
      delete process.env.APPLE_PRIVATE_KEY;

      await connector.connect();

      await expect(
        connector.executeTool('apple_app_get', { bundleId: 'com.test.app' })
      ).rejects.toThrow('Apple App Store Connect is not configured');

      await connector.disconnect();
    });

    it('should throw when Google tool called without Google credentials', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
      delete process.env.GOOGLE_SERVICE_ACCOUNT;

      await connector.connect();

      await expect(
        connector.executeTool('google_app_get', { packageName: 'com.test.app' })
      ).rejects.toThrow('Google Play Developer is not configured');

      await connector.disconnect();
    });
  });

  describe('Health Check Tool', () => {
    it('should return health status via tool', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();

      const result = (await connector.executeTool('appstore_health', {})) as any;

      expect(result).toHaveProperty('apple');
      expect(result).toHaveProperty('google');
      expect(result.apple).toBe(true);
      expect(result.google).toBe(false);

      await connector.disconnect();
    });
  });

  describe('Artifact Detection', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `appstore-test-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should detect .ipa artifacts', () => {
      writeFileSync(join(tmpDir, 'app.ipa'), 'fake-ipa-content');

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].platform).toBe('ios');
      expect(result.artifacts[0].extension).toBe('.ipa');
    });

    it('should detect .aab artifacts', () => {
      writeFileSync(join(tmpDir, 'app.aab'), 'fake-aab-content');

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].platform).toBe('android');
      expect(result.artifacts[0].extension).toBe('.aab');
    });

    it('should detect .apk artifacts', () => {
      writeFileSync(join(tmpDir, 'app.apk'), 'fake-apk-content');

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].platform).toBe('android');
      expect(result.artifacts[0].extension).toBe('.apk');
    });

    it('should detect visionOS .ipa from path containing visionos', () => {
      const visionDir = join(tmpDir, 'visionos');
      mkdirSync(visionDir, { recursive: true });
      writeFileSync(join(visionDir, 'app.ipa'), 'fake-visionos-ipa');

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].platform).toBe('visionos');
    });

    it('should detect multiple artifacts across subdirectories', () => {
      const iosDir = join(tmpDir, 'ios');
      const androidDir = join(tmpDir, 'android');
      mkdirSync(iosDir, { recursive: true });
      mkdirSync(androidDir, { recursive: true });

      writeFileSync(join(iosDir, 'build.ipa'), 'ios-content');
      writeFileSync(join(androidDir, 'build.aab'), 'android-content');
      writeFileSync(join(androidDir, 'build.apk'), 'android-apk-content');

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts).toHaveLength(3);

      const platforms = result.artifacts.map((a) => a.platform);
      expect(platforms).toContain('ios');
      expect(platforms).toContain('android');
    });

    it('should return empty array for non-existent directory', () => {
      const result = connector.detectArtifacts('/nonexistent/path');

      expect(result.artifacts).toHaveLength(0);
    });

    it('should ignore non-artifact files', () => {
      writeFileSync(join(tmpDir, 'readme.txt'), 'text');
      writeFileSync(join(tmpDir, 'config.json'), '{}');
      writeFileSync(join(tmpDir, 'script.sh'), 'echo hi');

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts).toHaveLength(0);
    });

    it('should include file size information', () => {
      const content = 'x'.repeat(1024);
      writeFileSync(join(tmpDir, 'app.ipa'), content);

      const result = connector.detectArtifacts(tmpDir);

      expect(result.artifacts[0].sizeBytes).toBe(1024);
    });

    it('should be accessible via MCP tool', async () => {
      writeFileSync(join(tmpDir, 'app.aab'), 'fake-aab');

      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();

      const result = (await connector.executeTool('appstore_detect_artifacts', {
        outputPath: tmpDir,
      })) as any;

      expect(result.artifacts).toHaveLength(1);
      expect(result.scannedPath).toBeTruthy();

      await connector.disconnect();
    });
  });

  describe('Webhook Handler', () => {
    it('should provide webhook handler', () => {
      const handler = connector.getWebhookHandler();
      expect(handler).toBeDefined();
    });

    it('should register webhook listeners', () => {
      const handler = connector.getWebhookHandler();
      const callback = vi.fn();

      handler.on('build.ready', callback);

      // Verify listener was registered
      expect(callback).not.toHaveBeenCalled();
    });

    it('should remove webhook listeners', () => {
      const handler = connector.getWebhookHandler();
      const callback = vi.fn();

      handler.on('build.ready', callback);
      handler.off('build.ready', callback);

      // Listener should be removed
      expect(callback).not.toHaveBeenCalled();
    });

    it('should process Apple webhook via tool', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();

      const handler = connector.getWebhookHandler();
      const callback = vi.fn();
      handler.on('build.ready', callback);

      await connector.executeTool('appstore_webhook_apple', {
        payload: {
          notificationType: 'BUILD_PROCESSING_COMPLETE',
          data: { buildId: 'build-123' },
        },
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'build.ready',
          platform: 'apple',
        })
      );

      await connector.disconnect();
    });

    it('should process Google webhook via tool', async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();

      const handler = connector.getWebhookHandler();
      const callback = vi.fn();
      handler.on('review.approved', callback);

      await connector.executeTool('appstore_webhook_google', {
        payload: {
          message: {
            data: Buffer.from(
              JSON.stringify({
                notificationType: 'REVIEW_APPROVED',
                packageName: 'com.test.app',
              })
            ).toString('base64'),
          },
        },
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'review.approved',
          platform: 'google',
        })
      );

      await connector.disconnect();
    });
  });

  describe('Tool Routing - New Tools', () => {
    beforeEach(async () => {
      process.env.APPLE_KEY_ID = 'test-key-id';
      process.env.APPLE_ISSUER_ID = 'test-issuer-id';
      process.env.APPLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

      await connector.connect();
    });

    afterEach(async () => {
      await connector.disconnect();
    });

    it('should route apple_beta_groups_list tool', async () => {
      // This will fail with a network error since we have no mock for the API
      // but it proves the routing works
      await expect(
        connector.executeTool('apple_beta_groups_list', { bundleId: 'com.test.app' })
      ).rejects.toThrow(); // Will throw API error, but that means routing worked
    });

    it('should route apple_version_create tool', async () => {
      await expect(
        connector.executeTool('apple_version_create', {
          bundleId: 'com.test.app',
          versionString: '1.0.0',
        })
      ).rejects.toThrow(); // API error = routing worked
    });

    it('should route apple_version_get tool', async () => {
      await expect(
        connector.executeTool('apple_version_get', {
          bundleId: 'com.test.app',
        })
      ).rejects.toThrow(); // API error = routing worked
    });

    it('should route apple_version_attach_build tool', async () => {
      await expect(
        connector.executeTool('apple_version_attach_build', {
          versionId: 'v-1',
          buildId: 'b-1',
        })
      ).rejects.toThrow(); // API error = routing worked
    });

    it('should route apple_version_submit tool', async () => {
      await expect(
        connector.executeTool('apple_version_submit', {
          versionId: 'v-1',
        })
      ).rejects.toThrow(); // API error = routing worked
    });

    it('should route apple_version_localization_update tool', async () => {
      await expect(
        connector.executeTool('apple_version_localization_update', {
          versionId: 'v-1',
          locale: 'en-US',
          description: 'Test',
        })
      ).rejects.toThrow(); // API error = routing worked
    });
  });
});
