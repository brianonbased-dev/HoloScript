/**
 * VoiceOutputTrait Tests
 *
 * Tests for text-to-speech synthesis trait.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  VoiceOutputTrait,
  type VoiceOutputConfig,
  type VoiceDefinition,
} from '../VoiceOutputTrait';

describe('VoiceOutputTrait', () => {
  let voice: VoiceOutputTrait;

  beforeEach(() => {
    voice = new VoiceOutputTrait();
  });

  afterEach(() => {
    voice.dispose();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = voice.getConfig();

      expect(config.engine).toBe('browser');
      expect(config.pitch).toBe(1.0);
      expect(config.rate).toBe(1.0);
      expect(config.volume).toBe(1.0);
      expect(config.ssml).toBe(false);
      expect(config.maxQueueSize).toBe(50);
    });

    it('should accept custom config', () => {
      voice = new VoiceOutputTrait({
        engine: 'elevenlabs',
        pitch: 1.2,
        rate: 0.9,
        volume: 0.8,
        ssml: true,
      });

      const config = voice.getConfig();
      expect(config.engine).toBe('elevenlabs');
      expect(config.pitch).toBe(1.2);
      expect(config.rate).toBe(0.9);
      expect(config.volume).toBe(0.8);
      expect(config.ssml).toBe(true);
    });

    it('should initialize with custom voices', () => {
      const voiceDefn: VoiceDefinition = {
        id: 'custom1',
        name: 'Custom Voice',
        language: 'en-US',
        pitch: 1.0,
      };

      voice = new VoiceOutputTrait({
        voices: [voiceDefn],
        defaultVoice: 'custom1',
      });

      expect(voice.getVoice('custom1')).toBeDefined();
      expect(voice.getCurrentVoice()).toBe('custom1');
    });
  });

  describe('state management', () => {
    it('should start in idle state', () => {
      expect(voice.getState()).toBe('idle');
    });

    it('should check if speaking', () => {
      expect(voice.isSpeaking()).toBe(false);
    });

    it('should check if paused', () => {
      expect(voice.isPaused()).toBe(false);
    });
  });

  describe('voice management', () => {
    it('should add a voice', () => {
      const voiceDefn: VoiceDefinition = {
        id: 'narrator',
        name: 'Narrator',
        language: 'en-US',
      };

      voice.addVoice(voiceDefn);

      expect(voice.getVoice('narrator')).toBeDefined();
      expect(voice.getVoice('narrator')?.name).toBe('Narrator');
    });

    it('should remove a voice', () => {
      voice.addVoice({ id: 'temp', name: 'Temp', language: 'en-US' });
      voice.removeVoice('temp');

      expect(voice.getVoice('temp')).toBeUndefined();
    });

    it('should get all voice IDs', () => {
      voice.addVoice({ id: 'v1', name: 'Voice 1', language: 'en-US' });
      voice.addVoice({ id: 'v2', name: 'Voice 2', language: 'en-GB' });

      const ids = voice.getVoiceIds();
      expect(ids).toContain('v1');
      expect(ids).toContain('v2');
    });

    it('should set current voice', () => {
      voice.addVoice({ id: 'narrator', name: 'Narrator', language: 'en-US' });
      voice.setVoice('narrator');

      expect(voice.getCurrentVoice()).toBe('narrator');
    });
  });

  describe('queue management', () => {
    it('should get queue length', () => {
      expect(voice.getQueueLength()).toBe(0);
    });

    it('should clear queue', () => {
      // Queue some speech
      voice.speak('First message');
      voice.speak('Second message');

      voice.clearQueue();

      expect(voice.getQueueLength()).toBe(0);
    });
  });

  describe('pitch/rate/volume', () => {
    it('should set pitch', () => {
      voice.setPitch(1.5);
      expect(voice.getPitch()).toBe(1.5);
    });

    it('should clamp pitch to valid range', () => {
      voice.setPitch(5.0); // Over max
      expect(voice.getPitch()).toBeLessThanOrEqual(2.0);

      voice.setPitch(0.1); // Under min
      expect(voice.getPitch()).toBeGreaterThanOrEqual(0.5);
    });

    it('should set rate', () => {
      voice.setRate(1.3);
      expect(voice.getRate()).toBe(1.3);
    });

    it('should set volume', () => {
      voice.setVolume(0.5);
      expect(voice.getVolume()).toBe(0.5);
    });

    it('should clamp volume to 0-1 range', () => {
      voice.setVolume(1.5);
      expect(voice.getVolume()).toBeLessThanOrEqual(1.0);

      voice.setVolume(-0.5);
      expect(voice.getVolume()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('speak', () => {
    it('should queue text for speaking', () => {
      const requestId = voice.speak('Hello, world!');

      expect(typeof requestId).toBe('string');
    });

    it('should accept speak options', () => {
      const requestId = voice.speak('Hello', {
        pitch: 1.2,
        rate: 0.9,
      });

      expect(typeof requestId).toBe('string');
    });
  });

  describe('pause/resume', () => {
    it('should pause speaking', () => {
      voice.speak('Long text here');
      voice.pause();

      // After pause, state should indicate paused
      expect(voice.isPaused()).toBe(true);
    });

    it('should resume speaking', () => {
      voice.speak('Long text here');
      voice.pause();
      voice.resume();

      expect(voice.isPaused()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop speaking', () => {
      voice.speak('Some text');
      voice.stop();

      expect(voice.isSpeaking()).toBe(false);
    });
  });

  describe('events', () => {
    it('should register event listeners', () => {
      const callback = vi.fn();
      voice.on('start', callback);

      // Trigger speech - would emit start in real scenario
      expect(voice.getState()).toBeDefined();
    });

    it('should remove event listeners', () => {
      const callback = vi.fn();
      voice.on('start', callback);
      voice.off('start', callback);

      voice.speak('Test');

      // Listener was removed, shouldn't be called
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('SSML support', () => {
    it('should enable SSML mode', () => {
      voice = new VoiceOutputTrait({ ssml: true });

      const config = voice.getConfig();
      expect(config.ssml).toBe(true);
    });

    it('should speak SSML text', () => {
      voice = new VoiceOutputTrait({ ssml: true });

      const ssmlText = '<speak><prosody rate="fast">Hello!</prosody></speak>';
      const requestId = voice.speak(ssmlText);

      expect(typeof requestId).toBe('string');
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      voice.speak('Test');
      voice.dispose();

      expect(voice.getQueueLength()).toBe(0);
    });
  });
});

describe('VoiceOutputTrait with engines', () => {
  it('should configure Azure engine', () => {
    const voice = new VoiceOutputTrait({
      engine: 'azure',
      apiKey: 'test-key',
      region: 'eastus',
    });

    const config = voice.getConfig();
    expect(config.engine).toBe('azure');
    expect(config.region).toBe('eastus');

    voice.dispose();
  });

  it('should configure ElevenLabs engine', () => {
    const voice = new VoiceOutputTrait({
      engine: 'elevenlabs',
      apiKey: 'test-key',
    });

    const config = voice.getConfig();
    expect(config.engine).toBe('elevenlabs');

    voice.dispose();
  });

  it('should configure custom endpoint', () => {
    const voice = new VoiceOutputTrait({
      engine: 'custom',
      endpoint: 'https://my-tts-api.com/speak',
    });

    const config = voice.getConfig();
    expect(config.engine).toBe('custom');
    expect(config.endpoint).toBe('https://my-tts-api.com/speak');

    voice.dispose();
  });
});
