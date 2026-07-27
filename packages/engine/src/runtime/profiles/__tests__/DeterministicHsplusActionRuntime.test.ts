import { describe, expect, it } from 'vitest';
import type { HeadlessExperimentScheduleEntry } from '../HeadlessExecutionLedger';
import {
  ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET,
  createDeterministicHsplusActionRuntime,
} from '../DeterministicHsplusActionRuntime';

const BEHAVIOR_SOURCE = `composition "Two Resident Behavior" {
  state {
    water: 2
    privateAdapter: "secret-adapter-a"
  }

  logic {
    action observe(residentId) {
      return {
        resident_id: residentId,
        location: "commons",
        visible_event_ids: [],
        bounded_memory_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      }
    }

    action contribute(amount) {
      state.water = state.water + amount
      emit("water_added", { amount: amount })
      return { allowed: true, outcome: "water_added" }
    }

    action update_private(adapter) {
      state.privateAdapter = adapter
      return { allowed: true, outcome: "private_updated" }
    }

    action reject() {
      return { allowed: false, outcome: "blocked_without_world_mutation" }
    }

    action mutate_then_fail(amount) {
      state.water = state.water + amount
      return { allowed: true, outcome: 1 / 0 }
    }

    action denied_mutation(amount) {
      state.water = state.water + amount
      return { allowed: false, outcome: "denied" }
    }

    action denied_event() {
      emit("forbidden_event", { attempted: true })
      return { allowed: false, outcome: "denied" }
    }
  }
}`;

function scheduleEntry(
  entrypoint: string,
  options: {
    kind?: 'observation' | 'action';
    args?: Record<string, string | number | boolean | null>;
    expect?: HeadlessExperimentScheduleEntry['expect'];
  } = {}
): HeadlessExperimentScheduleEntry {
  return {
    kind: options.kind ?? 'action',
    scheduleEntryId: `entry-${entrypoint}`,
    order: 0,
    tick: 0,
    phase: 'test',
    entrypoint,
    args: options.args ?? {},
    ...(options.expect === undefined ? {} : { expect: options.expect }),
  };
}

