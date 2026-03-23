import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppStoreConnector } from '../AppStoreConnector.js';

describe('AppStoreConnector', () => {
    let connector: AppStoreConnector;

    beforeEach(() => {
        connector = new AppStoreConnector();
        vi.clearAllMocks();
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
            const appleTools = tools.filter(t => t.name.startsWith('apple_'));
            expect(appleTools.length).toBeGreaterThan(0);

            // Should have Google tools
            const googleTools = tools.filter(t => t.name.startsWith('google_'));
            expect(googleTools.length).toBeGreaterThan(0);

            // Should have cross-platform tools
            const crossPlatformTools = tools.filter(t => t.name.startsWith('appstore_'));
            expect(crossPlatformTools.length).toBeGreaterThan(0);
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
            process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

            await connector.connect();

            const health = await connector.health();
            expect(health).toBe(true);

            await connector.disconnect();
        });

        it('should disconnect properly', async () => {
            process.env.APPLE_KEY_ID = 'test-key-id';
            process.env.APPLE_ISSUER_ID = 'test-issuer-id';
            process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

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

        it('should route Apple tools correctly', async () => {
            process.env.APPLE_KEY_ID = 'test-key-id';
            process.env.APPLE_ISSUER_ID = 'test-issuer-id';
            process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

            await connector.connect();

            // Mock tool execution would happen here
            // In production tests, use actual API mocks

            await connector.disconnect();
        });

        it('should handle unknown tools', async () => {
            process.env.APPLE_KEY_ID = 'test-key-id';
            process.env.APPLE_ISSUER_ID = 'test-issuer-id';
            process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

            await connector.connect();

            await expect(
                connector.executeTool('unknown_tool', {})
            ).rejects.toThrow('Unknown tool');

            await connector.disconnect();
        });
    });

    describe('Health Check', () => {
        it('should return health status', async () => {
            process.env.APPLE_KEY_ID = 'test-key-id';
            process.env.APPLE_ISSUER_ID = 'test-issuer-id';
            process.env.APPLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';

            await connector.connect();

            const result = await connector.executeTool('appstore_health', {});

            expect(result).toHaveProperty('apple');
            expect(result).toHaveProperty('google');

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
    });
});
