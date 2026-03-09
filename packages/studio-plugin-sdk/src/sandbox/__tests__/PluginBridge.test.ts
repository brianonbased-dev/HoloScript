/**
 * Tests for PluginBridge - permission validation, rate limiting, message dispatch
 *
 * Since PluginBridge depends on PluginSandbox which requires DOM (iframe),
 * we test the bridge logic through integration with a mock sandbox.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  SandboxPermission,
  PluginSandboxManifest,
  PluginAPICallMessage,
  PluginStorageMessage,
  PluginFetchMessage,
  PluginClipboardMessage,
  PluginRegisterMessage,
  PluginLogMessage,
  PluginErrorMessage,
  PluginToHostMessage,
  MessageId,
} from '../types.js';

/**
 * Mock sandbox that captures messages and simulates permission checks.
 */
function createMockSandbox(pluginId: string, permissions: SandboxPermission[]) {
  const sentResponses: Array<{ id: MessageId; success: boolean; data?: unknown; error?: unknown }> =
    [];
  const sentEvents: Array<{ namespace: string; event: string; data: unknown }> = [];
  const violations: Array<{ permission: SandboxPermission; details: string }> = [];
  const latencies: number[] = [];
  const messageHandlers: Array<(message: PluginToHostMessage) => void> = [];

  return {
    getPluginId: () => pluginId,
    hasPermission: (perm: SandboxPermission) => permissions.includes(perm),
    sendResponse: (requestId: MessageId, success: boolean, data?: unknown, error?: unknown) => {
      sentResponses.push({ id: requestId, success, data, error });
    },
    sendEvent: (namespace: string, event: string, data: unknown) => {
      sentEvents.push({ namespace, event, data });
    },
    recordPermissionViolation: (perm: SandboxPermission, details: string) => {
      violations.push({ permission: perm, details });
    },
    recordLatency: (ms: number) => {
      latencies.push(ms);
    },
    onMessage: (handler: (message: PluginToHostMessage) => void) => {
      messageHandlers.push(handler);
      return () => {
        const idx = messageHandlers.indexOf(handler);
        if (idx !== -1) messageHandlers.splice(idx, 1);
      };
    },
    // For accessing manifest in isUrlAllowed
    options: {
      manifest: {
        permissions,
        networkPolicy: {
          allowedDomains: ['api.example.com', '*.trusted.org'],
          allowLocalhost: false,
        },
      } as PluginSandboxManifest,
    },

    // Test helpers
    _sentResponses: sentResponses,
    _sentEvents: sentEvents,
    _violations: violations,
    _latencies: latencies,
    _messageHandlers: messageHandlers,
    _simulateMessage: (message: PluginToHostMessage) => {
      for (const handler of messageHandlers) {
        handler(message);
      }
    },
  };
}

/**
 * Creates a test message with boilerplate fields.
 */
