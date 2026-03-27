/**
 * EyeRenderer — Refractive Eye with Cornea + Iris + Pupil + Sclera
 *
 * Two-layer rendering: sclera/iris inner sphere + cornea refraction outer sphere.
 * IOR 1.376 for cornea (NOT 1.5 — G.CHAR.003). Iris parallax via depth offset.
 * Wet layer with micro-roughness for realistic light scattering.
 *
 * @see G.CHAR.003: Eye IOR = 1.376 (not 1.5). Add wet layer + micro-saccade.
 * @see Characters as Code vision, Section 8A
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// =============================================================================
// Types
// =============================================================================

export interface EyeRendererProps {
  /** Iris color [R, G, B] 0-1. Default: hazel green */
  irisColor?: [number, number, number];
  /** Pupil base size (fraction of iris, 0-1). Default 0.35 */
  pupilSize?: number;
  /** Pupil dilation override (0-1). Default driven by irisColor lightness */
  pupilDilation?: number;
  /** Sclera (white) color. Default: slightly warm white */
  scleraColor?: [number, number, number];
  /** Cornea IOR (default 1.376 for human eye) */
  corneaIOR?: number;
  /** Cornea roughness (very low — almost mirror). Default 0.01 */
  corneaRoughness?: number;
  /** Wet layer roughness (micro-reflection). Default 0.005 */
  wetLayerRoughness?: number;
  /** Enable micro-saccade (tiny random eye movements). Default true */
  microSaccade?: boolean;
  /** Iris parallax depth in eye-space. Default 0.3mm */
  irisDepth?: number;
  /** Position */
  position?: [number, number, number];
  /** Scale */
  scale?: number;
  /** Which eye: controls saccade direction */
  side?: 'left' | 'right';
}

// =============================================================================
// Shaders
// =============================================================================

const EYE_VERTEX_SHADER = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const IRIS_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uIrisColor;
uniform float uPupilSize;
uniform vec3 uScleraColor;
uniform float uIrisDepth;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

void main() {
  // Map UV to centered coords (-1 to 1)
  vec2 centered = (vUv - 0.5) * 2.0;
  float dist = length(centered);

  // Sclera (outer ring)
  if (dist > 0.85) {
    gl_FragColor = vec4(uScleraColor, 1.0);
    return;
  }

  // Iris ring (0.35 to 0.85)
  float irisOuter = 0.85;
  float irisInner = uPupilSize;

  if (dist > irisInner) {
    // Iris coloring with radial pattern
    float irisT = (dist - irisInner) / (irisOuter - irisInner);
    // Radial iris fibers
    float angle = atan(centered.y, centered.x);
    float fibers = sin(angle * 60.0) * 0.05 + sin(angle * 37.0) * 0.03;
    // Darker at pupil edge, lighter at sclera edge
    vec3 innerIris = uIrisColor * 0.3;
    vec3 outerIris = uIrisColor * 1.2;
    vec3 iris = mix(innerIris, outerIris, irisT) + fibers;

    // Collarette (bright ring at ~60% of iris)
    float collarette = smoothstep(0.55, 0.6, irisT) * smoothstep(0.65, 0.6, irisT);
    iris += uIrisColor * collarette * 0.3;

    gl_FragColor = vec4(iris, 1.0);
    return;
  }

  // Pupil (center)
  gl_FragColor = vec4(0.02, 0.02, 0.02, 1.0);
}
`;

const CORNEA_FRAGMENT_SHADER = /* glsl */ `
uniform float uIOR;
uniform float uRoughness;
uniform float uWetRoughness;

varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  // Fresnel reflection (Schlick approx with IOR)
  float f0 = pow((uIOR - 1.0) / (uIOR + 1.0), 2.0);
  float cosTheta = max(0.0, dot(normal, viewDir));
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);

  // Wet layer adds slight diffuse reflection
  float wetReflection = fresnel * (1.0 - uWetRoughness);

  // Environment reflection approximation
  vec3 reflectDir = reflect(-viewDir, normal);
  vec3 envColor = vec3(0.6, 0.7, 0.8) * 0.5; // Sky approx

  vec3 color = envColor * wetReflection;

  gl_FragColor = vec4(color, fresnel * 0.6);
}
`;

// =============================================================================
// Component
// =============================================================================

export const EyeRenderer: React.FC<EyeRendererProps> = ({
  irisColor = [0.35, 0.55, 0.25],
  pupilSize = 0.35,
  pupilDilation,
  scleraColor = [0.95, 0.93, 0.91],
  corneaIOR = 1.376,
  corneaRoughness = 0.01,
  wetLayerRoughness = 0.005,
  microSaccade = true,
  irisDepth = 0.0003,
  position,
  scale = 1.0,
  side = 'left',
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const irisRef = useRef<THREE.Mesh>(null);

  const effectivePupilSize = pupilDilation ?? pupilSize;

  const irisUniforms = useMemo(() => ({
    uIrisColor: { value: new THREE.Vector3(irisColor[0], irisColor[1], irisColor[2]) },
    uPupilSize: { value: effectivePupilSize },
    uScleraColor: { value: new THREE.Vector3(scleraColor[0], scleraColor[1], scleraColor[2]) },
    uIrisDepth: { value: irisDepth },
    uTime: { value: 0 },
  }), [irisColor, effectivePupilSize, scleraColor, irisDepth]);

  const corneaUniforms = useMemo(() => ({
    uIOR: { value: corneaIOR },
    uRoughness: { value: corneaRoughness },
    uWetRoughness: { value: wetLayerRoughness },
  }), [corneaIOR, corneaRoughness, wetLayerRoughness]);

  const irisMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: EYE_VERTEX_SHADER,
    fragmentShader: IRIS_FRAGMENT_SHADER,
    uniforms: irisUniforms,
  }), [irisUniforms]);

  const corneaMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: EYE_VERTEX_SHADER,
    fragmentShader: CORNEA_FRAGMENT_SHADER,
    uniforms: corneaUniforms,
    transparent: true,
    depthWrite: false,
  }), [corneaUniforms]);

  // Micro-saccade animation
  useFrame((_, delta) => {
    if (!microSaccade || !groupRef.current) return;
    irisUniforms.uTime.value += delta;

    const t = irisUniforms.uTime.value;
    // Micro-saccades: tiny random-looking oscillations
    const saccadeX = Math.sin(t * 2.3) * 0.002 + Math.sin(t * 5.7) * 0.001;
    const saccadeY = Math.sin(t * 3.1) * 0.002 + Math.cos(t * 4.3) * 0.001;
    const sign = side === 'left' ? 1 : -1;
    groupRef.current.rotation.y = saccadeX * sign;
    groupRef.current.rotation.x = saccadeY;
  });

  const eyeScale = 0.012 * scale; // ~12mm radius for a human eye

  return (
    <group ref={groupRef} position={position}>
      {/* Inner sphere: iris + sclera + pupil */}
      <mesh ref={irisRef} material={irisMaterial} renderOrder={0}>
        <sphereGeometry args={[eyeScale * 0.95, 64, 64]} />
      </mesh>
      {/* Outer sphere: cornea refraction + wet layer */}
      <mesh material={corneaMaterial} renderOrder={1}>
        <sphereGeometry args={[eyeScale, 64, 64]} />
      </mesh>
    </group>
  );
};
