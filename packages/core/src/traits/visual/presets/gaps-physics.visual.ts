/**
 * Visual presets for GAPS physics traits.
 *
 * Provides R3F material/rendering hints for the new unified physics,
 * weather, and world state traits from the GAPS roadmap.
 */
import type { TraitVisualConfig } from '../types';

export const GAPS_PHYSICS_VISUALS: Map<string, TraitVisualConfig> = new Map([
  // --- Pillar A: Unified Physics ---
  [
    'fluid',
    {
      material: {
        type: 'physical',
        color: '#1a6fc4',
        metalness: 0.0,
        roughness: 0.05,
        transmission: 0.95,
        ior: 1.33,
        thickness: 0.5,
      },
      layers: [
        {
          type: 'effect',
          name: 'ssfr',
          priority: 50,
          config: {
            resolutionScale: 0.5,
            absorptionColor: [0.4, 0.04, 0.0],
            absorptionStrength: 2.0,
            fresnelPower: 0.02,
            refractionStrength: 0.1,
          },
        },
      ],
    },
  ],
  [
    'soft_body_pro',
    {
      material: {
        type: 'physical',
        color: '#e8a87c',
        metalness: 0.0,
        roughness: 0.6,
      },
      layers: [
        {
          type: 'deformation',
          name: 'pbd_tearing',
          priority: 45,
          config: { tearThreshold: 0.8, tearColor: '#8b0000' },
        },
      ],
    },
  ],
  [
    'crowd_sim',
    {
      material: {
        type: 'standard',
        color: '#7b68ee',
      },
      layers: [
        {
          type: 'instanced',
          name: 'crowd_instances',
          priority: 30,
          config: { maxInstances: 10000, lodLevels: 3 },
        },
      ],
    },
  ],
  [
    'deformable_terrain',
    {
      material: {
        type: 'standard',
        color: '#8b7355',
        roughness: 0.9,
      },
      layers: [
        {
          type: 'displacement',
          name: 'heightmap_erosion',
          priority: 40,
          config: { displacementScale: 5.0 },
        },
      ],
    },
  ],
  [
    'volumetric_clouds',
    {
      material: {
        type: 'shader',
        color: '#ffffff',
      },
      layers: [
        {
          type: 'volumetric',
          name: 'cloud_raymarcher',
          priority: 80,
          config: {
            absorptionCoeff: 0.04,
            scatteringCoeff: 0.06,
            phaseG: 0.3,
            maxSteps: 64,
          },
        },
      ],
    },
  ],
  [
    'god_rays',
    {
      material: {
        type: 'shader',
        color: '#fffde7',
      },
      layers: [
        {
          type: 'post_process',
          name: 'volumetric_light',
          priority: 85,
          config: { decay: 0.96, weight: 0.5, exposure: 0.3, samples: 100 },
        },
      ],
    },
  ],

  // --- Weather Hub ---
  [
    'weather',
    {
      material: {
        type: 'none',
        color: '#87ceeb',
      },
      layers: [
        {
          type: 'ambient',
          name: 'weather_atmosphere',
          priority: 90,
          config: { affectsLighting: true, affectsFog: true },
        },
      ],
    },
  ],

  // --- Pillar B: Persistent World ---
  [
    'world_state',
    {
      material: {
        type: 'none',
        color: '#4a90d9',
      },
      layers: [],
    },
  ],
  [
    'spatial_voice',
    {
      material: {
        type: 'none',
        color: '#90ee90',
      },
      layers: [
        {
          type: 'indicator',
          name: 'voice_range',
          priority: 10,
          config: { showRadius: true, radiusColor: '#90ee9040' },
        },
      ],
    },
  ],
  [
    'lip_sync',
    {
      material: {
        type: 'none',
        color: '#ffb6c1',
      },
      layers: [
        {
          type: 'morph',
          name: 'viseme_blendshapes',
          priority: 60,
          config: { blendShapePrefix: 'viseme_' },
        },
      ],
    },
  ],

  // --- Pillar C: Living Economy ---
  [
    'ai_companion',
    {
      material: {
        type: 'standard',
        color: '#dda0dd',
        emissive: '#330033',
        emissiveIntensity: 0.2,
      },
      layers: [
        {
          type: 'indicator',
          name: 'ai_thinking',
          priority: 15,
          config: { pulseColor: '#9b59b6', pulseSpeed: 1.5 },
        },
      ],
    },
  ],
  [
    'token_gated',
    {
      material: {
        type: 'standard',
        color: '#ffd700',
        metalness: 0.8,
        roughness: 0.2,
      },
      layers: [
        {
          type: 'barrier',
          name: 'token_gate_barrier',
          priority: 70,
          config: { barrierColor: '#ffd70060', shimmer: true },
        },
      ],
    },
  ],
  [
    'moderation',
    {
      material: {
        type: 'none',
        color: '#ff6347',
      },
      layers: [],
    },
  ],
  [
    'anti_grief',
    {
      material: {
        type: 'none',
        color: '#32cd32',
      },
      layers: [
        {
          type: 'shield',
          name: 'grief_shield',
          priority: 95,
          config: { shieldColor: '#32cd3230' },
        },
      ],
    },
  ],
]);
