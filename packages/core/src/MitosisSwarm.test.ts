import { describe, it, expect, vi } from 'vitest';
import { HoloScriptRuntime } from './HoloScriptRuntime';
import { HoloCompositionParser } from './parser/HoloCompositionParser';
import { enableConsoleLogging } from './logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Mitosis Swarm live test', () => {
  it.skip('should spawn agents and receive sync reports (swarm execution pipeline not yet implemented)', async () => {
    enableConsoleLogging();
    const demoPath = path.resolve(__dirname, '../../../examples/SwarmMasteryDemo.holo');
    const code = fs.readFileSync(demoPath, 'utf-8');

    const parser = new HoloCompositionParser();
    const parseResult = parser.parse(code);
    if (!parseResult.success) {
      console.error('Parse Errors:', JSON.stringify(parseResult.errors, null, 2));
    }
    expect(parseResult.success).toBe(true);

    const runtime = new HoloScriptRuntime();

    const spawnSpy = vi.fn();
    const syncSpy = vi.fn();

    runtime.on('mitosis_spawned', spawnSpy);
    runtime.on('mitosis_synced', syncSpy);

    await runtime.execute(parseResult.ast);

    // Wait for async actions to complete (the mining loop)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(spawnSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy).toHaveBeenCalledTimes(2);

    const state = runtime.getState();
    // Commander should have aggregated resources: 2 miners * 50 = 100
    // Actually the AlphaCommander is an object, its state might be in currentScope or context.variables
    // Let's check variables directly
    const commanderIdx = Array.from(runtime.getContext().variables.keys()).find((k) =>
      k.includes('AlphaCommander')
    );
    const commander = commanderIdx ? runtime.getContext().variables.get(commanderIdx) : null;

    // In our demo, AlphaCommander state has total_resources
    // await sleep allows properties to update
    expect((commander as any)?.state.total_resources).toBeGreaterThanOrEqual(100);
  }, 10000);
});
