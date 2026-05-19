import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  maybeStartKeepAliveLoop,
  stopKeepAliveLoop,
  getKeepAliveStatus,
} from '../keep-alive.js';

describe('keep-alive', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    stopKeepAliveLoop();
  });

  afterEach(() => {
    stopKeepAliveLoop();
    process.env = originalEnv;
  });

  it('does not start when MCP_KEEP_ALIVE_ENABLED is not set', () => {
    delete process.env.MCP_KEEP_ALIVE_ENABLED;
    maybeStartKeepAliveLoop({ port: 3000 });
    const status = getKeepAliveStatus();
    expect(status.enabled).toBe(false);
  });

  it('starts when MCP_KEEP_ALIVE_ENABLED=1', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = '1';
    process.env.MCP_KEEP_ALIVE_INTERVAL_MS = '60000'; // 1 min for tests
    maybeStartKeepAliveLoop({ port: 3000 });
    const status = getKeepAliveStatus();
    expect(status.enabled).toBe(true);
    expect(status.intervalMs).toBe(60_000);
    expect(status.url).toBe('http://127.0.0.1:3000/health');
  });

  it('starts when MCP_KEEP_ALIVE_ENABLED=true', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = 'true';
    process.env.MCP_KEEP_ALIVE_INTERVAL_MS = '120000';
    maybeStartKeepAliveLoop({ port: 8080 });
    const status = getKeepAliveStatus();
    expect(status.enabled).toBe(true);
    expect(status.url).toBe('http://127.0.0.1:8080/health');
  });

  it('respects MCP_KEEP_ALIVE_URL override', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = '1';
    process.env.MCP_KEEP_ALIVE_INTERVAL_MS = '60000';
    process.env.MCP_KEEP_ALIVE_URL = 'https://custom.example.com/healthz';
    maybeStartKeepAliveLoop({ port: 3000 });
    const status = getKeepAliveStatus();
    expect(status.url).toBe('https://custom.example.com/healthz');
  });

  it('enforces minimum interval of 60 seconds', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = '1';
    process.env.MCP_KEEP_ALIVE_INTERVAL_MS = '5000'; // Too low
    maybeStartKeepAliveLoop({ port: 3000 });
    const status = getKeepAliveStatus();
    expect(status.intervalMs).toBe(60_000);
  });

  it('defaults to 270 seconds (4.5 min) when interval not set', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = '1';
    delete process.env.MCP_KEEP_ALIVE_INTERVAL_MS;
    maybeStartKeepAliveLoop({ port: 3000 });
    const status = getKeepAliveStatus();
    expect(status.intervalMs).toBe(270_000);
  });

  it('stopKeepAliveLoop stops the loop', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = '1';
    process.env.MCP_KEEP_ALIVE_INTERVAL_MS = '60000';
    maybeStartKeepAliveLoop({ port: 3000 });
    expect(getKeepAliveStatus().enabled).toBe(true);
    stopKeepAliveLoop();
    expect(getKeepAliveStatus().enabled).toBe(false);
  });

  it('does not start duplicate loops', () => {
    process.env.MCP_KEEP_ALIVE_ENABLED = '1';
    process.env.MCP_KEEP_ALIVE_INTERVAL_MS = '60000';
    maybeStartKeepAliveLoop({ port: 3000 });
    maybeStartKeepAliveLoop({ port: 3000 }); // Second call is no-op
    const status = getKeepAliveStatus();
    expect(status.enabled).toBe(true);
  });

  it('initial ping status is idle', () => {
    const status = getKeepAliveStatus();
    expect(status.lastPingStatus).toBe('idle');
    expect(status.lastPingAt).toBeNull();
  });
});