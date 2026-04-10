import { describe, it, expect, beforeEach } from 'vitest';
import { subtitleHandler } from '../SubtitleTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('SubtitleTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    language: 'en',
    position: 'bottom' as const,
    font_size: 16,
    background: true,
    background_opacity: 0.7,
    max_lines: 3,
    line_duration: 5000,
    auto_translate: [] as string[],
    speaker_colors: false,
    speaker_labels: true,
    word_highlight: false,
  };

  beforeEach(() => {
    node = createMockNode('sub');
    ctx = createMockContext();
    attachTrait(subtitleHandler, node, cfg, ctx);
  });

  it('initializes and emits init event', () => {
    expect((node as any).__subtitleState.isDisplaying).toBe(false);
    expect(getEventCount(ctx, 'subtitle_init')).toBe(1);
  });

  it('subtitle_text adds line and displays', () => {
    sendEvent(subtitleHandler, node, cfg, ctx, {
      type: 'subtitle_text',
      text: 'Hello',
      speaker: 'Alice',
    });
    const s = (node as any).__subtitleState;
    expect(s.isDisplaying).toBe(true);
    expect(s.lines.length).toBe(1);
    expect(s.currentSpeaker).toBe('Alice');
    expect(getEventCount(ctx, 'on_subtitle_display')).toBe(1);
    expect(getEventCount(ctx, 'subtitle_render')).toBe(1);
  });

  it('trims lines beyond max_lines', () => {
    for (let i = 0; i < 5; i++) {
      sendEvent(subtitleHandler, node, cfg, ctx, {
        type: 'subtitle_text',
        text: `Line ${i}`,
        speaker: 'A',
      });
    }
    expect((node as any).__subtitleState.lines.length).toBe(3);
  });

  it('auto_translate triggers translation events', () => {
    const transCfg = { ...cfg, auto_translate: ['es', 'fr'] };
    const n2 = createMockNode('tran');
    const c2 = createMockContext();
    attachTrait(subtitleHandler, n2, transCfg, c2);
    sendEvent(subtitleHandler, n2, transCfg, c2, {
      type: 'subtitle_text',
      text: 'Hello',
      speaker: 'A',
      language: 'en',
    });
    expect(getEventCount(c2, 'subtitle_translate')).toBe(2);
  });

  it('translation_complete emits ready', () => {
    sendEvent(subtitleHandler, node, cfg, ctx, {
      type: 'subtitle_translation_complete',
      translatedText: 'Hola',
      targetLang: 'es',
    });
    expect(getEventCount(ctx, 'subtitle_translation_ready')).toBe(1);
  });

  it('speech_recognition final adds line', () => {
    sendEvent(subtitleHandler, node, cfg, ctx, {
      type: 'speech_recognition_result',
      text: 'Hey',
      isFinal: true,
      speaker: 'Bob',
    });
    expect((node as any).__subtitleState.lines.length).toBe(1);
  });

  it('start/stop recognition', () => {
    sendEvent(subtitleHandler, node, cfg, ctx, { type: 'subtitle_start_recognition' });
    expect((node as any).__subtitleState.speechRecognitionActive).toBe(true);
    expect(getEventCount(ctx, 'speech_recognition_start')).toBe(1);
    sendEvent(subtitleHandler, node, cfg, ctx, { type: 'subtitle_stop_recognition' });
    expect((node as any).__subtitleState.speechRecognitionActive).toBe(false);
  });

  it('clear removes all lines', () => {
    sendEvent(subtitleHandler, node, cfg, ctx, { type: 'subtitle_text', text: 'X', speaker: 'A' });
    sendEvent(subtitleHandler, node, cfg, ctx, { type: 'subtitle_clear' });
    expect((node as any).__subtitleState.lines.length).toBe(0);
    expect(getEventCount(ctx, 'subtitle_hide')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(subtitleHandler, node, cfg, ctx, { type: 'subtitle_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'subtitle_info') as any;
    expect(r.isDisplaying).toBe(false);
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    (node as any).__subtitleState.speechRecognitionActive = true;
    subtitleHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__subtitleState).toBeUndefined();
    expect(getEventCount(ctx, 'subtitle_stop_recognition')).toBe(1);
    expect(getEventCount(ctx, 'subtitle_destroy')).toBe(1);
  });
});
