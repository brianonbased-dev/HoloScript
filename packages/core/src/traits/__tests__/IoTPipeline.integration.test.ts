/**
 * IoT Pipeline Integration Tests
 *
 * Validates end-to-end data flow through three cooperating traits:
 *
 *   MQTTSourceTrait ──► DataBindingTrait ──► MQTTSinkTrait
 *
 * No real network — MQTT client fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { readJson } from '../../errors/safeJsonParse';
/** Flush all pending microtasks (resolved Promises). */
const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

// ─── MQTT Client Mock ─────────────────────────────────────────────────────────
function makeMockClient() {
  const _listeners: Record<string, (...a: any[]) => void> = {};
  let _subscribeCb: ((msg: any) => void) | null = null;
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    subscribe: vi.fn((_o: any, cb: any) => {
      _subscribeCb = cb;
    }),
    unsubscribe: vi.fn(),
    publish: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((ev: string, cb: any) => {
      _listeners[ev] = cb;
    }),
    _trigger: (ev: string, ...a: any[]) => _listeners[ev]?.(...a),
    _push: (msg: any) => _subscribeCb?.(msg),
  };
}

// Each test gets fresh clients via factory
const _clientFactory = vi.fn(() => makeMockClient());

vi.mock('@holoscript/engine/runtime/protocols/MQTTClient', () => {
  const parsePayload = vi.fn((msg: any) => {
    try {
      return typeof msg.payload === 'string' ? readJson(msg.payload) : msg.payload;
    } catch {
      return msg.payload;
    }
  });
  return {
    createMQTTClient: (...args: any[]) => _clientFactory(...args),
    getMQTTClient: vi.fn(() => null),
    registerMQTTClient: vi.fn(),
    MQTTClient: { parsePayload },
  };
});

import { mqttSourceHandler } from '../MQTTSourceTrait';
import { mqttSinkHandler } from '../MQTTSinkTrait';
import { dataBindingHandler } from '../DataBindingTrait';

// ─── Pipeline builder ─────────────────────────────────────────────────────────
let _nodeId = 0;

interface Pipeline {
  node: any;
  sourceCtx: any;
  bindCtx: any;
  sinkCtx: any;
  srcCfg: any;
  bindCfg: any;
  sinkCfg: any;
  /** Send raw message through Source → DataBinding → Sink */
  pushMessage: (payload: unknown) => void;
  /** Send data directly into DataBinding (bypassing Source) */
  pushData: (data: Record<string, unknown>) => void;
  sinkState: () => any;
  srcState: () => any;
  bindState: () => any;
}

function buildPipeline(
  opts: {
    parseJson?: boolean;
    stateField?: string;
    bindings?: any[];
    sinkTopic?: string;
    sinkQoS?: 0 | 1 | 2;
    onChangeOnly?: boolean;
    throttleMs?: number;
    interpolation?: boolean;
  } = {}
): Pipeline {
  const id = ++_nodeId;
  const node: any = { id: `sensor_${id}`, name: `Sensor${id}` };
  const stateField = opts.stateField ?? 'value';

  // ----- Source -----
  const sourceCtx = {
    emit: vi.fn(),
    setState: vi.fn((u: any) => Object.assign(node, u)),
    getState: vi.fn().mockReturnValue({}),
  };
  const srcCfg: any = {
    ...mqttSourceHandler.defaultConfig,
    topic: 'sensors/in',
    broker: `mqtt://broker${id}`,
    clientId: `src_${id}`,
    autoConnect: false,
    parseJson: opts.parseJson ?? false,
    stateField,
  };
  mqttSourceHandler.onAttach!(node, srcCfg, sourceCtx as any);

  // ----- DataBinding -----
  const bindCtx = {
    emit: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn().mockReturnValue({}),
  };
  const bindCfg: any = {
    ...dataBindingHandler.defaultConfig!,
    source: `internal://node_${id}`,
    source_type: 'custom',
    refresh_rate: 0,
    interpolation: opts.interpolation ?? false,
    bindings: opts.bindings ?? [
      {
        source_path: stateField,
        target_property: 'displayValue',
        transform: 'none',
      },
    ],
  };
  dataBindingHandler.onAttach!(node, bindCfg, bindCtx as any);
  // Mark connected
  dataBindingHandler.onEvent!(node, bindCfg, bindCtx as any, {
    type: 'data_binding_connected',
    handle: 'handle_1',
  });

  // ----- Sink -----
  const sinkCtx = {
    emit: vi.fn(),
    setState: vi.fn(),
    // Return clean snapshot so hash is stable for onChangeOnly (no mutable __xxxState internals)
    getState: vi.fn(() => ({ [stateField]: node[stateField] })),
  };
  const sinkCfg: any = {
    ...mqttSinkHandler.defaultConfig,
    broker: `mqtt://broker${id}`,
    clientId: `sink_${id}`,
    topic: opts.sinkTopic ?? 'out/display',
    qos: opts.sinkQoS ?? 0,
    autoConnect: false,
    onChangeOnly: opts.onChangeOnly ?? false,
    throttleMs: opts.throttleMs ?? 0,
  };
  mqttSinkHandler.onAttach!(node, sinkCfg, sinkCtx as any);
  // Mark sink connected
  node.__mqttSinkState.connected = true;

  const pushData = async (data: Record<string, unknown>) => {
    dataBindingHandler.onEvent!(node, bindCfg, bindCtx as any, {
      type: 'data_binding_data',
      data,
    });
    mqttSinkHandler.onUpdate!(node, sinkCfg, sinkCtx as any, 0.016);
    await flushPromises();
  };

  const pushMessage = async (payload: unknown) => {
    // Source receives MQTT message → setState mutates node
    node.__mqttSourceState.client._push({ payload });
    // DataBinding receives fresh data from node
    await pushData({ [stateField]: node[stateField] });
  };

  return {
    node,
    sourceCtx,
    bindCtx,
    sinkCtx,
    srcCfg,
    bindCfg,
    sinkCfg,
    pushMessage,
    pushData,
    sinkState: () => node.__mqttSinkState,
    srcState: () => node.__mqttSourceState,
    bindState: () => node.__dataBindingState,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clientFactory.mockImplementation(() => makeMockClient());
});

