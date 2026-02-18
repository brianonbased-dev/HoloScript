/**
 * Runtime Registry Modules Production Tests
 *
 * Tests for PhysicsEngine, NavigationEngine, AssetStreamer, and
 * SpeechRecognizer — all share the same interface+registry pattern:
 * registry Map + register() + get() functions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  physicsEngineRegistry, registerPhysicsEngine, getPhysicsEngine,
} from '../PhysicsEngine';
import {
  navigationEngineRegistry, registerNavigationEngine, getNavigationEngine,
} from '../NavigationEngine';
import {
  assetStreamerRegistry, registerAssetStreamer, getAssetStreamer,
} from '../AssetStreamer';
import {
  speechRecognizerRegistry, registerSpeechRecognizer, getSpeechRecognizer,
} from '../SpeechRecognizer';

const mockImpl = (name: string) => ({ _name: name } as any);

describe('Runtime Registries — Production', () => {

  // ======== PHYSICS ENGINE ========

  describe('PhysicsEngine registry', () => {
    beforeEach(() => physicsEngineRegistry.clear());

    it('registers and retrieves an engine', () => {
      const engine = mockImpl('webgpu');
      registerPhysicsEngine('webgpu', engine);
      expect(getPhysicsEngine('webgpu')).toBe(engine);
    });

    it('returns undefined for unknown engine', () => {
      expect(getPhysicsEngine('nonexistent')).toBeUndefined();
    });

    it('overwrites existing registration', () => {
      registerPhysicsEngine('physx', mockImpl('v1'));
      const v2 = mockImpl('v2');
      registerPhysicsEngine('physx', v2);
      expect(getPhysicsEngine('physx')).toBe(v2);
    });
  });

  // ======== NAVIGATION ENGINE ========

  describe('NavigationEngine registry', () => {
    beforeEach(() => navigationEngineRegistry.clear());

    it('registers and retrieves an engine', () => {
      const engine = mockImpl('recast');
      registerNavigationEngine('recast', engine);
      expect(getNavigationEngine('recast')).toBe(engine);
    });

    it('returns undefined for unknown engine', () => {
      expect(getNavigationEngine('missing')).toBeUndefined();
    });
  });

  // ======== ASSET STREAMER ========

  describe('AssetStreamer registry', () => {
    beforeEach(() => assetStreamerRegistry.clear());

    it('registers and retrieves a streamer', () => {
      const streamer = mockImpl('draco');
      registerAssetStreamer('draco', streamer);
      expect(getAssetStreamer('draco')).toBe(streamer);
    });

    it('returns undefined for unknown streamer', () => {
      expect(getAssetStreamer('nope')).toBeUndefined();
    });
  });

  // ======== SPEECH RECOGNIZER ========

  describe('SpeechRecognizer registry', () => {
    beforeEach(() => speechRecognizerRegistry.clear());

    it('registers and retrieves a recognizer', () => {
      const rec = mockImpl('whisper');
      registerSpeechRecognizer('whisper', rec);
      expect(getSpeechRecognizer('whisper')).toBe(rec);
    });

    it('returns undefined for unknown recognizer', () => {
      expect(getSpeechRecognizer('missing')).toBeUndefined();
    });
  });
});
