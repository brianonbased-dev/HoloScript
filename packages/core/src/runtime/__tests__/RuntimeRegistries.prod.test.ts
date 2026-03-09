/**
 * Runtime Registries Production Tests
 *
 * Tests register/get for PhysicsEngine, NavigationEngine, AssetStreamer, SpeechRecognizer registries.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { physicsEngineRegistry, registerPhysicsEngine, getPhysicsEngine } from '../PhysicsEngine';
import {
  navigationEngineRegistry,
  registerNavigationEngine,
  getNavigationEngine,
} from '../NavigationEngine';
import { assetStreamerRegistry, registerAssetStreamer, getAssetStreamer } from '../AssetStreamer';
import {
  speechRecognizerRegistry,
  registerSpeechRecognizer,
  getSpeechRecognizer,
} from '../SpeechRecognizer';

const mockEngine = () =>
  ({
    initialize: async () => {},
    addBody: () => {},
    removeBody: () => {},
    updateBody: () => {},
    applyForce: () => {},
    step: () => {},
    getStates: () => ({}),
    dispose: () => {},
  }) as any;

describe('Runtime Registries — Production', () => {
  beforeEach(() => {
    physicsEngineRegistry.clear();
    navigationEngineRegistry.clear();
    assetStreamerRegistry.clear();
    speechRecognizerRegistry.clear();
  });

  describe('PhysicsEngine registry', () => {
    it('register + get', () => {
      const eng = mockEngine();
      registerPhysicsEngine('webgpu', eng);
      expect(getPhysicsEngine('webgpu')).toBe(eng);
    });

    it('returns undefined for unknown', () => {
      expect(getPhysicsEngine('nope')).toBeUndefined();
    });

    it('overwrites same name', () => {
      const a = mockEngine();
      const b = mockEngine();
      registerPhysicsEngine('gpu', a);
      registerPhysicsEngine('gpu', b);
      expect(getPhysicsEngine('gpu')).toBe(b);
    });
  });

  describe('NavigationEngine registry', () => {
    it('register + get', () => {
      const eng = mockEngine();
      registerNavigationEngine('recast', eng);
      expect(getNavigationEngine('recast')).toBe(eng);
    });

    it('returns undefined for unknown', () => {
      expect(getNavigationEngine('nope')).toBeUndefined();
    });
  });

  describe('AssetStreamer registry', () => {
    it('register + get', () => {
      const eng = mockEngine();
      registerAssetStreamer('threejs', eng);
      expect(getAssetStreamer('threejs')).toBe(eng);
    });

    it('returns undefined for unknown', () => {
      expect(getAssetStreamer('nope')).toBeUndefined();
    });
  });

  describe('SpeechRecognizer registry', () => {
    it('register + get', () => {
      const eng = mockEngine();
      registerSpeechRecognizer('whisper', eng);
      expect(getSpeechRecognizer('whisper')).toBe(eng);
    });

    it('returns undefined for unknown', () => {
      expect(getSpeechRecognizer('nope')).toBeUndefined();
    });
  });
});
