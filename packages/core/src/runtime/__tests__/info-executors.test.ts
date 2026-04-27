import { describe, it, expect, vi } from 'vitest';
import { executeVisualize, executeUIElement } from '../info-executors.js';
import type { InfoExecutorContext } from '../info-executors.js';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeCtx(): InfoExecutorContext {
  return {
    getVariable: vi.fn(),
    createDataVisualization: vi.fn(),
    uiElements: new Map(),
    emit: vi.fn(),
  };
}

describe('executeVisualize', () => {
  it('returns error when variable not found', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const node = { type: 'visualize', target: 'missingVar', vizType: 'bar' };
    const result = await executeVisualize(node, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('calls createDataVisualization when variable exists', async () => {
    const ctx = makeCtx();
    const data = [1, 2, 3];
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue(data);
    const node = { type: 'visualize', target: 'myData', vizType: 'bar' };
    await executeVisualize(node, ctx);
    expect(ctx.createDataVisualization).toHaveBeenCalled();
  });

  it('returns success with visualizing target in output', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue({ x: 1 });
    const node = { type: 'visualize', target: 'myVar', vizType: 'scatter' };
    const result = await executeVisualize(node, ctx);
    expect(result.success).toBe(true);
    const out = result.output as { visualizing: string };
    expect(out.visualizing).toBe('myVar');
  });

  it('returns cylinder hologram', async () => {
    const ctx = makeCtx();
    (ctx.getVariable as ReturnType<typeof vi.fn>).mockReturnValue([1]);
    const node = { type: 'visualize', target: 'v', vizType: 'line' };
    const result = await executeVisualize(node, ctx);
    const holo = result.hologram as { shape: string };
    expect(holo.shape).toBe('cylinder');
  });
});

describe('executeUIElement', () => {
  it('registers element in ctx.uiElements', async () => {
    const ctx = makeCtx();
    const node = { type: 'ui_element', name: 'btn1', elementType: 'button', label: 'Click', properties: {} };
    await executeUIElement(node, ctx);
    expect(ctx.uiElements.has('btn1')).toBe(true);
  });

  it('returns success', async () => {
    const ctx = makeCtx();
    const node = { type: 'ui_element', name: 'el1', elementType: 'button', label: 'OK', properties: {} };
    const result = await executeUIElement(node, ctx);
    expect(result.success).toBe(true);
  });

  it('sets slider initial value from value or min or 0', async () => {
    const ctx = makeCtx();
    const nodeWithMin = {
      type: 'ui_element', name: 'slider1', elementType: 'slider', label: 'Vol', properties: { min: 5 },
    };
    await executeUIElement(nodeWithMin, ctx);
    const el = ctx.uiElements.get('slider1') as { value: number };
    expect(el.value).toBe(5);
  });

  it('sets textinput initial value from value or empty string', async () => {
    const ctx = makeCtx();
    const node = { type: 'ui_element', name: 'inp1', elementType: 'textinput', label: 'Name', properties: {} };
    await executeUIElement(node, ctx);
    const el = ctx.uiElements.get('inp1') as { value: string };
    expect(el.value).toBe('');
  });

  it('sets toggle initial checked from checked or false', async () => {
    const ctx = makeCtx();
    const node = { type: 'ui_element', name: 'tog1', elementType: 'toggle', label: 'On', properties: {} };
    await executeUIElement(node, ctx);
    const el = ctx.uiElements.get('tog1') as { value: unknown };
    expect(el.value).toBe(false);
  });

  it('output contains element info', async () => {
    const ctx = makeCtx();
    const node = { type: 'ui_element', name: 'e2', elementType: 'button', label: 'Go', properties: {} };
    const result = await executeUIElement(node, ctx);
    expect(result.output).toBeDefined();
  });
});