// ─── Scenario 1: Basic pipeline flow ─────────────────────────────────────────
describe('IoT Pipeline — basic flow', () => {
  it('raw value flows Source → node property → Sink publish', async () => {
    const p = buildPipeline({ parseJson: false });
    await p.pushMessage(42);
    expect(p.node.value).toBe(42);
    expect(p.node.displayValue).toBe(42);
    expect(p.sinkState().publishCount).toBeGreaterThan(0);
  });

  it('Source emits mqtt_message containing the value', async () => {
    const p = buildPipeline({ parseJson: false });
    await p.pushMessage(99);
    expect(p.sourceCtx.emit).toHaveBeenCalledWith(
      'mqtt_message',
      expect.objectContaining({ value: 99 })
    );
  });

  it('DataBinding emits on_data_change when data arrives', async () => {
    const p = buildPipeline({ parseJson: false });
    await p.pushMessage(7);
    expect(p.bindCtx.emit).toHaveBeenCalledWith('on_data_change', expect.any(Object));
  });

  it('Sink publish count increments each pipeline round-trip', async () => {
    const p = buildPipeline({ parseJson: false });
    await p.pushMessage(1);
    await p.pushMessage(2);
    await p.pushMessage(3);
    expect(p.sinkState().publishCount).toBe(3);
  });

  it('Source messageCount increments for each push', async () => {
    const p = buildPipeline({ parseJson: false });
    await p.pushMessage(10);
    await p.pushMessage(20);
    expect(p.srcState().messageCount).toBe(2);
  });
});

// ─── Scenario 2: JSON parsing ─────────────────────────────────────────────────
describe('IoT Pipeline — JSON parsing', () => {
  it('parses JSON payload and passes parsed object to Source', async () => {
    const p = buildPipeline({ parseJson: true });
    const payload = JSON.stringify({ temperature: 23.5, humidity: 60 });
    p.srcState().client._push({ payload });
    // parsePayload was called
    expect(p.sourceCtx.emit).toHaveBeenCalledWith(
      'mqtt_message',
      expect.objectContaining({
        value: expect.objectContaining({ temperature: 23.5 }),
      })
    );
  });

  it('raw JSON string passes unchanged when parseJson=false', async () => {
    const p = buildPipeline({ parseJson: false });
    const raw = '{"x":1}';
    p.srcState().client._push({ payload: raw });
    expect(p.srcState().lastMessage).toBe(raw);
  });
});

// ─── Scenario 3: Transform ────────────────────────────────────────────────────
describe('IoT Pipeline — transforms', () => {
  it('scale transform: 25 * factor=2 → displayValue=50', async () => {
    const p = buildPipeline({
      stateField: 'rawTemp',
      bindings: [
        {
          source_path: 'rawTemp',
          target_property: 'displayValue',
          transform: 'scale',
          transform_params: { factor: 2 },
        },
      ],
    });
    await p.pushData({ rawTemp: 25 });
    expect(p.node.displayValue).toBe(50);
  });

  it('normalize transform: 50 in [0,100] → displayValue≈0.5', async () => {
    const p = buildPipeline({
      stateField: 'level',
      bindings: [
        {
          source_path: 'level',
          target_property: 'displayValue',
          transform: 'normalize',
          transform_params: { min: 0, max: 100 },
        },
      ],
    });
    await p.pushData({ level: 50 });
    expect(p.node.displayValue).toBeCloseTo(0.5);
  });

  it('map transform: "low" → "🟢"', async () => {
    const p = buildPipeline({
      stateField: 'status',
      bindings: [
        {
          source_path: 'status',
          target_property: 'displayValue',
          transform: 'map',
          transform_params: { mapping: { low: '🟢', high: '🔴' } },
        },
      ],
    });
    await p.pushData({ status: 'low' });
    expect(p.node.displayValue).toBe('🟢');
  });
});

