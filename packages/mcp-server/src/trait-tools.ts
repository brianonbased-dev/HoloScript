import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket, type RawData } from 'ws';

/**
 * MCP Tools for Algebraic Trait Composition and Provenance (Pillar 3)
 */
export const traitTools: Tool[] = [
  {
    name: 'compile_trait_composition',
    description:
      'Compile a HoloScript trait composition using algebraic conflict resolution (Provenance Semiring). ' +
      'Resolves conflicts based on authority weights and provenance traces. ' +
      'Returns the merged defaultConfig and any composition errors.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the composed trait to create (e.g. "Warrior")',
        },
        components: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of component trait names (e.g. ["@grabbable", "@physics"])',
        },
        overrides: {
          type: 'object',
          description: 'Optional property overrides that win over component defaults.',
        },
        authorityLevel: {
          type: 'number',
          description: 'The authority level of the caller (0-100+). High authority wins conflicts.',
        },
      },
      required: ['name', 'components'],
    },
  },
  {
    name: 'sync_hardware_loop',
    description:
      'Synchronize a virtual HoloScript scene with a physical ROS2 hardware loop. ' +
      'When ROS2_BRIDGE_URL is configured, connects to rosbridge_server and verifies a live handshake. ' +
      'Without ROS2_BRIDGE_URL, returns an honest stub with contractVerified=false.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeName: { type: 'string', description: 'ROS2 node name for the hardware bridge' },
        topicPrefix: { type: 'string', description: 'Prefix for ROS2 topics (default: /holo)' },
        frequency: { type: 'number', description: 'Sync frequency in Hz (default: 60)' },
        bidirectional: { type: 'boolean', description: 'Enable bidirectional command flow' },
      },
      required: ['nodeName'],
    },
  },
  {
    name: 'execute_economic_contract',
    description:
      'PREPARATION ONLY: validate or simulate a sovereign economic contract (x402). Disabled by default; dry-run, deterministic mock, and live-request modes perform no network call, wallet signature, provisioning, or transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        contractId: {
          type: 'string',
          description: 'The unique ID of the economic contract (from code)',
        },
        payer: { type: 'string', description: 'The agent ID or wallet of the payer' },
        amount: { type: 'number', description: 'Amount to authorize in USDC (micro-units)' },
        resourceType: {
          type: 'string',
          enum: ['compute', 'storage', 'data', 'inference'],
          description: 'Type of resource being rented',
        },
      },
      required: ['contractId', 'payer', 'amount'],
    },
  },
];

import {
  TraitCompositionCompiler,
  vrTraitRegistry,
  type TraitCompositionDecl,
} from '@holoscript/core';