describe('DeterministicHsplusActionRuntime', () => {
  it('executes the Model Village action subset through engine-owned structured AST', () => {
    expect(ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET).toBe(
      'holoscript-engine-hsplus-deterministic-action-subset-v1'
    );
    const runtime = createDeterministicHsplusActionRuntime(BEHAVIOR_SOURCE);
    expect(runtime.initialState).toEqual({
      privateAdapter: 'secret-adapter-a',
      water: 2,
    });

    const observation = runtime.invoke(
      scheduleEntry('observe', {
        kind: 'observation',
        args: { residentId: 'resident-1' },
      })
    );
    expect(observation.value).toEqual({
      bounded_memory_hash: 'a'.repeat(64),
      location: 'commons',
      resident_id: 'resident-1',
      visible_event_ids: [],
    });
    expect(observation.state).toEqual(runtime.initialState);
    expect(observation.emittedEvents).toEqual([]);

    const contribution = runtime.invoke(
      scheduleEntry('contribute', {
        args: { amount: 1 },
        expect: { allowed: true, outcome: 'water_added', stateChanged: true },
      })
    );
    expect(contribution.value).toEqual({ allowed: true, outcome: 'water_added' });
    expect(contribution.state).toEqual({
      privateAdapter: 'secret-adapter-a',
      water: 3,
    });
    expect(contribution.emittedEvents).toEqual([{ event: 'water_added', payload: { amount: 1 } }]);

    const denied = runtime.invoke(
      scheduleEntry('reject', {
        expect: {
          allowed: false,
          outcome: 'blocked_without_world_mutation',
          stateChanged: false,
        },
      })
    );
    expect(denied.state).toEqual(contribution.state);
    expect(denied.emittedEvents).toEqual([]);
  });

  it('requires exact named arguments and known action entrypoints', () => {
    const runtime = createDeterministicHsplusActionRuntime(BEHAVIOR_SOURCE);
    expect(() => runtime.invoke(scheduleEntry('missing'))).toThrow(/unknown action entrypoint/i);
    expect(() =>
      runtime.invoke(scheduleEntry('contribute', { args: { amount: 1, extra: true } }))
    ).toThrow(/requires exactly: amount/i);
    expect(() => runtime.invoke(scheduleEntry('contribute'))).toThrow(/requires exactly: amount/i);
  });

  it('defers projected public-state expectations to the headless ledger', () => {
    const runtime = createDeterministicHsplusActionRuntime(BEHAVIOR_SOURCE);
    const result = runtime.invoke(
      scheduleEntry('update_private', {
        args: { adapter: 'secret-adapter-b' },
        expect: { allowed: true, outcome: 'private_updated', stateChanged: false },
      })
    );

    expect(result.state).toEqual({
      privateAdapter: 'secret-adapter-b',
      water: 2,
    });
  });

  it('rolls back failed, observational, and denied mutations and buffers denied events', () => {
    const runtime = createDeterministicHsplusActionRuntime(BEHAVIOR_SOURCE);

    expect(() =>
      runtime.invoke(
        scheduleEntry('contribute', {
          args: { amount: 1 },
          expect: { allowed: true, outcome: 'wrong-outcome', stateChanged: true },
        })
      )
    ).toThrow(/outcome does not match the schedule/i);
    expect(runtime.getState().water).toBe(2);

    expect(() =>
      runtime.invoke(scheduleEntry('mutate_then_fail', { args: { amount: 4 } }))
    ).toThrow(/division by zero/i);
    expect(runtime.getState().water).toBe(2);

    expect(() =>
      runtime.invoke(
        scheduleEntry('contribute', {
          kind: 'observation',
          args: { amount: 1 },
        })
      )
    ).toThrow(/observation .* attempted to mutate state/i);
    expect(runtime.getState().water).toBe(2);

    expect(() => runtime.invoke(scheduleEntry('denied_mutation', { args: { amount: 1 } }))).toThrow(
      /denied action .* attempted a state change or event/i
    );
    expect(runtime.getState().water).toBe(2);

    expect(() => runtime.invoke(scheduleEntry('denied_event'))).toThrow(
      /denied action .* attempted a state change or event/i
    );
    expect(runtime.getState().water).toBe(2);
  });

  it('preserves lazy boolean semantics without evaluating an unused branch', () => {
    const lazySource = BEHAVIOR_SOURCE.replace(
      'action observe(residentId) {',
      `action lazy_and() {
        if (false && 1 / 0 > 0) {
          return { allowed: true, outcome: "wrong" }
        }
        return { allowed: true, outcome: "and-short-circuited" }
      }

      action lazy_or() {
        if (true || 1 / 0 > 0) {
          return { allowed: true, outcome: "or-short-circuited" }
        }
        return { allowed: true, outcome: "wrong" }
      }

      action observe(residentId) {`
    );
    const runtime = createDeterministicHsplusActionRuntime(lazySource);

    expect(runtime.invoke(scheduleEntry('lazy_and')).value).toEqual({
      allowed: true,
      outcome: 'and-short-circuited',
    });
    expect(runtime.invoke(scheduleEntry('lazy_or')).value).toEqual({
      allowed: true,
      outcome: 'or-short-circuited',
    });
  });

  it('rejects dynamic host access, unsupported statements, and prototype keys before execution', () => {
    const hostEscape = BEHAVIOR_SOURCE.replace(
      'action observe(residentId) {',
      `action escape() {
        return {
          allowed: true,
          outcome: getState.constructor("return Da" + "te.now()")()
        }
      }

      action observe(residentId) {`
    );
    expect(() => createDeterministicHsplusActionRuntime(hostEscape)).toThrow(
      /not admitted|structured parse failed/i
    );

    const localMutation = BEHAVIOR_SOURCE.replace(
      'action observe(residentId) {',
      `action local_mutation() {
        const decorated = []
        return { allowed: true, outcome: "unsupported" }
      }

      action observe(residentId) {`
    );
    expect(() => createDeterministicHsplusActionRuntime(localMutation)).toThrow(
      /VariableDeclaration.*not admitted/i
    );

    const prototypeKey = BEHAVIOR_SOURCE.replace(
      'return { allowed: false, outcome: "blocked_without_world_mutation" }',
      'return { allowed: false, outcome: "blocked_without_world_mutation", __proto__: "x" }'
    );
    expect(() => createDeterministicHsplusActionRuntime(prototypeKey)).toThrow(
      /unsafe key "__proto__"|structured parse failed/i
    );

    const shadowedState = BEHAVIOR_SOURCE.replace(
      'action observe(residentId)',
      'action observe(state)'
    );
    expect(() => createDeterministicHsplusActionRuntime(shadowedState)).toThrow(
      /unsupported signature|reserved parameter "state"/i
    );

    const typedParameter = BEHAVIOR_SOURCE.replace(
      'action observe(residentId)',
      'action observe(residentId: string)'
    );
    expect(() => createDeterministicHsplusActionRuntime(typedParameter)).toThrow(
      /typed parameter "residentId".*not admitted/i
    );

    const computedStateAssignment = BEHAVIOR_SOURCE.replace(
      'action observe(residentId) {',
      `action computed_assignment(property) {
        state /* parser-loss gap */ [property] = 1
        return { allowed: true, outcome: "unsupported" }
      }

      action observe(residentId) {`
    );
    expect(() => createDeterministicHsplusActionRuntime(computedStateAssignment)).toThrow(
      /computed state access.*not admitted/i
    );

    const parenthesizedComputedStateAssignment = BEHAVIOR_SOURCE.replace(
      'action observe(residentId) {',
      `action parenthesized_computed_assignment(property) {
        (state) /* parser-loss gap */ [property] = 1
        return { allowed: true, outcome: "unsupported" }
      }

      action observe(residentId) {`
    );
    expect(() =>
      createDeterministicHsplusActionRuntime(parenthesizedComputedStateAssignment)
    ).toThrow(/computed state access.*not admitted/i);

    const deepMemberPath = BEHAVIOR_SOURCE.replace(
      'return { allowed: false, outcome: "blocked_without_world_mutation" }',
      `return { allowed: false, outcome: state${'.water'.repeat(33)} }`
    );
    expect(() => createDeterministicHsplusActionRuntime(deepMemberPath)).toThrow(
      /member access exceeds AST depth 32/i
    );

    const duplicateObjectKey = BEHAVIOR_SOURCE.replace(
      'return { allowed: false, outcome: "blocked_without_world_mutation" }',
      'return { allowed: false, outcome: "first", outcome: "second" }'
    );
    expect(() => createDeterministicHsplusActionRuntime(duplicateObjectKey)).toThrow(
      /duplicate key "outcome"/i
    );

    const missingReturn = BEHAVIOR_SOURCE.replace(
      'action observe(residentId) {',
      `action missing_return() {
        state.water = state.water
      }

      action observe(residentId) {`
    );
    const incompleteRuntime = createDeterministicHsplusActionRuntime(missingReturn);
    expect(() => incompleteRuntime.invoke(scheduleEntry('missing_return'))).toThrow(
      /without an explicit return/i
    );
  });

  it('is deterministic across independent runtimes', () => {
    const run = () => {
      const runtime = createDeterministicHsplusActionRuntime(BEHAVIOR_SOURCE);
      return [
        runtime.invoke(
          scheduleEntry('observe', {
            kind: 'observation',
            args: { residentId: 'resident-2' },
          })
        ),
        runtime.invoke(
          scheduleEntry('contribute', {
            args: { amount: 1 },
            expect: { allowed: true, outcome: 'water_added', stateChanged: true },
          })
        ),
        runtime.invoke(
          scheduleEntry('reject', {
            expect: {
              allowed: false,
              outcome: 'blocked_without_world_mutation',
              stateChanged: false,
            },
          })
        ),
      ];
    };

    expect(run()).toEqual(run());
  });
});

