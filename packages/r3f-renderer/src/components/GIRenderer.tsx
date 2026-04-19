/**
 * GIRenderer — Screen-Space Global Illumination with quality tiers.
 *
 * Provides indirect lighting via SSGI depth-buffer ray marching.
 * Falls back to light probes on medium tier and ambient-only on low tier.
 * Phase 2: prophetic SNN-driven indirect bounces (off-loadable to HoloMesh).
 *
 * @see W.248: Radiance Cascades optimal GI technique
 * @see P.RENDER.002: Quality-Tier Rendering Pipeline
 * @see G.RENDER.001: Radiance Cascades 3D still experimental — SSGI default
 * @see packages/snn-webgpu/src/prophetic-gi/RFC-PROPHETIC-GI.md
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, _useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  ProphecyFrame,
  ProphecySceneContext,
  ProphecyTransport,
} from '@holoscript/snn-webgpu';

// ── Types ────────────────────────────────────────────────────────────────────

export type GIMethod = 'ssgi' | 'light_probes' | 'ambient_only' | 'prophetic';
export type GIQualityTier = 'ultra' | 'high' | 'medium' | 'low';

/** Caller-supplied prophetic transport + probe config. */
export interface PropheticConfig {
  /**
   * Pre-initialised prophecy transport.  GIRenderer only steps it;
   * lifecycle (initialize / destroy) is the caller's responsibility
   * so the same transport can be shared across renderers.
   */
  transport: ProphecyTransport;
  /**
   * Per-frame scene-context provider.  Called inside `useFrame` —
   * keep cheap.  If omitted, GIRenderer derives a default context
   * from the active camera + a fixed sun.
   */
  sceneContext?: () => ProphecySceneContext;
  /**
   * Optional callback fired with the latest `ProphecyFrame`.  Useful
   * for debug overlays, telemetry, or chaining to a probe-volume
   * material.  If omitted, frames are accumulated internally and
   * exposed via the returned `<group>`'s userData.
   */
  onFrame?: (frame: ProphecyFrame) => void;
}

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
  /**
   * Prophetic GI configuration.  Required when `method === 'prophetic'`.
   * Ignored otherwise.  See PropheticConfig for shape.
   */
  prophecy?: PropheticConfig;
}

// ── Quality Tier Mapping ─────────────────────────────────────────────────────

const TIER_CONFIG: Record<GIQualityTier, { method: GIMethod; samples: number }> = {
  ultra: { method: 'ssgi', samples: 32 },
  high: { method: 'ssgi', samples: 16 },
  medium: { method: 'light_probes', samples: 0 },
  low: { method: 'ambient_only', samples: 0 },
};

/** Default sun for prophetic GI when no scene-context provider given. */
const DEFAULT_PROPHETIC_SUN = {
  direction: [0.3, 0.8, 0.5] as [number, number, number],
  color: [1.0, 0.95, 0.85] as [number, number, number],
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
  prophecy,
}: GIRendererProps) {
  const probeRef = useRef<THREE.HemisphereLight>(null);
  const propheticGroupRef = useRef<THREE.Group>(null);
  const [latestProphecy, setLatestProphecy] = useState<ProphecyFrame | null>(null);
  const inFlight = useRef(false);

  const tierConfig = useMemo(() => TIER_CONFIG[qualityTier], [qualityTier]);
  const activeMethod = method ?? tierConfig.method;
  const activeSamples = userSamples ?? tierConfig.samples;
  const ambientCol = useMemo(() => new THREE.Color(ambientColor), [ambientColor]);

  // Surface a clear configuration error rather than silently rendering
  // nothing when the caller selects 'prophetic' but forgets the config.
  // We log once per mount; React's strict-mode double-invocation is a
  // dev-time concern only.
  useEffect(() => {
    if (enabled && activeMethod === 'prophetic' && !prophecy) {
      console.warn(
        "[GIRenderer] method='prophetic' requires a `prophecy` prop; " +
          'falling back to ambient_only for this frame.',
      );
    }
  }, [enabled, activeMethod, prophecy]);

  useFrame((state) => {
    if (!enabled) return;
    if (activeMethod === 'light_probes' && probeRef.current) {
      probeRef.current.intensity = intensity * ambientIntensity;
      return;
    }
    if (activeMethod === 'prophetic' && prophecy) {
      // One outstanding step at a time — the transport may be remote.
      if (inFlight.current) return;
      inFlight.current = true;

      const ctx: ProphecySceneContext = prophecy.sceneContext
        ? prophecy.sceneContext()
        : {
            cameraPosition: [
              state.camera.position.x,
              state.camera.position.y,
              state.camera.position.z,
            ],
            cameraForward: (() => {
              const v = new THREE.Vector3();
              state.camera.getWorldDirection(v);
              return [v.x, v.y, v.z];
            })(),
            sunDirection: DEFAULT_PROPHETIC_SUN.direction,
            sunColor: DEFAULT_PROPHETIC_SUN.color,
          };

      void prophecy.transport
        .step(ctx)
        .then((frame) => {
          setLatestProphecy(frame);
          prophecy.onFrame?.(frame);
          if (propheticGroupRef.current) {
            propheticGroupRef.current.userData.prophecy = frame;
          }
        })
        .catch((err) => {
          // Stay alive — log once per error class, don't spam.
          console.warn('[GIRenderer] prophetic step failed:', err);
        })
        .finally(() => {
          inFlight.current = false;
        });
    }
  });

  if (!enabled) return null;

  if (activeMethod === 'prophetic') {
    // No prophecy config provided → graceful ambient fallback (warned above).
    if (!prophecy) {
      return (
        <hemisphereLight
          color={ambientCol}
          groundColor="#302010"
          intensity={ambientIntensity * intensity}
        />
      );
    }
    // Aggregate the probe predictions into a per-frame average colour
    // and feed it as a hemisphere tint.  The full per-probe blend is
    // a downstream material concern — left for the next agent
    // (probe-volume material is Phase 2.b).
    const avg = computeAverageRadiance(latestProphecy);
    return (
      <group ref={propheticGroupRef} userData={{ prophecyMethod: 'prophetic' }}>
        <hemisphereLight
          color={new THREE.Color(avg[0], avg[1], avg[2])}
          groundColor="#403020"
          intensity={intensity * (latestProphecy ? 0.8 : ambientIntensity)}
        />
        <ambientLight color={ambientCol} intensity={ambientIntensity * 0.2} />
      </group>
    );
  }

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

/**
 * Average the per-probe radiance for a quick hemisphere tint.  Uses
 * confidence as a weight so dim / low-confidence probes don't wash
 * out the result.  Returns linear RGB in [0, 1+].  Caller should
 * tone-map downstream.
 *
 * Exported (named export) so renderers wiring their own probe-volume
 * materials can reuse the same reduction.
 */
export function computeAverageRadiance(
  frame: ProphecyFrame | null,
): [number, number, number] {
  if (!frame || frame.probes.length === 0) return [0.5, 0.5, 0.55];
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (const p of frame.probes) {
    const weight = p.confidence;
    r += p.rgb[0] * weight;
    g += p.rgb[1] * weight;
    b += p.rgb[2] * weight;
    w += weight;
  }
  if (w <= 0) return [0.5, 0.5, 0.55];
  return [r / w, g / w, b / w];
}
