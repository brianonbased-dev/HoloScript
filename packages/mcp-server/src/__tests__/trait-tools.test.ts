import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';

import { handleTraitTool } from '../trait-tools';

async function listenOnEphemeralPort(server: WebSocketServer): Promise<number> {
  if (!server.address()) {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  }

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected rosbridge test server to listen on a TCP port');
  }
  return (address as AddressInfo).port;
}

async function closeServer(server: WebSocketServer): Promise<void> {
  server.clients.forEach((client) => client.close());
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe('trait tools', () => {
  afterEach(() => {
    delete process.env.ROS2_BRIDGE_URL;
    delete process.env.ROS2_BRIDGE_TIMEOUT_MS;
    delete process.env.X402_FACILITATOR_MODE;
    delete process.env.ALLOW_MOCK_X402;
  });

  it('wires execute_economic_contract to the disabled-by-default adapter', async () => {
    const result = (await handleTraitTool('execute_economic_contract', {
      contractId: 'contract-1',
      payer: 'agent-1',
      amount: 1,
    })) as Record<string, unknown>;

    expect(result).toMatchObject({
      success: false,
      status: 'no_x402_facilitator',
      amount: 1,
    });
  });

  it('preserves deterministic legacy mock fields through execute_economic_contract', async () => {
    process.env.ALLOW_MOCK_X402 = '1';
    const args = { contractId: 'contract-1', payer: 'agent-1', amount: 1 };
    const first = (await handleTraitTool('execute_economic_contract', args)) as Record<
      string,
      unknown
    >;
    const second = (await handleTraitTool('execute_economic_contract', args)) as Record<
      string,
      unknown
    >;

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'mock_payment',
      amount: 1,
      balanceRemaining: -1,
      provisioning: 'none',
    });
    expect(first.transactionId).toMatch(/^mock-tx-[a-f0-9]{24}$/);
  });

  it('keeps sync_hardware_loop honest when no ROS2 bridge URL is configured', async () => {
    const result = (await handleTraitTool('sync_hardware_loop', {
      nodeName: 'holo_rig_01',
    })) as Record<string, any>;

    expect(result.status).toBe('stub_no_ros2_bridge');
    expect(result.contractVerified).toBe(false);
    expect(result.latencyMs).toBe(-1);
  });

  it('connects sync_hardware_loop through configured rosbridge_server URL', async () => {
    const receivedRequests: Array<Record<string, unknown>> = [];
    const server = new WebSocketServer({ port: 0 });

    server.on('connection', (socket) => {
      socket.on('message', (data) => {
        const request = JSON.parse(data.toString()) as Record<string, unknown>;
        receivedRequests.push(request);
        socket.send(
          JSON.stringify({
            op: 'service_response',
            id: request.id,
            service: '/rosapi/topics',
            result: true,
            values: {
              topics: ['/holo/joint_cmd'],
              types: ['sensor_msgs/JointState'],
            },
          })
        );
      });
    });

    const port = await listenOnEphemeralPort(server);
    process.env.ROS2_BRIDGE_URL = `ws://127.0.0.1:${port}`;

    try {
      const result = (await handleTraitTool('sync_hardware_loop', {
        nodeName: 'holo_rig_01',
        topicPrefix: '/holo',
        frequency: 30,
        bidirectional: true,
      })) as Record<string, any>;

      expect(receivedRequests[0]).toMatchObject({
        op: 'call_service',
        service: '/rosapi/topics',
      });
      expect(result.status).toBe('connected');
      expect(result.status).not.toBe('stub_no_ros2_bridge');
      expect(result.contractVerified).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.activeTopics).toContain('/holo/joint_cmd');
      expect(result.traitEvents).toContainEqual(expect.objectContaining({ type: 'ros2:connect' }));
    } finally {
      await closeServer(server);
    }
  });

  it('does not verify the hardware contract when rosbridge_server is unreachable', async () => {
    const server = new WebSocketServer({ port: 0 });
    const port = await listenOnEphemeralPort(server);
    process.env.ROS2_BRIDGE_URL = `ws://127.0.0.1:${port}`;
    process.env.ROS2_BRIDGE_TIMEOUT_MS = '25';

    try {
      const result = (await handleTraitTool('sync_hardware_loop', {
        nodeName: 'holo_rig_01',
      })) as Record<string, any>;

      expect(result.status).toBe('ros2_bridge_unreachable');
      expect(result.contractVerified).toBe(false);
      expect(result.error).toContain('timed out');
    } finally {
      await closeServer(server);
    }
  });
});
