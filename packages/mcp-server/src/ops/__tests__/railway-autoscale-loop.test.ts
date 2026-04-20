import { describe, it, expect, vi, afterEach } from 'vitest';
import { maybeStartRailwayAutoscaleLoop } from '../railway-autoscale-loop.js';

describe('maybeStartRailwayAutoscaleLoop', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('no-ops when MCP_AUTOSCALE_ENABLED is unset', () => {
    expect(() => maybeStartRailwayAutoscaleLoop({ port: 3999 })).not.toThrow();
  });

  it('warns and no-ops when enabled but Railway env incomplete', () => {
    vi.stubEnv('MCP_AUTOSCALE_ENABLED', '1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    maybeStartRailwayAutoscaleLoop({ port: 3999 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
