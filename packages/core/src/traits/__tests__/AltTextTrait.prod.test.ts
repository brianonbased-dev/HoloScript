/**
 * AltTextTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { altTextHandler } from '../AltTextTrait';

function makeNode(extras: any = {}) {
  return { id: 'alt_node', ...extras };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}, nodeExtras: any = {}) {
  const node = makeNode(nodeExtras);
  const ctx = makeCtx();
  const config = { ...altTextHandler.defaultConfig!, ...cfg };
  altTextHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('altTextHandler.defaultConfig', () => {
  const d = altTextHandler.defaultConfig!;
  it('text=""', () => expect(d.text).toBe(''));
  it('verbose=""', () => expect(d.verbose).toBe(''));
  it('language=en', () => expect(d.language).toBe('en'));
  it('auto_generate=false', () => expect(d.auto_generate).toBe(false));
  it('context_aware=true', () => expect(d.context_aware).toBe(true));
  it('include_spatial=false', () => expect(d.include_spatial).toBe(false));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('altTextHandler.onAttach', () => {
  it('creates __altTextState', () => expect(attach().node.__altTextState).toBeDefined());
  it('isRegistered=false initially', () =>
    expect(attach().node.__altTextState.isRegistered).toBe(false));
  it('generatedText=null', () => expect(attach().node.__altTextState.generatedText).toBeNull());
  it('isGenerating=false', () => expect(attach().node.__altTextState.isGenerating).toBe(false));
  it('emits alt_text_register when text is set', () => {
    const { ctx } = attach({ text: 'A red cube' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_register',
      expect.objectContaining({ text: 'A red cube' })
    );
  });
  it('sets isRegistered=true after text register', () => {
    const { node } = attach({ text: 'A cube' });
    expect(node.__altTextState.isRegistered).toBe(true);
  });
  it('includes verbose in alt_text_register', () => {
    const { ctx } = attach({ text: 'Cube', verbose: 'A shiny red cube with sharp corners' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_register',
      expect.objectContaining({ verbose: 'A shiny red cube with sharp corners' })
    );
  });
  it('includes language in alt_text_register', () => {
    const { ctx } = attach({ text: 'Cube', language: 'fr' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_register',
      expect.objectContaining({ language: 'fr' })
    );
  });
  it('no alt_text_register when text is empty', () => {
    const { ctx } = attach({ text: '', auto_generate: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('alt_text_register', expect.anything());
  });
  it('emits alt_text_generate_request when auto_generate=true and text empty', () => {
    const { ctx } = attach({ text: '', auto_generate: true });
    expect(ctx.emit).toHaveBeenCalledWith('alt_text_generate_request', expect.anything());
  });
  it('sets isGenerating=true when auto_generate=true', () => {
    const { node } = attach({ text: '', auto_generate: true });
    expect(node.__altTextState.isGenerating).toBe(true);
  });
  it('alt_text_generate_request includes contextAware flag', () => {
    const { ctx } = attach({ text: '', auto_generate: true, context_aware: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_generate_request',
      expect.objectContaining({ contextAware: true })
    );
  });
  it('alt_text_generate_request includes includeSpatial flag', () => {
    const { ctx } = attach({ text: '', auto_generate: true, include_spatial: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_generate_request',
      expect.objectContaining({ includeSpatial: true })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('altTextHandler.onDetach', () => {
  it('removes __altTextState', () => {
    const { node, config, ctx } = attach();
    altTextHandler.onDetach!(node, config, ctx);
    expect(node.__altTextState).toBeUndefined();
  });
  it('emits alt_text_unregister', () => {
    const { node, config, ctx } = attach({ text: 'Cube' });
    ctx.emit.mockClear();
    altTextHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('alt_text_unregister', expect.anything());
  });
});

// ─── onEvent — alt_text_generated ────────────────────────────────────────────

describe('altTextHandler.onEvent — alt_text_generated', () => {
  it('stores generatedText', () => {
    const { node, ctx, config } = attach({ text: '', auto_generate: true });
    altTextHandler.onEvent!(node, config, ctx, {
      type: 'alt_text_generated',
      text: 'AI says: a sphere',
    });
    expect(node.__altTextState.generatedText).toBe('AI says: a sphere');
  });
  it('sets isGenerating=false', () => {
    const { node, ctx, config } = attach({ text: '', auto_generate: true });
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_generated', text: 'Sphere' });
    expect(node.__altTextState.isGenerating).toBe(false);
  });
  it('sets isRegistered=true', () => {
    const { node, ctx, config } = attach({ text: '', auto_generate: true });
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_generated', text: 'Sphere' });
    expect(node.__altTextState.isRegistered).toBe(true);
  });
  it('emits alt_text_register with generated text', () => {
    const { node, ctx, config } = attach({ text: '', auto_generate: true });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, {
      type: 'alt_text_generated',
      text: 'Sphere',
      verbose: 'A round sphere',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_register',
      expect.objectContaining({ text: 'Sphere', verbose: 'A round sphere' })
    );
  });
  it('verbose defaults to empty string when not provided', () => {
    const { node, ctx, config } = attach({ text: '', auto_generate: true });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_generated', text: 'Sphere' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_register')!;
    expect(call[1].verbose).toBe('');
  });
});

// ─── onEvent — alt_text_query ─────────────────────────────────────────────────

describe('altTextHandler.onEvent — alt_text_query', () => {
  it('returns config.text for brief verbosity', () => {
    const { node, ctx, config } = attach({ text: 'Red cube' });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, {
      type: 'alt_text_query',
      queryId: 'q1',
      verbosity: 'brief',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).toBe('Red cube');
  });
  it('returns config.verbose for verbose verbosity when set', () => {
    const { node, ctx, config } = attach({
      text: 'Red cube',
      verbose: 'A small red metallic cube',
    });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, {
      type: 'alt_text_query',
      queryId: 'q1',
      verbosity: 'verbose',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).toBe('A small red metallic cube');
  });
  it('falls back to config.text when verbose is empty', () => {
    const { node, ctx, config } = attach({ text: 'Red cube', verbose: '' });
    altTextHandler.onEvent!(node, config, ctx, {
      type: 'alt_text_query',
      queryId: 'q2',
      verbosity: 'verbose',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).toBe('Red cube');
  });
  it('falls back to generatedText when config.text is empty', () => {
    const { node, ctx, config } = attach({ text: '', auto_generate: false });
    node.__altTextState.generatedText = 'Generated: sphere';
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_query', queryId: 'q3' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).toBe('Generated: sphere');
  });
  it('passes queryId through in alt_text_response', () => {
    const { node, ctx, config } = attach({ text: 'Cube' });
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_query', queryId: 'myQuery' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].queryId).toBe('myQuery');
  });
  it('includes language in alt_text_response', () => {
    const { node, ctx, config } = attach({ text: 'Cube', language: 'de' });
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_query', queryId: 'q' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].language).toBe('de');
  });
  it('appends spatial info when include_spatial=true and node has position', () => {
    const { node, ctx, config } = attach(
      { text: 'Cube', include_spatial: true },
      { position: { x: 1.5, y: 2.0, z: -3.0 } }
    );
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_query', queryId: 'q' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).toContain('1.5');
    expect(call[1].text).toContain('2.0');
    expect(call[1].text).toContain('-3.0');
  });
  it('no spatial suffix when include_spatial=false', () => {
    const { node, ctx, config } = attach(
      { text: 'Cube', include_spatial: false },
      { position: { x: 1, y: 2, z: 3 } }
    );
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_query', queryId: 'q' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).not.toContain('Located at');
  });
  it('no spatial suffix when node has no position', () => {
    const { node, ctx, config } = attach({ text: 'Cube', include_spatial: true });
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_query', queryId: 'q' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_response')!;
    expect(call[1].text).not.toContain('Located at');
  });
});

// ─── onEvent — alt_text_update ────────────────────────────────────────────────

describe('altTextHandler.onEvent — alt_text_update', () => {
  it('emits alt_text_register with new text', () => {
    const { node, ctx, config } = attach({ text: 'Old text' });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_update', text: 'New text' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'alt_text_register',
      expect.objectContaining({ text: 'New text' })
    );
  });
  it('uses event.verbose when provided; falls back to config.verbose', () => {
    const { node, ctx, config } = attach({ text: 'Cube', verbose: 'Default verbose' });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, {
      type: 'alt_text_update',
      text: 'New cube',
      verbose: 'Extra detail',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_register')!;
    expect(call[1].verbose).toBe('Extra detail');
  });
  it('retains config.verbose when event.verbose not provided', () => {
    const { node, ctx, config } = attach({ text: 'Cube', verbose: 'Config verbose' });
    ctx.emit.mockClear();
    altTextHandler.onEvent!(node, config, ctx, { type: 'alt_text_update', text: 'New cube' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'alt_text_register')!;
    expect(call[1].verbose).toBe('Config verbose');
  });
});
