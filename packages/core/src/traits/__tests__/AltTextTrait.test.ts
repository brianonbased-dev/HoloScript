import { describe, it, expect, beforeEach } from 'vitest';
import { altTextHandler } from '../AltTextTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('AltTextTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    text: 'A red cube',
    verbose: 'A red cube with rounded edges on a table',
    language: 'en',
    auto_generate: false,
    context_aware: true,
    include_spatial: false,
  };

  beforeEach(() => {
    node = createMockNode('at');
    ctx = createMockContext();
    attachTrait(altTextHandler, node, cfg, ctx);
  });

  it('registers text on attach', () => {
    expect(getEventCount(ctx, 'alt_text_register')).toBe(1);
    expect((node as any).__altTextState.isRegistered).toBe(true);
  });

  it('auto_generate requests generation when no text', () => {
    const n = createMockNode('at2');
    const c = createMockContext();
    attachTrait(altTextHandler, n, { ...cfg, text: '', auto_generate: true }, c);
    expect(getEventCount(c, 'alt_text_generate_request')).toBe(1);
    expect((n as any).__altTextState.isGenerating).toBe(true);
  });

  it('generated text registers', () => {
    const n = createMockNode('at3');
    const c = createMockContext();
    attachTrait(altTextHandler, n, { ...cfg, text: '', auto_generate: true }, c);
    sendEvent(altTextHandler, n, { ...cfg, text: '', auto_generate: true }, c, {
      type: 'alt_text_generated',
      text: 'Generated desc',
      verbose: 'Long desc',
    });
    expect((n as any).__altTextState.generatedText).toBe('Generated desc');
    expect((n as any).__altTextState.isRegistered).toBe(true);
  });

  it('query returns brief text', () => {
    sendEvent(altTextHandler, node, cfg, ctx, {
      type: 'alt_text_query',
      queryId: 'q1',
      verbosity: 'brief',
    });
    const resp = getLastEvent(ctx, 'alt_text_response');
    expect(resp.text).toBe('A red cube');
  });

  it('query returns verbose text', () => {
    sendEvent(altTextHandler, node, cfg, ctx, {
      type: 'alt_text_query',
      queryId: 'q2',
      verbosity: 'verbose',
    });
    const resp = getLastEvent(ctx, 'alt_text_response');
    expect(resp.text).toBe('A red cube with rounded edges on a table');
  });

  it('spatial context appends position', () => {
    (node as any).position = { x: 1, y: 2, z: 3 };
    const spatialCfg = { ...cfg, include_spatial: true };
    sendEvent(altTextHandler, node, spatialCfg, ctx, { type: 'alt_text_query', queryId: 'q3' });
    const resp = getLastEvent(ctx, 'alt_text_response');
    expect(resp.text).toContain('1.0');
  });

  it('update re-registers', () => {
    sendEvent(altTextHandler, node, cfg, ctx, { type: 'alt_text_update', text: 'Updated text' });
    expect(getEventCount(ctx, 'alt_text_register')).toBe(2);
  });

  it('detach unregisters', () => {
    altTextHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'alt_text_unregister')).toBe(1);
    expect((node as any).__altTextState).toBeUndefined();
  });
});
