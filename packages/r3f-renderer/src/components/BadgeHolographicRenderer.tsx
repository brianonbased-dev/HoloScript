import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Ring, Float, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeDisplayMode = 'ribbon' | 'shield' | 'icon' | 'holographic';
export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface BadgeData {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: BadgeTier;
  earnedAt: number;
}

export interface BadgeHolographicRendererProps {
  /** Badges to display */
  badges?: BadgeData[];
  /** Max badges to show */
  maxDisplay?: number;
  /** Display mode */
  display?: BadgeDisplayMode;
  /** Show total count */
  showCount?: boolean;
  /** Position in scene */
  position?: [number, number, number];
  /** Primary color override */
  themeColor?: string;
}

// ---------------------------------------------------------------------------
// Tier Colors
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<BadgeTier, { primary: string; glow: string; intensity: number }> = {
  bronze: { primary: '#cd7f32', glow: '#b87333', intensity: 0.3 },
  silver: { primary: '#c0c0c0', glow: '#e8e8e8', intensity: 0.5 },
  gold: { primary: '#ffd700', glow: '#ffed4a', intensity: 0.7 },
  diamond: { primary: '#b9f2ff', glow: '#00fff7', intensity: 1.0 },
};

// ---------------------------------------------------------------------------
// Shaders (holographic iridescence)
// ---------------------------------------------------------------------------