// ─── Scenario 4: onChangeOnly dedup ──────────────────────────────────────────
describe('IoT Pipeline — Sink onChangeOnly dedup', () => {
  it('suppresses re-publish of identical value', async () => {
    const p = buildPipeline({ parseJson: false, onChangeOnly: true });
    await p.pushMessage(42);
    await p.pushMessage(42);
    expect(p.sinkState().publishCount).toBe(1);
  });

  it('publishes again when value changes', async () => {
    const p = buildPipeline({ parseJson: false, onChangeOnly: true });
    await p.pushMessage(42);
    await p.pushMessage(99);
    expect(p.sinkState().publishCount).toBe(2);
  });
});

// ─── Scenario 5: DataBinding error handling ───────────────────────────────────
describe('IoT Pipeline — DataBinding error recovery', () => {
  it('errorCount increments on data_binding_error', () => {
    const p = buildPipeline();
    dataBindingHandler.onEvent!(p.node, p.bindCfg, p.bindCtx as any, {
      type: 'data_binding_error',
      error: 'source_timeout',
    });
    expect(p.bindState().errorCount).toBe(1);
    expect(p.bindCtx.emit).toHaveBeenCalledWith(
      'on_data_error',
      expect.objectContaining({ errorCount: 1 })
    );
  });

  it('Source and Sink continue functioning despite DataBinding error', () => {
    const p = buildPipeline();
    dataBindingHandler.onEvent!(p.node, p.bindCfg, p.bindCtx as any, {
      type: 'data_binding_error',
      error: 'oops',
    });
    p.srcState().client._push({ payload: 5 });
    expect(p.srcState().messageCount).toBe(1);
    expect(p.sinkState().connected).toBe(true);
  });
});

// ─── Scenario 6: Multiple bindings ───────────────────────────────────────────
describe('IoT Pipeline — multiple bindings', () => {
  it('two bindings both update node properties', async () => {
    const p = buildPipeline({
      bindings: [
        { source_path: 'temp', target_property: 'displayTemp', transform: 'none' },
        { source_path: 'humidity', target_property: 'displayHumidity', transform: 'none' },
      ],
    });
    await p.pushData({ temp: 22, humidity: 55 });
    expect(p.node.displayTemp).toBe(22);
    expect(p.node.displayHumidity).toBe(55);
  });

  it('missing source_path is skipped without error', async () => {
    const p = buildPipeline({
      bindings: [
        { source_path: 'exists', target_property: 'displayValue', transform: 'none' },
        { source_path: 'missing', target_property: 'displayMissing', transform: 'none' },
      ],
    });
    await expect(p.pushData({ exists: 7 })).resolves.not.toThrow();
    expect(p.node.displayValue).toBe(7);
  });
});

// ─── Scenario 7: DataBinding introspection ───────────────────────────────────
describe('IoT Pipeline — DataBinding query', () => {
  it('returns isConnected, bindingCount, currentData', async () => {
    const p = buildPipeline();
    await p.pushData({ value: 100 });
    p.bindCtx.emit.mockClear();
    dataBindingHandler.onEvent!(p.node, p.bindCfg, p.bindCtx as any, {
      type: 'data_binding_query',
      queryId: 'q1',
    });
    expect(p.bindCtx.emit).toHaveBeenCalledWith(
      'data_binding_info',
      expect.objectContaining({
        queryId: 'q1',
        isConnected: true,
        bindingCount: 1,
      })
    );
  });
});

// ─── Scenario 8: Source directly feeds Sink (no DataBinding intermediary) ─────
describe('IoT Pipeline — direct Source→Sink', () => {
  it('Source message triggers Sink publish in same update cycle', async () => {
    const node: any = { id: 'direct_test_1' };
    const sourceCtx = {
      emit: vi.fn(),
      setState: vi.fn((u: any) => Object.assign(node, u)),
      getState: vi.fn().mockReturnValue({}),
    };
    const sinkCtx = {
      emit: vi.fn(),
      setState: vi.fn(),
      getState: vi.fn().mockReturnValue(node),
    };

    const srcCfg = {
      ...mqttSourceHandler.defaultConfig!,
      topic: 'in/raw',
      autoConnect: false,
      parseJson: false,
      stateField: 'rawVal',
    };
    mqttSourceHandler.onAttach!(node, srcCfg, sourceCtx as any);

    const sinkCfg = {
      ...mqttSinkHandler.defaultConfig!,
      topic: 'out/raw',
      autoConnect: false,
      onChangeOnly: false,
    };
    mqttSinkHandler.onAttach!(node, sinkCfg, sinkCtx as any);
    node.__mqttSinkState.connected = true;

    node.__mqttSourceState.client._push({ payload: 'hello' });
    mqttSinkHandler.onUpdate!(node, sinkCfg, sinkCtx as any, 0.016);
    await flushPromises();

    expect(node.__mqttSinkState.publishCount).toBe(1);
  });
});
