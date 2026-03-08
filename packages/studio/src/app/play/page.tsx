'use client';

import Link from 'next/link';
import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls, GizmoHelper, GizmoViewport, Environment,
  TransformControls, Sky, Stars, Cloud, Float,
  MeshWobbleMaterial, MeshDistortMaterial, Sparkles,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface SceneObject {
  id: string;
  type: string;
  label: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  children?: CompoundChild[];
  velocity?: [number, number, number];
}

interface CompoundChild {
  type: string;
  offset: [number, number, number];
  scale: [number, number, number];
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

// ═══════════════════════════════════════════════════════════════════
// Stylized Primitives & Models
// ═══════════════════════════════════════════════════════════════════

const PRIMITIVES = [
  { type: 'box',      label: 'Box',      emoji: '📦', color: '#6C5CE7', category: 'shape' as const },
  { type: 'sphere',   label: 'Sphere',   emoji: '🔮', color: '#FD79A8', category: 'shape' as const },
  { type: 'cylinder', label: 'Cylinder', emoji: '🥫', color: '#00CEC9', category: 'shape' as const },
  { type: 'cone',     label: 'Cone',     emoji: '🔺', color: '#FDCB6E', category: 'shape' as const },
  { type: 'torus',    label: 'Ring',     emoji: '💎', color: '#E17055', category: 'shape' as const },
  { type: 'capsule',  label: 'Capsule',  emoji: '💊', color: '#A29BFE', category: 'shape' as const },
];

const COMPOUNDS = [
  {
    type: 'tree', label: 'Tree', emoji: '🌲', color: '#00B894', category: 'model' as const,
    children: [
      { type: 'cylinder', offset: [0, 0, 0] as [number, number, number], scale: [0.25, 1.4, 0.25] as [number, number, number], color: '#6D4C41', roughness: 0.9, metalness: 0 },
      { type: 'sphere',   offset: [0, 1.6, 0] as [number, number, number], scale: [1.4, 1.6, 1.4] as [number, number, number], color: '#00B894', roughness: 0.7, metalness: 0 },
      { type: 'sphere',   offset: [0.5, 1.2, 0.3] as [number, number, number], scale: [0.9, 1.0, 0.9] as [number, number, number], color: '#55EFC4', roughness: 0.7, metalness: 0 },
      { type: 'sphere',   offset: [-0.4, 1.3, -0.3] as [number, number, number], scale: [0.8, 0.9, 0.8] as [number, number, number], color: '#00CEC9', roughness: 0.7, metalness: 0 },
    ],
  },
  {
    type: 'house', label: 'House', emoji: '🏠', color: '#FDCB6E', category: 'model' as const,
    children: [
      { type: 'box',  offset: [0, 0, 0] as [number, number, number], scale: [1.6, 1.3, 1.6] as [number, number, number], color: '#FFEAA7', roughness: 0.6, metalness: 0.05 },
      { type: 'cone', offset: [0, 1.1, 0] as [number, number, number], scale: [2.0, 1.0, 2.0] as [number, number, number], color: '#E17055', roughness: 0.5, metalness: 0.1 },
      { type: 'box',  offset: [0.35, -0.15, 0.81] as [number, number, number], scale: [0.38, 0.65, 0.06] as [number, number, number], color: '#6D4C41', roughness: 0.8, metalness: 0 },
      // Windows (emissive glow!)
      { type: 'box',  offset: [-0.35, 0.15, 0.81] as [number, number, number], scale: [0.3, 0.3, 0.04] as [number, number, number], color: '#74B9FF', emissive: '#74B9FF', emissiveIntensity: 2.0, roughness: 0.1, metalness: 0.5 },
      { type: 'box',  offset: [-0.35, 0.15, -0.81] as [number, number, number], scale: [0.3, 0.3, 0.04] as [number, number, number], color: '#74B9FF', emissive: '#74B9FF', emissiveIntensity: 2.0, roughness: 0.1, metalness: 0.5 },
    ],
  },
  {
    type: 'snowman', label: 'Snowman', emoji: '⛄', color: '#DFE6E9', category: 'model' as const,
    children: [
      { type: 'sphere', offset: [0, 0, 0] as [number, number, number],    scale: [0.85, 0.85, 0.85] as [number, number, number], color: '#F5F6FA', roughness: 0.3, metalness: 0.1 },
      { type: 'sphere', offset: [0, 0.8, 0] as [number, number, number],  scale: [0.65, 0.65, 0.65] as [number, number, number], color: '#F5F6FA', roughness: 0.3, metalness: 0.1 },
      { type: 'sphere', offset: [0, 1.4, 0] as [number, number, number],  scale: [0.45, 0.45, 0.45] as [number, number, number], color: '#FFFFFF', roughness: 0.3, metalness: 0.1 },
      // Carrot nose
      { type: 'cone',   offset: [0, 1.4, 0.25] as [number, number, number], scale: [0.06, 0.3, 0.06] as [number, number, number], color: '#E17055', roughness: 0.6, metalness: 0 },
      // Eyes
      { type: 'sphere', offset: [-0.1, 1.5, 0.2] as [number, number, number], scale: [0.06, 0.06, 0.06] as [number, number, number], color: '#2D3436', roughness: 1, metalness: 0 },
      { type: 'sphere', offset: [0.1, 1.5, 0.2] as [number, number, number], scale: [0.06, 0.06, 0.06] as [number, number, number], color: '#2D3436', roughness: 1, metalness: 0 },
      // Hat
      { type: 'cylinder', offset: [0, 1.7, 0] as [number, number, number], scale: [0.35, 0.08, 0.35] as [number, number, number], color: '#2D3436', roughness: 0.5, metalness: 0.2 },
      { type: 'cylinder', offset: [0, 1.9, 0] as [number, number, number], scale: [0.25, 0.35, 0.25] as [number, number, number], color: '#2D3436', roughness: 0.5, metalness: 0.2 },
    ],
  },
  {
    type: 'castle', label: 'Castle', emoji: '🏰', color: '#B2BEC3', category: 'model' as const,
    children: [
      { type: 'box',      offset: [0, 0, 0] as [number, number, number],       scale: [2.8, 1.8, 2.8] as [number, number, number], color: '#B2BEC3', roughness: 0.7, metalness: 0.15 },
      { type: 'cylinder', offset: [-1.2, 1.2, -1.2] as [number, number, number], scale: [0.4, 1.4, 0.4] as [number, number, number], color: '#A4B0BE', roughness: 0.7, metalness: 0.15 },
      { type: 'cylinder', offset: [1.2, 1.2, -1.2] as [number, number, number],  scale: [0.4, 1.4, 0.4] as [number, number, number], color: '#A4B0BE', roughness: 0.7, metalness: 0.15 },
      { type: 'cylinder', offset: [-1.2, 1.2, 1.2] as [number, number, number],  scale: [0.4, 1.4, 0.4] as [number, number, number], color: '#A4B0BE', roughness: 0.7, metalness: 0.15 },
      { type: 'cylinder', offset: [1.2, 1.2, 1.2] as [number, number, number],   scale: [0.4, 1.4, 0.4] as [number, number, number], color: '#A4B0BE', roughness: 0.7, metalness: 0.15 },
      // Tower roofs
      { type: 'cone', offset: [-1.2, 2.3, -1.2] as [number, number, number], scale: [0.55, 0.7, 0.55] as [number, number, number], color: '#6C5CE7', roughness: 0.3, metalness: 0.3 },
      { type: 'cone', offset: [1.2, 2.3, -1.2] as [number, number, number],  scale: [0.55, 0.7, 0.55] as [number, number, number], color: '#6C5CE7', roughness: 0.3, metalness: 0.3 },
      { type: 'cone', offset: [-1.2, 2.3, 1.2] as [number, number, number],  scale: [0.55, 0.7, 0.55] as [number, number, number], color: '#6C5CE7', roughness: 0.3, metalness: 0.3 },
      { type: 'cone', offset: [1.2, 2.3, 1.2] as [number, number, number],   scale: [0.55, 0.7, 0.55] as [number, number, number], color: '#6C5CE7', roughness: 0.3, metalness: 0.3 },
      // Gate glow
      { type: 'box', offset: [0, -0.3, 1.41] as [number, number, number], scale: [0.5, 0.8, 0.08] as [number, number, number], color: '#FDCB6E', emissive: '#FDCB6E', emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.5 },
    ],
  },
  {
    type: 'rocket', label: 'Rocket', emoji: '🚀', color: '#FF6B6B', category: 'model' as const,
    children: [
      { type: 'cylinder', offset: [0, 0, 0] as [number, number, number],     scale: [0.45, 2.2, 0.45] as [number, number, number], color: '#DFE6E9', roughness: 0.2, metalness: 0.7 },
      { type: 'cone',     offset: [0, 1.4, 0] as [number, number, number],   scale: [0.5, 0.8, 0.5] as [number, number, number], color: '#FF6B6B', roughness: 0.3, metalness: 0.4 },
      // Fins
      { type: 'cone', offset: [0.35, -0.85, 0] as [number, number, number], scale: [0.2, 0.55, 0.1] as [number, number, number], color: '#74B9FF', roughness: 0.3, metalness: 0.4 },
      { type: 'cone', offset: [-0.35, -0.85, 0] as [number, number, number], scale: [0.2, 0.55, 0.1] as [number, number, number], color: '#74B9FF', roughness: 0.3, metalness: 0.4 },
      { type: 'cone', offset: [0, -0.85, 0.35] as [number, number, number], scale: [0.1, 0.55, 0.2] as [number, number, number], color: '#74B9FF', roughness: 0.3, metalness: 0.4 },
      // Engine glow
      { type: 'sphere', offset: [0, -1.1, 0] as [number, number, number], scale: [0.35, 0.35, 0.35] as [number, number, number], color: '#FDCB6E', emissive: '#FF6348', emissiveIntensity: 3.0, roughness: 0, metalness: 0 },
    ],
  },
  {
    type: 'crystal', label: 'Crystal', emoji: '💠', color: '#A29BFE', category: 'model' as const,
    children: [
      { type: 'cone', offset: [0, 0, 0] as [number, number, number],    scale: [0.6, 1.8, 0.6] as [number, number, number], color: '#A29BFE', emissive: '#6C5CE7', emissiveIntensity: 1.0, roughness: 0.05, metalness: 0.9 },
      { type: 'cone', offset: [0, 0, 0] as [number, number, number],    scale: [0.6, -1.0, 0.6] as [number, number, number], color: '#A29BFE', emissive: '#6C5CE7', emissiveIntensity: 1.0, roughness: 0.05, metalness: 0.9 },
      { type: 'cone', offset: [0.3, -0.3, 0.2] as [number, number, number], scale: [0.3, 1.0, 0.3] as [number, number, number], color: '#74B9FF', emissive: '#0984E3', emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.9 },
    ],
  },
  {
    type: 'dragon', label: 'Dragon', emoji: '🐉', color: '#FF4400', category: 'model' as const,
    children: [], // GLB model — no inline children needed
  },
];

const ALL_TOOLS = [...PRIMITIVES, ...COMPOUNDS];

const COLOR_PALETTE = [
  '#6C5CE7', '#FD79A8', '#00CEC9', '#FDCB6E', '#E17055',
  '#A29BFE', '#74B9FF', '#FF6B6B', '#55EFC4', '#F5F6FA',
  '#2D3436', '#00B894',
];

// ── Lighting Presets ──
const LIGHTING_PRESETS = [
  { id: 'sunset',  label: '🌅 Sunset',  sky: true,  sunPos: [1, 0.15, -1] as [number, number, number], stars: false, ambI: 0.5, dirI: 1.2, fogColor: '#1a0d2e', bgGradient: 'linear-gradient(180deg, #1a0d2e 0%, #3d1947 30%, #c84b31 60%, #0d1f0d 100%)' },
  { id: 'day',     label: '☀️ Day',     sky: true,  sunPos: [0, 1, 0] as [number, number, number], stars: false, ambI: 0.8, dirI: 1.8, fogColor: '#87CEEB', bgGradient: 'linear-gradient(180deg, #74B9FF 0%, #A3D8F4 50%, #55EFC4 80%, #00B894 100%)' },
  { id: 'night',   label: '🌙 Night',   sky: false, sunPos: [0, -1, 0] as [number, number, number], stars: true, ambI: 0.15, dirI: 0.3, fogColor: '#050510', bgGradient: 'linear-gradient(180deg, #0c0c1d 0%, #1a1a3e 50%, #0d150d 100%)' },
  { id: 'neon',    label: '🟣 Neon',    sky: false, sunPos: [0, -1, 0] as [number, number, number], stars: true, ambI: 0.2, dirI: 0.4, fogColor: '#0a001a', bgGradient: 'linear-gradient(180deg, #0a001a 0%, #1a0033 50%, #0d001a 100%)' },
  { id: 'golden',  label: '✨ Golden',  sky: true,  sunPos: [-1, 0.2, 0] as [number, number, number], stars: false, ambI: 0.6, dirI: 1.5, fogColor: '#2a1a0a', bgGradient: 'linear-gradient(180deg, #2a1a0a 0%, #4a2a10 30%, #ffa751 60%, #1a2a0a 100%)' },
];

// ── Scene Templates ──
const SCENES: Record<string, { label: string; emoji: string; objects: Omit<SceneObject, 'id'>[] }> = {
  empty: { label: 'Empty', emoji: '🆕', objects: [] },
  village: {
    label: 'Village', emoji: '🏘️',
    objects: [
      { type: 'house', label: 'House', position: [0, 0.65, -3], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#FDCB6E', children: COMPOUNDS.find(c => c.type === 'house')!.children },
      { type: 'house', label: 'House', position: [4, 0.65, -4.5], rotation: [0, 0.5, 0], scale: [0.85, 0.85, 0.85], color: '#FF7675', children: COMPOUNDS.find(c => c.type === 'house')!.children?.map(c => ({ ...c, color: c.type === 'box' && c.offset[1] === 0 ? '#FF7675' : c.color })) },
      { type: 'tree', label: 'Tree', position: [-3, 0.7, -2], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#00B894', children: COMPOUNDS.find(c => c.type === 'tree')!.children },
      { type: 'tree', label: 'Tree', position: [2, 0.7, -1], rotation: [0, 1.2, 0], scale: [1.25, 1.25, 1.25], color: '#00B894', children: COMPOUNDS.find(c => c.type === 'tree')!.children },
      { type: 'tree', label: 'Tree', position: [-5.5, 0.7, -5], rotation: [0, 2, 0], scale: [0.9, 0.9, 0.9], color: '#00B894', children: COMPOUNDS.find(c => c.type === 'tree')!.children },
      { type: 'crystal', label: 'Crystal', position: [6, 0.5, -1], rotation: [0, 0.8, 0], scale: [0.5, 0.5, 0.5], color: '#A29BFE', children: COMPOUNDS.find(c => c.type === 'crystal')!.children },
    ],
  },
  space: {
    label: 'Space', emoji: '🚀',
    objects: [
      { type: 'rocket', label: 'Rocket', position: [0, 1.1, -3], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#FF6B6B', children: COMPOUNDS.find(c => c.type === 'rocket')!.children },
      { type: 'sphere', label: 'Planet', position: [5, 2.5, -6], rotation: [0, 0, 0], scale: [2.5, 2.5, 2.5], color: '#6C5CE7', children: undefined },
      { type: 'sphere', label: 'Moon', position: [-4, 3.5, -5], rotation: [0, 0, 0], scale: [1.0, 1.0, 1.0], color: '#DFE6E9', children: undefined },
      { type: 'torus', label: 'Ring', position: [5, 2.5, -6], rotation: [1.2, 0, 0], scale: [3.5, 3.5, 0.2], color: '#FDCB6E', children: undefined },
      { type: 'crystal', label: 'Crystal', position: [-2, 0.5, -1], rotation: [0, 0, 0.3], scale: [0.7, 0.7, 0.7], color: '#A29BFE', children: COMPOUNDS.find(c => c.type === 'crystal')!.children },
    ],
  },
  enchanted: {
    label: 'Enchanted', emoji: '🔮',
    objects: [
      { type: 'castle', label: 'Castle', position: [0, 0.9, -5], rotation: [0, 0, 0], scale: [1, 1, 1], color: '#B2BEC3', children: COMPOUNDS.find(c => c.type === 'castle')!.children },
      { type: 'tree', label: 'Tree', position: [-4, 0.7, -3], rotation: [0, 0.5, 0], scale: [1.3, 1.3, 1.3], color: '#00B894', children: COMPOUNDS.find(c => c.type === 'tree')!.children },
      { type: 'tree', label: 'Tree', position: [4, 0.7, -2], rotation: [0, -0.8, 0], scale: [1.1, 1.1, 1.1], color: '#00B894', children: COMPOUNDS.find(c => c.type === 'tree')!.children },
      { type: 'crystal', label: 'Crystal', position: [-2, 0.5, -1], rotation: [0, 0, 0], scale: [0.8, 0.8, 0.8], color: '#A29BFE', children: COMPOUNDS.find(c => c.type === 'crystal')!.children },
      { type: 'crystal', label: 'Crystal', position: [3, 0.5, -7], rotation: [0, 1.5, 0.1], scale: [0.6, 0.6, 0.6], color: '#74B9FF', children: COMPOUNDS.find(c => c.type === 'crystal')!.children },
      { type: 'snowman', label: 'Snowman', position: [6, 0.42, -4], rotation: [0, -0.5, 0], scale: [0.8, 0.8, 0.8], color: '#DFE6E9', children: COMPOUNDS.find(c => c.type === 'snowman')!.children },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════
// Sound Effects
// ═══════════════════════════════════════════════════════════════════

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext { if (!audioCtx) audioCtx = new AudioContext(); return audioCtx; }

function playPlaceSound() {
  try { const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.setValueAtTime(600, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15); gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2); } catch {}
}
function playDeleteSound() {
  try { const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'sawtooth'; osc.connect(gain); gain.connect(ctx.destination); osc.frequency.setValueAtTime(400, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2); gain.gain.setValueAtTime(0.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25); } catch {}
}
function playBounceSound() {
  try { const ctx = getAudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.setValueAtTime(200 + Math.random() * 200, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1); gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12); osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12); } catch {}
}

// ═══════════════════════════════════════════════════════════════════
// 3D Components
// ═══════════════════════════════════════════════════════════════════

/** GLB model types that have compiled .glb files */
const GLB_MODEL_TYPES = new Set(['tree', 'house', 'castle', 'snowman', 'rocket', 'crystal', 'dragon']);

function PrimitiveGeometry({ type }: { type: string }) {
  switch (type) {
    case 'box':      return <boxGeometry args={[1, 1, 1]} />;
    case 'sphere':   return <sphereGeometry args={[0.5, 32, 32]} />;
    case 'cylinder': return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case 'cone':     return <coneGeometry args={[0.5, 1, 32]} />;
    case 'torus':    return <torusGeometry args={[0.4, 0.15, 16, 48]} />;
    case 'capsule':  return <capsuleGeometry args={[0.3, 0.5, 8, 16]} />;
    default:         return <boxGeometry />;
  }
}

/** Rich material for each mesh */
function RichMaterial({ color, isSelected, emissive, emissiveIntensity, metalness, roughness }: {
  color: string; isSelected: boolean; emissive?: string; emissiveIntensity?: number; metalness?: number; roughness?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness ?? 0.35}
      metalness={metalness ?? 0.15}
      emissive={emissive ?? (isSelected ? color : '#000000')}
      emissiveIntensity={emissiveIntensity ?? (isSelected ? 0.25 : 0)}
      envMapIntensity={0.8}
    />
  );
}

/** Per-model scale overrides (large models scaled to fit scene) */
const MODEL_SCALE_OVERRIDES: Record<string, number> = { dragon: 0.3 };

/** Load and render a HoloScript-compiled GLB model */
function GLBModel({ type, isSelected, onClick }: { type: string; isSelected: boolean; onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  const { scene } = useGLTF(`/models/${type}.glb`);
  const modelScale = MODEL_SCALE_OVERRIDES[type] ?? 1;
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    // Traverse and update materials for selection highlight
    c.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Clone materials so instances don't share state
        child.material = child.material.clone();
        if (isSelected) {
          child.material.emissive = new THREE.Color('#ffffff');
          child.material.emissiveIntensity = 0.15;
        }
      }
    });
    return c;
  }, [scene, isSelected]);

  return <primitive object={cloned} scale={[modelScale, modelScale, modelScale]} onClick={onClick} />;
}

