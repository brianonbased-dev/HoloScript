/**
 * AudioTrait.ts
 *
 * Declarative audio attachment for HoloScript+ nodes.
 * Plays spatial audio from a node's position in 3D space.
 *
 * @trait audio
 */

import type { TraitHandler } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { AudioEngine } from './AudioEngine';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// =============================================================================
// CONFIG
// =============================================================================

export interface AudioTraitConfig {
  soundId: string;
  volume: number;
  loop: boolean;
  spatialize: boolean;
  maxDistance: number;
  refDistance: number;
  rolloffFactor: number;
  channel: string;
  autoPlay: boolean;
  pitch: number;
}

// Per-node source tracking
const nodeAudioSources = new Map<string, string>(); // nodeId -> sourceId

// Shared engine reference
let sharedAudioEngine: AudioEngine | null = null;

export function setSharedAudioEngine(engine: AudioEngine): void {
  sharedAudioEngine = engine;
}

export function getSharedAudioEngine(): AudioEngine {
  if (!sharedAudioEngine) {
    sharedAudioEngine = new AudioEngine();
  }
  return sharedAudioEngine;
}

const defaultConfig: AudioTraitConfig = {
  soundId: '',
  volume: 1,
  loop: false,
  spatialize: true,
  maxDistance: 50,
  refDistance: 1,
  rolloffFactor: 1,
  channel: 'master',
  autoPlay: true,
  pitch: 1,
};

export const audioTraitHandler: TraitHandler<AudioTraitConfig> = {
  name: 'audio' as const,
  defaultConfig,

  onAttach(node: HSPlusNode, config: AudioTraitConfig, _context: any) {
    if (!config.soundId || !config.autoPlay) return;

    const engine = getSharedAudioEngine();
    const nodeId = node.id!;
    const pos = (node.properties?.position as any) || { x: 0, y: 0, z: 0 };

    const sourceId = engine.play(config.soundId, {
      position: pos,
      volume: config.volume,
      pitch: config.pitch,
      loop: config.loop,
      maxDistance: config.maxDistance,
      refDistance: config.refDistance,
      rolloffFactor: config.rolloffFactor,
      spatialize: config.spatialize,
      channel: config.channel,
    });

    nodeAudioSources.set(nodeId, sourceId);
  },

  onDetach(node: HSPlusNode, _config: AudioTraitConfig, _context: any) {
    const nodeId = node.id!;
    const sourceId = nodeAudioSources.get(nodeId);
    if (sourceId) {
      getSharedAudioEngine().stop(sourceId);
      nodeAudioSources.delete(nodeId);
    }
  },

  onUpdate(node: HSPlusNode, _config: AudioTraitConfig, _context: any, _delta: number) {
    const nodeId = node.id!;
    const sourceId = nodeAudioSources.get(nodeId);
    if (!sourceId) return;

    // Sync source position with node position
    const pos = (node.properties?.position as any) || { x: 0, y: 0, z: 0 };
    getSharedAudioEngine().setSourcePosition(sourceId, pos);
  },
};
