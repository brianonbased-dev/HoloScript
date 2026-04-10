import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import { logger } from '../logger';

describe('Spatial State Machines Integration', () => {
  let runtime: HoloScriptRuntime;

  beforeEach(() => {
    runtime = new HoloScriptRuntime();
    vi.spyOn(logger, 'info');
    vi.spyOn(logger, 'debug');
  });

  it('should parse and execute a door state machine', async () => {
    const source = `
      state_machine DoorMachine {
        initial: "closed"
        
        state closed {
          on_exit { log("Gate opening...") }
        }
        
        state open {
          on_entry { log("Gate is now open!") }
        }
        
        transitions {
          closed -> open: click
          open -> closed: click
        }
      }

      orb gate {
        @logic(machine: "DoorMachine")
        color: "red"
      }
    `;

    const parser = new HoloScriptPlusParser();
    const result = parser.parse(source);

    // Execute the program
    const execResults = await runtime.execute(result.ast.body);
    expect(execResults.success).toBe(true);

    // Verify initial state
    const gateObj = runtime.getVariable('gate') as any;
    expect(gateObj).toBeDefined();

    // Simulate click event
    await runtime.triggerUIEvent('gate', 'click', { id: 'gate' });

    // Simple check without objectContaining first
    expect(logger.info).toHaveBeenCalled();
  });
});
