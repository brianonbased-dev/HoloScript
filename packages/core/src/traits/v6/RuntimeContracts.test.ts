import { describe, expect, it } from 'vitest';
import type { HSPlusNode } from '../../types/HoloScriptPlus';
import type { TraitContext, TraitHandler } from '../TraitTypes';
import type { V6RuntimeContract, V6RuntimeContractReceipt } from './RuntimeContracts';
import {
  endpointHandler,
  handlerHandler,
  middlewareHandler,
  routeHandler,
  serviceHandler,
  V6_SERVICE_TRAIT_HANDLERS,
} from './ServiceTraits';
import {
  graphqlHandler,
  grpcHandler,
  httpHandler,
  modbusHandler,
  opcUaHandler,
  websocketHandler,
  V6_NETWORK_TRAIT_HANDLERS,
} from './NetworkTraits';

interface HandlerCase {
  handler: TraitHandler<unknown>;
  kind: string;
}

const handlerCases: HandlerCase[] = [
  { handler: serviceHandler as unknown as TraitHandler<unknown>, kind: 'service' },
  { handler: endpointHandler as unknown as TraitHandler<unknown>, kind: 'service-endpoint' },
  { handler: routeHandler as unknown as TraitHandler<unknown>, kind: 'service-route' },
  { handler: handlerHandler as unknown as TraitHandler<unknown>, kind: 'service-handler' },
  { handler: middlewareHandler as unknown as TraitHandler<unknown>, kind: 'service-middleware' },
  { handler: httpHandler as unknown as TraitHandler<unknown>, kind: 'network-http-client' },
  {
    handler: websocketHandler as unknown as TraitHandler<unknown>,
    kind: 'network-websocket-client',
  },
  { handler: grpcHandler as unknown as TraitHandler<unknown>, kind: 'network-grpc-channel' },
  {
    handler: graphqlHandler as unknown as TraitHandler<unknown>,
    kind: 'network-graphql-endpoint',
  },
  { handler: opcUaHandler as unknown as TraitHandler<unknown>, kind: 'network-opc-ua-session' },
  { handler: modbusHandler as unknown as TraitHandler<unknown>, kind: 'network-modbus-client' },
];

describe('v6 service/network runtime contracts', () => {
  it('exports explicit handler registries for service and network traits', () => {
    expect(V6_SERVICE_TRAIT_HANDLERS.map((handler) => handler.name)).toEqual([
      'service',
      'endpoint',
      'route',
      'handler',
      'middleware',
    ]);
    expect(V6_NETWORK_TRAIT_HANDLERS.map((handler) => handler.name)).toEqual([
      'http',
      'websocket',
      'grpc',
      'graphql',
      'opc_ua',
      'modbus',
    ]);
  });

  it.each(handlerCases)(
    '$handler.name attach emits and stores a runtime contract',
    ({ handler, kind }) => {
      const node = makeNode(handler.name);
      const { context, events } = makeContext();
      const config = handler.defaultConfig;

      expect(typeof handler.onAttach).toBe('function');
      handler.onAttach?.(node, config, context);

      const contracts = node.__v6RuntimeContracts as V6RuntimeContract[] | undefined;
      const registered = findPayload<V6RuntimeContract>(events, 'v6:runtime_contract_registered');

      expect(registered).toEqual(
        expect.objectContaining({
          trait: handler.name,
          kind,
          runtime: 'contract-only',
          status: 'registered',
          nodeId: node.id,
        })
      );
      expect(registered?.capabilities.length).toBeGreaterThan(0);
      expect(contracts).toHaveLength(1);
      expect(contracts?.[0]).toEqual(registered);
      expect(events.map((event) => event.event)).toContain(registered?.events.attached);
    }
  );

  it.each(handlerCases)('$handler.name detach emits a teardown receipt', ({ handler, kind }) => {
    const node = makeNode(handler.name);
    const { context, events } = makeContext();
    const config = handler.defaultConfig;

    expect(typeof handler.onDetach).toBe('function');
    handler.onAttach?.(node, config, context);
    events.length = 0;
    handler.onDetach?.(node, config, context);

    const receipt = findPayload<V6RuntimeContractReceipt>(events, 'v6:runtime_contract_detached');

    expect(node.__v6RuntimeContracts).toBeUndefined();
    expect(receipt).toEqual(
      expect.objectContaining({
        trait: handler.name,
        kind,
        status: 'detached',
        found: true,
        nodeId: node.id,
      })
    );
    expect(receipt?.contract).toEqual(expect.objectContaining({ trait: handler.name, kind }));
    expect(events.map((event) => event.event)).toContain(receipt?.contract?.events.detached);
  });
});

function makeNode(name: string): HSPlusNode {
  return {
    id: `node-${name}`,
    type: 'object',
    name,
  } as HSPlusNode;
}

function makeContext(): {
  context: TraitContext;
  events: Array<{ event: string; payload: unknown }>;
} {
  const events: Array<{ event: string; payload: unknown }> = [];
  const context: TraitContext = {
    vr: {
      hands: { left: null, right: null },
      headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
      getPointerRay: () => null,
      getDominantHand: () => null,
    },
    physics: {
      applyVelocity: () => undefined,
      applyAngularVelocity: () => undefined,
      setKinematic: () => undefined,
      raycast: () => null,
      getBodyPosition: () => null,
      getBodyVelocity: () => null,
    },
    audio: {
      playSound: () => undefined,
    },
    haptics: {
      pulse: () => undefined,
      rumble: () => undefined,
    },
    emit: (event: string, payload?: unknown) => {
      events.push({ event, payload });
    },
    getState: () => ({}),
    setState: () => undefined,
    getScaleMultiplier: () => 1,
    setScaleContext: () => undefined,
  };

  return { context, events };
}

function findPayload<T>(
  events: Array<{ event: string; payload: unknown }>,
  eventName: string
): T | undefined {
  return events.find((event) => event.event === eventName)?.payload as T | undefined;
}
