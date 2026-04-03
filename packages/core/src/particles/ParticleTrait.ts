/**
 * ParticleTrait.ts
 *
 * Declarative particle attachment for HoloScript+ nodes.
 * Allows any node to emit particles via the trait system.
 *
 * @trait particles
 */

import type { TraitHandler } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { ParticleSystem, EmitterConfig } from './ParticleSystem';
import { ParticlePresets } from './ParticlePresets';
import * as Affectors from './ParticleAffectors';

// =============================================================================
// CONFIG
// =============================================================================

export interface ParticleTraitConfig {
  /** Preset name (key from ParticlePresets) */
  preset?: string;
  /** Custom emitter config (overrides preset) */
  emitter?: Partial<EmitterConfig>;
  /** Affectors to apply */
  affectors?: string[];
  /** Whether to follow the node's position */
  followNode: boolean;
  /** Whether to auto-start emitting on attach */
  autoStart: boolean;
}

// Per-node particle systems
const nodeSystems = new Map<string, ParticleSystem>();

const defaultConfig: ParticleTraitConfig = {
  preset: 'sparks',
  followNode: true,
  autoStart: true,
};

// Built-in affector registry
const affectorRegistry: Record<string, (p: any, delta: number) => void> = {
  gravity: Affectors.gravity(-9.81),
  lightGravity: Affectors.gravity(-2.0),
  wind: Affectors.wind(0.5, 0, 0),
  turbulence: Affectors.turbulence(1.0),
  drag: Affectors.drag(0.98),
  floorBounce: Affectors.floorBounce(0, 0.6),
};

export const particleTraitHandler: TraitHandler<ParticleTraitConfig> = {
  name: 'particles',
  defaultConfig,

  onAttach(node: HSPlusNode, config: ParticleTraitConfig, _context: any) {
    const nodeId = node.id!;

    // Build emitter config from preset + overrides
    const presetConfig = config.preset ? ParticlePresets[config.preset] : ParticlePresets.sparks;

    if (!presetConfig) return;

    const emitterConfig: EmitterConfig = {
      ...presetConfig,
      ...(config.emitter || {}),
    };

    // Override position from node
    if (config.followNode && node.properties?.position) {
      const pos = node.properties.position as any;
      emitterConfig.position = { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 };
    }

    const system = new ParticleSystem(emitterConfig);

    // Apply affectors
    if (config.affectors) {
      for (const name of config.affectors) {
        if (affectorRegistry[name]) {
          system.addAffector(affectorRegistry[name]);
        }
      }
    }

    system.setEmitting(config.autoStart !== false);

    // Handle burst
    if (emitterConfig.burst && config.autoStart !== false) {
      system.burst(emitterConfig.burst);
    }

    nodeSystems.set(nodeId, system);
  },

  onDetach(node: HSPlusNode, _config: ParticleTraitConfig, _context: any) {
    nodeSystems.delete(node.id!);
  },

  onUpdate(node: HSPlusNode, config: ParticleTraitConfig, _context: any, delta: number) {
    const system = nodeSystems.get(node.id!);
    if (!system) return;

    // Follow node position
    if (config.followNode && node.properties?.position) {
      const pos = node.properties.position as any;
      system.setPosition(pos.x || 0, pos.y || 0, pos.z || 0);
    }

    system.update(delta);

    // Surface particle data on node for renderer
    if (node.properties) {
      (node.properties as any)._particles = system.getAliveParticles();
      (node.properties as any)._particleCount = system.getActiveCount();
    }
  },
};

/**
 * Get the ParticleSystem for a given node (for external control).
 */
export function getNodeParticleSystem(nodeId: string): ParticleSystem | undefined {
  return nodeSystems.get(nodeId);
}
