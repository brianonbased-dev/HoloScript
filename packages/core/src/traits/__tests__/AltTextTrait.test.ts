import { describe, it, expect, beforeEach } from 'vitest';
import { altTextHandler } from '../AltTextTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('AltTextTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    text: 'A red chair',
    verbose: 'A red wooden chair positioned near the window',
    language: 'en',
    auto_generate: false,
    context_aware: true,
    include_spatial: false,
  };

  beforeEach(() => {
    node = createMockNode('chair');
    ctx = createMockContext();
    attachTrait(altTextHandler, node, cfg, ctx);
  });

  it('registers alt text on attach', () => {
    expect(getEventCount(ctx, 'alt_text_register')).toBe(1);
    expect((node as any).__altTextState.isRegistered).toBe(true);
  });

  it('auto_generate requests generation', () => {
    const n2 = createMockNode('auto');
    const c2 = createMockContext();
    attachTrait(altTextHandler, n2, { ...cfg, text: '', auto_generate: true }, c2);
    expect(getEventCount(c2, 'alt_text_generate_request')).toBe(1);
    expect((n2 as any).__altTextState.isGenerating).toBe(true);
  });

  it('generated text gets registered', () => {
    const n2 = createMockNode('gen');
    const c2 = createMockContext();
    attachTrait(altTextHandler, n2, { ...cfg, text: '', auto_generate: true }, c2);
    sendEvent(altTextHandler, n2, { ...cfg, text: '', auto_generate: true }, c2, { type: 'alt_text_generated', text: 'AI chair', verbose: '' });
    expect((n2 as any).__altTextState.generatedText).toBe('AI chair');
    expect((n2 as any).__altTextState.isRegistered).toBe(true);
  });

  it('query returns brief text', () => {
    sendEvent(altTextHandler, node, cfg, ctx, { type: 'alt_text_query', queryId: 'q1', verbosity: 'brief' });
    const r = getLastEvent(ctx, 'alt_text_response') as any;
    expect(r.text).toBe('A red chair');
  });

  it('query returns verbose text', () => {
    sendEvent(altTextHandler, node, cfg, ctx, { type: 'alt_text_query', queryId: 'q2', verbosity: 'verbose' });
    const r = getLastEvent(ctx, 'alt_text_response') as any;
    expect(r.text).toContain('wooden chair');
  });

  it('query appends spatial info when configured', () => {
    (node as any).position = { x: 1, y: 2, z: 3 };
    const spatialCfg = { ...cfg, include_spatial: true };
    sendEvent(altTextHandler, node, spatialCfg, ctx, { type: 'alt_text_query', queryId: 'q3' });
    const r = getLastEvent(ctx, 'alt_text_response') as any;
    expect(r.text).toContain('Located at');
  });

  it('update event re-registers', () => {
    ctx.clearEvents();
    sendEvent(altTextHandler, node, cfg, ctx, { type: 'alt_text_update', text: 'Blue chair' });
    expect(getEventCount(ctx, 'alt_text_register')).toBe(1);
  });

  it('cleans up on detach', () => {
    altTextHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__altTextState).toBeUndefined();
    expect(getEventCount(ctx, 'alt_text_unregister')).toBe(1);
  });
});
