/**
 * Unit tests for info-executors — BUILD-mode module coverage.
 *
 * Slice 22 — two dispatch-only executors for visualizing data and
 * registering UI elements. Small surface but worth locking since
 * downstream depends on the envelope shapes.
 *
 * **See**: packages/core/src/runtime/info-executors.ts (slice 22)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeVisualize,
  executeUIElement,
  type InfoExecutorContext,
} from './info-executors';
import type { ASTNode, ExecutionResult, UI2DNode, UIElementState } from '../types';

function makeCtx(overrides: Partial<InfoExecutorContext> = {}): InfoExecutorContext {
  return {
    getVariable: vi.fn(() => undefined),
    createDataVisualization: vi.fn(),
    uiElements: new Map<string, UIElementState>(),
    on: vi.fn(),
    callFunction: vi.fn(async () => ({ success: true }) as ExecutionResult),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// executeVisualize
// ──────────────────────────────────────────────────────────────────

describe('executeVisualize — target lookup', () => {
  it('returns failure envelope when variable is undefined', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => undefined) });
    const result = await executeVisualize(
      { type: 'visualize', target: 'missing' } as ASTNode & { target?: string },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("No data found for 'missing'");
    expect(ctx.createDataVisualization).not.toHaveBeenCalled();
  });

  it('creates data visualization when target resolves', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => [1, 2, 3]) });
    const result = await executeVisualize(
      {
        type: 'visualize',
        target: 'arr',
        position: [5, 10, 15],
      } as ASTNode & { target?: string },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(ctx.createDataVisualization).toHaveBeenCalledWith(
      'arr', [1, 2, 3], [5, 10, 15],
    );
  });

  it('defaults position to [0,0,0] when absent', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => 'data') });
    await executeVisualize(
      { type: 'visualize', target: 'x' } as ASTNode & { target?: string },
      ctx,
    );
    expect(ctx.createDataVisualization).toHaveBeenCalledWith('x', 'data', [0, 0, 0]);
  });

  it('defaults target to empty string when absent (still fails lookup)', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => undefined) });
    const result = await executeVisualize(
      { type: 'visualize' } as ASTNode,
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("No data found for ''");
  });

  it('output envelope includes target + data', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => 'hello') });
    const result = await executeVisualize(
      { type: 'visualize', target: 'greeting' } as ASTNode & { target?: string },
      ctx,
    );
    expect(result.output).toEqual({ visualizing: 'greeting', data: 'hello' });
  });

  it('attaches VISUALIZE hologram (cylinder #32cd32)', async () => {
    const ctx = makeCtx({ getVariable: vi.fn(() => 1) });
    const result = await executeVisualize(
      { type: 'visualize', target: 't' } as ASTNode & { target?: string },
      ctx,
    );
    expect(result.hologram).toMatchObject({
      shape: 'cylinder',
      color: '#32cd32',
      interactive: true,
    });
  });

  it('zero and empty-string are valid data (not treated as missing)', async () => {
    // Only `undefined` triggers the missing-data error path
    const ctx0 = makeCtx({ getVariable: vi.fn(() => 0) });
    const ctxEmpty = makeCtx({ getVariable: vi.fn(() => '') });
    const ctxNull = makeCtx({ getVariable: vi.fn(() => null) });
    expect((await executeVisualize({ type: 'visualize', target: 'a' } as ASTNode & { target?: string }, ctx0)).success).toBe(true);
    expect((await executeVisualize({ type: 'visualize', target: 'a' } as ASTNode & { target?: string }, ctxEmpty)).success).toBe(true);
    expect((await executeVisualize({ type: 'visualize', target: 'a' } as ASTNode & { target?: string }, ctxNull)).success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
// executeUIElement
// ──────────────────────────────────────────────────────────────────

describe('executeUIElement — registration', () => {
  it('stores widget under node.name in uiElements map', async () => {
    const ctx = makeCtx();
    const node = {
      type: 'ui2d',
      name: 'btn',
      elementType: 'button',
      properties: { label: 'Click' },
    } as unknown as UI2DNode;
    await executeUIElement(node, ctx);
    const el = ctx.uiElements.get('btn');
    expect(el).toBeDefined();
    expect(el!.type).toBe('button');
    expect(el!.name).toBe('btn');
    expect(el!.visible).toBe(true);
    expect(el!.enabled).toBe(true);
  });

  it('copies node.properties (does not share reference)', async () => {
    const ctx = makeCtx();
    const props = { color: 'red' };
    const node = {
      type: 'ui2d',
      name: 'w',
      elementType: 'button',
      properties: props,
    } as unknown as UI2DNode;
    await executeUIElement(node, ctx);
    expect(ctx.uiElements.get('w')!.properties).toEqual(props);
    expect(ctx.uiElements.get('w')!.properties).not.toBe(props);
  });
});

describe('executeUIElement — initial value defaults by elementType', () => {
  it('textinput defaults to empty string', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'ti', elementType: 'textinput', properties: {} } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.uiElements.get('ti')!.value).toBe('');
  });

  it('textinput honors explicit value', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'ti', elementType: 'textinput', properties: { value: 'preset' } } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.uiElements.get('ti')!.value).toBe('preset');
  });

  it('slider defaults to properties.min when value absent', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 's', elementType: 'slider', properties: { min: 5, max: 100 } } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.uiElements.get('s')!.value).toBe(5);
  });

  it('slider falls through to 0 when neither value nor min set', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 's', elementType: 'slider', properties: {} } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.uiElements.get('s')!.value).toBe(0);
  });

  it('toggle defaults to false', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'tg', elementType: 'toggle', properties: {} } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.uiElements.get('tg')!.value).toBe(false);
  });

  it('toggle honors explicit checked: true', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'tg', elementType: 'toggle', properties: { checked: true } } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.uiElements.get('tg')!.value).toBe(true);
  });

  it('non-matching elementType (button) gets no value default', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'b', elementType: 'button', properties: {} } as unknown as UI2DNode,
      ctx,
    );
    // No .value set for unrecognized elementTypes
    expect(ctx.uiElements.get('b')!.value).toBeUndefined();
  });
});

describe('executeUIElement — event handler registration', () => {
  it('registers events as "<name>.<event>" with wrapper calling handlerName', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      {
        type: 'ui2d',
        name: 'form',
        elementType: 'button',
        properties: {},
        events: { click: 'onSubmit', focus: 'onFocus' },
      } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.on).toHaveBeenCalledTimes(2);
    // First argument (event name) is composed from name + event
    expect((ctx.on as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('form.click');
    expect((ctx.on as ReturnType<typeof vi.fn>).mock.calls[1][0]).toBe('form.focus');
  });

  it('registered handlers invoke callFunction with handlerName when fired', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      {
        type: 'ui2d',
        name: 'w',
        elementType: 'button',
        properties: {},
        events: { click: 'onClick' },
      } as unknown as UI2DNode,
      ctx,
    );
    // Get the registered handler, invoke it, verify callFunction
    const [, registeredHandler] = (ctx.on as ReturnType<typeof vi.fn>).mock.calls[0];
    await registeredHandler();
    expect(ctx.callFunction).toHaveBeenCalledWith('onClick');
  });

  it('missing events object → no handlers registered', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'x', elementType: 'button', properties: {} } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.on).not.toHaveBeenCalled();
  });

  it('empty events object → no handlers registered', async () => {
    const ctx = makeCtx();
    await executeUIElement(
      { type: 'ui2d', name: 'x', elementType: 'button', properties: {}, events: {} } as unknown as UI2DNode,
      ctx,
    );
    expect(ctx.on).not.toHaveBeenCalled();
  });
});

describe('executeUIElement — return envelope', () => {
  it('output is the UIElementState instance that was registered', async () => {
    const ctx = makeCtx();
    const result = await executeUIElement(
      { type: 'ui2d', name: 'r', elementType: 'button', properties: { x: 1 } } as unknown as UI2DNode,
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe(ctx.uiElements.get('r'));
  });
});