describe('DeterministicHsplusActionRuntime v2 numeric builtins', () => {
  const BUILTIN_SOURCE = `composition "Builtin Probe" {
  state {
    touched: 0
  }

  logic {
    action vec3_length(v) {
      return { value: sqrt(v.x * v.x + v.y * v.y + v.z * v.z) }
    }

    action half_cos(angle) {
      return { value: cos(angle * 0.5) }
    }

    action bad_domain(x) {
      return { value: sqrt(x) }
    }

    action clamped(value, lo, hi) {
      return { value: max(lo, min(hi, value)) }
    }
  }
}`;

  function observation(entrypoint: string, args: Record<string, unknown>) {
    return {
      kind: 'observation',
      scheduleEntryId: `v2-${entrypoint}`,
      order: 0,
      tick: 0,
      phase: 'test',
      entrypoint,
      args,
    } as HeadlessExperimentScheduleEntry;
  }

  it('executes whitelisted builtins under the v2 subset id', () => {
    const runtime = createDeterministicHsplusActionRuntime(BUILTIN_SOURCE, {
      numericBuiltins: true,
    });
    expect(runtime.subsetId).toBe(
      'holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins'
    );
    expect(
      runtime.invoke(observation('vec3_length', { v: { x: 3, y: 4, z: 0 } })).value
    ).toEqual({ value: 5 });
    expect(runtime.invoke(observation('half_cos', { angle: 0 })).value).toEqual({ value: 1 });
    expect(
      runtime.invoke(observation('clamped', { value: 42, lo: 0, hi: 10 })).value
    ).toEqual({ value: 10 });
  });

  it('keeps the v1 subset closed to every call including table members', () => {
    expect(() => createDeterministicHsplusActionRuntime(BUILTIN_SOURCE)).toThrow(
      /function calls are not admitted in the v1 deterministic subset/
    );
    const v1 = createDeterministicHsplusActionRuntime(`composition "V1" {
  state { touched: 0 }
  logic {
    action plain(a, b) { return { value: a + b } }
  }
}`);
    expect(v1.subsetId).toBe('holoscript-engine-hsplus-deterministic-action-subset-v1');
    expect(v1.invoke(observation('plain', { a: 2, b: 3 })).value).toEqual({ value: 5 });
  });

  it('fail-closes on domain errors and rejects non-table or member callees', () => {
    const runtime = createDeterministicHsplusActionRuntime(BUILTIN_SOURCE, {
      numericBuiltins: true,
    });
    expect(() => runtime.invoke(observation('bad_domain', { x: -1 }))).toThrow(
      /produced an unsupported number/
    );
    expect(() =>
      createDeterministicHsplusActionRuntime(
        `composition "X" {
  state { touched: 0 }
  logic {
    action f(x) { return { value: tan(x) } }
  }
}`,
        { numericBuiltins: true }
      )
    ).toThrow(/not in the v2 numeric builtin table/);
    expect(() =>
      createDeterministicHsplusActionRuntime(
        `composition "X" {
  state { touched: 0 }
  logic {
    action f(x) { return { value: sqrt(x, x) } }
  }
}`,
        { numericBuiltins: true }
      )
    ).toThrow(/requires exactly 1 argument/);
  });
});

