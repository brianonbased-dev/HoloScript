import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import { parseHolo } from './HoloCompositionParser';

const fixture = readFileSync(
  new URL('./examples/executable-closure.holo', import.meta.url),
  'utf8'
);

describe('.holo executable closure', () => {
  it('preserves action and event bodies and deterministically mutates state and an object', async () => {
    const parsed = parseHolo(fixture);

    expect(parsed.success).toBe(true);
    expect(parsed.errors).toEqual([]);

    const composition = parsed.ast;
    expect(composition).toBeDefined();

    const action = composition?.logic?.actions.find((candidate) => candidate.name === 'increment');
    const handler = composition?.logic?.handlers.find((candidate) => candidate.event === 'tick');

    expect(action?.body.map((statement) => statement.type)).toEqual(['Assignment', 'Assignment']);
    expect(handler?.body.map((statement) => statement.type)).toEqual(['Assignment', 'Assignment']);

    const runtime = new HoloScriptRuntime();
    runtime.setVariable(
      'state',
      Object.fromEntries(
        (composition?.state?.properties ?? []).map((property) => [property.key, property.value])
      )
    );

    const counter = composition?.objects.find((object) => object.name === 'Counter');
    runtime.setVariable(
      'Counter',
      Object.fromEntries(
        (counter?.properties ?? []).map((property) => [property.key, property.value])
      )
    );

    const actionResults = await runtime.executeHoloProgram(action?.body ?? []);
    const handlerResults = await runtime.executeHoloProgram(handler?.body ?? []);

    expect(actionResults.every((result) => result.success)).toBe(true);
    expect(handlerResults.every((result) => result.success)).toBe(true);
    expect(runtime.getVariable('state.count')).toBe(3);
    expect(runtime.getVariable('Counter.count')).toBe(4);
  });

  it('reports unsupported action-body syntax instead of silently discarding it', () => {
    const parsed = parseHolo(`composition "UnsupportedBody" {
      logic {
        action unsupported() {
          @opaque_statement
        }
      }
    }`);

    expect(parsed.success).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.ast?.logic?.actions[0]?.body.length).toBeGreaterThan(0);
  });
});
