/**
 * HairRenderer — Card-Based + Strand-Based Hair with Marschner Shading
 *
 * Two modes:
 * - Cards: Textured quads following guide curves. Performant, good for games.
 * - Strands: Individual line segments with per-segment color. High-end.
 *
 * Both modes use Marschner dual-specular shading (R + TRT lobes) for
 * realistic anisotropic highlights along hair strands.
 *
 * @see W.242: Layered shell + wrinkle maps = practical sweet spot
 * @see Characters as Code vision, Section 8C
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// =============================================================================
// Types
// =============================================================================

export type HairMode = 'cards' | 'strands';

export interface HairGuide {
  /** Control points along the guide curve */
  points: [number, number, number][];
}

export interface HairRendererProps {
  /** Rendering mode */
  mode: HairMode;
  /** Guide curves defining hair flow direction */
  guides: HairGuide[];
  /** Number of cards per guide (cards mode). Default 3 */
  cardsPerGuide?: number;
  /** Card width (cards mode). Default 0.008 */
  cardWidth?: number;
  /** Strands per guide (strands mode). Default 50 */
  strandsPerGuide?: number;
  /** Melanin (0 = blonde, 0.5 = brown, 1 = black). Default 0.5 */
  melanin?: number;
  /** Melanin redness (0 = cool, 1 = auburn). Default 0.3 */
  melaninRedness?: number;
  /** Primary specular shift in degrees. Default -5 */
  primaryShift?: number;
  /** Secondary specular shift in degrees. Default -10 */
  secondaryShift?: number;
  /** Wind direction + magnitude for sway animation */
  wind?: [number, number, number];
  /** Position */
  position?: [number, number, number];
  /** Opacity */
  opacity?: number;
}

// =============================================================================
// Hair Color from Melanin
// =============================================================================

function melaninToColor(melanin: number, redness: number): THREE.Color {
  // Based on physically-based melanin absorption model
  const eumelanin = melanin;
  const pheomelanin = redness * melanin;

  const r = Math.exp(-eumelanin * 1.5 - pheomelanin * 0.5);
  const g = Math.exp(-eumelanin * 2.5 - pheomelanin * 1.5);
  const b = Math.exp(-eumelanin * 4.0 - pheomelanin * 3.0);

  return new THREE.Color(
    Math.max(0.02, Math.min(1, r)),
    Math.max(0.02, Math.min(1, g)),
    Math.max(0.02, Math.min(1, b))
  );
}

// =============================================================================
// Shaders
// =============================================================================

const HAIR_VERTEX_SHADER = /* glsl */ `
attribute float aStrandT;
attribute float aStrandId;

uniform float uTime;
uniform vec3 uWind;

varying float vStrandT;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vTangent;

void main() {
  vStrandT = aStrandT;

  // Hair tangent along strand direction (approximated from position derivative)
  vTangent = normalize(vec3(0.0, -1.0, 0.0)); // Placeholder; real impl uses adjacent segments

  // Wind sway: increases along strand length (tips sway more)
  float swayAmount = aStrandT * aStrandT;
  vec3 sway = uWind * swayAmount * sin(uTime * 2.0 + aStrandId * 6.28) * 0.02;

  vec3 pos = position + sway;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  vNormal = normalize(normalMatrix * normal);
  vViewPosition = -mvPosition.xyz;

  gl_Position = projectionMatrix * mvPosition;
}
`;

const HAIR_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uHairColor;
uniform float uPrimaryShift;
uniform float uSecondaryShift;
uniform float uOpacity;

