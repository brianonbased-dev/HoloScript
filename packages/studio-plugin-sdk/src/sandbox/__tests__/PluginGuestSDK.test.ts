// @vitest-environment jsdom
/**
 * Tests for PluginGuestSDK - the plugin-facing API inside sandboxed iframes
 *
 * These tests simulate the postMessage channel by mocking window.parent.postMessage
 * and dispatching MessageEvents.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  HostToPluginMessage,
  HostInitMessage,
  HostResponseMessage,
  HostEventMessage,
  HostShutdownMessage,
  PluginToHostMessage,
} from '../types.js';

/**
 * Helper to capture messages sent via window.parent.postMessage.
 */
function setupPostMessageCapture(): {
  sentMessages: PluginToHostMessage[];
  cleanup: () => void;
} {
  const sentMessages: PluginToHostMessage[] = [];

  // Mock window.parent.postMessage
  const originalParent = window.parent;
  Object.defineProperty(window, 'parent', {
    value: {
      postMessage: (msg: PluginToHostMessage, origin: string) => {
        sentMessages.push(msg);
      },
    },
    writable: true,
    configurable: true,
  });

  return {
    sentMessages,
    cleanup: () => {
      Object.defineProperty(window, 'parent', {
        value: originalParent,
        writable: true,
        configurable: true,
      });
    },
  };
}

/**
 * Simulates a host message arriving at the plugin iframe.
 */
function simulateHostMessage(message: HostToPluginMessage): void {
  const event = new MessageEvent('message', { data: message });
  window.dispatchEvent(event);
}

/**
 * Creates a mock host:response message.
 */
function createHostResponse(
  pluginId: string,
  requestId: string,
  success: boolean,
  data?: unknown,
  error?: { code: string; message: string },
): HostResponseMessage {
  return {
    protocol: 'holoscript-sandbox-v1',
    id: `resp-${Date.now()}`,
    pluginId,
    timestamp: Date.now(),
    type: 'host:response',
    payload: {
      requestId,
      success,
      data,
      error: error as HostResponseMessage['payload']['error'],
    },
  };
}