// THIN (ratchet P4): provenanceHash is a SHA-256 of the JSON-serialized composition output,
// not a cryptographic commitment to the source trait definitions. The hash covers the
// *result* of compilation, not the *inputs* that produced it. Provenance tracing requires
// binding the input trait names + authority levels, which this hash does not do.
async function computeProvenanceHash(composed: unknown): Promise<string> {
  const { createHash } = await import('crypto');
  const canonical = JSON.stringify(composed, Object.keys(composed as object).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

interface RosbridgeHandshake {
  bridgeUrl: string;
  latencyMs: number;
  topics: string[];
  types: string[];
}

function configuredRosbridgeUrl(): string | null {
  const configured = process.env.ROS2_BRIDGE_URL?.trim();
  return configured ? configured : null;
}

function rosbridgeTimeoutMs(): number {
  const configured = Number(process.env.ROS2_BRIDGE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 1500;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function normalizeRosbridgeValues(values: unknown): { topics: string[]; types: string[] } {
  const payload = values && typeof values === 'object' ? (values as Record<string, unknown>) : {};
  return {
    topics: stringArray(payload.topics),
    types: stringArray(payload.types),
  };
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  return data.toString('utf8');
}

async function handshakeRosbridge(bridgeUrl: string): Promise<RosbridgeHandshake> {
  const timeoutMs = rosbridgeTimeoutMs();
  const startedAt = Date.now();
  const requestId = `sync-hardware-loop-${startedAt}-${Math.random().toString(36).slice(2)}`;

  return await new Promise<RosbridgeHandshake>((resolve, reject) => {
    const socket = new WebSocket(bridgeUrl);
    let settled = false;

    const timer = setTimeout(() => {
      rejectOnce(new Error(`rosbridge handshake timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.removeAllListeners();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }

    function resolveOnce(value: RosbridgeHandshake) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function rejectOnce(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          op: 'call_service',
          id: requestId,
          service: '/rosapi/topics',
          args: {},
        })
      );
    });

    socket.once('error', (error: Error) => rejectOnce(error));
    socket.once('close', () => {
      rejectOnce(new Error('rosbridge connection closed before handshake completed'));
    });

    socket.on('message', (data: RawData) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(rawDataToString(data)) as Record<string, unknown>;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        rejectOnce(new Error(`invalid rosbridge response: ${detail}`));
        return;
      }

      const isExpectedResponse =
        message.id === requestId ||
        (message.id === undefined &&
          message.op === 'service_response' &&
          message.service === '/rosapi/topics');
      if (!isExpectedResponse) return;

      if (message.result === false) {
        rejectOnce(new Error('rosbridge /rosapi/topics returned result=false'));
        return;
      }

      const { topics, types } = normalizeRosbridgeValues(message.values);
      resolveOnce({
        bridgeUrl,
        topics,
        types,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
    });
  });
}

export async function handleTraitTool(name: string, args: Record<string, any>) {
  if (name === 'compile_trait_composition') {
    const compiler = new TraitCompositionCompiler();

    const decl: TraitCompositionDecl & { provenance?: any } = {
      name: args.name,
      components: args.components,
      overrides: args.overrides,
      provenance: {
        context: { authorityLevel: args.authorityLevel ?? 0 },
      },
    };

    try {
      // Binder lookup helper
      const getHandler = (n: string) => {
        const normalized = n.startsWith('@') ? n.slice(1) : n;
        return (
          vrTraitRegistry.getHandler(normalized as never) ?? vrTraitRegistry.getHandler(n as never)
        );
      };

      const [result] = compiler.compile([decl], getHandler);
      return {
        success: true,
        composedTrait: result,
        provenanceHash: await computeProvenanceHash(result), // sha256 of deterministic JSON serialization
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        type: error.name,
      };
    }
  }

  if (name === 'sync_hardware_loop') {
    const nodeName =
      typeof args.nodeName === 'string' && args.nodeName.trim() ? args.nodeName : 'holo_rig_01';
    const topicPrefix =
      typeof args.topicPrefix === 'string' && args.topicPrefix.trim() ? args.topicPrefix : '/holo';
    const requestedFrequency = Number(args.frequency);
    const frequencyHz =
      Number.isFinite(requestedFrequency) && requestedFrequency > 0 ? requestedFrequency : 60;
    const bidirectional = args.bidirectional !== false;
    const bridgeUrl = configuredRosbridgeUrl();

    if (bridgeUrl) {
      const startedAt = Date.now();
      try {
        const handshake = await handshakeRosbridge(bridgeUrl);
        return {
          success: true,
          status: 'connected',
          node: nodeName,
          bridgeUrl: handshake.bridgeUrl,
          topicPrefix,
          frequencyHz,
          bidirectional,
          latencyMs: handshake.latencyMs,
          contractVerified: true,
          activeTopics: handshake.topics,
          activeTypes: handshake.types,
          traitEvents: [
            { type: 'ros2:init', payload: { node: nodeName } },
            {
              type: 'ros2:connect',
              payload: { node: nodeName, bridgeUrl: handshake.bridgeUrl, topicPrefix },
            },
            { type: 'ros2:connected', payload: { latencyMs: handshake.latencyMs } },
          ],
          message: `ROS2 bridge connected for ${nodeName} via ${handshake.bridgeUrl}.`,
        };
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          status: 'ros2_bridge_unreachable',
          node: nodeName,
          bridgeUrl,
          topicPrefix,
          frequencyHz,
          bidirectional,
          latencyMs: Math.max(0, Date.now() - startedAt),
          contractVerified: false,
          error: detail,
          message:
            'ROS2_BRIDGE_URL is configured, but rosbridge_server could not complete the /rosapi/topics handshake.',
        };
      }
    }

    // OVERCLAIMED ratchet fix: no ROS2 bridge exists. Return honest stub.
    // contractVerified is now false — callers must not trust this as a safety gate.
    return {
      status: 'stub_no_ros2_bridge',
      node: nodeName,
      latencyMs: -1,
      contractVerified: false,
      message:
        'ROS2 bridge not connected. sync_hardware_loop is a stub — no real hardware handshake performed. Do not gate safety decisions on this result.',
    };
  }

  if (name === 'execute_economic_contract') {
    const { createX402SettlementAdapterFromEnv } = await import('./x402-settlement-adapter');
    return createX402SettlementAdapterFromEnv().execute(args);
  }

  return null;
}
