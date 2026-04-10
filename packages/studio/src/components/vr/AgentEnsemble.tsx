/**
 * AgentEnsemble — 4 floating specialist AI agent orbs in VR
 *
 * Orbs hover near their "domain" when activated:
 *   🔵 Physics      — attaches near physics objects
 *   🟣 ArtDirector  — orbits the scene center
 *   🟡 Animator     — follows the selected object
 *   🔴 SoundDesigner— hovers at the top of the scene
 *
 * Each orb shows its name + last message via Html billboard.
 * Clicking an orb in VR (hover glow) opens Brittney-style
 * context so the specialist agent can advise.
 */

'use client';

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

// ─── Agent configuration ──────────────────────────────────────────────────────

interface AgentConfig {
  id: string;
  label: string;
  emoji: string;
  color: string;
  glowColor: string;
  getBasePosition: (time: number, selected: THREE.Vector3 | null) => [number, number, number];
  hint: string;
}

const AGENTS: AgentConfig[] = [
  {
    id: 'physics',
    label: 'Physics',
    emoji: '⚛️',
    color: '#3b82f6',
    glowColor: '#60a5fa',
    getBasePosition: (t) => [-1.6, 1.2 + Math.sin(t * 0.9) * 0.06, -1.8],
    hint: 'I manage rigidbodies, colliders, and forces.',
  },
  {
    id: 'artdir',
    label: 'Art Director',
    emoji: '🎨',
    color: '#8b5cf6',
    glowColor: '#a78bfa',
    getBasePosition: (t) => [0, 1.8 + Math.sin(t * 1.1 + 1) * 0.05, -2.2],
    hint: 'I refine materials, lighting, and composition.',
  },
  {
    id: 'animator',
    label: 'Animator',
    emoji: '🎬',
    color: '#eab308',
    glowColor: '#facc15',
    getBasePosition: (t, sel) =>
      sel
        ? [sel.x + 0.4, sel.y + 0.6 + Math.sin(t * 1.4) * 0.04, sel.z]
        : [1.6, 1.2 + Math.sin(t * 1.4 + 2) * 0.06, -1.8],
    hint: 'I handle keyframes, curves, and motion paths.',
  },
  {
    id: 'sound',
    label: 'Sound Designer',
    emoji: '🎵',
    color: '#ef4444',
    glowColor: '#f87171',
    getBasePosition: (t) => [1.0, 2.2 + Math.sin(t * 0.7 + 3) * 0.06, -1.6],
    hint: 'I place 3D audio, reverb zones, and SFX.',
  },
];

// ─── Single orb ───────────────────────────────────────────────────────────────

interface OrbProps {
  agent: AgentConfig;
  selectedPos: THREE.Vector3 | null;
}

function AgentOrb({ agent, selectedPos }: OrbProps) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const t = useRef(0);
  const currentPos = useRef(new THREE.Vector3(...agent.getBasePosition(0, selectedPos)));

  useFrame((_, delta) => {
    t.current += delta;
    const [tx, ty, tz] = agent.getBasePosition(t.current, selectedPos);
    currentPos.current.lerp(new THREE.Vector3(tx, ty, tz), 0.05);

    if (groupRef.current) {
      groupRef.current.position.copy(currentPos.current);
    }

    // Glow pulse
    if (glowRef.current) {
      const baseScale = hovered ? 1.3 : 1.0;
      const pulse = baseScale + Math.sin(t.current * 3) * 0.07;
      glowRef.current.scale.setScalar(pulse);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = hovered ? 0.35 : 0.14 + Math.sin(t.current * 3) * 0.06;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Glow aura */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.055, 14, 14]} />
        <meshBasicMaterial
          color={agent.glowColor}
          transparent
          opacity={0.15}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Core orb */}
      <mesh
        onPointerEnter={() => {
          setHovered(true);
          setShowHint(true);
        }}
        onPointerLeave={() => {
          setHovered(false);
          setTimeout(() => setShowHint(false), SAVE_FEEDBACK_DURATION);
        }}
      >
        <sphereGeometry args={[0.032, 16, 16]} />
        <meshStandardMaterial
          color={agent.color}
          emissive={agent.color}
          emissiveIntensity={hovered ? 1.4 : 0.6}
          roughness={0.1}
          metalness={0.7}
        />
      </mesh>

      {/* Orbit ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.038, 0.044, 32]} />
        <meshBasicMaterial color={agent.glowColor} transparent opacity={0.5} />
      </mesh>

      {/* Label / hint billboard */}
      <Html
        position={[0, 0.055, 0]}
        center
        transform
        scale={0.0016}
        occlude={false}
        zIndexRange={[30, 31]}
      >
        <div
          style={{
            background: showHint
              ? `linear-gradient(135deg, ${agent.color}cc, ${agent.glowColor}99)`
              : 'rgba(10,10,20,0.75)',
            border: `1px solid ${agent.glowColor}55`,
            borderRadius: 10,
            padding: showHint ? '6px 10px' : '3px 8px',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
            maxWidth: 200,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {agent.emoji} {agent.label}
          </span>
          {showHint && (
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 9,
                color: 'rgba(255,255,255,0.8)',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {agent.hint}
            </p>
          )}
        </div>
      </Html>
    </group>
  );
}

// ─── Ensemble root ────────────────────────────────────────────────────────────

export function AgentEnsemble() {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);

  // Resolve world-space position of selected node (from store transform)
  const selectedPos = (() => {
    if (!selectedId) return null;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node?.position) return null;
    return new THREE.Vector3(...node.position);
  })();

  return (
    <group name="agent-ensemble">
      {AGENTS.map((a) => (
        <AgentOrb key={a.id} agent={a} selectedPos={selectedPos} />
      ))}
    </group>
  );
}