describe('PluginGuestSDK', () => {
  let capture: ReturnType<typeof setupPostMessageCapture>;

  beforeEach(() => {
    capture = setupPostMessageCapture();
  });

  afterEach(() => {
    capture.cleanup();
  });

  it('should send plugin:ready message when ready() is called', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    sdk.ready();

    expect(capture.sentMessages.length).toBe(1);
    const readyMsg = capture.sentMessages[0];
    expect(readyMsg.type).toBe('plugin:ready');
    expect(readyMsg.pluginId).toBe('test-plugin');
    expect(readyMsg.protocol).toBe('holoscript-sandbox-v1');
    expect((readyMsg as any).payload.version).toBe('1.0.0');
  });

  it('should not send ready twice', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    sdk.ready();
    sdk.ready(); // Second call should be ignored

    // Only one ready message
    const readyMessages = capture.sentMessages.filter((m) => m.type === 'plugin:ready');
    expect(readyMessages.length).toBe(1);
  });

  it('should handle host:init message and call onInit handler', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');
    const initHandler = vi.fn();

    sdk.onInit(initHandler);

    const initMessage: HostInitMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'init-1',
      pluginId: 'test-plugin',
      timestamp: Date.now(),
      type: 'host:init',
      payload: {
        grantedPermissions: ['scene:read', 'ui:panel'],
        settings: { apiKey: 'test-key' },
        theme: { mode: 'dark', colors: { primary: '#6366f1' } },
        studioVersion: '3.43.0',
      },
    };

    simulateHostMessage(initMessage);

    expect(initHandler).toHaveBeenCalledWith(initMessage.payload);
    expect(sdk.getPermissions()).toEqual(['scene:read', 'ui:panel']);
    expect(sdk.hasPermission('scene:read')).toBe(true);
    expect(sdk.hasPermission('scene:write')).toBe(false);
    expect(sdk.getSettings()).toEqual({ apiKey: 'test-key' });
  });

  it('should call onInit immediately if init data already received', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    // Send init first
    const initMessage: HostInitMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'init-1',
      pluginId: 'test-plugin',
      timestamp: Date.now(),
      type: 'host:init',
      payload: {
        grantedPermissions: ['scene:read'],
        settings: {},
        theme: { mode: 'dark', colors: {} },
        studioVersion: '3.43.0',
      },
    };

    simulateHostMessage(initMessage);

    // Then register handler
    const initHandler = vi.fn();
    sdk.onInit(initHandler);

    // Should be called immediately
    expect(initHandler).toHaveBeenCalledWith(initMessage.payload);
  });

  it('should make API calls and resolve with response data', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    // Start API call
    const nodesPromise = sdk.scene.getNodes();

    // Find the sent message
    const apiCallMsg = capture.sentMessages.find((m) => m.type === 'plugin:api-call');
    expect(apiCallMsg).toBeDefined();
    expect((apiCallMsg as any).payload.namespace).toBe('scene');
    expect((apiCallMsg as any).payload.method).toBe('getNodes');

    // Simulate host response
    const response = createHostResponse('test-plugin', apiCallMsg!.id, true, ['node-1', 'node-2']);
    simulateHostMessage(response);

    const result = await nodesPromise;
    expect(result).toEqual(['node-1', 'node-2']);
  });

  it('should reject API calls when host returns error', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    const promise = sdk.scene.createNode('root', { name: 'test' });

    const apiCallMsg = capture.sentMessages.find((m) => m.type === 'plugin:api-call');
    expect(apiCallMsg).toBeDefined();

    // Simulate error response
    const response = createHostResponse('test-plugin', apiCallMsg!.id, false, undefined, {
      code: 'PERMISSION_DENIED',
      message: 'Plugin lacks scene:write permission',
    });
    simulateHostMessage(response);

    await expect(promise).rejects.toThrow('PERMISSION_DENIED');
  });

  it('should timeout API calls that take too long', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0', {
      defaultTimeout: 100, // 100ms timeout for testing
    });

    const promise = sdk.scene.getNodes();

    // Don't send a response - let it timeout
    await expect(promise).rejects.toThrow('timed out');
  }, 2000);

  it('should handle event subscriptions', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    const handler = vi.fn();
    const unsubscribe = sdk.on('scene', 'nodesChanged', handler);

    // Simulate host event
    const eventMessage: HostEventMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'evt-1',
      pluginId: 'test-plugin',
      timestamp: Date.now(),
      type: 'host:event',
      payload: {
        namespace: 'scene',
        event: 'nodesChanged',
        data: { changedIds: ['node-1'] },
      },
    };

    simulateHostMessage(eventMessage);

    expect(handler).toHaveBeenCalledWith({ changedIds: ['node-1'] });

    // Unsubscribe
    unsubscribe();

    // Send again
    simulateHostMessage(eventMessage);

    // Handler should not have been called again
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle shutdown signal', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    const shutdownHandler = vi.fn();
    sdk.onShutdown(shutdownHandler);

    const shutdownMessage: HostShutdownMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'shutdown-1',
      pluginId: 'test-plugin',
      timestamp: Date.now(),
      type: 'host:shutdown',
      payload: {
        reason: 'user-disabled',
        gracePeriodMs: 3000,
      },
    };

    simulateHostMessage(shutdownMessage);

    expect(shutdownHandler).toHaveBeenCalledWith('user-disabled');
  });

  it('should reject pending requests on shutdown', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    // Start an API call that will be pending
    const promise = sdk.scene.getNodes();

    // Simulate shutdown
    const shutdownMessage: HostShutdownMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'shutdown-1',
      pluginId: 'test-plugin',
      timestamp: Date.now(),
      type: 'host:shutdown',
      payload: {
        reason: 'studio-closing',
        gracePeriodMs: 0,
      },
    };

    simulateHostMessage(shutdownMessage);

    await expect(promise).rejects.toThrow('shutting down');
  });

  it('should ignore messages for other plugins', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('my-plugin', '1.0.0');

    const handler = vi.fn();
    sdk.on('scene', 'nodesChanged', handler);

    // Send event for a different plugin
    const eventMessage: HostEventMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'evt-1',
      pluginId: 'other-plugin', // Different plugin!
      timestamp: Date.now(),
      type: 'host:event',
      payload: {
        namespace: 'scene',
        event: 'nodesChanged',
        data: { changedIds: ['node-1'] },
      },
    };

    simulateHostMessage(eventMessage);

    expect(handler).not.toHaveBeenCalled();
  });

  it('should send storage operations via postMessage', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    // Start storage set
    const setPromise = sdk.storage.set('myKey', { value: 42 });

    const storageMsg = capture.sentMessages.find((m) => m.type === 'plugin:storage');
    expect(storageMsg).toBeDefined();
    expect((storageMsg as any).payload.operation).toBe('set');
    expect((storageMsg as any).payload.scope).toBe('local');
    expect((storageMsg as any).payload.key).toBe('myKey');
    expect((storageMsg as any).payload.value).toEqual({ value: 42 });

    // Respond
    const response = createHostResponse('test-plugin', storageMsg!.id, true, undefined);
    simulateHostMessage(response);

    await setPromise; // Should resolve without error
  });

  it('should send log messages to host', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    sdk.log('info', 'Hello from plugin', { extra: true });

    const logMsg = capture.sentMessages.find((m) => m.type === 'plugin:log');
    expect(logMsg).toBeDefined();
    expect((logMsg as any).payload.level).toBe('info');
    expect((logMsg as any).payload.message).toBe('Hello from plugin');
    expect((logMsg as any).payload.data).toEqual({ extra: true });
  });

  it('should send error reports to host', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    sdk.reportError('CRASH', 'Something broke', 'Error stack trace...');

    const errorMsg = capture.sentMessages.find((m) => m.type === 'plugin:error');
    expect(errorMsg).toBeDefined();
    expect((errorMsg as any).payload.code).toBe('CRASH');
    expect((errorMsg as any).payload.message).toBe('Something broke');
    expect((errorMsg as any).payload.stack).toBe('Error stack trace...');
  });

  it('should support scene API convenience methods', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    // Test scene.onNodesChanged convenience
    const handler = vi.fn();
    const unsub = sdk.scene.onNodesChanged(handler);

    const eventMessage: HostEventMessage = {
      protocol: 'holoscript-sandbox-v1',
      id: 'evt-1',
      pluginId: 'test-plugin',
      timestamp: Date.now(),
      type: 'host:event',
      payload: {
        namespace: 'scene',
        event: 'nodesChanged',
        data: { ids: ['n1'] },
      },
    };

    simulateHostMessage(eventMessage);
    expect(handler).toHaveBeenCalledWith({ ids: ['n1'] });

    unsub();
  });

  it('should support registration methods', async () => {
    const { PluginGuestSDK } = await import('../PluginGuestSDK.js');
    const sdk = new PluginGuestSDK('test-plugin', '1.0.0');

    const promise = sdk.registerPanel({
      id: 'my-panel',
      label: 'My Panel',
      icon: 'BarChart2',
      position: 'right',
      width: 400,
    });

    const registerMsg = capture.sentMessages.find((m) => m.type === 'plugin:register');
    expect(registerMsg).toBeDefined();
    expect((registerMsg as any).payload.kind).toBe('panel');
    expect((registerMsg as any).payload.descriptor.id).toBe('my-panel');

    // Respond
    const response = createHostResponse('test-plugin', registerMsg!.id, true, { registered: true });
    simulateHostMessage(response);

    await promise;
  });
});
