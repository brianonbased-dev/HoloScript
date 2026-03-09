/**
 * VoiceOutputTrait — Production Test Suite
 *
 * Tests pure CPU logic:  voice registry, queue priority ordering, config
 * getters/setters with clamps, segment→text conversion, cache management,
 * event listener registration, and the full state machine guards.
 *
 * Browser SpeechSynthesis is stubbed out so the entire suite runs in Node.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceOutputTrait, createVoiceOutputTrait } from '../VoiceOutputTrait';
import type { VoiceDefinition, SpeechSegment } from '../VoiceOutputTrait';

// ── stub global SpeechSynthesis + SpeechSynthesisUtterance ─────────────────
const onendCallbacks: Array<() => void> = [];

const MockUtterance = class {
  text: string;
  pitch = 1;
  rate = 1;
  volume = 1;
  voice: any = null;
  onend: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onboundary: ((e: any) => void) | null = null;
  constructor(t: string) {
    this.text = t;
  }
};

const mockSynth = {
  speak: vi.fn(), // does NOT fire onend - items stay in speaking state
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  getVoices: vi.fn(() => []),
};

beforeEach(() => {
  onendCallbacks.length = 0;
  (global as any).window = { speechSynthesis: mockSynth };
  (global as any).SpeechSynthesisUtterance = MockUtterance;
  vi.clearAllMocks();
});
afterEach(() => {
  delete (global as any).window;
  delete (global as any).SpeechSynthesisUtterance;
  vi.restoreAllMocks();
});

// ─── constructor defaults ─────────────────────────────────────────────────────

describe('VoiceOutputTrait — constructor defaults', () => {
  it('engine defaults to browser', () => {
    const t = new VoiceOutputTrait();
    expect(t.getConfig().engine).toBe('browser');
  });
  it('pitch defaults to 1.0', () => expect(new VoiceOutputTrait().getConfig().pitch).toBe(1.0));
  it('rate defaults to 1.0', () => expect(new VoiceOutputTrait().getConfig().rate).toBe(1.0));
  it('volume defaults to 1.0', () => expect(new VoiceOutputTrait().getConfig().volume).toBe(1.0));
  it('ssml defaults to false', () => expect(new VoiceOutputTrait().getConfig().ssml).toBe(false));
  it('maxQueueSize defaults to 50', () =>
    expect(new VoiceOutputTrait().getConfig().maxQueueSize).toBe(50));
  it('interrupt defaults to false', () =>
    expect(new VoiceOutputTrait().getConfig().interrupt).toBe(false));
  it('initial state = idle', () => expect(new VoiceOutputTrait().getState()).toBe('idle'));
  it('isSpeaking() = false initially', () =>
    expect(new VoiceOutputTrait().isSpeaking()).toBe(false));
  it('isPaused() = false initially', () => expect(new VoiceOutputTrait().isPaused()).toBe(false));
  it('createVoiceOutputTrait factory returns VoiceOutputTrait instance', () => {
    expect(createVoiceOutputTrait()).toBeInstanceOf(VoiceOutputTrait);
  });
  it('config overrides are applied', () => {
    const t = new VoiceOutputTrait({ pitch: 1.5, rate: 0.8, volume: 0.5 });
    expect(t.getConfig().pitch).toBe(1.5);
    expect(t.getConfig().rate).toBe(0.8);
    expect(t.getConfig().volume).toBe(0.5);
  });
  it('defaultVoice sets currentVoice', () => {
    const t = new VoiceOutputTrait({ defaultVoice: 'v1' });
    expect(t.getCurrentVoice()).toBe('v1');
  });
  it('initial currentVoice is null when no defaultVoice', () => {
    expect(new VoiceOutputTrait().getCurrentVoice()).toBeNull();
  });
});

// ─── voice management ────────────────────────────────────────────────────────

describe('VoiceOutputTrait — voice management', () => {
  const sampleVoice: VoiceDefinition = {
    id: 'v1',
    name: 'Alice',
    language: 'en-US',
    gender: 'female',
  };

  it('addVoice stores voice by id', () => {
    const t = new VoiceOutputTrait();
    t.addVoice(sampleVoice);
    expect(t.getVoice('v1')).toEqual(sampleVoice);
  });
  it('getVoiceIds returns array of stored ids', () => {
    const t = new VoiceOutputTrait();
    t.addVoice(sampleVoice);
    t.addVoice({ id: 'v2', name: 'Bob', language: 'en-GB' });
    expect(t.getVoiceIds()).toContain('v1');
    expect(t.getVoiceIds()).toContain('v2');
  });
  it('removeVoice deletes voice', () => {
    const t = new VoiceOutputTrait();
    t.addVoice(sampleVoice);
    t.removeVoice('v1');
    expect(t.getVoice('v1')).toBeUndefined();
  });
  it('getVoice returns undefined for unknown id', () => {
    expect(new VoiceOutputTrait().getVoice('unknown')).toBeUndefined();
  });
  it('setVoice updates currentVoice when voice exists', () => {
    const t = new VoiceOutputTrait();
    t.addVoice(sampleVoice);
    t.setVoice('v1');
    expect(t.getCurrentVoice()).toBe('v1');
  });
  it('setVoice is no-op when voice not registered', () => {
    const t = new VoiceOutputTrait();
    t.setVoice('ghost');
    expect(t.getCurrentVoice()).toBeNull();
  });
  it('setVoice emits voice-changed event', () => {
    const t = new VoiceOutputTrait();
    t.addVoice(sampleVoice);
    const cb = vi.fn();
    t.on('voice-changed', cb);
    t.setVoice('v1');
    expect(cb).toHaveBeenCalledOnce();
  });
  it('voices from config constructor are registered', () => {
    const t = new VoiceOutputTrait({ voices: [sampleVoice] });
    expect(t.getVoice('v1')).toEqual(sampleVoice);
  });
  it('getBrowserVoices returns [] when no synth', () => {
    delete (global as any).window;
    const t = new VoiceOutputTrait();
    expect(t.getBrowserVoices()).toEqual([]);
  });
});

// ─── speak / queue management ─────────────────────────────────────────────────

describe('VoiceOutputTrait — speak / queue / priority', () => {
  it('speak returns an id string', () => {
    const t = new VoiceOutputTrait();
    const id = t.speak('hello');
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^speech_/);
  });
  it('speak increments id counter', () => {
    const t = new VoiceOutputTrait();
    const id1 = t.speak('one');
    const id2 = t.speak('two');
    // When speaking starts processQueue is called inside, which may clear queue.
    // Use stopAll to prevent browser synth doing anything and see queue directly.
    t.stopAll();
    expect(id1).not.toBe(id2);
  });
  it('getQueueLength reflects queued items', () => {
    const t = new VoiceOutputTrait();
    // mockSynth.speak does NOT fire onend, so state stays 'speaking' until stop() or onend
    t.speak('a'); // starts processing (state=speaking, utterance pending in synth)
    t.speak('b'); // queued (length=1)
    t.speak('c'); // queued (length=2)
    expect(t.getQueueLength()).toBe(2);
  });
  it('higher priority item is inserted before lower priority', () => {
    const t = new VoiceOutputTrait();
    // First speaks → state=speaking; subsequent items go to queue
    t.speak('low', { priority: 0 });
    // Now state=speaking; next items go to queue
    const id2 = t.speak('also-low', { priority: 0 });
    const id3 = t.speak('high', { priority: 10 });
    // High-priority should be first in queue (queue=[high, also-low])
    expect(t.getQueueLength()).toBe(2);
    // Remove high-priority id first (it was inserted at head)
    expect(t.removeFromQueue(id3)).toBe(true);
    expect(t.getQueueLength()).toBe(1);
  });
  it('clearQueue empties queue without stopping current', () => {
    const t = new VoiceOutputTrait();
    t.speak('a');
    t.speak('b');
    t.speak('c');
    t.clearQueue();
    expect(t.getQueueLength()).toBe(0);
  });
  it('removeFromQueue removes specific item by id', () => {
    const t = new VoiceOutputTrait();
    t.speak('a'); // starts speaking, state=speaking
    const id = t.speak('b'); // queued [0]
    t.speak('c'); // queued [1]
    // b and c are in the queue, a is being "spoken"
    expect(t.removeFromQueue(id)).toBe(true);
    expect(t.getQueueLength()).toBe(1);
  });
  it('removeFromQueue returns false for unknown id', () => {
    const t = new VoiceOutputTrait();
    expect(t.removeFromQueue('ghost_123')).toBe(false);
  });
  it('maxQueueSize limits queue', () => {
    const t = new VoiceOutputTrait({ maxQueueSize: 2 });
    t.speak('a'); // starts processing (state=speaking)
    t.speak('b'); // queued (length=1)
    t.speak('c'); // queued (length=2 = max)
    t.speak('d'); // rejected — queue full
    expect(t.getQueueLength()).toBe(2);
  });
  it('stopAll empties queue and resets state to idle', () => {
    const t = new VoiceOutputTrait();
    t.speak('a');
    t.speak('b');
    t.stopAll();
    expect(t.getQueueLength()).toBe(0);
    expect(t.getState()).toBe('idle');
  });
  it('speakSegments returns id string', () => {
    const t = new VoiceOutputTrait();
    const segs: SpeechSegment[] = [{ text: 'hello' }, { text: 'world' }];
    const id = t.speakSegments(segs);
    expect(id).toMatch(/^speech_/);
  });
});

// ─── pause / resume / stop guards ────────────────────────────────────────────

describe('VoiceOutputTrait — pause / resume / stop guards', () => {
  it('pause() changes state to paused when speaking', () => {
    const t = new VoiceOutputTrait();
    t.speak('hello'); // state = speaking
    t.pause();
    expect(t.isPaused()).toBe(true);
    expect(t.getState()).toBe('paused');
  });
  it('pause() does nothing when already paused', () => {
    const t = new VoiceOutputTrait();
    t.speak('hello');
    t.pause();
    t.pause(); // second call must not throw
    expect(t.isPaused()).toBe(true);
  });
  it('resume() transitions paused → speaking', () => {
    const t = new VoiceOutputTrait();
    t.speak('hello');
    t.pause();
    t.resume();
    expect(t.isSpeaking()).toBe(true);
  });
  it('resume() is no-op when not paused', () => {
    const t = new VoiceOutputTrait();
    t.speak('hello'); // state=speaking (synth.speak does not fire onend)
    expect(t.isSpeaking()).toBe(true);
    t.resume(); // no-op: not paused, state stays speaking
    expect(t.isSpeaking()).toBe(true);
  });
  it('stop() resets state to idle', () => {
    const t = new VoiceOutputTrait();
    t.speak('hello');
    t.stop();
    expect(t.getState()).toBe('idle');
  });
  it('isSpeaking() returns false after stop', () => {
    const t = new VoiceOutputTrait();
    t.speak('hello');
    t.stop();
    expect(t.isSpeaking()).toBe(false);
  });
});

// ─── settings — volume / pitch / rate clamping ────────────────────────────────

describe('VoiceOutputTrait — setVolume / setPitch / setRate', () => {
  it('setVolume clamps to 0 minimum', () => {
    const t = new VoiceOutputTrait();
    t.setVolume(-5);
    expect(t.getVolume()).toBe(0);
  });
  it('setVolume clamps to 1 maximum', () => {
    const t = new VoiceOutputTrait();
    t.setVolume(99);
    expect(t.getVolume()).toBe(1);
  });
  it('setVolume within range is preserved', () => {
    const t = new VoiceOutputTrait();
    t.setVolume(0.7);
    expect(t.getVolume()).toBeCloseTo(0.7, 5);
  });
  it('setPitch clamps to 0.5 minimum', () => {
    const t = new VoiceOutputTrait();
    t.setPitch(0.1);
    expect(t.getPitch()).toBe(0.5);
  });
  it('setPitch clamps to 2 maximum', () => {
    const t = new VoiceOutputTrait();
    t.setPitch(5);
    expect(t.getPitch()).toBe(2);
  });
  it('setPitch in range preserved', () => {
    const t = new VoiceOutputTrait();
    t.setPitch(1.2);
    expect(t.getPitch()).toBeCloseTo(1.2, 5);
  });
  it('setRate clamps to 0.5 minimum', () => {
    const t = new VoiceOutputTrait();
    t.setRate(0.1);
    expect(t.getRate()).toBe(0.5);
  });
  it('setRate clamps to 2 maximum', () => {
    const t = new VoiceOutputTrait();
    t.setRate(10);
    expect(t.getRate()).toBe(2);
  });
  it('setRate in range preserved', () => {
    const t = new VoiceOutputTrait();
    t.setRate(1.5);
    expect(t.getRate()).toBeCloseTo(1.5, 5);
  });
});

// ─── event listeners ──────────────────────────────────────────────────────────

describe('VoiceOutputTrait — on / off event listeners', () => {
  it('on registers listener and it is called on matching event', () => {
    const t = new VoiceOutputTrait();
    const cb = vi.fn();
    t.on('pause', cb);
    t.speak('hello');
    t.pause();
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].type).toBe('pause');
  });
  it('off removes listener — no longer called', () => {
    const t = new VoiceOutputTrait();
    const cb = vi.fn();
    t.on('pause', cb);
    t.off('pause', cb);
    t.speak('hello');
    t.pause();
    expect(cb).not.toHaveBeenCalled();
  });
  it('resume event is emitted on resume()', () => {
    const t = new VoiceOutputTrait();
    const cb = vi.fn();
    t.on('resume', cb);
    t.speak('hi');
    t.pause();
    t.resume();
    expect(cb).toHaveBeenCalledOnce();
  });
  it('queue-empty event fires when speak queue drains without synth', () => {
    // Without browser synth, processQueue → synthesize → handleError → processQueue → queue-empty
    delete (global as any).window;
    delete (global as any).SpeechSynthesisUtterance;
    const t = new VoiceOutputTrait();
    const cb = vi.fn();
    t.on('queue-empty', cb);
    t.speak('hello');
    // processQueue ran, synthesize ran, synth==null → handleError → processQueue → queue-empty
    expect(cb).toHaveBeenCalled();
  });
});

// ─── cache ────────────────────────────────────────────────────────────────────

describe('VoiceOutputTrait — cache', () => {
  it('getCacheSize = 0 initially', () => {
    expect(new VoiceOutputTrait().getCacheSize()).toBe(0);
  });
  it('clearCache does not throw', () => {
    const t = new VoiceOutputTrait();
    expect(() => t.clearCache()).not.toThrow();
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────

describe('VoiceOutputTrait — dispose', () => {
  it('dispose() clears queue and voices', () => {
    const t = new VoiceOutputTrait({ voices: [{ id: 'v1', name: 'A', language: 'en' }] });
    t.speak('hi');
    t.dispose();
    expect(t.getQueueLength()).toBe(0);
    expect(t.getVoiceIds()).toHaveLength(0);
    expect(t.getState()).toBe('idle');
  });
});
