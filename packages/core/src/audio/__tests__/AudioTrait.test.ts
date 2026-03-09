import { describe, it, expect, beforeEach, vi } from 'vitest';
import { audioTraitHandler, setSharedAudioEngine, getSharedAudioEngine } from '../AudioTrait';
import type { AudioTraitConfig } from '../AudioTrait';

// Mock AudioEngine
function mockEngine() {
  return {
    play: vi.fn(() => 'source_1'),
    stop: vi.fn(),
    setSourcePosition: vi.fn(),
  };
}

// Mock HSPlusNode
function mockNode(id: string, pos = { x: 0, y: 0, z: 0 }) {
  return {
    id,
    properties: { position: pos },
  };
}

describe('AudioTrait', () => {
  let engine: ReturnType<typeof mockEngine>;

  beforeEach(() => {
    engine = mockEngine();
    setSharedAudioEngine(engine as any);
  });

  // --- Shared engine ---
  it('setSharedAudioEngine / getSharedAudioEngine', () => {
    expect(getSharedAudioEngine()).toBe(engine);
  });

  it('getSharedAudioEngine creates fallback when null', () => {
    setSharedAudioEngine(null as any);
    // The function creates a new AudioEngine if null
    const e = getSharedAudioEngine();
    expect(e).toBeDefined();
  });

  // --- Handler metadata ---
  it('handler has name and defaultConfig', () => {
    expect(audioTraitHandler.name).toBe('audio');
    expect(audioTraitHandler.defaultConfig).toBeDefined();
    expect(audioTraitHandler.defaultConfig.volume).toBe(1);
    expect(audioTraitHandler.defaultConfig.spatialize).toBe(true);
  });

  // --- onAttach ---
  it('onAttach plays sound when autoPlay is true', () => {
    const node = mockNode('n1');
    const config: AudioTraitConfig = {
      ...audioTraitHandler.defaultConfig,
      soundId: 'click.mp3',
      autoPlay: true,
    };
    audioTraitHandler.onAttach(node as any, config, {});
    expect(engine.play).toHaveBeenCalledWith(
      'click.mp3',
      expect.objectContaining({
        volume: 1,
        spatialize: true,
      })
    );
  });

  it('onAttach does nothing without soundId', () => {
    const node = mockNode('n2');
    const config: AudioTraitConfig = {
      ...audioTraitHandler.defaultConfig,
      soundId: '',
    };
    audioTraitHandler.onAttach(node as any, config, {});
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('onAttach does nothing when autoPlay is false', () => {
    const node = mockNode('n3');
    const config: AudioTraitConfig = {
      ...audioTraitHandler.defaultConfig,
      soundId: 'sound.mp3',
      autoPlay: false,
    };
    audioTraitHandler.onAttach(node as any, config, {});
    expect(engine.play).not.toHaveBeenCalled();
  });

  // --- onDetach ---
  it('onDetach stops audio source', () => {
    const node = mockNode('n4');
    const config: AudioTraitConfig = {
      ...audioTraitHandler.defaultConfig,
      soundId: 'music.mp3',
      autoPlay: true,
    };
    audioTraitHandler.onAttach(node as any, config, {});
    audioTraitHandler.onDetach(node as any, config, {});
    expect(engine.stop).toHaveBeenCalledWith('source_1');
  });

  it('onDetach does nothing if no source tracked', () => {
    const node = mockNode('n5');
    const config = audioTraitHandler.defaultConfig;
    // Should not throw
    audioTraitHandler.onDetach(node as any, config, {});
    expect(engine.stop).not.toHaveBeenCalled();
  });

  // --- onUpdate ---
  it('onUpdate syncs position from node', () => {
    const node = mockNode('n6', { x: 5, y: 10, z: -3 });
    const config: AudioTraitConfig = {
      ...audioTraitHandler.defaultConfig,
      soundId: 'step.mp3',
      autoPlay: true,
    };
    audioTraitHandler.onAttach(node as any, config, {});
    // Move node
    (node.properties.position as any) = { x: 20, y: 0, z: 0 };
    audioTraitHandler.onUpdate(node as any, config, {}, 0.016);
    expect(engine.setSourcePosition).toHaveBeenCalledWith('source_1', { x: 20, y: 0, z: 0 });
  });

  it('onUpdate does nothing without tracked source', () => {
    const node = mockNode('n7');
    const config = audioTraitHandler.defaultConfig;
    audioTraitHandler.onUpdate(node as any, config, {}, 0.016);
    expect(engine.setSourcePosition).not.toHaveBeenCalled();
  });
});
