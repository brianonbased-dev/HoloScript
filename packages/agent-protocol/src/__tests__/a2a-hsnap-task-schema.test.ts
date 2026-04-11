import { describe, expect, it } from 'vitest';

import {
  mapA2AToHSNAP,
  mapHSNAPToA2A,
  A2ATaskSchema,
  HSNAPPayloadSchema,
  A2ATaskStatusSchema,
  A2ATaskArtifactSchema,
  HSNAPTraitSchema,
  HSNAPStateBindingSchema,
  type A2ATask,
  type HSNAPPayload,
} from '../a2a-hsnap-task-schema';

// =============================================================================
// FIXTURES
// =============================================================================

const TIMESTAMP = '2026-04-10T12:00:00.000Z';

function makeA2ATask(overrides: Partial<A2ATask> = {}): A2ATask {
  return {
    id: 'task-001',
    status: 'completed',
    artifacts: [
      {
        name: 'SceneGraph',
        mimeType: 'application/json',
        data: { objects: ['Cube', 'Sphere'] },
        index: 0,
      },
    ],
    history: [
      {
        role: 'user',
        parts: [
          {
            type: 'data',
            mimeType: 'application/json',
            data: {
              schema: 'holoscript.task-bridge.v1',
              intent: 'compile_scene',
              from: 'planner-agent',
              to: 'builder-agent',
              skillId: 'compile_hs',
              arguments: { code: 'object Cube {}' },
              idempotencyKey: 'idem-001',
              priority: 5,
              timeout: 30000,
            },
          },
        ],
        timestamp: TIMESTAMP,
      },
    ],
    metadata: {
      stateBindings: [
        { target: 'position.x', source: 'input.x', mode: 'one-way' },
      ],
    },
    ...overrides,
  };
}

function makeHSNAPPayload(overrides: Partial<HSNAPPayload> = {}): HSNAPPayload {
  return {
    composition: 'TestComposition',
    traits: [
      { name: 'Renderable', config: { mesh: 'cube', mimeType: 'model/gltf', data: null } },
    ],
    stateBindings: [
      { target: 'opacity', source: 'input.alpha', mode: 'two-way' },
    ],
    task: {
      id: 'hsnap-task-001',
      from: 'planner',
      to: 'builder',
      intent: 'render_scene',
      skillId: 'render_scene',
      input: { quality: 'high' },
      idempotency_key: 'idem-hsnap-001',
    },
    result: {
      task_id: 'hsnap-task-001',
      status: 'completed',
      duration: 1200,
    },
    agent: {
      name: 'builder',
      accepts: ['.hsplus', 'render_scene'],
      emits: ['scene.rendered'],
      tools: ['compile_hs'],
      timeout: 30000,
      max_concurrent: 4,
    },
    ...overrides,
  };
}

// =============================================================================
// ZOD SCHEMA VALIDATION
// =============================================================================

