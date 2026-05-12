import { describe, expect, it } from 'vitest';
import { provisionBrokeredSession, localFileProvisionAdapter } from '../provision';
import type { DeviceFlowProvisionResult } from '../types';

describe('provisionBrokeredSession', () => {
  it('returns provision result when adapter succeeds', async () => {
    const mockResult: DeviceFlowProvisionResult = {
      status: 'executed',
      handle: 'test-handle',
      surface: 'mobile',
      seatId: 'seat-123',
      walletAddress: '0x1234',
      bearer: 'bearer-token',
      agentId: 'agent-test',
      envVarLines: ['HOLOMESH_API_KEY_TEST=bearer-token'],
    };

    const adapter = localFileProvisionAdapter(async () => mockResult);
    const session = await provisionBrokeredSession(
      { handle: 'test-handle', surface: 'mobile', founderBearer: 'founder-token' },
      { execute: true },
      adapter
    );

    expect(session.provision.status).toBe('executed');
    expect(session.provision.handle).toBe('test-handle');
    expect(session.provision.bearer).toBe('bearer-token');
  });

  it('throws when adapter returns an unexpected status', async () => {
    const badResult = { status: 'dry-run', handle: 'x', surface: 'mobile', seatId: 's', walletAddress: '0x0', envVarLines: [] } as unknown as DeviceFlowProvisionResult;
    const adapter = localFileProvisionAdapter(async () => badResult);

    await expect(
      provisionBrokeredSession(
        { handle: 'test-handle', surface: 'mobile', founderBearer: 'founder-token' },
        { execute: true },
        adapter
      )
    ).rejects.toThrow(/Provisioning failed/);
  });
});
