/**
 * NightCampfireScene
 *
 * Fire + floating embers + stars. Dark, primal, warm center.
 * Primary light source is the fire itself.
 *
 * @module holoshell/scenes/NightCampfireScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import type { SceneComponentProps } from '../types';
import { FireSource } from '../phenomena/FireSource';
import { GlowField } from '../phenomena/GlowField';
import { SandCanvas } from '../phenomena/SandCanvas';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface NightCampfireSceneProps extends SceneComponentProps {}

/**
 * A primal night camp under open stars.
 * Central fire, three log seats, tree silhouettes, rising smoke, and a low moon.
 * The world is dark earth and black trees — the fire is the only warmth and navigation.
 */
const NightCampfireScene: React.FC<NightCampfireSceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Low, intimate gaze into the fire — drawn to the living light
  React.useEffect(() => {
    camera.lookAt(0.15, -0.75, -2.0);
  }, [camera]);

  const handleNavigate = (id: string) => {
    onNavigateRequest?.(id as any);
    onInteraction?.('door_opened', { destination: id });
  };

  const handleFireProximity = (distance: number) => {
    onInteraction?.('fire_proximity', { distance });
  };

  return (
    <group>
      {/* === NIGHT SKY DOME (very dark, star field backdrop) === */}
      <mesh position={[0, 4.2, -5.2]}>
        <sphereGeometry args={[13, 18, 14]} />
        <meshBasicMaterial color="#0a0c14" side={1} />
      </mesh>

      {/* === STARS (high count, slow pulse — the only other light besides fire and moon) === */}
      <GlowField
        position={[0.2, 3.65, -4.8]}
        color="#f0f4ff"
        pulseRate={0.04}
        intensity={0.92}
        count={44}
      />
      {/* Secondary star layer — slightly lower, different color temperature */}
      <GlowField
        position={[-1.8, 2.9, -5.6]}
        color="#e8eeff"
        pulseRate={0.06}
        intensity={0.65}
        count={19}
      />

      {/* === BACKGROUND TREE SILHOUETTES (3-4 tall thin dark planes, forest wall) === */}
      {/* Far left tall pine-like silhouette */}
      <mesh position={[-5.8, 0.8, -7.8]} rotation={[0, 0.18, 0]}>
        <planeGeometry args={[1.8, 7.5]} />
        <meshBasicMaterial color="#0a0b0f" transparent opacity={0.92} side={2} />
      </mesh>
      {/* Mid-left cluster */}
      <mesh position={[-3.9, 0.55, -6.4]} rotation={[0, -0.12, 0]}>
        <planeGeometry args={[2.4, 6.8]} />
        <meshBasicMaterial color="#0c0d12" transparent opacity={0.91} side={2} />
      </mesh>
      {/* Far right silhouette */}
      <mesh position={[6.2, 0.9, -7.2]} rotation={[0, -0.25, 0]}>
        <planeGeometry args={[2.1, 7.2]} />
        <meshBasicMaterial color="#0a0b0f" transparent opacity={0.93} side={2} />
      </mesh>
      {/* Closer right tree mass (anchors door side) */}
      <mesh position={[4.8, 0.35, -5.3]} rotation={[0, 0.08, 0]}>
        <planeGeometry args={[1.6, 5.9]} />
        <meshBasicMaterial color="#0d0e13" transparent opacity={0.89} side={2} />
      </mesh>

      {/* === DARK EARTH GROUND (wide living sand plane, very dark) === */}
      <mesh position={[0, -1.78, -1.8]} rotation={[-Math.PI * 0.5, 0, 0]}>
        <planeGeometry args={[15, 9]} />
        <meshStandardMaterial color="#0f0a06" roughness={0.98} metalness={0.0} />
      </mesh>
      {/* Living raked earth overlay (subtle texture, no strong pattern — night hides detail) */}
      <SandCanvas
        position={[0.1, -1.76, -1.75]}
        rotation={[-Math.PI * 0.5, 0, 0]}
        scale={1.08}
        sandColor="#120d09"
        isUnderwater={false}
        rakePattern="none"
        onInteract={(uv) => onInteraction?.('earth_press', { uv })}
      />

      {/* === THREE LOG SEATS arranged in rough triangle around fire === */}
      {/* Log 1 — front left, horizontal */}
      <mesh position={[-1.45, -1.52, -1.25]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.195, 0.205, 2.55, 6]} />
        <meshStandardMaterial color="#1f1812" roughness={0.96} />
      </mesh>
      {/* Log 1 bark rings */}
      {[-0.7, 0.1, 0.85].map((x, i) => (
        <mesh key={i} position={[-1.45 + x * 0.08, -1.51, -1.25]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.208, 0.208, 0.11, 6]} />
          <meshStandardMaterial color="#15120f" roughness={0.98} />
        </mesh>
      ))}

      {/* Log 2 — front right */}
      <mesh position={[1.55, -1.53, -1.15]} rotation={[0, 0.12, Math.PI / 2]}>
        <cylinderGeometry args={[0.19, 0.2, 2.6, 6]} />
        <meshStandardMaterial color="#1c160f" roughness={0.95} />
      </mesh>
      {[-0.6, 0.2, 0.95].map((x, i) => (
        <mesh key={i} position={[1.55 + x * 0.07, -1.52, -1.15]} rotation={[0, 0.12, Math.PI / 2]}>
          <cylinderGeometry args={[0.203, 0.203, 0.1, 6]} />
          <meshStandardMaterial color="#120f0b" roughness={0.97} />
        </mesh>
      ))}

      {/* Log 3 — rear (between fire and door) */}
      <mesh position={[0.15, -1.54, -2.85]} rotation={[0, -0.85, Math.PI / 2]}>
        <cylinderGeometry args={[0.185, 0.195, 2.45, 6]} />
        <meshStandardMaterial color="#1a140e" roughness={0.97} />
      </mesh>
      {[-0.55, 0.05, 0.7].map((x, i) => (
        <mesh key={i} position={[0.15 + x * 0.06, -1.53, -2.85]} rotation={[0, -0.85, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.09, 6]} />
          <meshStandardMaterial color="#110e0a" roughness={0.98} />
        </mesh>
      ))}

      {/* === CENTRAL CAMPFIRE (primary light + heat source) === */}
      <FireSource
        position={[0, -1.38, -1.82]}
        intensity={1.08}
        colorTemp={0.62}
        embers
        onProximity={handleFireProximity}
      />

      {/* Firelight warmth pointLight — placed inside the fire group per spec */}
      <pointLight
        position={[0, -1.22, -1.82]}
        intensity={2.05}
        color="#ff7722"
        distance={8.5}
        decay={2.0}
      />

      {/* === RISING SMOKE WISPS (gray, high above fire, low intensity) === */}
      <GlowField
        position={[0.05, 2.05, -1.82]}
        color="#888888"
        pulseRate={0.12}
        intensity={0.16}
        count={13}
      />
      {/* Higher thinner smoke layer */}
      <GlowField
        position={[-0.15, 3.1, -1.95]}
        color="#777a82"
        pulseRate={0.08}
        intensity={0.11}
        count={8}
      />

      {/* === EMBER / SPARK GLOW LAYERS (different heights for life) === */}
      <GlowField
        position={[0.08, 0.45, -1.88]}
        color="#ff9933"
        pulseRate={0.55}
        intensity={0.72}
        count={18}
      />
      {/* Lower ground embers near logs */}
      <GlowField
        position={[-0.4, -1.35, -1.55]}
        color="#ff7722"
        pulseRate={0.7}
        intensity={0.35}
        count={9}
      />

      {/* === MOON (high right, cold white) + HALO === */}
      <mesh position={[3.55, 4.55, -7.15]}>
        <sphereGeometry args={[0.36]} />
        <meshBasicMaterial color="#f0f0e0" />
      </mesh>
      {/* Subtle moon surface detail (small offset sphere) */}
      <mesh position={[3.48, 4.5, -7.05]}>
        <sphereGeometry args={[0.33]} />
        <meshBasicMaterial color="#e8e8d8" transparent opacity={0.4} />
      </mesh>
      {/* Moon halo / atmospheric bloom */}
      <GlowField
        position={[3.55, 4.52, -7.2]}
        color="#d8d8e8"
        pulseRate={0.03}
        intensity={0.55}
        count={7}
      />
      {/* Larger soft halo */}
      <GlowField
        position={[3.5, 4.4, -7.4]}
        color="#b8b8c8"
        pulseRate={0.02}
        intensity={0.28}
        count={5}
      />

      {/* === FIRE RING STONES (irregular, charred, surrounding pit) === */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2 + 0.1;
        const r = 1.32 + (i % 3) * 0.04;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * r, -1.58, -1.82 + Math.sin(a) * (1.05 + (i % 2) * 0.1)]}
          >
            <sphereGeometry args={[0.26 + (i % 3) * 0.04]} />
            <meshStandardMaterial color="#2a2826" roughness={0.99} />
          </mesh>
        );
      })}

      {/* Small charred sticks / kindling near fire edge (natural detail) */}
      <mesh position={[-0.35, -1.52, -1.45]} rotation={[0.4, 0.8, 0]}>
        <cylinderGeometry args={[0.03, 0.035, 0.7, 4]} />
        <meshStandardMaterial color="#1a1612" roughness={0.98} />
      </mesh>
      <mesh position={[0.55, -1.53, -1.6]} rotation={[-0.3, -1.1, 0]}>
        <cylinderGeometry args={[0.028, 0.032, 0.55, 4]} />
        <meshStandardMaterial color="#15120f" roughness={0.97} />
      </mesh>

      {/* === SCENE DOOR embedded in the campfire ring of stones === */}
      <SceneDoor
        position={[3.2, -0.9, -2.6]}
        rotation={[0.02, -0.15, -0.01]}
        materialType="campfire_ring"
        destinationScene="ZenGardenCloseScene"
        onNavigate={handleNavigate}
        ariaLabel="Step away from the fire into the quiet garden close-up"
      />

      {/* Very distant low hill / ridge line for night horizon */}
      <mesh position={[0, -0.4, -8.2]} rotation={[0.02, 0, 0]}>
        <planeGeometry args={[18, 3.2]} />
        <meshBasicMaterial color="#0f1116" transparent opacity={0.85} side={2} />
      </mesh>

      {/* TODO: crackle, owl call, wood pop, very faint night wind through pines (audio) */}
    </group>
  );
};

export default NightCampfireScene;
