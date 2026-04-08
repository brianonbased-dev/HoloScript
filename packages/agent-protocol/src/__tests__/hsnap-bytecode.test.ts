import { describe, it, expect } from 'vitest';

import { UAALOpCode } from '../../../uaal/src/opcodes';

import { compileHSNAPToUAAL, compileHSNAPToUAALDetailed } from '../hsnap-bytecode';

describe('compileHSNAPToUAAL', () => {
  it('compiles hsnap metadata, routing, and execution calls into bytecode', () => {
    const source = `composition PlannerAgent {
      @agent {
        name: "planner"
        accepts: ["task.plan", ".hsplus"]
        emits: ["task.complete"]
        tools: ["knowledge_query"]
        timeout: 30000
        max_concurrent: 4
      }

      @task {
        id: "task-1"
        from: "router"
        to: "planner"
        intent: "plan"
        priority: 2
        timeout: 15000
      }

      @state_machine {
        initial: "idle"

        state "idle" {
          transition "receive_goal" -> "planning" {
            guard: goal != ""
          }
        }

        state "planning" {
          on_entry {
            this.plan = llm_call("decompose", { prompt: "Break into steps" })
            this.lookup = tool_call("knowledge_query", { q: goal })
            emit("task.progress", { percent: 25 })
          }
        }
      }
    }`;

    const result = compileHSNAPToUAALDetailed(source);
    const opcodes = result.bytecode.instructions.map((instruction) => instruction.opCode);

    expect(opcodes).toContain(UAALOpCode.OP_STATE_SET);
    expect(opcodes).toContain(UAALOpCode.OP_ROUTE_MATCH);
    expect(opcodes).toContain(UAALOpCode.OP_ROUTE_SCORE);
    expect(opcodes).toContain(UAALOpCode.OP_GRAPH_START);
    expect(opcodes).toContain(UAALOpCode.OP_NODE_ENTER);
    expect(opcodes).toContain(UAALOpCode.OP_INVOKE_LLM);
    expect(opcodes).toContain(UAALOpCode.OP_OFFLOAD);
    expect(opcodes).toContain(UAALOpCode.OP_EMIT_SIGNAL);
    expect(opcodes.at(-1)).toBe(UAALOpCode.HALT);

    expect(result.artifacts.agent?.name).toBe('planner');
    expect(result.artifacts.task.intent).toBe('plan');
    expect(result.artifacts.stateMachine?.initial).toBe('idle');
    expect(result.artifacts.stateMachine?.states).toEqual(['idle', 'planning']);
    expect(result.artifacts.llmCalls.map((call) => call.name)).toEqual(['decompose']);
    expect(result.artifacts.toolCalls.map((call) => call.name)).toEqual(['knowledge_query']);
    expect(result.artifacts.emits.map((emit) => emit.event)).toEqual(['task.progress']);
  });

  it('can compile without appending the default full cycle', () => {
    const bytecode = compileHSNAPToUAAL(`composition Lightweight {
      @task { id: "task-lite", intent: "review" }
      emit("task.accept", { eta: 5 })
    }`, { includeFullCycle: false });

    const opcodes = bytecode.instructions.map((instruction) => instruction.opCode);
    expect(opcodes).toContain(UAALOpCode.OP_EMIT_SIGNAL);
    expect(opcodes).not.toContain(UAALOpCode.INTAKE);
    expect(opcodes.at(-1)).toBe(UAALOpCode.HALT);
  });
});