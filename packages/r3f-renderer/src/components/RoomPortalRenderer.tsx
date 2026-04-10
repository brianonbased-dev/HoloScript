import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Ring } from '@react-three/drei';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalStyle = 'door' | 'archway' | 'vortex' | 'rift';

export interface RoomPortalRendererProps {
  /** Portal position in world space */
  position?: [number, number, number];
  /** Target agent DID */
  targetDid?: string;
  /** Target room name */
  targetRoom?: string;
  /** Display label */
  label?: string;
  /** Visual style */
  style?: PortalStyle;
  /** Whether the portal is active/connected */
  isActive?: boolean;
  /** Total traversal count */
  traversals?: number;
  /** Primary color (hex) */
  color?: string;
  /** Called when user clicks the portal */
  onTraverse?: () => void;
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const PORTAL_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PORTAL_FRAG = `
uniform float uTime;
uniform vec3 uColor;
uniform float uActive;
varying vec2 vUv;

void main() {
  vec2 center = vUv - 0.5;
  float dist = length(center);
  float swirl = sin(atan(center.y, center.x) * 4.0 + uTime * 2.0) * 0.5 + 0.5;
  float ring = smoothstep(0.45, 0.35, dist) * smoothstep(0.0, 0.1, dist);
  float inner = smoothstep(0.35, 0.0, dist);
  float glow = ring * swirl + inner * 0.6;
  vec3 col = uColor * glow * uActive;
  float alpha = (ring + inner * 0.5) * uActive;
  gl_FragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function RoomPortalRenderer({
  position = [0, 0, -4],
  targetDid = '',
  targetRoom = 'main',
  label = 'Portal',
  style = 'door',
  isActive = true,
  traversals = 0,
  color = '#8b5cf6',
  onTraverse,
}: RoomPortalRendererProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const portalColor = useMemo(() => new THREE.Color(color), [color]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: portalColor },
      uActive: { value: isActive ? 1.0 : 0.2 },
    }),
    [portalColor, isActive]
  );

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta;
    }
    // Gentle float for active portals
    if (groupRef.current && isActive) {
      groupRef.current.position.y = position[1] + Math.sin(Date.now() * 0.001) * 0.05;
    }
  });

  const portalWidth = style === 'vortex' ? 1.2 : 1.5;
  const portalHeight = style === 'vortex' ? 1.2 : 2.2;

  return (
    <group ref={groupRef} position={position} name="room-portal">
      {/* Portal frame */}
      {(style === 'door' || style === 'archway') && (
        <PortalFrame
          width={portalWidth}
          height={portalHeight}
          color={color}
          isActive={isActive}
          isArch={style === 'archway'}
        />
      )}

      {/* Portal surface (swirl shader) */}
      <mesh position={[0, portalHeight / 2, 0]} onClick={onTraverse}>
        {style === 'vortex' ? (
          <circleGeometry args={[portalWidth / 2, 64]} />
        ) : (
          <planeGeometry args={[portalWidth * 0.85, portalHeight * 0.9]} />
        )}
        <shaderMaterial
          ref={materialRef}
          vertexShader={PORTAL_VERT}
          fragmentShader={PORTAL_FRAG}
          uniforms={uniforms}
          transparent
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Glow rings for vortex/rift styles */}
      {(style === 'vortex' || style === 'rift') && (
        <>
          <Ring
            args={[portalWidth / 2, portalWidth / 2 + 0.08, 64]}
            position={[0, portalHeight / 2, 0.01]}
          >
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isActive ? 0.6 : 0.15}
              side={THREE.DoubleSide}
            />
          </Ring>
          <Ring
            args={[portalWidth / 2 + 0.1, portalWidth / 2 + 0.15, 64]}
            position={[0, portalHeight / 2, 0.02]}
          >
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isActive ? 0.3 : 0.05}
              side={THREE.DoubleSide}
            />
          </Ring>
        </>
      )}

      {/* Label */}
      <Text
        position={[0, portalHeight + 0.4, 0]}
        fontSize={0.2}
        color={isActive ? color : '#4b5563'}
        anchorX="center"
        anchorY="bottom"
      >
        {label}
      </Text>

      {/* Target info */}
      {targetDid && (
        <Text position={[0, -0.2, 0]} fontSize={0.1} color="#64748b" anchorX="center">
          → {targetRoom} ({targetDid.slice(0, 16)}...)
        </Text>
      )}

      {/* Traversal counter */}
      {traversals > 0 && (
        <Text
          position={[portalWidth / 2 + 0.3, portalHeight - 0.3, 0]}
          fontSize={0.12}
          color="#94a3b8"
          anchorX="left"
        >
          {traversals} visits
        </Text>
      )}

      {/* Point light for glow */}
      {isActive && (
        <pointLight
          position={[0, portalHeight / 2, 0.5]}
          intensity={0.5}
          color={color}
          distance={4}
        />
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Portal Frame
// ---------------------------------------------------------------------------

function PortalFrame({
  width,
  height,
  color,
  isActive,
  isArch,
}: {
  width: number;
  height: number;
  color: string;
  isActive: boolean;
  isArch: boolean;
}) {
  const frameColor = isActive ? color : '#374151';
  const thickness = 0.08;

  return (
    <group>
      {/* Left pillar */}
      <mesh position={[-width / 2, height / 2, 0]}>
        <boxGeometry args={[thickness, height, thickness * 2]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Right pillar */}
      <mesh position={[width / 2, height / 2, 0]}>
        <boxGeometry args={[thickness, height, thickness * 2]} />
        <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Top beam */}
      {!isArch && (
        <mesh position={[0, height, 0]}>
          <boxGeometry args={[width + thickness, thickness, thickness * 2]} />
          <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.7} />
        </mesh>
      )}
      {/* Arch top */}
      {isArch && (
        <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[width / 2, thickness / 2, 8, 32, Math.PI]} />
          <meshStandardMaterial color={frameColor} roughness={0.3} metalness={0.7} />
        </mesh>
      )}
    </group>
  );
}