const HOLO_VERT = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPos.xyz;
  gl_Position = projectionMatrix * mvPos;
}
`;

const HOLO_FRAG = `
uniform float uTime;
uniform vec3 uTierColor;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  vec3 viewDir = normalize(vViewPosition);
  float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.0);

  // Iridescent color shift
  float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
  float shift = sin(angle * 3.0 + uTime * 1.5) * 0.5 + 0.5;
  vec3 iridescentA = uTierColor;
  vec3 iridescentB = vec3(uTierColor.z, uTierColor.x, uTierColor.y);
  vec3 color = mix(iridescentA, iridescentB, shift);

  // Scanline effect
  float scanline = sin(vUv.y * 80.0 + uTime * 3.0) * 0.05 + 0.95;

  // Combine
  float alpha = (fresnel * 0.6 + 0.3) * uIntensity * scanline;
  gl_FragColor = vec4(color * (1.0 + fresnel * 0.5), alpha);
}
`;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BadgeHolographicRenderer({
  badges = [],
  maxDisplay = 5,
  display = 'holographic',
  showCount = true,
  position = [0, 0, 0],
  themeColor,
}: BadgeHolographicRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const visible = badges.slice(0, maxDisplay);

  // Arrange badges in a row or arc
  const badgePositions = useMemo(() => {
    const count = visible.length;
    if (count === 0) return [];
    const spacing = display === 'holographic' ? 1.6 : 1.2;
    const startX = -((count - 1) * spacing) / 2;
    return visible.map((_, i) => {
      const x = startX + i * spacing;
      // Slight arc
      const z = -Math.pow((i - (count - 1) / 2) / count, 2) * 0.5;
      return [x, 0, z] as [number, number, number];
    });
  }, [visible.length, display]);

  return (
    <group ref={groupRef} position={position} name="badge-display">
      {/* Title */}
      {showCount && (
        <Text
          position={[0, 1.2, 0]}
          fontSize={0.18}
          color={themeColor || '#ec4899'}
          anchorX="center"
        >
          Badges ({badges.length})
        </Text>
      )}

      {/* Badge items */}
      {visible.map((badge, i) => {
        switch (display) {
          case 'holographic':
            return (
              <HolographicBadge
                key={badge.id}
                badge={badge}
                position={badgePositions[i]}
                index={i}
              />
            );
          case 'shield':
            return (
              <ShieldBadge key={badge.id} badge={badge} position={badgePositions[i]} index={i} />
            );
          case 'ribbon':
            return (
              <RibbonBadge key={badge.id} badge={badge} position={badgePositions[i]} index={i} />
            );
          default:
            return (
              <IconBadge key={badge.id} badge={badge} position={badgePositions[i]} index={i} />
            );
        }
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Holographic Badge (premium)
// ---------------------------------------------------------------------------

function HolographicBadge({
  badge,
  position,
  _index,
}: {
  badge: BadgeData;
  position: [number, number, number];
  index: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const tier = TIER_COLORS[badge.tier] || TIER_COLORS.bronze;
  const tierColor = useMemo(() => new THREE.Color(tier.primary), [tier.primary]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTierColor: { value: tierColor },
      uIntensity: { value: tier.intensity },
    }),
    [tierColor, tier.intensity]
  );

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.4} position={position}>
      <group>
        {/* Holographic disc */}
        <mesh>
          <circleGeometry args={[0.55, 64]} />
          <shaderMaterial
            ref={materialRef}
            vertexShader={HOLO_VERT}
            fragmentShader={HOLO_FRAG}
            uniforms={uniforms}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Outer ring */}
        <Ring args={[0.55, 0.6, 64]} position={[0, 0, 0.01]}>
          <meshBasicMaterial color={tier.glow} transparent opacity={0.7} side={THREE.DoubleSide} />
        </Ring>

        {/* Icon text */}
        <Text position={[0, 0.05, 0.02]} fontSize={0.28} anchorX="center" anchorY="middle">
          {badge.icon || '🏆'}
        </Text>

        {/* Name */}
        <Text
          position={[0, -0.45, 0.02]}
          fontSize={0.09}
          color={tier.primary}
          anchorX="center"
          maxWidth={1.2}
        >
          {badge.name}
        </Text>

        {/* Tier label */}
        <Text position={[0, -0.6, 0.02]} fontSize={0.06} color="#94a3b8" anchorX="center">
          {badge.tier.toUpperCase()}
        </Text>

        {/* Glow light */}
        <pointLight
          position={[0, 0, 0.3]}
          intensity={tier.intensity * 0.3}
          color={tier.glow}
          distance={2}
        />
      </group>
    </Float>
  );
}

// ---------------------------------------------------------------------------
// Shield Badge
// ---------------------------------------------------------------------------

function ShieldBadge({
  badge,
  position,
  _index,
}: {
  badge: BadgeData;
  position: [number, number, number];
  index: number;
}) {
  const tier = TIER_COLORS[badge.tier] || TIER_COLORS.bronze;

  return (
    <group position={position}>
      {/* Shield body */}
      <RoundedBox args={[0.9, 1.1, 0.1]} radius={0.08} smoothness={2}>
        <meshPhysicalMaterial color="#1e293b" roughness={0.3} metalness={0.7} />
      </RoundedBox>
      {/* Shield accent border */}
      <RoundedBox args={[0.95, 1.15, 0.08]} radius={0.1} smoothness={2} position={[0, 0, -0.02]}>
        <meshStandardMaterial color={tier.primary} roughness={0.4} metalness={0.6} />
      </RoundedBox>
      {/* Icon */}
      <Text position={[0, 0.15, 0.06]} fontSize={0.3} anchorX="center" anchorY="middle">
        {badge.icon || '🛡'}
      </Text>
      {/* Name */}
      <Text
        position={[0, -0.25, 0.06]}
        fontSize={0.08}
        color={tier.primary}
        anchorX="center"
        maxWidth={0.7}
      >
        {badge.name}
      </Text>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Ribbon Badge
// ---------------------------------------------------------------------------

function RibbonBadge({
  badge,
  position,
  _index,
}: {
  badge: BadgeData;
  position: [number, number, number];
  index: number;
}) {
  const tier = TIER_COLORS[badge.tier] || TIER_COLORS.bronze;

  return (
    <group position={position}>
      {/* Ribbon body */}
      <mesh>
        <planeGeometry args={[1.0, 0.5]} />
        <meshStandardMaterial
          color={tier.primary}
          roughness={0.5}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Ribbon tails */}
      <mesh position={[-0.3, -0.4, 0]} rotation={[0, 0, 0.15]}>
        <planeGeometry args={[0.2, 0.3]} />
        <meshStandardMaterial
          color={tier.primary}
          roughness={0.5}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0.3, -0.4, 0]} rotation={[0, 0, -0.15]}>
        <planeGeometry args={[0.2, 0.3]} />
        <meshStandardMaterial
          color={tier.primary}
          roughness={0.5}
          metalness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Icon + name */}
      <Text position={[-0.2, 0.05, 0.01]} fontSize={0.2} anchorX="center" anchorY="middle">
        {badge.icon || '🎖'}
      </Text>
      <Text position={[0.2, 0.05, 0.01]} fontSize={0.08} color="#fff" anchorX="left" maxWidth={0.5}>
        {badge.name}
      </Text>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Icon Badge (simple)
// ---------------------------------------------------------------------------

function IconBadge({
  badge,
  position,
  _index,
}: {
  badge: BadgeData;
  position: [number, number, number];
  index: number;
}) {
  const tier = TIER_COLORS[badge.tier] || TIER_COLORS.bronze;

  return (
    <Float speed={2} rotationIntensity={0} floatIntensity={0.2} position={position}>
      <group>
        <mesh>
          <circleGeometry args={[0.4, 32]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
        </mesh>
        <Ring args={[0.4, 0.45, 32]} position={[0, 0, 0.01]}>
          <meshBasicMaterial
            color={tier.primary}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </Ring>
        <Text position={[0, 0.02, 0.02]} fontSize={0.25} anchorX="center" anchorY="middle">
          {badge.icon || '⭐'}
        </Text>
        <Text
          position={[0, -0.35, 0]}
          fontSize={0.07}
          color={tier.primary}
          anchorX="center"
          maxWidth={0.8}
        >
          {badge.name}
        </Text>
      </group>
    </Float>
  );
}
