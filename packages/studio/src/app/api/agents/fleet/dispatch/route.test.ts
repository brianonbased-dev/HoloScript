import { describe, expect, it } from 'vitest';

import { fleetAgentHeartbeatGated } from './route';

describe('fleet dispatch heartbeat eligibility', () => {
  it('keeps an offline member gated when the optional presence endpoint is unavailable', () => {
    expect(fleetAgentHeartbeatGated({ agentId: 'stale', online: false }, new Set())).toBe(true);
  });

  it('accepts a member represented in the live presence set', () => {
    expect(fleetAgentHeartbeatGated({ agentId: 'live', online: true }, new Set(['live']))).toBe(false);
  });
});
