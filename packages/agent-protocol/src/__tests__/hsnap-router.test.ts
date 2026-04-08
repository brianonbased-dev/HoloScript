import { describe, it, expect, vi } from 'vitest';

import {
  HSNAPRouter,
  parseHSNAPAgentMetadata,
  parseHSNAPPayload,
  type HSNAPDispatchMessage,
} from '../hsnap-router';
import { UAALOpCode } from '../../../uaal/src/opcodes';

describe('HSNAPRouter', () => {
  it('registers agents from @agent metadata and routes by explicit name', async () => {
    const dispatch = vi.fn(async (message: HSNAPDispatchMessage) => ({
      handledBy: message.target.name,
      taskId: message.task.id,
    }));

    const router = new HSNAPRouter();
    router.registerAgent({
      source: `object "Planner" {
        @agent {
          name: "planner"
          accepts: ["task.plan", ".hsplus"]
          emits: ["task.complete"]
          tools: ["query"]
          timeout: 12000
          max_concurrent: 2
        }
      }`,
      vm: { dispatch },
    });

    const receipt = await router.route(`@task {
      id: "t-plan-1"
      from: "coordinator"
      to: "planner"
      intent: "plan"
      timeout: 5000
    }

    composition Goal {
      description: "Plan the build"
    }`);

    expect(receipt.status).toBe('completed');
    expect(receipt.target?.name).toBe('planner');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0].task.to).toBe('planner');
    expect(receipt.lifecycle.map((event) => event.type)).toEqual([
      'task.send',
      'task.accept',
      'task.complete',
    ]);
  });

  it('routes by capability when no explicit target is provided', async () => {
    const plannerDispatch = vi.fn(async () => ({ ok: true }));
    const reviewDispatch = vi.fn(async () => ({ ok: true }));

    const router = new HSNAPRouter();
    router.registerAgent({
      metadata: { name: 'planner', accepts: ['task.plan'], emits: [], tools: [] },
      vm: { dispatch: plannerDispatch },
    });
    router.registerAgent({
      metadata: { name: 'reviewer', accepts: ['task.review'], emits: [], tools: [] },
      vm: { dispatch: reviewDispatch },
    });

    const receipt = await router.route(`@task(id: "t-implicit", from: "coord", intent: "review")
    composition Review {}`);

    expect(receipt.status).toBe('completed');
    expect(receipt.target?.name).toBe('reviewer');
    expect(reviewDispatch).toHaveBeenCalledTimes(1);
    expect(plannerDispatch).not.toHaveBeenCalled();
  });

  it('emits progress and complete lifecycle events from VM dispatch', async () => {
    const router = new HSNAPRouter();
    router.registerAgent({
      metadata: { name: 'builder', accepts: ['task.build'], emits: ['task.progress'], tools: [] },
      vm: {
        dispatch: async (message: HSNAPDispatchMessage) => {
          message.reportProgress({ percent: 25 });
          message.reportProgress({ percent: 75 });
          return { status: 'done' };
        },
      },
    });

    const receipt = await router.route(`@task { id: "t-build-1", intent: "build" }
    composition Build {}`);

    expect(receipt.status).toBe('completed');
    expect(receipt.lifecycle.map((event) => event.type)).toEqual([
      'task.send',
      'task.accept',
      'task.progress',
      'task.progress',
      'task.complete',
    ]);
  });

  it('uses the pluggable compiler hook before dispatch', async () => {
    const compile = vi.fn(async (source: string) => ({ bytecode: source.length }));
    const dispatch = vi.fn(async (message: HSNAPDispatchMessage) => message.compiled);
    const source = `@task { id: "t-compile-1" }
    composition Execute {}`;

    const router = new HSNAPRouter({ compile });
    router.registerAgent({
      metadata: { name: 'executor', accepts: ['.hsplus'], emits: [], tools: [] },
      vm: { dispatch },
    });

    const receipt = await router.route(source);

    expect(compile).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledWith(source);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(receipt.result).toEqual({ bytecode: source.length });
  });

  it('returns task.fail lifecycle when no route is available', async () => {
    const router = new HSNAPRouter();
    const receipt = await router.route(`@task { id: "t-miss", intent: "unknown" }
    composition Missing {}`);

    expect(receipt.status).toBe('failed');
    expect(receipt.error).toContain('No matching HSNAP agent');
    expect(receipt.lifecycle.at(-1)?.type).toBe('task.fail');
  });

  it('uses the built-in hsplus to UAAL compiler when no custom hook is provided', async () => {
    const dispatch = vi.fn(async (message: HSNAPDispatchMessage) => message.compiled);

    const router = new HSNAPRouter();
    router.registerAgent({
      metadata: { name: 'planner', accepts: ['task.plan', '.hsplus'], emits: [], tools: [] },
      vm: { dispatch },
    });

    const receipt = await router.route(`composition PlannerTask {
      @task { id: "t-default", to: "planner", intent: "plan" }
      emit("task.progress", { percent: 10 })
    }`);

    expect(receipt.status).toBe('completed');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((receipt.result as { instructions: Array<{ opCode: UAALOpCode }> }).instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opCode: UAALOpCode.OP_STATE_SET }),
        expect.objectContaining({ opCode: UAALOpCode.OP_ROUTE_MATCH }),
        expect.objectContaining({ opCode: UAALOpCode.OP_EMIT_SIGNAL }),
      ])
    );
  });
});

describe('HSNAP metadata parsing', () => {
  it('parses @agent metadata arrays and limits', () => {
    expect(
      parseHSNAPAgentMetadata(`object "Worker" {
        @agent(name: "worker", accepts: ["task.build", ".hsplus"], emits: ["task.complete"], tools: ["compile"], timeout: 9000, max_concurrent: 3)
      }`)
    ).toEqual({
      name: 'worker',
      accepts: ['task.build', '.hsplus'],
      emits: ['task.complete'],
      tools: ['compile'],
      timeout: 9000,
      max_concurrent: 3,
    });
  });

  it('parses combined task/result payload metadata', () => {
    expect(
      parseHSNAPPayload(`@task {
        id: "t-001"
        from: "planner"
        to: "builder"
        intent: "build"
        priority: 2
        timeout: 15000
      }

      @result(task_id: "t-001", status: "ok", duration: 321)`)
    ).toEqual({
      task: {
        id: 't-001',
        from: 'planner',
        to: 'builder',
        intent: 'build',
        priority: 2,
        timeout: 15000,
      },
      result: {
        task_id: 't-001',
        status: 'ok',
        duration: 321,
      },
      agent: undefined,
    });
  });
});