describe('DeterministicHsplusActionRuntime v3 local bindings', () => {
  const SLERP_SOURCE = `composition "Slerp Probe" {
  state {
    touched: 0
  }

  logic {
    action quat_slerp(a, b, t) {
      dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
      bx = b.x
      by = b.y
      bz = b.z
      bw = b.w
      if (dot < 0) {
        bx = 0.0 - b.x
        by = 0.0 - b.y
        bz = 0.0 - b.z
        bw = 0.0 - b.w
        dot = 0.0 - dot
      }
      if (dot > 0.9995) {
        lx = a.x + (bx - a.x) * t
        ly = a.y + (by - a.y) * t
        lz = a.z + (bz - a.z) * t
        lw = a.w + (bw - a.w) * t
        len = sqrt(lx * lx + ly * ly + lz * lz + lw * lw)
        return { x: lx / len, y: ly / len, z: lz / len, w: lw / len }
      }
      theta0 = acos(dot)
      theta = theta0 * t
      sinTheta = sin(theta)
      sinTheta0 = sin(theta0)
      s0 = cos(theta) - dot * sinTheta / sinTheta0
      s1 = sinTheta / sinTheta0
      return { x: a.x * s0 + bx * s1, y: a.y * s0 + by * s1, z: a.z * s0 + bz * s1, w: a.w * s0 + bw * s1 }
    }
  }
}`;

  function observation(entrypoint: string, args: Record<string, unknown>) {
    return {
      kind: 'observation',
      scheduleEntryId: `v3-${entrypoint}`,
      order: 0,
      tick: 0,
      phase: 'test',
      entrypoint,
      args,
    } as HeadlessExperimentScheduleEntry;
  }

  it('executes the pure slerp projection under the v3 subset id', () => {
    const runtime = createDeterministicHsplusActionRuntime(SLERP_SOURCE, {
      numericBuiltins: true,
      localBindings: true,
    });
    expect(runtime.subsetId).toBe(
      'holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings'
    );
    const identity = { x: 0, y: 0, z: 0, w: 1 };
    const zQuarter = { x: 0, y: 0, z: 0.7071067811865476, w: 0.7071067811865476 };
    const mid = runtime.invoke(
      observation('quat_slerp', { a: identity, b: zQuarter, t: 0.5 })
    ).value as Record<string, number>;
    expect(mid.w).toBeCloseTo(0.9238795325112867, 12);
    expect(mid.z).toBeCloseTo(0.3826834323650898, 12);
    expect(mid.x).toBe(0);
    expect(mid.y).toBe(0);
  });

  it('takes the shortest-path negation and nlerp branches', () => {
    const runtime = createDeterministicHsplusActionRuntime(SLERP_SOURCE, {
      numericBuiltins: true,
      localBindings: true,
    });
    const a = { x: 0.5, y: 0.5, z: 0.5, w: 0.5 };
    const negated = { x: -0.5, y: -0.5, z: -0.5, w: -0.5 };
    const shortest = runtime.invoke(
      observation('quat_slerp', { a, b: negated, t: 0.25 })
    ).value as Record<string, number>;
    expect(shortest.x).toBeCloseTo(0.5, 12);
    expect(shortest.w).toBeCloseTo(0.5, 12);
  });

  it('fails closed on use-before-assign and parameter reassignment', () => {
    expect(() =>
      createDeterministicHsplusActionRuntime(
        `composition "X" {
  state { touched: 0 }
  logic {
    action f(x) { return { value: ghost + x } }
  }
}`,
        { numericBuiltins: true, localBindings: true }
      )
    ).toThrow(/undeclared parameter "ghost"/);
    expect(() =>
      createDeterministicHsplusActionRuntime(
        `composition "X" {
  state { touched: 0 }
  logic {
    action f(x) { x = 1
      return { value: x } }
  }
}`,
        { numericBuiltins: true, localBindings: true }
      )
    ).toThrow(/cannot reassign a parameter/);
  });

  it('keeps locals closed in v1 and v2 modes', () => {
    expect(() =>
      createDeterministicHsplusActionRuntime(SLERP_SOURCE, { numericBuiltins: true })
    ).toThrow(/must be declared state/);
    expect(() => createDeterministicHsplusActionRuntime(SLERP_SOURCE)).toThrow(
      /must be declared state/
    );
  });
});