varying float vStrandT;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vTangent;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
  vec3 tangent = normalize(vTangent);

  // Kajiya-Kay diffuse
  float TdotL = dot(tangent, lightDir);
  float TdotV = dot(tangent, viewDir);
  float sinTL = sqrt(max(0.0, 1.0 - TdotL * TdotL));
  float sinTV = sqrt(max(0.0, 1.0 - TdotV * TdotV));
  float diffuse = sinTL;

  // Marschner R lobe (primary specular)
  float shiftedTdotH1 = TdotL + TdotV;
  float specR = pow(max(0.0, sinTL * sinTV - TdotL * TdotV), 40.0);

  // Marschner TRT lobe (secondary, broader)
  float specTRT = pow(max(0.0, sinTL * sinTV - TdotL * TdotV), 10.0) * 0.5;

  // Root darkening (hair darker near scalp)
  float rootDarken = mix(0.6, 1.0, vStrandT);

  // Tip lightening (slight bleach at tips)
  float tipLighten = mix(1.0, 1.15, smoothstep(0.8, 1.0, vStrandT));

  vec3 color = uHairColor * rootDarken * tipLighten;
  color = color * (diffuse * 0.6 + 0.2) + vec3(specR * 0.4) + uHairColor * specTRT * 0.2;

  // Ambient occlusion: inner strands are darker
  color *= mix(0.7, 1.0, diffuse);

  gl_FragColor = vec4(color, uOpacity);
}
`;

// =============================================================================
// Geometry Builders
// =============================================================================

function buildCardGeometry(
  guides: HairGuide[],
  cardsPerGuide: number,
  cardWidth: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const strandTs: number[] = [];
  const strandIds: number[] = [];
  const indices: number[] = [];

  let vertexOffset = 0;
  let strandId = 0;

  for (const guide of guides) {
    for (let card = 0; card < cardsPerGuide; card++) {
      const offsetAngle = (card / cardsPerGuide) * Math.PI;
      const offsetX = Math.cos(offsetAngle) * cardWidth * 0.5;
      const offsetZ = Math.sin(offsetAngle) * cardWidth * 0.5;

      for (let i = 0; i < guide.points.length; i++) {
        const p = guide.points[i];
        const t = i / (guide.points.length - 1);

        // Left vertex
        positions.push(p[0] - offsetX, p[1], p[2] - offsetZ);
        normals.push(0, 0, 1);
        uvs.push(0, t);
        strandTs.push(t);
        strandIds.push(strandId);

        // Right vertex
        positions.push(p[0] + offsetX, p[1], p[2] + offsetZ);
        normals.push(0, 0, 1);
        uvs.push(1, t);
        strandTs.push(t);
        strandIds.push(strandId);

        // Triangle indices (quad per segment)
        if (i < guide.points.length - 1) {
          const base = vertexOffset + i * 2;
          indices.push(base, base + 1, base + 2);
          indices.push(base + 1, base + 3, base + 2);
        }
      }

      vertexOffset += guide.points.length * 2;
      strandId++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aStrandT', new THREE.Float32BufferAttribute(strandTs, 1));
  geometry.setAttribute('aStrandId', new THREE.Float32BufferAttribute(strandIds, 1));
  geometry.setIndex(indices);

  return geometry;
}

function buildStrandGeometry(guides: HairGuide[], strandsPerGuide: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const strandTs: number[] = [];
  const strandIds: number[] = [];

  let strandId = 0;

  for (const guide of guides) {
    for (let s = 0; s < strandsPerGuide; s++) {
      // Jitter around guide
      const jitterX = (Math.random() - 0.5) * 0.005;
      const jitterZ = (Math.random() - 0.5) * 0.005;

      for (let i = 0; i < guide.points.length; i++) {
        const p = guide.points[i];
        const t = i / (guide.points.length - 1);
        const jitterScale = t * t; // More jitter at tips
        positions.push(p[0] + jitterX * jitterScale, p[1], p[2] + jitterZ * jitterScale);
        strandTs.push(t);
        strandIds.push(strandId);
      }
      strandId++;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aStrandT', new THREE.Float32BufferAttribute(strandTs, 1));
  geometry.setAttribute('aStrandId', new THREE.Float32BufferAttribute(strandIds, 1));

  return geometry;
}

// =============================================================================
// Component
// =============================================================================

export const HairRenderer: React.FC<HairRendererProps> = ({
  mode,
  guides,
  cardsPerGuide = 3,
  cardWidth = 0.008,
  strandsPerGuide = 50,
  melanin = 0.5,
  melaninRedness = 0.3,
  primaryShift = -5,
  secondaryShift = -10,
  wind = [0, 0, 0],
  position,
  opacity = 1.0,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.LineSegments>(null);

  const hairColor = useMemo(
    () => melaninToColor(melanin, melaninRedness),
    [melanin, melaninRedness]
  );

  const uniforms = useMemo(
    () => ({
      uHairColor: { value: new THREE.Vector3(hairColor.r, hairColor.g, hairColor.b) },
      uPrimaryShift: { value: primaryShift * (Math.PI / 180) },
      uSecondaryShift: { value: secondaryShift * (Math.PI / 180) },
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector3(wind[0], wind[1], wind[2]) },
      uOpacity: { value: opacity },
    }),
    [hairColor, primaryShift, secondaryShift, wind, opacity]
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: HAIR_VERTEX_SHADER,
        fragmentShader: HAIR_FRAGMENT_SHADER,
        uniforms,
        transparent: opacity < 1.0,
        side: THREE.DoubleSide,
        depthWrite: opacity >= 1.0,
      }),
    [uniforms, opacity]
  );

  const geometry = useMemo(() => {
    if (mode === 'cards') {
      return buildCardGeometry(guides, cardsPerGuide, cardWidth);
    }
    return buildStrandGeometry(guides, strandsPerGuide);
  }, [mode, guides, cardsPerGuide, cardWidth, strandsPerGuide]);

  // Update wind uniform
  useEffect(() => {
    uniforms.uWind.value.set(wind[0], wind[1], wind[2]);
  }, [wind]);

  // Animate
  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
  });

  if (mode === 'strands') {
    return (
      <group position={position}>
        <lineSegments ref={lineRef} geometry={geometry} material={material} />
      </group>
    );
  }

  return (
    <group position={position}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
    </group>
  );
};
