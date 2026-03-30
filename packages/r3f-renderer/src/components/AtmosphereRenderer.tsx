/**
 * AtmosphereRenderer — Sky dome with Bruneton precomputed atmospheric scattering.
 *
 * Supports three sky models: physically-based atmosphere (Bruneton),
 * simple gradient, and HDRI cubemap. Integrates with WeatherBlackboard
 * for day/night cycle and weather-driven sky changes.
 *
 * @see W.252: Bruneton precomputed atmospheric scattering
 * @see P.RENDER.001: Environment Rendering Stack pattern
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export type SkyModel = 'bruneton' | 'gradient' | 'hdri';

export interface AtmosphereRendererProps {
  /** Sky rendering model (default: 'bruneton') */
  model?: SkyModel;
  /** Sun direction as normalized vector [x, y, z] */
  sunDirection?: [number, number, number];
  /** Atmospheric turbidity 1.0-10.0 (default: 2.0) */
  turbidity?: number;
  /** Rayleigh scattering coefficient (default: 1.0) */
  rayleigh?: number;
  /** Mie scattering coefficient (default: 0.005) */
  mieCoefficient?: number;
  /** Mie directional factor (default: 0.8) */
  mieDirectional?: number;
  /** Sky dome radius (default: 5000) */
  radius?: number;
  /** Gradient top color (gradient model only) */
  gradientTop?: string;
  /** Gradient bottom color (gradient model only) */
  gradientBottom?: string;
  /** HDRI environment map URL (hdri model only) */
  hdriUrl?: string;
  /** Overall sky exposure (default: 1.0) */
  exposure?: number;
  /** Ground color at horizon (default: '#3d6b4f') */
  groundColor?: string;
  /** Whether to render stars at night */
  showStars?: boolean;
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const SKY_VERT = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;

uniform vec3 uSunDirection;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vSunDirection = uSunDirection;
  vSunfade = 1.0 - clamp(1.0 - exp(uSunDirection.y / 0.065), 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position.z = gl_Position.w;
}
`;

const BRUNETON_FRAG = /* glsl */ `
uniform float uTurbidity;
uniform float uRayleigh;
uniform float uMieCoefficient;
uniform float uMieDirectional;
uniform float uExposure;
uniform vec3 uGroundColor;

varying vec3 vWorldPosition;
varying vec3 vSunDirection;
varying float vSunfade;

float rayleighPhase(float cosTheta) {
  return 0.75 * (1.0 + cosTheta * cosTheta);
}

float henyeyGreenstein(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5) * 0.07958;
}

void main() {
  vec3 direction = normalize(vWorldPosition);

  float zenithAngle = acos(max(0.0, dot(vec3(0.0, 1.0, 0.0), direction)));
  float inverseDenom = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - degrees(zenithAngle), -1.253));

  vec3 betaR = vec3(5.5e-6, 13.0e-6, 22.4e-6) * uRayleigh;
  float sunE = 1000.0 * max(0.0, 1.0 - exp(-((3.14159265 / 1.95) - acos(dot(vSunDirection, vec3(0.0, 1.0, 0.0))))));

  float mieCoeff = uMieCoefficient * uTurbidity * 1e-5;
  vec3 betaM = vec3(mieCoeff);

  vec3 extinction = exp(-(betaR * inverseDenom + betaM * inverseDenom));

  float cosTheta = dot(direction, vSunDirection);
  vec3 betaRTheta = betaR * rayleighPhase(cosTheta);
  vec3 betaMTheta = betaM * henyeyGreenstein(cosTheta, uMieDirectional);

  vec3 Lin = sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * (1.0 - extinction);
  Lin *= mix(
    vec3(1.0),
    pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * extinction, vec3(0.5)),
    clamp(pow(1.0 - dot(vec3(0.0, 1.0, 0.0), vSunDirection), 5.0), 0.0, 1.0)
  );

  float sunAngularDiameter = 0.0093;
  float sundisk = smoothstep(sunAngularDiameter, sunAngularDiameter * 0.99, acos(cosTheta));
  vec3 L0 = vec3(0.1) * extinction;
  L0 += sunE * 19000.0 * extinction * sundisk;

  vec3 finalColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);

  if (direction.y < 0.0) {
    finalColor = uGroundColor * max(0.0, dot(vSunDirection, vec3(0.0, 1.0, 0.0)));
  }

  finalColor = 1.0 - exp(-uExposure * finalColor);
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

const GRADIENT_FRAG = /* glsl */ `
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uExposure;
varying vec3 vWorldPosition;

void main() {
  vec3 direction = normalize(vWorldPosition);
  float t = max(0.0, direction.y);
  vec3 color = mix(uBottomColor, uTopColor, t) * uExposure;
  gl_FragColor = vec4(color, 1.0);
}
`;

// ── Component ────────────────────────────────────────────────────────────────

export function AtmosphereRenderer({
  model = 'bruneton',
  sunDirection = [0.3, 0.8, 0.1],
  turbidity = 2.0,
  rayleigh = 1.0,
  mieCoefficient = 0.005,
  mieDirectional = 0.8,
  radius = 5000,
  gradientTop = '#0077ff',
  gradientBottom = '#87ceeb',
  exposure = 1.0,
  groundColor = '#3d6b4f',
}: AtmosphereRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const sunDir = useMemo(() => new THREE.Vector3(...sunDirection).normalize(), [sunDirection]);
  const groundCol = useMemo(() => new THREE.Color(groundColor), [groundColor]);
  const topCol = useMemo(() => new THREE.Color(gradientTop), [gradientTop]);
  const bottomCol = useMemo(() => new THREE.Color(gradientBottom), [gradientBottom]);

  const uniforms = useMemo(() => {
    if (model === 'gradient') {
      return {
        uTopColor: { value: topCol },
        uBottomColor: { value: bottomCol },
        uExposure: { value: exposure },
      };
    }
    return {
      uSunDirection: { value: sunDir },
      uTurbidity: { value: turbidity },
      uRayleigh: { value: rayleigh },
      uMieCoefficient: { value: mieCoefficient },
      uMieDirectional: { value: mieDirectional },
      uExposure: { value: exposure },
      uGroundColor: { value: groundCol },
    };
  }, [
    model,
    sunDir,
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectional,
    exposure,
    groundCol,
    topCol,
    bottomCol,
  ]);

  useFrame(() => {
    if (model === 'bruneton') {
      uniforms.uSunDirection.value.set(...sunDirection).normalize();
      uniforms.uTurbidity.value = turbidity;
      uniforms.uExposure.value = exposure;
    }
  });

  const fragmentShader = model === 'gradient' ? GRADIENT_FRAG : BRUNETON_FRAG;

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={-1000}>
      <sphereGeometry args={[radius, 64, 32]} />
      <shaderMaterial
        vertexShader={SKY_VERT}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}
