import { describe, expect, it } from 'vitest';
import { createHeadlessRuntime } from '../HeadlessRuntime';

describe('HeadlessRuntime scene receipts', () => {
  it('reports instantiated scene objects before and after teardown', () => {
    const ast = {
      type: 'Program',
      body: [],
      root: {
        type: 'scene',
        id: 'root',
        children: [
          {
            type: 'object',
            id: 'Rock',
            name: 'Rock',
            template: 'ThrowRock',
            properties: {
              position: [1, 2, 3],
              scale: [1, 1, 1],
            },
            traits: new Map([
              ['physics', { mass: 1.8 }],
              ['collidable', {}],
            ]),
            children: [],
          },
          {
            type: 'object',
            id: 'Target',
            name: 'Target',
            properties: {
              position: [3, 1, 0],
            },
            traits: new Map([['static', {}]]),
            children: [],
          },
        ],
      },
    } as Parameters<typeof createHeadlessRuntime>[0];

    const runtime = createHeadlessRuntime(ast, { tickRate: 0 });
    runtime.start();

    expect(runtime.getStats().instanceCount).toBe(3);
    expect(runtime.getStats().peakInstanceCount).toBe(3);

    const liveReceipt = runtime.getSceneReceipt();
    expect(liveReceipt.objectCount).toBe(2);
    expect(liveReceipt.objects.map((object) => object.id)).toEqual(['Rock', 'Target']);
    expect(liveReceipt.objects[0]).toMatchObject({
      id: 'Rock',
      template: 'ThrowRock',
      transform: { position: [1, 2, 3] },
      physics: { collidable: true, massKg: 1.8 },
    });

    runtime.stop();

    expect(runtime.getStats().instanceCount).toBe(0);
    expect(runtime.getStats().peakInstanceCount).toBe(3);
    expect(runtime.getSceneReceipt().objectCount).toBe(2);
  });
});
