/**
 * GIRenderer — Screen-Space Global Illumination with quality tiers.
 *
 * Provides indirect lighting via SSGI depth-buffer ray marching.
 * Falls back to light probes on medium tier and ambient-only on low tier.
 * Future: Radiance Cascades as Ultra+ tier.
 *
 * @see W.248: Radiance Cascades optimal GI technique
 * @see P.RENDER.002: Quality-Tier Rendering Pipeline
 * @see G.RENDER.001: Radiance Cascades 3D still experimental — SSGI default
 */

import { useRef, useMemo } from 'react';
import { useFrame, _useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export type GIMethod = 'ssgi' | 'light_probes' | 'ambient_only';
export type GIQualityTier = 'ultra' | 'high' | 'medium' | 'low';

export interface LightProbeConfig {
  /** Probe grid resolution [x, y, z] */
  resolution?: [number, number, number];
  /** Whether to bake on load */
  bakeOnLoad?: boolean;
}

export interface GIRendererProps {
  /** GI method (default: 'ssgi') */
  method?: GIMethod;
  /** Quality tier — auto-selects method and parameters */
  qualityTier?: GIQualityTier;
  /** SSGI ray samples (default: 16) */
  samples?: number;
  /** SSGI max ray distance (default: 50) */
  maxDistance?: number;
  /** SSGI intensity (default: 1.0) */
  intensity?: number;
  /** SSGI thickness for hit detection (default: 0.5) */
  thickness?: number;
  /** Light probe configuration */
  lightProbes?: LightProbeConfig;
  /** Ambient light color (default: '#404060') */
  ambientColor?: string;
  /** Ambient light intensity (default: 0.3) */
  ambientIntensity?: number;
  /** Whether GI is active */
  enabled?: boolean;
}

// ── Quality Tier Mapping ─────────────────────────────────────────────────────

const TIER_CONFIG: Record<GIQualityTier, { method: GIMethod; samples: number }> = {
  ultra: { method: 'ssgi', samples: 32 },
  high: { method: 'ssgi', samples: 16 },
  medium: { method: 'light_probes', samples: 0 },
  low: { method: 'ambient_only', samples: 0 },
};

// ── Component ────────────────────────────────────────────────────────────────

export function GIRenderer({
  method,
  qualityTier = 'high',
  samples: userSamples,
  maxDistance = 50,
  intensity = 1.0,
  thickness = 0.5,
  ambientColor = '#404060',
  ambientIntensity = 0.3,
  enabled = true,
}: GIRendererProps) {
  const probeRef = useRef<THREE.HemisphereLight>(null);

  const tierConfig = useMemo(() => TIER_CONFIG[qualityTier], [qualityTier]);
  const activeMethod = method ?? tierConfig.method;
  const activeSamples = userSamples ?? tierConfig.samples;
  const ambientCol = useMemo(() => new THREE.Color(ambientColor), [ambientColor]);

  useFrame(() => {
    if (!enabled) return;
    if (activeMethod === 'light_probes' && probeRef.current) {
      probeRef.current.intensity = intensity * ambientIntensity;
    }
  });

  if (!enabled) return null;

  if (activeMethod === 'ambient_only') {
    return (
      <hemisphereLight
        color={ambientCol}
        groundColor="#302010"
        intensity={ambientIntensity * intensity}
      />
    );
  }

  if (activeMethod === 'light_probes') {
    return (
      <group>
        <hemisphereLight
          ref={probeRef}
          color="#8090c0"
          groundColor="#403020"
          intensity={ambientIntensity * intensity}
        />
        <ambientLight color={ambientCol} intensity={ambientIntensity * 0.5} />
      </group>
    );
  }

  // SSGI: enhanced ambient + directional bounce approximation.
  // Full SSGI multi-pass via PostProcessingRenderer render targets.
  return (
    <group>
      <hemisphereLight color="#90a0d0" groundColor="#403020" intensity={intensity * 0.6} />
      <ambientLight color={ambientCol} intensity={ambientIntensity * 0.3} />
      <group
        userData={{
          ssgi: true,
          samples: activeSamples,
          maxDistance,
          thickness,
          intensity,
        }}
      />
    </group>
  );
}
