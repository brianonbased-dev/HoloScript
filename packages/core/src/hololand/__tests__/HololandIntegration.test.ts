import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HololandClient } from '../HololandIntegration';

describe('HololandClient', () => {
  beforeEach(() => {
    HololandClient.resetInstance();
  });

  it('getInstance returns a singleton', () => {
    const a = HololandClient.getInstance();
    const b = HololandClient.getInstance();
    expect(a).toBe(b);
  });

  it('starts disconnected', () => {
    const client = HololandClient.getInstance();
    const info = client.getConnectionInfo();
    expect(info.state).toBe('disconnected');
  });

  it('uses default config values', () => {
    const client = HololandClient.getInstance();
    const info = client.getConnectionInfo();
    expect(info.serverUrl).toBe('wss://api.hololand.io');
  });

  it('uses custom config values', () => {
    const client = HololandClient.getInstance({ serverUrl: 'wss://custom.io' });
    const info = client.getConnectionInfo();
    expect(info.serverUrl).toBe('wss://custom.io');
  });

  it('connects successfully', async () => {
    const client = HololandClient.getInstance();
    await client.connect();
    expect(client.getConnectionInfo().state).toBe('connected');
  });

  it('emits connected event on connect', async () => {
    const client = HololandClient.getInstance();
    const handler = vi.fn();
    client.on('connected', handler);
    await client.connect();
    expect(handler).toHaveBeenCalled();
  });

  it('does not re-connect if already connected', async () => {
    const client = HololandClient.getInstance();
    await client.connect();
    const handler = vi.fn();
    client.on('connected', handler);
    await client.connect(); // should be no-op
    expect(handler).not.toHaveBeenCalled();
  });

  it('disconnects', async () => {
    const client = HololandClient.getInstance();
    await client.connect();
    client.disconnect();
    expect(client.getConnectionInfo().state).toBe('disconnected');
  });

  it('emits disconnected event', async () => {
    const client = HololandClient.getInstance();
    await client.connect();
    const handler = vi.fn();
    client.on('disconnected', handler);
    client.disconnect();
    expect(handler).toHaveBeenCalled();
  });

  it('getCurrentWorld is null before joining', () => {
    expect(HololandClient.getInstance().getCurrentWorld()).toBeNull();
  });

  it('getServices returns runtime services', async () => {
    const client = HololandClient.getInstance();
    const services = client.getServices();
    expect(services.assets).toBeDefined();
    expect(services.networking).toBeDefined();
    expect(services.audio).toBeDefined();
    expect(services.physics).toBeDefined();
  });

  it('resetInstance clears the singleton', () => {
    const a = HololandClient.getInstance();
    HololandClient.resetInstance();
    const b = HololandClient.getInstance();
    expect(a).not.toBe(b);
  });

  it('on returns an unsubscribe function', () => {
    const client = HololandClient.getInstance();
    const unsub = client.on('test', vi.fn());
    expect(typeof unsub).toBe('function');
  });
});