describe('Zod schemas', () => {
  describe('A2ATaskStatusSchema', () => {
    it('accepts valid status values', () => {
      for (const status of ['submitted', 'working', 'input-required', 'completed', 'failed', 'canceled']) {
        expect(A2ATaskStatusSchema.parse(status)).toBe(status);
      }
    });

    it('rejects invalid status', () => {
      expect(() => A2ATaskStatusSchema.parse('invalid')).toThrow();
    });
  });

  describe('A2ATaskSchema', () => {
    it('validates a well-formed A2A task', () => {
      const task = makeA2ATask();
      const result = A2ATaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    it('rejects a task missing id', () => {
      const task = makeA2ATask();
      const { id: _, ...noId } = task;
      const result = A2ATaskSchema.safeParse(noId);
      expect(result.success).toBe(false);
    });

    it('rejects a task with invalid status', () => {
      const task = makeA2ATask({ status: 'bogus' as A2ATask['status'] });
      const result = A2ATaskSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    it('accepts a task with empty artifacts and history', () => {
      const task = makeA2ATask({ artifacts: [], history: [] });
      const result = A2ATaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    it('validates message parts discriminated union', () => {
      const task = makeA2ATask({
        history: [
          {
            role: 'agent',
            parts: [
              { type: 'text', text: 'Done.' },
              { type: 'file', uri: 'file:///scene.gltf', mimeType: 'model/gltf' },
            ],
            timestamp: TIMESTAMP,
          },
        ],
      });
      const result = A2ATaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });
  });

  describe('A2ATaskArtifactSchema', () => {
    it('validates artifact with optional fields', () => {
      const result = A2ATaskArtifactSchema.safeParse({
        mimeType: 'text/plain',
        data: 'hello',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('HSNAPTraitSchema', () => {
    it('validates a trait', () => {
      const result = HSNAPTraitSchema.safeParse({
        name: 'Physics',
        config: { gravity: 9.81 },
      });
      expect(result.success).toBe(true);
    });

    it('rejects a trait without name', () => {
      const result = HSNAPTraitSchema.safeParse({ config: {} });
      expect(result.success).toBe(false);
    });
  });

  describe('HSNAPStateBindingSchema', () => {
    it('validates a state binding', () => {
      const result = HSNAPStateBindingSchema.safeParse({
        target: 'color.r',
        source: 'input.red',
        mode: 'one-way',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = HSNAPStateBindingSchema.safeParse({
        target: 'x',
        source: 'y',
        mode: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('HSNAPPayloadSchema', () => {
    it('validates a well-formed HSNAP payload', () => {
      const payload = makeHSNAPPayload();
      const result = HSNAPPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects payload missing composition', () => {
      const { composition: _, ...noComp } = makeHSNAPPayload();
      const result = HSNAPPayloadSchema.safeParse(noComp);
      expect(result.success).toBe(false);
    });

    it('accepts payload with empty traits and bindings', () => {
      const payload = makeHSNAPPayload({ traits: [], stateBindings: [] });
      const result = HSNAPPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('accepts payload without optional result/agent', () => {
      const payload = makeHSNAPPayload({ result: undefined, agent: undefined });
      const result = HSNAPPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// MAPPING: A2A -> HSNAP
// =============================================================================

describe('mapA2AToHSNAP', () => {
  it('extracts task metadata from the latest user message data part', () => {
    const task = makeA2ATask();
    const payload = mapA2AToHSNAP(task, { timestamp: TIMESTAMP });

    expect(payload.task.id).toBe('task-001');
    expect(payload.task.intent).toBe('compile_scene');
    expect(payload.task.from).toBe('planner-agent');
    expect(payload.task.to).toBe('builder-agent');
    expect(payload.task.skillId).toBe('compile_hs');
    expect(payload.task.input).toEqual({ code: 'object Cube {}' });
    expect(payload.task.idempotency_key).toBe('idem-001');
    expect(payload.task.priority).toBe(5);
    expect(payload.task.timeout).toBe(30000);
  });

  it('maps artifacts to traits', () => {
    const task = makeA2ATask();
    const payload = mapA2AToHSNAP(task);

    expect(payload.traits).toHaveLength(1);
    expect(payload.traits[0].name).toBe('SceneGraph');
    expect(payload.traits[0].config.mimeType).toBe('application/json');
    expect(payload.traits[0].config.data).toEqual({ objects: ['Cube', 'Sphere'] });
  });

  it('extracts state bindings from metadata', () => {
    const task = makeA2ATask();
    const payload = mapA2AToHSNAP(task);

    expect(payload.stateBindings).toHaveLength(1);
    expect(payload.stateBindings[0]).toEqual({
      target: 'position.x',
      source: 'input.x',
      mode: 'one-way',
    });
  });

  it('uses task id as composition name by default', () => {
    const task = makeA2ATask();
    const payload = mapA2AToHSNAP(task);
    expect(payload.composition).toBe('task-001');
  });

  it('respects id override in options', () => {
    const task = makeA2ATask();
    const payload = mapA2AToHSNAP(task, { id: 'custom-comp' });
    expect(payload.composition).toBe('custom-comp');
  });

  it('sets result metadata for completed tasks', () => {
    const task = makeA2ATask({ status: 'completed' });
    const payload = mapA2AToHSNAP(task);
    expect(payload.result).toEqual({ task_id: 'task-001', status: 'completed' });
  });

  it('sets result metadata for failed tasks', () => {
    const task = makeA2ATask({ status: 'failed' });
    const payload = mapA2AToHSNAP(task);
    expect(payload.result).toEqual({ task_id: 'task-001', status: 'failed' });
  });

  it('omits result for in-progress tasks', () => {
    const task = makeA2ATask({ status: 'working' });
    const payload = mapA2AToHSNAP(task);
    expect(payload.result).toBeUndefined();
  });

  it('handles task with no history gracefully', () => {
    const task = makeA2ATask({ history: [] });
    const payload = mapA2AToHSNAP(task);
    expect(payload.task.intent).toBeUndefined();
    expect(payload.task.skillId).toBeUndefined();
  });

  it('handles task with no metadata stateBindings', () => {
    const task = makeA2ATask({ metadata: undefined });
    const payload = mapA2AToHSNAP(task);
    expect(payload.stateBindings).toEqual([]);
  });

  it('names unnamed artifacts by index', () => {
    const task = makeA2ATask({
      artifacts: [
        { mimeType: 'text/plain', data: 'hello' },
        { mimeType: 'text/plain', data: 'world' },
      ],
    });
    const payload = mapA2AToHSNAP(task);
    expect(payload.traits[0].name).toBe('Artifact_0');
    expect(payload.traits[1].name).toBe('Artifact_1');
  });

  it('output validates against HSNAPPayloadSchema', () => {
    const task = makeA2ATask();
    const payload = mapA2AToHSNAP(task);
    const result = HSNAPPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// MAPPING: HSNAP -> A2A
// =============================================================================

describe('mapHSNAPToA2A', () => {
  it('maps traits back to artifacts', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload, { timestamp: TIMESTAMP });

    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts[0].name).toBe('Renderable');
    expect(task.artifacts[0].mimeType).toBe('model/gltf');
  });

  it('builds history from task metadata', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload, { timestamp: TIMESTAMP });

    expect(task.history).toHaveLength(1);
    expect(task.history[0].role).toBe('user');
    expect(task.history[0].parts[0].type).toBe('data');
    const data = (task.history[0].parts[0] as { type: 'data'; data: Record<string, unknown> }).data;
    expect(data.schema).toBe('holoscript.task-bridge.v1');
    expect(data.skillId).toBe('render_scene');
    expect(data.arguments).toEqual({ quality: 'high' });
  });

  it('derives status from result metadata', () => {
    const completed = mapHSNAPToA2A(makeHSNAPPayload({ result: { status: 'completed' } }));
    expect(completed.status).toBe('completed');

    const failed = mapHSNAPToA2A(makeHSNAPPayload({ result: { status: 'failed' } }));
    expect(failed.status).toBe('failed');

    const working = mapHSNAPToA2A(makeHSNAPPayload({ result: { status: 'in-progress' } }));
    expect(working.status).toBe('working');

    const noResult = mapHSNAPToA2A(makeHSNAPPayload({ result: undefined }));
    expect(noResult.status).toBe('submitted');
  });

  it('uses task id from payload', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload);
    expect(task.id).toBe('hsnap-task-001');
  });

  it('falls back to composition name for id', () => {
    const payload = makeHSNAPPayload({ task: {} });
    const task = mapHSNAPToA2A(payload);
    expect(task.id).toBe('TestComposition');
  });

  it('respects id override in options', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload, { id: 'override-id' });
    expect(task.id).toBe('override-id');
  });

  it('includes state bindings in metadata', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload);
    expect(task.metadata?.stateBindings).toEqual([
      { target: 'opacity', source: 'input.alpha', mode: 'two-way' },
    ]);
  });

  it('includes agent metadata when present', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload);
    expect(task.metadata?.agent).toBeDefined();
    expect((task.metadata?.agent as Record<string, unknown>).name).toBe('builder');
  });

  it('omits metadata when no bindings or agent', () => {
    const payload = makeHSNAPPayload({
      stateBindings: [],
      agent: undefined,
    });
    const task = mapHSNAPToA2A(payload);
    expect(task.metadata).toBeUndefined();
  });

  it('preserves raw source when option is set', () => {
    const payload = makeHSNAPPayload({ rawSource: '@task { intent: "test" }\ncomposition T {}' });
    const task = mapHSNAPToA2A(payload, { preserveRawSource: true, timestamp: TIMESTAMP });
    const data = (task.history[0].parts[0] as { type: 'data'; data: Record<string, unknown> }).data;
    expect(data.rawSource).toBe('@task { intent: "test" }\ncomposition T {}');
  });

  it('output validates against A2ATaskSchema', () => {
    const payload = makeHSNAPPayload();
    const task = mapHSNAPToA2A(payload, { timestamp: TIMESTAMP });
    const result = A2ATaskSchema.safeParse(task);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// ROUND-TRIP
// =============================================================================

describe('round-trip', () => {
  it('A2A -> HSNAP -> A2A preserves task identity and metadata', () => {
    const original = makeA2ATask();
    const hsnap = mapA2AToHSNAP(original, { timestamp: TIMESTAMP });
    const roundTripped = mapHSNAPToA2A(hsnap, { timestamp: TIMESTAMP });

    expect(roundTripped.id).toBe(original.id);
    expect(roundTripped.status).toBe('completed');
    expect(roundTripped.artifacts).toHaveLength(original.artifacts.length);
    expect(roundTripped.artifacts[0].name).toBe('SceneGraph');
  });

  it('HSNAP -> A2A -> HSNAP preserves composition and traits', () => {
    const original = makeHSNAPPayload({ result: undefined, agent: undefined });
    const a2a = mapHSNAPToA2A(original, { timestamp: TIMESTAMP });
    const roundTripped = mapA2AToHSNAP(a2a, { timestamp: TIMESTAMP });

    expect(roundTripped.task.id).toBe(original.task.id);
    expect(roundTripped.task.skillId).toBe(original.task.skillId);
    expect(roundTripped.traits).toHaveLength(original.traits.length);
    expect(roundTripped.traits[0].name).toBe('Renderable');
  });
});
