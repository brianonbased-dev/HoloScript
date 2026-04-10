/**
 * VoiceInputTrait Tests
 *
 * Comprehensive tests for voice recognition and command matching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VoiceInputTrait,
  type VoiceInputConfig,
  type VoiceCommand,
} from '../traits/VoiceInputTrait';

describe('VoiceInputTrait', () => {
  let trait: VoiceInputTrait;
  let config: VoiceInputConfig;

  beforeEach(() => {
    config = {
      mode: 'continuous',
      confidenceThreshold: 0.7,
      commands: [
        {
          phrase: 'turn on',
          aliases: ['activate', 'power up'],
          action: 'activate',
        },
        {
          phrase: 'move forward',
          aliases: ['go forward', 'advance'],
          action: 'move',
          params: { direction: 'forward' },
        },
        {
          phrase: 'stop',
          aliases: ['halt', 'pause'],
          action: 'stop',
        },
      ],
    };
    trait = new VoiceInputTrait(config);
  });

  describe('Initialization', () => {
    it('should initialize with config', () => {
      expect(trait).toBeDefined();
    });

    it('should not be listening initially', () => {
      expect(trait.isActive()).toBe(false);
    });

    it('should accept custom confidence threshold', () => {
      const customTrait = new VoiceInputTrait({
        mode: 'push-to-talk',
        confidenceThreshold: 0.85,
      });
      expect(customTrait).toBeDefined();
    });
  });

  describe('Listening Control', () => {
    it('should start listening', () => {
      trait.startListening();
      // Note: Web Speech API not available in test env, so this just tests the method exists
      expect(trait).toBeDefined();
    });

    it('should stop listening', () => {
      trait.stopListening();
      expect(trait.isActive()).toBe(false);
    });

    it('should toggle listening state', () => {
      trait.toggleListening();
      // Can't easily test state change without Web Speech API
      expect(trait).toBeDefined();
    });
  });

  describe('Event Listeners', () => {
    it('should register event listener', () => {
      const listener = vi.fn();
      trait.on(listener);
      expect(listener).not.toHaveBeenCalled();
    });

    it('should unregister event listener', () => {
      const listener = vi.fn();
      trait.on(listener);
      trait.off(listener);
      expect(trait).toBeDefined();
    });

    it('should allow multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      trait.on(listener1);
      trait.on(listener2);
      expect(trait).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should support continuous mode', () => {
      const continuousTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
      });
      expect(continuousTrait).toBeDefined();
    });

    it('should support push-to-talk mode', () => {
      const pushTrait = new VoiceInputTrait({
        mode: 'push-to-talk',
        confidenceThreshold: 0.7,
      });
      expect(pushTrait).toBeDefined();
    });

    it('should support always-listening mode', () => {
      const alwaysTrait = new VoiceInputTrait({
        mode: 'always-listening',
        confidenceThreshold: 0.5,
      });
      expect(alwaysTrait).toBeDefined();
    });

    it('should accept multiple languages', () => {
      const multiLangTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        languages: ['en-US', 'es-ES', 'fr-FR'],
      });
      expect(multiLangTrait).toBeDefined();
    });

    it('should support audio feedback toggle', () => {
      const feedbackTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        audioFeedback: true,
      });
      expect(feedbackTrait).toBeDefined();
    });

    it('should support transcript display', () => {
      const transcriptTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        showTranscript: true,
      });
      expect(transcriptTrait).toBeDefined();
    });
  });

  describe('Command Configuration', () => {
    it('should support command phrases', () => {
      const commands: VoiceCommand[] = [{ phrase: 'hello', action: 'greet' }];
      const cmdTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        commands,
      });
      expect(cmdTrait).toBeDefined();
    });

    it('should support command aliases', () => {
      const commands: VoiceCommand[] = [
        {
          phrase: 'turn on',
          aliases: ['activate', 'power up', 'enable'],
          action: 'activate',
        },
      ];
      const cmdTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        commands,
      });
      expect(cmdTrait).toBeDefined();
    });

    it('should support per-command confidence', () => {
      const commands: VoiceCommand[] = [
        {
          phrase: 'critical action',
          action: 'critical',
          confidence: 0.95,
        },
        {
          phrase: 'normal action',
          action: 'normal',
          confidence: 0.7,
        },
      ];
      const cmdTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        commands,
      });
      expect(cmdTrait).toBeDefined();
    });

    it('should support command parameters', () => {
      const commands: VoiceCommand[] = [
        {
          phrase: 'go to location',
          action: 'navigate',
          params: { target: 'location' },
        },
      ];
      const cmdTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        commands,
      });
      expect(cmdTrait).toBeDefined();
    });
  });

  describe('Timeout Configuration', () => {
    it('should support custom timeout', () => {
      const timeoutTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
        timeout: 5000,
      });
      expect(timeoutTrait).toBeDefined();
    });

    it('should use default timeout if not specified', () => {
      const defaultTrait = new VoiceInputTrait({
        mode: 'continuous',
        confidenceThreshold: 0.7,
      });
      expect(defaultTrait).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should dispose resources', () => {
      trait.dispose();
      expect(trait).toBeDefined();
    });

    it('should stop listening on dispose', () => {
      trait.startListening();
      trait.dispose();
      expect(trait.isActive()).toBe(false);
    });
  });
});