function createTestMessage<T extends PluginToHostMessage['type']>(
  type: T,
  pluginId: string,
  payload: Record<string, unknown>
): PluginToHostMessage {
  return {
    protocol: 'holoscript-sandbox-v1',
    id: `test-msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    pluginId,
    timestamp: Date.now(),
    type,
    payload,
  } as unknown as PluginToHostMessage;
}

// We import the bridge dynamically since it references PluginSandbox type
// but we use a mock instead
describe('PluginBridge Permission Checks', () => {
  it('should deny API calls when permission is missing', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['scene:read']);
    const bridge = new PluginBridge(mockSandbox as any, {
      onAPICall: vi.fn().mockResolvedValue({ nodes: [] }),
    });

    bridge.connect();

    // Simulate an API call that requires scene:write
    const message = createTestMessage('plugin:api-call', 'test-plugin', {
      namespace: 'scene',
      method: 'createNode',
      args: ['root', { name: 'test' }],
    });

    mockSandbox._simulateMessage(message);

    // Wait for async handling
    await new Promise((r) => setTimeout(r, 10));

    // Should have been denied
    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse).toBeDefined();
    expect(lastResponse.success).toBe(false);
    expect((lastResponse.error as any)?.code).toBe('PERMISSION_DENIED');

    // Should have recorded a violation
    expect(mockSandbox._violations.length).toBeGreaterThan(0);

    bridge.disconnect();
  });

  it('should allow API calls when permission is granted', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['scene:read']);
    const apiHandler = vi.fn().mockResolvedValue({ nodes: ['node-1', 'node-2'] });

    const bridge = new PluginBridge(mockSandbox as any, {
      onAPICall: apiHandler,
    });

    bridge.connect();

    const message = createTestMessage('plugin:api-call', 'test-plugin', {
      namespace: 'scene',
      method: 'getNodes',
      args: [],
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    // Should have called the API handler
    expect(apiHandler).toHaveBeenCalledWith('test-plugin', 'scene', 'getNodes', []);

    // Should have sent a success response
    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(true);
    expect(lastResponse.data).toEqual({ nodes: ['node-1', 'node-2'] });

    bridge.disconnect();
  });

  it('should deny storage operations without proper permission', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['scene:read']); // No storage permission
    const bridge = new PluginBridge(mockSandbox as any, {
      onStorage: vi.fn().mockResolvedValue('value'),
    });

    bridge.connect();

    const message = createTestMessage('plugin:storage', 'test-plugin', {
      operation: 'get',
      scope: 'local',
      key: 'my-key',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(false);
    expect((lastResponse.error as any)?.code).toBe('PERMISSION_DENIED');

    bridge.disconnect();
  });

  it('should allow storage operations with proper permission', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['storage:local']);
    const storageHandler = vi.fn().mockResolvedValue('stored-value');

    const bridge = new PluginBridge(mockSandbox as any, {
      onStorage: storageHandler,
    });

    bridge.connect();

    const message = createTestMessage('plugin:storage', 'test-plugin', {
      operation: 'get',
      scope: 'local',
      key: 'my-key',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    expect(storageHandler).toHaveBeenCalledWith('test-plugin', 'local', 'get', 'my-key', undefined);

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(true);
    expect(lastResponse.data).toBe('stored-value');

    bridge.disconnect();
  });

  it('should deny network requests without network:fetch permission', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['scene:read']); // No network permission
    const bridge = new PluginBridge(mockSandbox as any, {
      onFetch: vi.fn(),
    });

    bridge.connect();

    const message = createTestMessage('plugin:fetch', 'test-plugin', {
      url: 'https://api.example.com/data',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(false);
    expect((lastResponse.error as any)?.code).toBe('PERMISSION_DENIED');

    bridge.disconnect();
  });

  it('should deny network requests to domains not in allowlist', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['network:fetch']);
    const bridge = new PluginBridge(mockSandbox as any, {
      onFetch: vi.fn(),
    });

    bridge.connect();

    const message = createTestMessage('plugin:fetch', 'test-plugin', {
      url: 'https://evil-site.com/steal-data',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(false);
    expect((lastResponse.error as any)?.code).toBe('PERMISSION_DENIED');
    expect(mockSandbox._violations.length).toBeGreaterThan(0);

    bridge.disconnect();
  });

  it('should allow network requests to domains in allowlist', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['network:fetch']);
    const fetchHandler = vi.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"data": "test"}',
    });

    const bridge = new PluginBridge(mockSandbox as any, {
      onFetch: fetchHandler,
    });

    bridge.connect();

    const message = createTestMessage('plugin:fetch', 'test-plugin', {
      url: 'https://api.example.com/data',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchHandler).toHaveBeenCalled();

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(true);

    bridge.disconnect();
  });

  it('should allow wildcard domain matches', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['network:fetch']);
    const fetchHandler = vi.fn().mockResolvedValue({
      status: 200,
      headers: {},
      body: 'ok',
    });

    const bridge = new PluginBridge(mockSandbox as any, {
      onFetch: fetchHandler,
    });

    bridge.connect();

    // Should match *.trusted.org
    const message = createTestMessage('plugin:fetch', 'test-plugin', {
      url: 'https://api.trusted.org/endpoint',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchHandler).toHaveBeenCalled();

    bridge.disconnect();
  });
});

describe('PluginBridge Log and Error Handling', () => {
  it('should forward log messages to onLog handler', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', []);
    const logHandler = vi.fn();

    const bridge = new PluginBridge(mockSandbox as any, {
      onLog: logHandler,
    });

    bridge.connect();

    const message = createTestMessage('plugin:log', 'test-plugin', {
      level: 'info',
      message: 'Hello from plugin',
      data: { extra: true },
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    expect(logHandler).toHaveBeenCalledWith('test-plugin', 'info', 'Hello from plugin', {
      extra: true,
    });

    bridge.disconnect();
  });

  it('should forward error messages to onError handler', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', []);
    const errorHandler = vi.fn();

    const bridge = new PluginBridge(mockSandbox as any, {
      onError: errorHandler,
    });

    bridge.connect();

    const message = createTestMessage('plugin:error', 'test-plugin', {
      code: 'PLUGIN_CRASH',
      message: 'Something went wrong',
      stack: 'Error: Something went wrong\n  at plugin.js:42',
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    expect(errorHandler).toHaveBeenCalledWith(
      'test-plugin',
      'PLUGIN_CRASH',
      'Something went wrong',
      'Error: Something went wrong\n  at plugin.js:42'
    );

    bridge.disconnect();
  });
});

describe('PluginBridge Registration Handling', () => {
  it('should deny registration without required permission', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['scene:read']); // No ui:panel
    const bridge = new PluginBridge(mockSandbox as any, {
      onRegister: vi.fn(),
    });

    bridge.connect();

    const message = createTestMessage('plugin:register', 'test-plugin', {
      kind: 'panel',
      descriptor: { id: 'my-panel', label: 'My Panel' },
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(false);
    expect((lastResponse.error as any)?.code).toBe('PERMISSION_DENIED');

    bridge.disconnect();
  });

  it('should allow registration with correct permission', async () => {
    const { PluginBridge } = await import('../PluginBridge.js');

    const mockSandbox = createMockSandbox('test-plugin', ['ui:panel']);
    const registerHandler = vi.fn().mockResolvedValue(undefined);

    const bridge = new PluginBridge(mockSandbox as any, {
      onRegister: registerHandler,
    });

    bridge.connect();

    const message = createTestMessage('plugin:register', 'test-plugin', {
      kind: 'panel',
      descriptor: { id: 'my-panel', label: 'My Panel' },
    });

    mockSandbox._simulateMessage(message);
    await new Promise((r) => setTimeout(r, 10));

    expect(registerHandler).toHaveBeenCalledWith('test-plugin', 'panel', {
      id: 'my-panel',
      label: 'My Panel',
    });

    const lastResponse = mockSandbox._sentResponses[mockSandbox._sentResponses.length - 1];
    expect(lastResponse.success).toBe(true);

    bridge.disconnect();
  });
});