/** Renders an object — GLB model or primitive */
function ScenePrimitive({ obj, isSelected, onSelect }: { obj: SceneObject; isSelected: boolean; onSelect: (id: string) => void }) {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle float animation
  useFrame((state) => {
    if (!groupRef.current || isSelected) return;
    groupRef.current.position.y = obj.position[1] + Math.sin(state.clock.elapsedTime * 0.8 + obj.position[0]) * 0.04;
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(obj.id); }, [obj.id, onSelect]);

  // Use GLB model for compound types
  if (GLB_MODEL_TYPES.has(obj.type)) {
    return (
      <group ref={groupRef} position={obj.position} rotation={obj.rotation} scale={obj.scale}>
        <GLBModel type={obj.type} isSelected={isSelected} onClick={handleClick} />
      </group>
    );
  }

  // Fallback: inline children (for any non-GLB compound shapes)
  if (obj.children && obj.children.length > 0) {
    return (
      <group ref={groupRef} position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handleClick}>
        {obj.children.map((child, i) => (
          <mesh key={i} position={child.offset} scale={child.scale} castShadow receiveShadow>
            <PrimitiveGeometry type={child.type} />
            <RichMaterial color={child.color} isSelected={isSelected} emissive={child.emissive} emissiveIntensity={child.emissiveIntensity} metalness={child.metalness} roughness={child.roughness} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <mesh position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handleClick} castShadow receiveShadow>
        <PrimitiveGeometry type={obj.type} />
        <RichMaterial color={obj.color} isSelected={isSelected} />
      </mesh>
    </group>
  );
}

/** Physics object with gravity */
function PhysicsObject({ obj, isSelected, onSelect, onUpdatePosition }: {
  obj: SceneObject; isSelected: boolean; onSelect: (id: string) => void; onUpdatePosition: (id: string, y: number, vy: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const velRef = useRef(obj.velocity?.[1] ?? 0);
  const posRef = useRef(obj.position[1]);

  useFrame((_, delta) => {
    if (isSelected) return;
    const dt = Math.min(delta, 0.05);
    velRef.current -= 9.81 * dt;
    posRef.current += velRef.current * dt;
    const groundY = getGroundY(obj);
    if (posRef.current <= groundY) {
      posRef.current = groundY;
      if (Math.abs(velRef.current) > 0.5) { velRef.current = -velRef.current * 0.35; playBounceSound(); }
      else { velRef.current = 0; }
    }
    if (groupRef.current) groupRef.current.position.y = posRef.current;
    if (velRef.current === 0 && Math.abs(posRef.current - obj.position[1]) > 0.01) onUpdatePosition(obj.id, posRef.current, 0);
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(obj.id); }, [obj.id, onSelect]);

  // Use GLB model for compound types
  if (GLB_MODEL_TYPES.has(obj.type)) {
    return (
      <group ref={groupRef} position={[obj.position[0], posRef.current, obj.position[2]]} rotation={obj.rotation} scale={obj.scale}>
        <GLBModel type={obj.type} isSelected={isSelected} onClick={handleClick} />
      </group>
    );
  }

  // Fallback: inline children
  if (obj.children && obj.children.length > 0) {
    return (
      <group ref={groupRef} position={[obj.position[0], posRef.current, obj.position[2]]} rotation={obj.rotation} scale={obj.scale} onClick={handleClick}>
        {obj.children.map((child, i) => (
          <mesh key={i} position={child.offset} scale={child.scale} castShadow receiveShadow>
            <PrimitiveGeometry type={child.type} />
            <RichMaterial color={child.color} isSelected={isSelected} emissive={child.emissive} emissiveIntensity={child.emissiveIntensity} metalness={child.metalness} roughness={child.roughness} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <mesh ref={groupRef as any} position={[obj.position[0], posRef.current, obj.position[2]]} rotation={obj.rotation} scale={obj.scale} onClick={handleClick} castShadow receiveShadow>
      <PrimitiveGeometry type={obj.type} />
      <RichMaterial color={obj.color} isSelected={isSelected} />
    </mesh>
  );
}

function getGroundY(obj: SceneObject): number {
  const s = obj.scale[1];
  switch (obj.type) {
    case 'sphere': return 0.5 * s;
    case 'torus': return 0.15 * s;
    case 'capsule': return 0.55 * s;
    case 'tree': return 0.7 * s;
    case 'house': return 0.65 * s;
    case 'snowman': return 0.42 * s;
    case 'castle': return 0.9 * s;
    case 'rocket': return 1.1 * s;
    case 'crystal': return 0.5 * s;
    default: return 0.5 * s;
  }
}

/** Ground plane */
function StylizedGround({ onPlace, lightingId }: { onPlace: (p: THREE.Vector3) => void; lightingId: string }) {
  const isNeon = lightingId === 'neon';
  return (
    <group>
      {/* Clickable invisible plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPlace(e.point); }}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial transparent opacity={0} />
      </mesh>
      {/* Visible grid ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial
          color={isNeon ? '#0a001a' : lightingId === 'day' ? '#55EFC4' : lightingId === 'golden' ? '#2a1a0a' : '#0d1420'}
          roughness={0.9}
          metalness={0.05}
        />
      </mesh>
      {/* Grid lines */}
      <gridHelper
        args={[30, 30, isNeon ? '#7c3aed' : '#334155', isNeon ? '#4c1d95' : '#1e293b']}
        position={[0, 0.001, 0]}
      />
    </group>
  );
}

/** Transform controls */
function SelectedTransform({ obj, mode, onUpdate, orbitRef }: {
  obj: SceneObject; mode: 'translate' | 'rotate' | 'scale';
  onUpdate: (id: string, pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  orbitRef: React.RefObject<any>;
}) {
  const ref = useRef<any>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const onChange = () => { const o = c.object; if (o) onUpdate(obj.id, [o.position.x, o.position.y, o.position.z], [o.rotation.x, o.rotation.y, o.rotation.z], [o.scale.x, o.scale.y, o.scale.z]); };
    const onDrag = (e: { value: boolean }) => { if (orbitRef.current) orbitRef.current.enabled = !e.value; };
    c.addEventListener('change', onChange); c.addEventListener('dragging-changed', onDrag);
    return () => { c.removeEventListener('change', onChange); c.removeEventListener('dragging-changed', onDrag); };
  }, [obj.id, onUpdate, orbitRef]);

  return (
    <TransformControls ref={ref} mode={mode} position={obj.position} rotation={obj.rotation} scale={obj.scale} size={0.8}>
      <ScenePrimitive obj={obj} isSelected={true} onSelect={() => {}} />
    </TransformControls>
  );
}

/** Neon accent lights */
function NeonLights() {
  return (
    <>
      <pointLight position={[-5, 3, 3]} intensity={3} color="#A855F7" distance={18} />
      <pointLight position={[5, 3, -3]} intensity={3} color="#06B6D4" distance={18} />
      <pointLight position={[0, 1, 5]} intensity={2} color="#EC4899" distance={14} />
    </>
  );
}

/** The main 3D scene */
function SceneContent({ objects, selectedId, transformMode, lighting, physicsEnabled, onSelect, onPlace, onUpdateTransform, onUpdatePhysicsPos, orbitRef }: {
  objects: SceneObject[]; selectedId: string | null; transformMode: 'translate' | 'rotate' | 'scale';
  lighting: typeof LIGHTING_PRESETS[number]; physicsEnabled: boolean;
  onSelect: (id: string | null) => void; onPlace: (point: THREE.Vector3) => void;
  onUpdateTransform: (id: string, pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  onUpdatePhysicsPos: (id: string, y: number, vy: number) => void; orbitRef: React.RefObject<any>;
}) {
  return (
    <>
      {/* === LIGHTING === */}
      <ambientLight intensity={lighting.ambI} />
      <directionalLight position={[8, 12, 5]} intensity={lighting.dirI} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-far={50} shadow-camera-left={-15} shadow-camera-right={15}
        shadow-camera-top={15} shadow-camera-bottom={-15} />
      <hemisphereLight intensity={0.3} color="#74B9FF" groundColor="#E17055" />
      {lighting.id === 'neon' && <NeonLights />}

      {/* === SKY & ENVIRONMENT === */}
      {lighting.sky && (
        <Sky sunPosition={lighting.sunPos} turbidity={8} rayleigh={2} mieCoefficient={0.005} mieDirectionalG={0.8} />
      )}
      {lighting.stars && (
        <Stars radius={100} depth={50} count={3000} factor={4} saturation={0.5} fade speed={1.5} />
      )}
      {lighting.id === 'day' && (
        <>
          <Cloud position={[-8, 12, -10]} speed={0.2} opacity={0.4} width={10} depth={1.5} segments={15} />
          <Cloud position={[6, 14, -15]} speed={0.15} opacity={0.3} width={8} depth={1} segments={12} />
        </>
      )}
      <Environment preset={lighting.id === 'day' ? 'park' : lighting.id === 'neon' ? 'city' : 'sunset'} background={false} environmentIntensity={0.5} />
      <fog attach="fog" args={[lighting.fogColor, 18, 45]} />

      {/* === AMBIENT PARTICLES === */}
      <Sparkles count={80} size={3} scale={[20, 10, 20]} speed={0.3}
        color={lighting.id === 'neon' ? '#A855F7' : lighting.id === 'night' ? '#74B9FF' : '#FDCB6E'}
        opacity={0.5} />

      {/* === GROUND === */}
      <StylizedGround onPlace={onPlace} lightingId={lighting.id} />

      {/* Deselect on background click */}
      <mesh visible={false} position={[0, 10, 0]} onClick={() => onSelect(null)}>
        <sphereGeometry args={[100]} />
      </mesh>

      {/* === OBJECTS === */}
      {objects.map(obj => {
        if (obj.id === selectedId) return <SelectedTransform key={obj.id} obj={obj} mode={transformMode} onUpdate={onUpdateTransform} orbitRef={orbitRef} />;
        if (physicsEnabled) return <PhysicsObject key={obj.id} obj={obj} isSelected={false} onSelect={onSelect} onUpdatePosition={onUpdatePhysicsPos} />;
        return <ScenePrimitive key={obj.id} obj={obj} isSelected={false} onSelect={onSelect} />;
      })}

      {/* === CONTROLS === */}
      <OrbitControls ref={orbitRef} makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={2} maxDistance={30} target={[0, 0, 0]} enableDamping dampingFactor={0.05} />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Play Mode Page
// ═══════════════════════════════════════════════════════════════════

export default function PlayPage() {
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<typeof ALL_TOOLS[number]>(PRIMITIVES[0]);
  const [activeColor, setActiveColor] = useState(PRIMITIVES[0].color);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [lightingIdx, setLightingIdx] = useState(0);
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const orbitRef = useRef<any>(null);

  const selectedObj = selectedId ? objects.find(o => o.id === selectedId) : null;
  const lighting = LIGHTING_PRESETS[lightingIdx];

  const handlePlace = useCallback((point: THREE.Vector3) => {
    if (selectedId) { setSelectedId(null); return; }
    const compound = COMPOUNDS.find(c => c.type === activeTool.type);
    const groundY = getGroundY({ type: activeTool.type, scale: [1, 1, 1] } as SceneObject);
    const newObj: SceneObject = {
      id: `obj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: activeTool.type, label: activeTool.label,
      position: [Math.round(point.x * 2) / 2, physicsEnabled ? 5 + Math.random() * 3 : groundY, Math.round(point.z * 2) / 2],
      rotation: [0, 0, 0], scale: [1, 1, 1], color: activeColor,
      children: compound?.children,
      velocity: physicsEnabled ? [0, 0, 0] : undefined,
    };
    setObjects(prev => [...prev, newObj]);
    setSelectedId(newObj.id);
    playPlaceSound();
  }, [activeTool, activeColor, selectedId, physicsEnabled]);

  const handleUpdateTransform = useCallback((id: string, pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, position: pos, rotation: rot, scale: scl } : o));
  }, []);

  const handleUpdatePhysicsPos = useCallback((id: string, y: number, vy: number) => {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, position: [o.position[0], y, o.position[2]], velocity: [0, vy, 0] } : o));
  }, []);

  const deleteSelected = useCallback(() => { if (!selectedId) return; playDeleteSound(); setObjects(prev => prev.filter(o => o.id !== selectedId)); setSelectedId(null); }, [selectedId]);
  const duplicateSelected = useCallback(() => { if (!selectedObj) return; const n = { ...selectedObj, id: `obj-${Date.now()}`, position: [selectedObj.position[0] + 1.5, selectedObj.position[1], selectedObj.position[2]] as [number, number, number] }; setObjects(prev => [...prev, n]); setSelectedId(n.id); playPlaceSound(); }, [selectedObj]);
  const paintSelected = useCallback((color: string) => {
    if (!selectedId) return; setActiveColor(color);
    setObjects(prev => prev.map(o => {
      if (o.id !== selectedId) return o;
      if (o.children) return { ...o, color, children: o.children.map((c, i) => i === 0 ? { ...c, color } : c) };
      return { ...o, color };
    }));
  }, [selectedId]);
  const loadScene = useCallback((sceneId: string) => { const s = SCENES[sceneId]; if (!s) return; setObjects(s.objects.map((o, i) => ({ ...o, id: `s-${sceneId}-${i}-${Date.now()}` }))); setSelectedId(null); }, []);
  const clearAll = useCallback(() => { if (objects.length === 0) return; playDeleteSound(); setObjects([]); setSelectedId(null); }, [objects.length]);
  const togglePhysics = useCallback(() => {
    setPhysicsEnabled(prev => {
      if (!prev) setObjects(objs => objs.map(o => ({ ...o, position: [o.position[0], o.position[1] + 0.1, o.position[2]] as [number, number, number], velocity: [0, 0, 0] as [number, number, number] })));
      return !prev;
    });
  }, []);
  const exportScene = useCallback(() => {
    const data = { version: 1, objects: objects.map(({ id, ...r }) => r), lighting: lighting.id };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [objects, lighting]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'Delete': case 'Backspace': e.preventDefault(); deleteSelected(); break;
        case 'd': if (e.ctrlKey || e.metaKey) { e.preventDefault(); duplicateSelected(); } break;
        case 'g': setTransformMode('translate'); break;
        case 'r': setTransformMode('rotate'); break;
        case 's': if (!e.ctrlKey) setTransformMode('scale'); break;
        case 'Escape': setSelectedId(null); break;
        case 'z': if (e.ctrlKey || e.metaKey) { e.preventDefault(); setObjects(prev => prev.slice(0, -1)); setSelectedId(null); } break;
        case 'p': togglePhysics(); break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [deleteSelected, duplicateSelected, togglePhysics]);

  return (
    <div className="play-page">
      <header className="play-header">
        <Link href="/" className="play-home-btn" title="Go Home">🏠</Link>
        <div className="play-title">
          <span className="play-title-emoji">🎨</span>
          <span>Play Mode</span>
          <span className="play-subtitle">3D Scene Builder</span>
        </div>
        <div className="play-header-actions">
          <button className={`play-physics-toggle ${physicsEnabled ? 'active' : ''}`} onClick={togglePhysics} title="Toggle Physics (P)">
            {physicsEnabled ? '🌍 Physics ON' : '⚡ Physics OFF'}
          </button>
          <span className="play-shape-counter">{objects.length} objects</span>
        </div>
      </header>

      <div className="play-workspace">
        <aside className="play-toolbar">
          <div className="play-toolbar-label">SHAPES</div>
          {PRIMITIVES.map(p => (
            <button key={p.type} className={`play-tool-btn ${activeTool.type === p.type ? 'active' : ''}`}
              onClick={() => { setActiveTool(p); setActiveColor(p.color); setSelectedId(null); }} title={p.label}>
              <span className="play-tool-emoji">{p.emoji}</span>
              <span className="play-tool-label">{p.label}</span>
            </button>
          ))}
          <div className="play-toolbar-divider" />
          <div className="play-toolbar-label">MODELS</div>
          {COMPOUNDS.map(p => (
            <button key={p.type} className={`play-tool-btn ${activeTool.type === p.type ? 'active' : ''}`}
              onClick={() => { setActiveTool(p); setActiveColor(p.color); setSelectedId(null); }} title={p.label}>
              <span className="play-tool-emoji">{p.emoji}</span>
              <span className="play-tool-label">{p.label}</span>
            </button>
          ))}
          <div className="play-toolbar-divider" />
          <div className="play-toolbar-label">SCENES</div>
          {Object.entries(SCENES).map(([id, scene]) => (
            <button key={id} className="play-tool-btn play-scene-btn" onClick={() => loadScene(id)} title={scene.label}>
              <span className="play-tool-emoji">{scene.emoji}</span>
              <span className="play-tool-label">{scene.label}</span>
            </button>
          ))}
        </aside>

        <main className="play-canvas-3d">
          <Canvas shadows camera={{ position: [6, 5, 8], fov: 50 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
            style={{ background: lighting.bgGradient }}>
            <Suspense fallback={null}>
              <SceneContent objects={objects} selectedId={selectedId} transformMode={transformMode}
                lighting={lighting} physicsEnabled={physicsEnabled}
                onSelect={setSelectedId} onPlace={handlePlace}
                onUpdateTransform={handleUpdateTransform} onUpdatePhysicsPos={handleUpdatePhysicsPos}
                orbitRef={orbitRef} />
            </Suspense>
          </Canvas>
          {objects.length === 0 && (
            <div className="play-canvas-hint">
              <span className="play-hint-emoji">👆</span>
              <span>Click the ground to place a shape!</span>
              <span className="play-hint-sub">Or load a scene from the left panel</span>
            </div>
          )}
        </main>

        {selectedObj && (
          <aside className="play-properties">
            <div className="play-toolbar-label">{selectedObj.label.toUpperCase()}</div>
            <div className="play-transform-group">
              {(['translate', 'rotate', 'scale'] as const).map(m => (
                <button key={m} className={`play-transform-btn ${transformMode === m ? 'active' : ''}`}
                  onClick={() => setTransformMode(m)}>
                  {m === 'translate' ? '↔️ Move' : m === 'rotate' ? '🔄 Rotate' : '📐 Scale'}
                </button>
              ))}
            </div>
            <div className="play-toolbar-label" style={{ marginTop: 12 }}>COLOR</div>
            <div className="play-color-grid">
              {COLOR_PALETTE.map(c => (
                <button key={c} className={`play-color-swatch ${selectedObj.color === c ? 'active' : ''}`}
                  style={{ background: c }} onClick={() => paintSelected(c)} />
              ))}
            </div>
            <div className="play-prop-actions">
              <button className="play-action-btn" onClick={duplicateSelected}>📋 Duplicate</button>
              <button className="play-action-btn play-delete-btn" onClick={deleteSelected}>🗑️ Delete</button>
            </div>
          </aside>
        )}
      </div>

      <footer className="play-footer">
        <div className="play-lighting-bar">
          {LIGHTING_PRESETS.map((p, i) => (
            <button key={p.id} className={`play-lighting-btn ${lightingIdx === i ? 'active' : ''}`} onClick={() => setLightingIdx(i)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="play-footer-hints">
          <span>🖱️ Click to place</span>
          <span>P Physics</span>
        </div>
        <div className="play-footer-actions">
          <button className="play-action-btn" onClick={exportScene} disabled={objects.length === 0}>📤 Export</button>
          <button className="play-action-btn" onClick={() => { setObjects(prev => prev.slice(0, -1)); setSelectedId(null); }} disabled={objects.length === 0}>↩️ Undo</button>
          <button className="play-action-btn" onClick={clearAll} disabled={objects.length === 0}>🗑️ Clear</button>
        </div>
      </footer>
    </div>
  );
}

// Preload all HoloScript-compiled GLB models
GLB_MODEL_TYPES.forEach(type => useGLTF.preload(`/models/${type}.glb`));
