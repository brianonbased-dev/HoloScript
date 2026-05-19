/**
 * WarmLibraryScene
 *
 * Fireplace + bookshelves + floating dust motes (GlowField).
 * Cozy, scholarly, slow-moving. Door embedded in bookshelf gap.
 *
 * @module holoshell/scenes/WarmLibraryScene
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import type { SceneComponentProps } from '../types';
import { FireSource } from '../phenomena/FireSource';
import { GlowField } from '../phenomena/GlowField';
import { LeafField } from '../phenomena/LeafField';
import { SceneDoor } from '../phenomena/SceneDoor';

export interface WarmLibrarySceneProps extends SceneComponentProps {}

/**
 * A warm, lived-in library with a crackling fireplace as the heart.
 * Every surface is wood, stone, paper, or flame — no UI chrome.
 * Depth is built from back shelves → mantel → fire → foreground planks.
 */
const WarmLibraryScene: React.FC<WarmLibrarySceneProps> = ({
  onNavigateRequest,
  onInteraction,
}) => {
  const { camera } = useThree();

  // Cozy inward gaze toward fire and books (slightly lowered, centered on hearth)
  React.useEffect(() => {
    camera.lookAt(0.2, -0.35, -2.1);
  }, [camera]);

  const handleNavigate = (id: string) => {
    onNavigateRequest?.(id as any);
    onInteraction?.('door_opened', { destination: id });
  };

  const handleFireProximity = (distance: number) => {
    onInteraction?.('fire_proximity', { distance });
  };

  const handleLeafTouch = (id: number) => {
    onInteraction?.('leaf_touch', { id });
  };

  const handleDustMote = (detail?: unknown) => {
    onInteraction?.('dust_mote', detail);
  };

  return (
    <group>
      {/* === BACKGROUND DEPTH: deep library wall + tall bookcases at z=-4.2 === */}
      <mesh position={[0, 0.8, -4.25]} rotation={[0, 0, 0]}>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial color="#1f1812" roughness={0.96} metalness={0.01} />
      </mesh>

      {/* Tall vertical bookcase pillars receding into shadow */}
      {[-4.2, -2.1, 0, 2.1, 4.2].map((x, i) => (
        <mesh key={i} position={[x, 0.4, -4.1]}>
          <boxGeometry args={[0.9, 5.8, 0.7]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#2a2118' : '#231c15'} roughness={0.94} />
        </mesh>
      ))}

      {/* === MID-GROUND BOOKSHELVES: layered horizontal shelving with vertical book pillars === */}
      {/* Left bookcase frame */}
      <mesh position={[-3.8, 0.15, -3.35]}>
        <boxGeometry args={[1.6, 3.8, 0.9]} />
        <meshStandardMaterial color="#2f241a" roughness={0.9} />
      </mesh>
      {/* Right bookcase frame */}
      <mesh position={[3.8, 0.15, -3.35]}>
        <boxGeometry args={[1.6, 3.8, 0.9]} />
        <meshStandardMaterial color="#2f241a" roughness={0.9} />
      </mesh>

      {/* Horizontal shelf boards (4 levels) */}
      {[1.1, 0.25, -0.6, -1.45].map((y, idx) => (
        <mesh key={idx} position={[0, y, -3.05]}>
          <boxGeometry args={[9.2, 0.18, 0.75]} />
          <meshStandardMaterial color="#3a2a1f" roughness={0.88} />
        </mesh>
      ))}

      {/* Vertical pillar-books standing on shelves (earthy browns, narrow tall) */}
      {/* Shelf 1 (top) */}
      {[-2.8, -1.1, 0.6, 2.0, 3.4].map((x, i) => (
        <mesh key={`s1-${i}`} position={[x, 0.85, -2.85]}>
          <boxGeometry args={[0.22, 0.72, 0.38]} />
          <meshStandardMaterial color={['#3f2a18', '#2c2119', '#35291f', '#2a2118', '#3a2f22'][i]} roughness={0.85} />
        </mesh>
      ))}
      {/* Shelf 2 */}
      {[-3.1, -1.6, -0.2, 1.4, 2.9].map((x, i) => (
        <mesh key={`s2-${i}`} position={[x, 0.0, -2.85]}>
          <boxGeometry args={[0.18, 0.68, 0.36]} />
          <meshStandardMaterial color={['#2f241a', '#352b20', '#3c2f24', '#2a2219', '#31281f'][i]} roughness={0.87} />
        </mesh>
      ))}
      {/* Shelf 3 (lower) */}
      {[-2.5, -0.9, 0.8, 2.3].map((x, i) => (
        <mesh key={`s3-${i}`} position={[x, -0.85, -2.85]}>
          <boxGeometry args={[0.24, 0.65, 0.4]} />
          <meshStandardMaterial color={['#2c2119', '#3a2a1f', '#2a2218', '#35291f'][i]} roughness={0.9} />
        </mesh>
      ))}

      {/* === STONE MANTELPIECE above fireplace === */}
      <mesh position={[0, 0.62, -2.52]}>
        <boxGeometry args={[4.4, 0.28, 1.15]} />
        <meshStandardMaterial color="#5f5a52" roughness={0.98} metalness={0.03} />
      </mesh>
      {/* Mantel front lip detail */}
      <mesh position={[0, 0.48, -2.18]}>
        <boxGeometry args={[4.6, 0.12, 0.22]} />
        <meshStandardMaterial color="#4a4640" roughness={0.96} />
      </mesh>

      {/* === FIREPLACE BRICK SURROUND (enriched) === */}
      <mesh position={[0, -0.95, -2.75]}>
        <boxGeometry args={[4.1, 2.75, 0.95]} />
        <meshStandardMaterial color="#3f2f28" roughness={0.97} />
      </mesh>
      {/* Inner hearth recess for depth */}
      <mesh position={[0, -1.05, -2.55]}>
        <boxGeometry args={[3.1, 2.1, 0.6]} />
        <meshStandardMaterial color="#1f1610" roughness={0.99} />
      </mesh>

      {/* Fireplace ember glow light — warm core illumination */}
      <pointLight
        position={[0, -1.0, -2.25]}
        intensity={1.85}
        color="#ff6622"
        distance={7.5}
        decay={2.1}
      />

      {/* Warm ambient color wash plane (subtle volume behind fire) */}
      <mesh position={[0, -0.2, -2.42]} rotation={[0.02, 0, 0]}>
        <planeGeometry args={[5.8, 3.4]} />
        <meshBasicMaterial
          color="#331100"
          transparent
          opacity={0.32}
          depthWrite={false}
          side={2}
        />
      </mesh>

      {/* === HEART: FIRE SOURCE === */}
      <FireSource
        position={[0, -1.18, -2.38]}
        intensity={0.98}
        colorTemp={0.58}
        embers
        onProximity={handleFireProximity}
      />

      {/* === CANDLE ON MANTEL (tiny living flame) === */}
      <mesh position={[1.22, 0.78, -2.32]}>
        <cylinderGeometry args={[0.035, 0.038, 0.22, 5]} />
        <meshStandardMaterial color="#f4e9d8" roughness={0.6} emissive="#ffdd88" emissiveIntensity={0.35} />
      </mesh>
      {/* Candle flame glow (micro GlowField) */}
      <GlowField
        position={[1.22, 0.92, -2.32]}
        color="#ffdd99"
        pulseRate={0.42}
        intensity={0.65}
        count={4}
      />

      {/* === FLOATING DUST MOTES & EMBER GLOW (multiple layers for volume) === */}
      {/* High library dust near ceiling */}
      <GlowField
        position={[0.3, 1.65, -2.8]}
        color="#ffcc77"
        pulseRate={0.11}
        intensity={0.38}
        count={26}
      />
      {/* Mid air ember-lit dust around fire */}
      <GlowField
        position={[-0.6, 0.35, -2.15]}
        color="#ffaa55"
        pulseRate={0.19}
        intensity={0.52}
        count={19}
      />
      {/* Side warm pool near door */}
      <GlowField
        position={[2.1, 0.15, -2.55]}
        color="#eebb66"
        pulseRate={0.14}
        intensity={0.44}
        count={12}
      />

      {/* === DRIFTING PAPER / DRIED LEAVES in still library air === */}
      <LeafField
        position={[-1.9, 0.75, -2.15]}
        count={6}
        driftSpeed={0.065}
        color="#c9b38a"
        wind
        onTouch={handleLeafTouch}
      />
      {/* Secondary slower cluster near right shelves */}
      <LeafField
        position={[2.4, 0.55, -2.9]}
        count={4}
        driftSpeed={0.048}
        color="#b89f7a"
        wind
        onTouch={handleLeafTouch}
      />

      {/* === WOOD PLANK FLOOR (dark, wide, natural grain suggestion via multiple boards) === */}
      {/* Base floor plane */}
      <mesh position={[0, -1.72, -1.35]} rotation={[-Math.PI * 0.5, 0, 0]}>
        <planeGeometry args={[13, 7.5]} />
        <meshStandardMaterial color="#1a1008" roughness={0.94} metalness={0.0} />
      </mesh>
      {/* Plank separation lines (thin darker boxes for natural floorboards) */}
      {[-3.2, -1.6, 0, 1.6, 3.2].map((x, i) => (
        <mesh key={`plank-${i}`} position={[x, -1.71, -1.35]} rotation={[-Math.PI * 0.5, 0, 0]}>
          <boxGeometry args={[0.08, 7.2, 0.02]} />
          <meshStandardMaterial color="#120b06" roughness={0.98} />
        </mesh>
      ))}

      {/* Foreground book stack (physical detail, no interaction) */}
      <mesh position={[-3.1, -1.38, -0.85]}>
        <boxGeometry args={[0.65, 0.28, 0.9]} />
        <meshStandardMaterial color="#2a2118" roughness={0.82} />
      </mesh>
      <mesh position={[-3.05, -1.12, -0.82]}>
        <boxGeometry args={[0.6, 0.22, 0.82]} />
        <meshStandardMaterial color="#35291f" roughness={0.85} />
      </mesh>

      {/* === SCENE DOOR embedded in bookshelf (bookshelf material) === */}
      <SceneDoor
        position={[2.8, -0.35, -2.65]}
        rotation={[0.01, -0.04, 0.005]}
        materialType="bookshelf"
        destinationScene="ZenGardenScene"
        onNavigate={handleNavigate}
        ariaLabel="Leave the library through the bookshelf passage into the garden"
      />

      {/* Subtle right wall enclosure for spatial feel */}
      <mesh position={[5.8, 0.3, -2.8]} rotation={[0, -0.6, 0]}>
        <planeGeometry args={[6, 5.5]} />
        <meshStandardMaterial color="#231b14" roughness={0.95} side={2} />
      </mesh>

      {/* TODO: distant page turning + soft crackle + very faint music box (audio bridge) */}
    </group>
  );
};

export default WarmLibraryScene;
