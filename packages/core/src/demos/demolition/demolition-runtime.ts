/**
 * demolition-runtime.ts
 *
 * Demolition runtime module registration.
 * Integrates demolition demo with HoloScript runtime system.
 */

import type { RuntimeModule, RuntimeExecutor } from '../../runtime/RuntimeRegistry';
import { RuntimeRegistry } from '../../runtime/RuntimeRegistry';
import { DemolitionRuntimeExecutor } from './DemolitionRuntimeExecutor';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

/**
 * Demolition Runtime Module
 */
export const DemolitionRuntime: RuntimeModule = {
  id: 'demolition',
  name: 'Explosive Demolition Runtime',
  version: '1.0.0',

  supportedTypes: ['demolition', 'explosion', 'destruction', 'scene'],

  capabilities: {
    physics: {
      gravity: true,
      collision: true,
      constraints: true,
      softBody: false,
      fluids: false,
    },
    rendering: {
      particles: true,
      lighting: false,
      shadows: false,
      postProcessing: true,
    },
    interaction: {
      userInput: true,
      gestures: false,
      voice: false,
      haptics: false,
    },
    platforms: ['unity', 'unreal', 'webxr', 'godot', 'babylon', 'playcanvas'],
    performance: {
      maxEntities: 1000,
      maxParticles: 120000,
      targetFPS: 60,
    },
  },

  metadata: {
    author: 'HoloScript',
    description:
      'Explosive demolition runtime with fracture physics, shock waves, debris particles, and structural collapse',
    documentation: 'https://holoscript.dev/docs/runtimes/demolition',
    repository: 'https://github.com/holoscript/holoscript',
    license: 'MIT',
    tags: [
      'physics',
      'demolition',
      'destruction',
      'particles',
      'fracture',
      'explosions',
      'structural',
    ],
  },

  initialize(composition: HoloComposition, config?: any): RuntimeExecutor {
    const executor = new DemolitionRuntimeExecutor(config);
    executor.loadComposition(composition);
    return executor;
  },
};

// Auto-register when module is imported
RuntimeRegistry.register(DemolitionRuntime);

console.log('[HoloScript] Demolition runtime registered');
