import { describe, expect, it } from 'vitest';
import {
  WorldSimulationBridge,
  extractWorldGeneratorTraitNodes,
  type EventBusLike,
} from '../lib/worldSimulationBridge';

function createBus(): EventBusLike & {
  emit: (event: string, payload: unknown) => void;
} {
  const listeners = new Map<string, Array<(data: unknown) => void>>();
  return {
    on(event, listener) {
      const arr = listeners.get(event) ?? [];
      arr.push(listener);
      listeners.set(event, arr);
    },
    off(event, listener) {
      const arr = listeners.get(event) ?? [];
      listeners.set(
        event,
        arr.filter((l) => l !== listener)
      );
    },
    emit(event, payload) {
      (listeners.get(event) ?? []).forEach((l) => l(payload));
    },
  };
}

describe('extractWorldGeneratorTraitNodes', () => {
  it('extracts world_generator traits from array-based trait nodes', () => {
    const ast = {
      type: 'Composition',
      children: [
        {
          type: 'Object',
          id: 'world-node-1',
          traits: [
            {
              name: 'world_generator',
              config: {
                prompt: 'floating city',
                engine: 'sovereign-3d',
                format: '3dgs',
                quality: 'high',
              },
            },
          ],
        },
      ],
    };

    const found = extractWorldGeneratorTraitNodes(ast);
    expect(found).toHaveLength(1);
    expect(found[0].nodeId).toBe('world-node-1');
    expect(found[0].format).toBe('3dgs');
  });
});

describe('WorldSimulationBridge', () => {
  it('tracks generation lifecycle to ready stream with gaussian asset', () => {
    const bus = createBus();
    const bridge = new WorldSimulationBridge();
    bridge.connect(bus);

    bus.emit('world:generation_started', {
      nodeId: 'n1',
      generationId: 'gen-1',
    });

    bus.emit('world:generation_progress', {
      nodeId: 'n1',
      progress: 0.45,
    });

    bus.emit('world:generation_complete', {
      nodeId: 'n1',
      generationId: 'gen-1',
      assetUrl: 'https://cdn.example.com/world.splat',
    });

    const stream = bridge.getStream('n1');
    expect(stream).toBeDefined();
    expect(stream?.status).toBe('ready');
    expect(stream?.progress).toBe(1);
    expect(stream?.assets[0].kind).toBe('gaussian_splat');
  });

  it('tracks neural stream-ready events', () => {
    const bus = createBus();
    const bridge = new WorldSimulationBridge();
    bridge.connect(bus);

    bus.emit('world:stream_ready', {
      node: { id: 'n2' },
      streamUrl: 'wss://stream.example.com/world/2',
    });

    const stream = bridge.getStream('n2');
    expect(stream?.status).toBe('ready');
    expect(stream?.assets[0].kind).toBe('neural_stream');
  });

  it('emits updates to subscribers', () => {
    const bus = createBus();
    const bridge = new WorldSimulationBridge();
    bridge.connect(bus);

    let eventCount = 0;
    const unsubscribe = bridge.subscribe(() => {
      eventCount += 1;
    });

    bus.emit('world:generation_started', {
      nodeId: 'n3',
      generationId: 'gen-3',
    });

    bus.emit('world:generation_error', {
      nodeId: 'n3',
      error: 'adapter offline',
    });

    unsubscribe();
    expect(eventCount).toBeGreaterThanOrEqual(2);
    expect(bridge.getStream('n3')?.status).toBe('error');
  });

  it('seeds idle streams from AST trait discovery', () => {
    const bridge = new WorldSimulationBridge();

    const ast = {
      children: [
        {
          id: 'seed-node',
          traits: [{ name: 'world_generator', config: { prompt: 'dunes' } }],
        },
      ],
    };

    const seeded = bridge.seedFromAst(ast);
    expect(seeded).toHaveLength(1);
    expect(bridge.getStream('seed-node')?.status).toBe('idle');
  });
});
