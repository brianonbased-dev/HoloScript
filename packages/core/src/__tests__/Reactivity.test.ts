import { expect, test, describe, beforeEach } from 'vitest';
import { HoloScriptParser } from '../HoloScriptParser';
import { HoloScriptRuntime } from '../HoloScriptRuntime';

describe('HoloScript+ Reactivity', () => {
  let parser: HoloScriptParser;
  let runtime: HoloScriptRuntime;

  beforeEach(() => {
    parser = new HoloScriptParser();
    runtime = new HoloScriptRuntime();
  });

  test('should parse and execute @state directive', async () => {
    const code = '@state count: 10 name: "Holo"';
    const ast = parser.parseVoiceCommand({ command: code, confidence: 1, timestamp: Date.now() });

    await runtime.executeProgram(ast);
    const state = runtime.getState();

    expect(state.count).toBe(10);
    expect(state.name).toBe('Holo');
  });

  test('should interpolate state values in orb properties', async () => {
    // Set initial state
    await runtime.executeProgram(
      parser.parseVoiceCommand({
        command: '@state count: 42',
        confidence: 1,
        timestamp: Date.now(),
      })
    );

    // Create orb using state interpolation
    const code = 'create orb myOrb { size: ${count} }';
    const ast = parser.parseVoiceCommand({ command: code, confidence: 1, timestamp: Date.now() });

    await runtime.executeProgram(ast);
    const orb = runtime.getVariable('myOrb') as any;

    expect(orb.properties.size).toBe(42);
  });

  test('should support traits as directives', async () => {
    const code = 'create orb traitOrb @grabbable';
    const ast = parser.parseVoiceCommand({ command: code, confidence: 1, timestamp: Date.now() });

    expect(ast[0].directives).toBeDefined();
    expect(ast[0].directives![0].type).toBe('trait');
    expect((ast[0].directives![0] as any).name).toBe('grabbable');
  });

  test('should support multiple directives', async () => {
    const code = 'create orb multiOrb @grabbable @hoverable';
    const ast = parser.parseVoiceCommand({ command: code, confidence: 1, timestamp: Date.now() });

    expect(ast[0].directives?.length).toBe(2);
  });

  test('should support trait configurations', async () => {
    const code = 'create orb configOrb @grabbable { stiffness: 0.5 }';
    const ast = parser.parseVoiceCommand({ command: code, confidence: 1, timestamp: Date.now() });

    expect(ast[0].directives![0].type).toBe('trait');
    expect((ast[0].directives![0] as any).config.stiffness).toBe(0.5);
  });
});
