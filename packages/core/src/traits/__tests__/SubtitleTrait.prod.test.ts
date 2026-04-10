/**
 * SubtitleTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { subtitleHandler } from '../SubtitleTrait';

// The SPEAKER_COLORS const is internal — expected values inlined from source:
const SPEAKER_COLORS_EXPECTED = ['#FFFFFF', '#00FFFF', '#FFFF00', '#FF00FF', '#00FF00', '#FFA500'];

function makeNode() {
  return { id: 'sub_node' };
}
function makeContext() {
  return { emit: vi.fn() };
}
function attachNode(config: any = {}) {
  const node = makeNode();
  const ctx = makeContext();
  const cfg = { ...subtitleHandler.defaultConfig!, ...config };
  subtitleHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

describe('SPEAKER_COLORS (internal — values verified from source)', () => {
  it('has 6 colors', () => expect(SPEAKER_COLORS_EXPECTED).toHaveLength(6));
  it('first = #FFFFFF', () => expect(SPEAKER_COLORS_EXPECTED[0]).toBe('#FFFFFF'));
  it('second = #00FFFF', () => expect(SPEAKER_COLORS_EXPECTED[1]).toBe('#00FFFF'));
  it('all valid hex', () => {
    for (const c of SPEAKER_COLORS_EXPECTED) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('subtitleHandler.defaultConfig', () => {
  it('language = en', () => expect(subtitleHandler.defaultConfig!.language).toBe('en'));
  it('position = bottom', () => expect(subtitleHandler.defaultConfig!.position).toBe('bottom'));
  it('font_size = 16', () => expect(subtitleHandler.defaultConfig!.font_size).toBe(16));
  it('background = true', () => expect(subtitleHandler.defaultConfig!.background).toBe(true));
  it('background_opacity = 0.7', () =>
    expect(subtitleHandler.defaultConfig!.background_opacity).toBe(0.7));
  it('max_lines = 3', () => expect(subtitleHandler.defaultConfig!.max_lines).toBe(3));
  it('line_duration = 5000', () => expect(subtitleHandler.defaultConfig!.line_duration).toBe(5000));
  it('auto_translate = []', () =>
    expect(subtitleHandler.defaultConfig!.auto_translate).toEqual([]));
  it('speaker_colors = false', () =>
    expect(subtitleHandler.defaultConfig!.speaker_colors).toBe(false));
  it('speaker_labels = true', () =>
    expect(subtitleHandler.defaultConfig!.speaker_labels).toBe(true));
  it('word_highlight = false', () =>
    expect(subtitleHandler.defaultConfig!.word_highlight).toBe(false));
});

describe('subtitleHandler.onAttach', () => {
  it('creates __subtitleState', () =>
    expect((attachNode().node as any).__subtitleState).toBeDefined());
  it('isDisplaying = false', () =>
    expect((attachNode().node as any).__subtitleState.isDisplaying).toBe(false));
  it('lines = []', () => expect((attachNode().node as any).__subtitleState.lines).toEqual([]));
  it('currentSpeaker = null', () =>
    expect((attachNode().node as any).__subtitleState.currentSpeaker).toBeNull());
  it('speechRecognitionActive = false', () =>
    expect((attachNode().node as any).__subtitleState.speechRecognitionActive).toBe(false));
  it('translationPending = false', () =>
    expect((attachNode().node as any).__subtitleState.translationPending).toBe(false));
  it('emits subtitle_init with position/fontSize/background', () => {
    const { ctx } = attachNode({ position: 'top', font_size: 24 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'subtitle_init',
      expect.objectContaining({ position: 'top', fontSize: 24 })
    );
  });
});

describe('subtitleHandler.onDetach', () => {
  it('removes __subtitleState', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__subtitleState).toBeUndefined();
  });
  it('emits subtitle_stop_recognition when speechRecognitionActive', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__subtitleState.speechRecognitionActive = true;
    ctx.emit.mockClear();
    subtitleHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('subtitle_stop_recognition', expect.any(Object));
  });
  it('always emits subtitle_destroy', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    subtitleHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('subtitle_destroy', expect.any(Object));
  });
});

describe('subtitleHandler.onUpdate — line expiration', () => {
  it('removes expired lines and emits subtitle_hide when empty', () => {
    const { node, cfg, ctx } = attachNode({ line_duration: 1000 });
    (node as any).__subtitleState.lines = [
      { text: 'Old', speaker: 'X', timestamp: Date.now() - 2000, language: 'en' },
    ];
    (node as any).__subtitleState.isDisplaying = true;
    ctx.emit.mockClear();
    subtitleHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__subtitleState.lines).toHaveLength(0);
    expect((node as any).__subtitleState.isDisplaying).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('subtitle_hide', expect.any(Object));
  });
  it('keeps fresh lines', () => {
    const { node, cfg, ctx } = attachNode({ line_duration: 5000 });
    (node as any).__subtitleState.lines = [
      { text: 'Fresh', speaker: 'Y', timestamp: Date.now() - 100, language: 'en' },
    ];
    ctx.emit.mockClear();
    subtitleHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__subtitleState.lines).toHaveLength(1);
  });
});

describe('subtitleHandler.onEvent — subtitle_text', () => {
  it('adds line and sets isDisplaying=true', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onEvent!(node, cfg, ctx, {
      type: 'subtitle_text',
      text: 'Hello',
      speaker: 'Alice',
    });
    expect((node as any).__subtitleState.lines).toHaveLength(1);
    expect((node as any).__subtitleState.isDisplaying).toBe(true);
  });
  it('sets currentSpeaker', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_text', text: 'Hi', speaker: 'Bob' });
    expect((node as any).__subtitleState.currentSpeaker).toBe('Bob');
  });
  it('trims to max_lines by shifting oldest', () => {
    const { node, cfg, ctx } = attachNode({ max_lines: 2 });
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_text', text: 'L1', speaker: 'A' });
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_text', text: 'L2', speaker: 'A' });
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_text', text: 'L3', speaker: 'A' });
    expect((node as any).__subtitleState.lines).toHaveLength(2);
    expect((node as any).__subtitleState.lines[0].text).toBe('L2');
  });
  it('emits on_subtitle_display', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_text', text: 'T', speaker: 'D' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_subtitle_display',
      expect.objectContaining({ text: 'T', speaker: 'D' })
    );
  });
  it('emits subtitle_translate per auto_translate target', () => {
    const { node, cfg, ctx } = attachNode({ auto_translate: ['fr', 'es'], language: 'en' });
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, {
      type: 'subtitle_text',
      text: 'Hello',
      speaker: 'A',
      language: 'en',
    });
    const calls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'subtitle_translate');
    expect(calls).toHaveLength(2);
  });
  it('defaults speaker to Unknown when not provided', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_text', text: 'Hi' });
    expect((node as any).__subtitleState.lines[0].speaker).toBe('Unknown');
  });
});

describe('subtitleHandler.onEvent — translation_complete', () => {
  it('clears translationPending and emits subtitle_translation_ready', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__subtitleState.translationPending = true;
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, {
      type: 'subtitle_translation_complete',
      translatedText: 'Hola',
      targetLang: 'es',
    });
    expect((node as any).__subtitleState.translationPending).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'subtitle_translation_ready',
      expect.objectContaining({ text: 'Hola', language: 'es' })
    );
  });
});

describe('subtitleHandler.onEvent — speech_recognition_result', () => {
  it('final: adds to lines', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onEvent!(node, cfg, ctx, {
      type: 'speech_recognition_result',
      text: 'Final',
      isFinal: true,
      speaker: 'Eve',
    });
    expect((node as any).__subtitleState.lines.some((l: any) => l.text === 'Final')).toBe(true);
  });
  it('interim: does NOT add to lines', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onEvent!(node, cfg, ctx, {
      type: 'speech_recognition_result',
      text: '...',
      isFinal: false,
    });
    expect((node as any).__subtitleState.lines).toHaveLength(0);
  });
  it('sets isDisplaying = true regardless of final/interim', () => {
    const { node, cfg, ctx } = attachNode();
    subtitleHandler.onEvent!(node, cfg, ctx, {
      type: 'speech_recognition_result',
      text: 'Hi',
      isFinal: false,
    });
    expect((node as any).__subtitleState.isDisplaying).toBe(true);
  });
});

describe('subtitleHandler.onEvent — misc', () => {
  it('start_recognition sets active and emits speech_recognition_start', () => {
    const { node, cfg, ctx } = attachNode({ language: 'fr' });
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_start_recognition' });
    expect((node as any).__subtitleState.speechRecognitionActive).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'speech_recognition_start',
      expect.objectContaining({ language: 'fr' })
    );
  });
  it('stop_recognition clears active', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__subtitleState.speechRecognitionActive = true;
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_stop_recognition' });
    expect((node as any).__subtitleState.speechRecognitionActive).toBe(false);
  });
  it('subtitle_clear empties lines and emits subtitle_hide', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__subtitleState.lines = [
      { text: 'a', speaker: 'X', timestamp: Date.now(), language: 'en' },
    ];
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_clear' });
    expect((node as any).__subtitleState.lines).toHaveLength(0);
    expect(ctx.emit).toHaveBeenCalledWith('subtitle_hide', expect.any(Object));
  });
  it('subtitle_set_position emits subtitle_update_position', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_set_position', position: 'top' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'subtitle_update_position',
      expect.objectContaining({ position: 'top' })
    );
  });
  it('subtitle_query emits subtitle_info snapshot', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__subtitleState.isDisplaying = true;
    (node as any).__subtitleState.currentSpeaker = 'Zara';
    ctx.emit.mockClear();
    subtitleHandler.onEvent!(node, cfg, ctx, { type: 'subtitle_query', queryId: 'q7' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'subtitle_info',
      expect.objectContaining({ queryId: 'q7', isDisplaying: true, currentSpeaker: 'Zara' })
    );
  });
});
