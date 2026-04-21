/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PluginSandbox, type PluginManifest } from '../PluginSandbox';

const baseManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test',
  version: '1.0.0',
  author: 'a',
  description: 'd',
  entryPoint: 'about:blank',
  capabilities: ['scene:read'],
};

describe('PluginSandbox (RFC-028 host hardening)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('ignores postMessage when event.source is not the plugin iframe', async () => {
    const onPluginMessage = vi.fn();
    const sandbox = new PluginSandbox({
      containerElement: document.body,
      onPluginMessage,
    });

    await sandbox.load(baseManifest);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'event',
          id: 'forge',
          pluginId: 'test-plugin',
          method: 'plugin:ready',
          timestamp: Date.now(),
        },
        source: window,
      })
    );

    expect(onPluginMessage).not.toHaveBeenCalled();
    sandbox.destroy();
  });

  it('accepts postMessage from the plugin iframe contentWindow', async () => {
    const onPluginMessage = vi.fn();
    const sandbox = new PluginSandbox({
      containerElement: document.body,
      onPluginMessage,
    });

    await sandbox.load(baseManifest);
    const frame = document.querySelector<HTMLIFrameElement>('iframe[data-plugin-id="test-plugin"]');
    const cw = frame?.contentWindow;
    expect(cw).toBeTruthy();

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'event',
          id: 'ready_1',
          pluginId: 'test-plugin',
          method: 'plugin:ready',
          timestamp: Date.now(),
        },
        source: cw as Window,
      })
    );

    expect(onPluginMessage).toHaveBeenCalled();
    sandbox.destroy();
  });
});
