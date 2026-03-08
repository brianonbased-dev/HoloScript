'use client';

import Link from 'next/link';
import { useState, useRef, useCallback, useEffect, useMemo, Suspense, type PointerEvent as ReactPointerEvent } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  OrbitControls, GizmoHelper, GizmoViewport, Environment,
  TransformControls, Sky, Stars, Cloud, Float,
  MeshWobbleMaterial, MeshDistortMaterial, Sparkles,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';
import { getProofOfPlayEngine, type ProofOfPlayStats } from './proofOfPlay';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

type AnimationType = 'none' | 'spin' | 'bob' | 'pulse' | 'orbit';
type ParticleType = 'none' | 'sparkles' | 'trail' | 'fire';

interface SimulationConfig {
  gravity: number;       // 0–20, default 9.81
  wind: [number, number, number]; // directional force
  friction: number;      // 0–1, default 0.35 (bounce damping)
  timeScale: number;     // 0.1–3.0, default 1.0
}

const DEFAULT_SIM: SimulationConfig = {
  gravity: 9.81,
  wind: [0, 0, 0],
  friction: 0.35,
  timeScale: 1.0,
};

const ANIMATION_PRESETS: { id: AnimationType; label: string; emoji: string }[] = [
  { id: 'none',  label: 'None',  emoji: '⏹️' },
  { id: 'spin',  label: 'Spin',  emoji: '🔄' },
  { id: 'bob',   label: 'Bob',   emoji: '🫧' },
  { id: 'pulse', label: 'Pulse', emoji: '💓' },
  { id: 'orbit', label: 'Orbit', emoji: '🪐' },
];

const PARTICLE_PRESETS: { id: ParticleType; label: string; emoji: string }[] = [
  { id: 'none',     label: 'None',     emoji: '⏹️' },
  { id: 'sparkles', label: 'Sparkles', emoji: '✨' },
  { id: 'trail',    label: 'Trail',    emoji: '🌊' },
  { id: 'fire',     label: 'Fire',     emoji: '🔥' },
];

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
  animation?: AnimationType;
  particles?: ParticleType;
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
  garden: {
    label: 'Garden', emoji: '🥕',
    objects: [],  // Garden uses its own interactive GardenScene component
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

  // Clone scene once (only when the source scene changes)
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = child.material.clone();
      }
    });
    return c;
  }, [scene]);

  // Apply selection highlight without recloning
  useEffect(() => {
    cloned.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.material.emissive = isSelected ? new THREE.Color('#ffffff') : new THREE.Color('#000000');
        child.material.emissiveIntensity = isSelected ? 0.15 : 0;
      }
    });
  }, [cloned, isSelected]);

  return <primitive object={cloned} scale={[modelScale, modelScale, modelScale]} onClick={onClick} />;
}

/** Renders an object — GLB model or primitive */
/** Per-object particle effects */
function ObjectParticles({ obj }: { obj: SceneObject }) {
  if (obj.particles === 'none') return null;
  const pos = obj.position;
  if (obj.particles === 'sparkles') {
    return <Sparkles count={30} size={4} scale={[2, 2, 2]} position={pos} speed={0.6} color="#FDCB6E" opacity={0.8} />;
  }
  if (obj.particles === 'trail') {
    return <Sparkles count={50} size={2} scale={[1.5, 3, 1.5]} position={[pos[0], pos[1] + 0.5, pos[2]]} speed={1.5} color="#74B9FF" opacity={0.6} />;
  }
  if (obj.particles === 'fire') {
    return (
      <>
        <pointLight position={pos} intensity={2} color="#FF6348" distance={5} />
        <Sparkles count={40} size={3} scale={[1, 2, 1]} position={[pos[0], pos[1] + 0.8, pos[2]]} speed={2} color="#FF6348" opacity={0.9} />
      </>
    );
  }
  return null;
}

function ScenePrimitive({ obj, isSelected, onSelect }: { obj: SceneObject; isSelected: boolean; onSelect: (id: string) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const spawnPos = useRef(obj.position);

  // Animation + gentle float
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const anim = obj.animation || 'none';

    switch (anim) {
      case 'spin':
        groupRef.current.rotation.y += delta * 1.5;
        break;
      case 'bob':
        groupRef.current.position.y = obj.position[1] + Math.sin(t * 2) * 0.3;
        break;
      case 'pulse': {
        const s = 1 + Math.sin(t * 3) * 0.15;
        groupRef.current.scale.set(obj.scale[0] * s, obj.scale[1] * s, obj.scale[2] * s);
        break;
      }
      case 'orbit': {
        const radius = 1.5;
        groupRef.current.position.x = spawnPos.current[0] + Math.cos(t * 0.8) * radius;
        groupRef.current.position.z = spawnPos.current[2] + Math.sin(t * 0.8) * radius;
        groupRef.current.rotation.y = t * 0.8;
        break;
      }
      default:
        if (!isSelected) {
          groupRef.current.position.y = obj.position[1] + Math.sin(t * 0.8 + obj.position[0]) * 0.04;
        }
        break;
    }
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(obj.id); }, [obj.id, onSelect]);

  // Use GLB model for compound types
  if (GLB_MODEL_TYPES.has(obj.type)) {
    return (
      <group ref={groupRef} position={obj.position} rotation={obj.rotation} scale={obj.scale}>
        <GLBModel type={obj.type} isSelected={isSelected} onClick={handleClick} />
        <ObjectParticles obj={obj} />
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
        <ObjectParticles obj={obj} />
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <mesh position={obj.position} rotation={obj.rotation} scale={obj.scale} onClick={handleClick} castShadow receiveShadow>
        <PrimitiveGeometry type={obj.type} />
        <RichMaterial color={obj.color} isSelected={isSelected} />
      </mesh>
      <ObjectParticles obj={obj} />
    </group>
  );
}

/** Physics object with gravity */
function PhysicsObject({ obj, isSelected, onSelect, onUpdatePosition, simConfig }: {
  obj: SceneObject; isSelected: boolean; onSelect: (id: string) => void; onUpdatePosition: (id: string, y: number, vy: number) => void; simConfig: SimulationConfig;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const velRef = useRef<[number, number, number]>([
    obj.velocity?.[0] ?? 0,
    obj.velocity?.[1] ?? 0,
    obj.velocity?.[2] ?? 0,
  ]);
  const posRef = useRef<[number, number, number]>([...obj.position]);

  useFrame((state, delta) => {
    if (isSelected) return;
    const dt = Math.min(delta, 0.05) * simConfig.timeScale;
    // Gravity
    velRef.current[1] -= simConfig.gravity * dt;
    // Wind force
    velRef.current[0] += simConfig.wind[0] * dt * 0.5;
    velRef.current[2] += simConfig.wind[2] * dt * 0.5;
    // Integrate position
    posRef.current[0] += velRef.current[0] * dt;
    posRef.current[1] += velRef.current[1] * dt;
    posRef.current[2] += velRef.current[2] * dt;
    const groundY = getGroundY(obj);
    if (posRef.current[1] <= groundY) {
      posRef.current[1] = groundY;
      if (Math.abs(velRef.current[1]) > 0.5) { velRef.current[1] = -velRef.current[1] * simConfig.friction; playBounceSound(); }
      else { velRef.current[1] = 0; }
      // Ground friction on horizontal velocity
      velRef.current[0] *= (1 - simConfig.friction * 0.5);
      velRef.current[2] *= (1 - simConfig.friction * 0.5);
    }
    if (groupRef.current) {
      groupRef.current.position.set(posRef.current[0], posRef.current[1], posRef.current[2]);
      // Animation on physics objects
      const anim = obj.animation || 'none';
      const t = state.clock.elapsedTime;
      if (anim === 'spin') groupRef.current.rotation.y += dt * 1.5;
      else if (anim === 'pulse') {
        const s = 1 + Math.sin(t * 3) * 0.15;
        groupRef.current.scale.set(obj.scale[0] * s, obj.scale[1] * s, obj.scale[2] * s);
      }
    }
    if (velRef.current[1] === 0 && Math.abs(posRef.current[1] - obj.position[1]) > 0.01) onUpdatePosition(obj.id, posRef.current[1], 0);
  });

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(obj.id); }, [obj.id, onSelect]);

  // Use GLB model for compound types
  if (GLB_MODEL_TYPES.has(obj.type)) {
    return (
      <group ref={groupRef} position={[...obj.position]} rotation={obj.rotation} scale={obj.scale}>
        <GLBModel type={obj.type} isSelected={isSelected} onClick={handleClick} />
        <ObjectParticles obj={obj} />
      </group>
    );
  }

  // Fallback: inline children
  if (obj.children && obj.children.length > 0) {
    return (
      <group ref={groupRef} position={[...obj.position]} rotation={obj.rotation} scale={obj.scale} onClick={handleClick}>
        {obj.children.map((child, i) => (
          <mesh key={i} position={child.offset} scale={child.scale} castShadow receiveShadow>
            <PrimitiveGeometry type={child.type} />
            <RichMaterial color={child.color} isSelected={isSelected} emissive={child.emissive} emissiveIntensity={child.emissiveIntensity} metalness={child.metalness} roughness={child.roughness} />
          </mesh>
        ))}
        <ObjectParticles obj={obj} />
      </group>
    );
  }

  return (
    <group ref={groupRef} position={[...obj.position]} rotation={obj.rotation} scale={obj.scale}>
      <mesh onClick={handleClick} castShadow receiveShadow>
        <PrimitiveGeometry type={obj.type} />
        <RichMaterial color={obj.color} isSelected={isSelected} />
      </mesh>
      <ObjectParticles obj={obj} />
    </group>
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
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // Only place if pointer didn't move much (click, not drag/orbit)
    if (pointerDownPos.current) {
      const dx = e.clientX - pointerDownPos.current.x;
      const dy = e.clientY - pointerDownPos.current.y;
      if (dx * dx + dy * dy > 25) return; // >5px = drag, skip
    }
    onPlace(e.point);
  }, [onPlace]);

  return (
    <group>
      {/* Clickable invisible plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow
        onPointerDown={handlePointerDown}
        onClick={handleClick}>
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

  // Zero out the child's transform — TransformControls handles positioning
  const localObj = useMemo(() => ({
    ...obj,
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  }), [obj]);

  return (
    <TransformControls ref={ref} mode={mode} position={obj.position} rotation={obj.rotation} scale={obj.scale} size={0.8}>
      <ScenePrimitive obj={localObj} isSelected={true} onSelect={() => {}} />
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
// ═══════════════════════════════════════════════════════════════════
// Garden Demo — Interactive Showcase
// ═══════════════════════════════════════════════════════════════════

type GrowthStage = 'seed' | 'sprout' | 'growing' | 'ready' | 'withering' | 'dead' | 'washing';
type GardenTool = 'river' | 'seed';
const GROWTH_DURATION = 3; // seconds per stage
const WATER_RADIUS = 3.0; // max distance from river centre for healthy growth
const WASH_RADIUS = 1.0;  // too close — washes away
const WITHER_TIME = 6;    // seconds until a dry seed dies

interface GardenSeed {
  id: string;
  position: [number, number, number];
  stage: GrowthStage;
  stageTime: number;
  waterDist: number; // cached distance to river
}

/** Animated flowing water river */
function WaterRiver({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const geo = meshRef.current.geometry;
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      posAttr.setY(i, Math.sin(x * 2 + t * 1.5) * 0.06 + Math.sin(z * 3 + t * 2) * 0.04);
    }
    posAttr.needsUpdate = true;
  });
  return (
    <group position={position}>
      {/* River bed (dark earth underneath) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[3.5, 18]} />
        <meshStandardMaterial color="#3E2723" roughness={0.95} />
      </mesh>
      {/* River bank (gradient dirt edge) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[4.5, 20]} />
        <meshStandardMaterial color="#795548" roughness={0.9} />
      </mesh>
      {/* Main water surface */}
      <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[2.5, 16, 24, 24]} />
        <meshStandardMaterial color="#1E88E5" transparent opacity={0.75} roughness={0.05} metalness={0.4} />
      </mesh>
      {/* Shallow water shimmer */}
      <Sparkles count={40} size={2.5} scale={[3, 0.5, 16]} speed={0.5} color="#90CAF9" opacity={0.5} position={[0, 0.08, 0]} />
      {/* Bank stones — more and varied */}
      {[
        [-1.8, 0.08, -5], [-1.6, 0.06, -2], [-1.9, 0.1, 1], [-1.5, 0.07, 3.5], [-1.7, 0.09, 6],
        [1.8, 0.1, -4], [1.6, 0.08, -1], [1.9, 0.07, 2], [1.5, 0.09, 5], [1.7, 0.06, 7],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <sphereGeometry args={[0.1 + (i % 3) * 0.05, 8, 6]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#78909C' : '#90A4AE'} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** A single seed/plant with proximity-based behaviour */
function GardenPlant({ seed, onUpdate, onHarvest }: {
  seed: GardenSeed;
  onUpdate: (id: string, patch: Partial<GardenSeed>) => void;
  onHarvest: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const { stage, stageTime, waterDist } = seed;
    const nextTime = stageTime + delta;

    // Washing-away animation: shrink and disappear
    if (stage === 'washing') {
      if (groupRef.current) {
        const s = Math.max(0, 1 - nextTime * 2);
        groupRef.current.scale.setScalar(s);
        groupRef.current.position.y = seed.position[1] - nextTime * 0.3;
      }
      if (nextTime > 0.8) onUpdate(seed.id, { stage: 'dead', stageTime: 0 });
      else onUpdate(seed.id, { stageTime: nextTime });
      return;
    }

    // Dead seeds don't animate
    if (stage === 'dead') return;

    // Withering: far from water
    if (waterDist > WATER_RADIUS) {
      if (stage !== 'withering' && stage !== 'dead') {
        onUpdate(seed.id, { stage: 'withering', stageTime: 0 });
        return;
      }
      if (stage === 'withering' && nextTime > WITHER_TIME) {
        onUpdate(seed.id, { stage: 'dead', stageTime: 0 });
        return;
      }
      onUpdate(seed.id, { stageTime: nextTime });
      // Droop animation
      if (groupRef.current) {
        groupRef.current.rotation.z = Math.sin(nextTime) * 0.1 + (nextTime / WITHER_TIME) * 0.4;
      }
      return;
    }

    // Too close: wash away
    if (waterDist < WASH_RADIUS) {
      if (stage !== 'washing' && stage !== 'dead') {
        onUpdate(seed.id, { stage: 'washing', stageTime: 0 });
        return;
      }
    }

    // Healthy growth
    if (stage !== 'ready') {
      if (nextTime >= GROWTH_DURATION) {
        const nextStages: Record<string, GrowthStage> = { seed: 'sprout', sprout: 'growing', growing: 'ready' };
        const nextStage = nextStages[stage];
        if (nextStage) {
          // ★ Proof-of-Play: run a compute job on each stage transition
          getProofOfPlayEngine().runStageJob(stage);
        }
        onUpdate(seed.id, { stage: nextStage || stage, stageTime: 0 });
      } else {
        onUpdate(seed.id, { stageTime: nextTime });
      }
    }

    // Gentle sway
    if (groupRef.current && stage !== 'seed') {
      groupRef.current.rotation.z = Math.sin(stageTime * 2) * 0.05;
    }
  });

  const progress = seed.stageTime / GROWTH_DURATION;
  const { stage } = seed;

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (stage === 'ready') {
      // ★ Proof-of-Play: run a harvest benchmark job
      getProofOfPlayEngine().runStageJob('ready');
      onHarvest();
      onUpdate(seed.id, { stage: 'dead', stageTime: 0 });
    }
  }, [stage, seed.id, onHarvest, onUpdate]);

  if (stage === 'dead') return null;

  const witherTint = stage === 'withering' ? Math.min(seed.stageTime / WITHER_TIME, 1) : 0;

  return (
    <group ref={groupRef} position={seed.position} onClick={handleClick}>
      {/* Soil disc */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.35, 16]} />
        <meshStandardMaterial color={stage === 'withering' ? `rgb(${93 + witherTint * 50}, ${64 - witherTint * 20}, ${55 - witherTint * 20})` : '#5D4037'} roughness={0.9} />
      </mesh>

      {stage === 'seed' && (
        <mesh position={[0, 0.08, 0]} castShadow>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial color="#8D6E63" roughness={0.8} />
        </mesh>
      )}

      {(stage === 'sprout' || stage === 'withering') && (
        <group>
          <mesh position={[0, 0.05 + progress * 0.15, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.025, 0.1 + progress * 0.3, 8]} />
            <meshStandardMaterial color={witherTint > 0.3 ? '#9E8B60' : '#27AE60'} roughness={0.6} />
          </mesh>
          <mesh position={[0.04, 0.15 + progress * 0.1, 0]} rotation={[0, 0, 0.4]} castShadow>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color={witherTint > 0.3 ? '#B8A060' : '#2ECC71'} roughness={0.5} />
          </mesh>
          {witherTint > 0.5 && (
            <Sparkles count={8} size={2} scale={[0.6, 0.4, 0.6]} position={[0, 0.2, 0]} speed={0.3} color="#8B6914" opacity={0.5} />
          )}
        </group>
      )}

      {stage === 'growing' && (
        <group>
          <mesh position={[0, 0.2 + progress * 0.1, 0]} castShadow>
            <cylinderGeometry args={[0.025, 0.03, 0.4 + progress * 0.2, 8]} />
            <meshStandardMaterial color="#27AE60" roughness={0.6} />
          </mesh>
          {[0, 1.2, 2.4, 3.6, 4.8].map((angle, i) => (
            <mesh key={i} position={[Math.cos(angle) * 0.08, 0.35 + progress * 0.1, Math.sin(angle) * 0.08]} rotation={[0.3, angle, 0.5]} castShadow>
              <coneGeometry args={[0.03, 0.12, 4]} />
              <meshStandardMaterial color="#2ECC71" roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.05, 0]} castShadow>
            <coneGeometry args={[0.06, 0.15 * (0.5 + progress * 0.5), 8]} />
            <meshStandardMaterial color="#E67E22" roughness={0.4} />
          </mesh>
          {/* Water drops near river */}
          <Sparkles count={6} size={2} scale={[0.5, 0.8, 0.5]} position={[0, 0.2, 0]} speed={0.5} color="#74B9FF" opacity={0.4} />
        </group>
      )}

      {stage === 'ready' && (
        <group>
          <mesh position={[0, 0.15, 0]} castShadow>
            <coneGeometry args={[0.1, 0.4, 12]} />
            <meshStandardMaterial color="#E67E22" roughness={0.35} emissive="#E67E22" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, 0.38, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.01, 0.06, 6]} />
            <meshStandardMaterial color="#27AE60" roughness={0.5} />
          </mesh>
          {[0, 1.2, 2.4, 3.6, 4.8].map((angle, i) => (
            <mesh key={i} position={[Math.cos(angle) * 0.06, 0.42, Math.sin(angle) * 0.06]} rotation={[0.4 + Math.sin(angle) * 0.2, angle, 0.6]} castShadow>
              <coneGeometry args={[0.025, 0.15, 4]} />
              <meshStandardMaterial color="#2ECC71" roughness={0.4} />
            </mesh>
          ))}
          <Sparkles count={15} size={3} scale={[0.8, 1, 0.8]} position={[0, 0.3, 0]} speed={0.8} color="#FDCB6E" opacity={0.7} />
          <pointLight position={[0, 0.3, 0]} intensity={0.5} color="#FDCB6E" distance={2} />
        </group>
      )}

      {stage === 'washing' && (
        <mesh position={[0, 0.06, 0]} castShadow>
          <sphereGeometry args={[0.07, 8, 8]} />
          <meshStandardMaterial color="#5D8AA8" transparent opacity={0.5} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
}

/** Self-contained interactive Garden scene */
function GardenScene({ onHarvest, onStatsUpdate }: { onHarvest: () => void; onStatsUpdate: (stats: ProofOfPlayStats) => void }) {
  const [gardenTool, setGardenTool] = useState<GardenTool>('river');
  const [riverPos, setRiverPos] = useState<[number, number, number] | null>(null);
  const [seeds, setSeeds] = useState<GardenSeed[]>([]);

  // Distance from a point to the river axis (XZ plane)
  const distToRiver = useCallback((pos: [number, number, number]) => {
    if (!riverPos) return Infinity;
    const dx = pos[0] - riverPos[0];
    // River runs along Z axis, so only X distance matters for "nearness"
    return Math.abs(dx);
  }, [riverPos]);

  const handleGroundClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = e.point;
    if (gardenTool === 'river') {
      setRiverPos([Math.round(p.x * 2) / 2, 0.03, Math.round(p.z * 2) / 2]);
      setGardenTool('seed');
      // Recalculate water distance for existing seeds
      setSeeds(prev => prev.map(s => {
        const dx = Math.abs(s.position[0] - Math.round(p.x * 2) / 2);
        return { ...s, waterDist: dx };
      }));
    } else {
      const pos: [number, number, number] = [Math.round(p.x * 4) / 4, 0.01, Math.round(p.z * 4) / 4];
      const wd = distToRiver(pos);
      const newSeed: GardenSeed = {
        id: `seed-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        position: pos,
        stage: wd < WASH_RADIUS ? 'washing' : 'seed',
        stageTime: 0,
        waterDist: wd,
      };
      setSeeds(prev => [...prev, newSeed]);
    }
  }, [gardenTool, distToRiver]);

  const updateSeed = useCallback((id: string, patch: Partial<GardenSeed>) => {
    setSeeds(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  // Clean up dead seeds after a delay
  useEffect(() => {
    const interval = setInterval(() => {
      setSeeds(prev => prev.filter(s => s.stage !== 'dead'));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Poll proof-of-play stats and report upstream
  useEffect(() => {
    const poll = setInterval(() => {
      onStatsUpdate(getProofOfPlayEngine().getStats());
    }, 1000);
    return () => clearInterval(poll);
  }, [onStatsUpdate]);

  return (
    <group>
      {/* === GREEN GRASS GROUND === */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow
        onClick={handleGroundClick}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#4CAF50" roughness={0.9} metalness={0} />
      </mesh>
      {/* Darker grass patches for natural variation */}
      {[[-5, -5], [3, -8], [-8, 4], [7, 2], [-3, 7], [10, -3], [-10, -8]].map(([x, z], i) => (
        <mesh key={`gp-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.001, z]} receiveShadow>
          <circleGeometry args={[1.5 + i * 0.3, 16]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#388E3C' : '#66BB6A'} roughness={0.95} />
        </mesh>
      ))}
      {/* Grass tufts (small cone clusters) */}
      {Array.from({ length: 25 }, (_, i) => {
        const gx = (Math.sin(i * 7.3) * 12);
        const gz = (Math.cos(i * 5.1) * 12);
        return (
          <mesh key={`tuft-${i}`} position={[gx, 0.08, gz]} castShadow>
            <coneGeometry args={[0.08, 0.2, 4]} />
            <meshStandardMaterial color={i % 3 === 0 ? '#2E7D32' : '#43A047'} roughness={0.7} />
          </mesh>
        );
      })}
      {/* Small flower dots */}
      {Array.from({ length: 12 }, (_, i) => {
        const fx = Math.sin(i * 4.7) * 10 + Math.cos(i * 2.3) * 3;
        const fz = Math.cos(i * 3.1) * 10 + Math.sin(i * 1.9) * 3;
        const colors = ['#FFEB3B', '#E91E63', '#9C27B0', '#FF9800', '#FFFFFF'];
        return (
          <mesh key={`flower-${i}`} position={[fx, 0.06, fz]}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshStandardMaterial color={colors[i % colors.length]} emissive={colors[i % colors.length]} emissiveIntensity={0.3} />
          </mesh>
        );
      })}

      {/* River — placed by user */}
      {riverPos && <WaterRiver position={riverPos} />}

      {/* Water radius indicator (subtle ring on grass) */}
      {riverPos && (
        <mesh position={[riverPos[0], 0.006, riverPos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[WATER_RADIUS - 0.05, WATER_RADIUS + 0.05, 64]} />
          <meshBasicMaterial color="#81D4FA" transparent opacity={0.15} />
        </mesh>
      )}

      {/* All seeds/plants */}
      {seeds.map(s => (
        <GardenPlant key={s.id} seed={s} onUpdate={updateSeed} onHarvest={onHarvest} />
      ))}

      {/* Decorative trees — more of them */}
      {[
        [-6, 0, -2], [8, 0, -7], [-9, 0, 5], [11, 0, 3], [-4, 0, 8],
        [6, 0, 8], [-11, 0, -6], [9, 0, -1],
      ].map(([x, y, z], i) => (
        <group key={`tree-${i}`} position={[x, y, z]}>
          <mesh position={[0, 0.4 + i * 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.12 + i * 0.01, 0.18 + i * 0.01, 0.8 + i * 0.1, 8]} />
            <meshStandardMaterial color="#6D4C41" roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.0 + i * 0.1, 0]} castShadow>
            <coneGeometry args={[0.6 + i * 0.05, 1.2 + i * 0.1, 8]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#2E7D32' : '#388E3C'} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Sun warmth light */}
      <pointLight position={[0, 6, 0]} intensity={0.5} color="#FFF9C4" distance={20} />

      {/* Garden tool HUD */}
      <GardenToolHUD tool={gardenTool} setTool={setGardenTool} hasRiver={!!riverPos} seedCount={seeds.filter(s => s.stage !== 'dead').length} />
    </group>
  );
}

/** Garden tool indicator (positioned in 3D above the action area) */
function GardenToolHUD({ tool, setTool, hasRiver, seedCount }: {
  tool: GardenTool; setTool: (t: GardenTool) => void; hasRiver: boolean; seedCount: number;
}) {
  // We render this via the parent's HTML overlay, so this is a no-op in 3D
  // The actual HUD is rendered by the PlayPage gardenActive check
  return null;
}

/** The main 3D scene */
function SceneContent({ objects, selectedId, transformMode, lighting, physicsEnabled, simConfig, gardenActive, onSelect, onPlace, onUpdateTransform, onUpdatePhysicsPos, onGardenHarvest, onStatsUpdate, orbitRef }: {
  objects: SceneObject[]; selectedId: string | null; transformMode: 'translate' | 'rotate' | 'scale';
  lighting: typeof LIGHTING_PRESETS[number]; physicsEnabled: boolean; simConfig: SimulationConfig;
  gardenActive: boolean;
  onSelect: (id: string | null) => void; onPlace: (point: THREE.Vector3) => void;
  onUpdateTransform: (id: string, pos: [number, number, number], rot: [number, number, number], scl: [number, number, number]) => void;
  onUpdatePhysicsPos: (id: string, y: number, vy: number) => void; onGardenHarvest: () => void; onStatsUpdate: (stats: ProofOfPlayStats) => void; orbitRef: React.RefObject<any>;
}) {
  return (
    <>
      {/* === LIGHTING === */}
      <ambientLight intensity={lighting.ambI} />
      <directionalLight position={[8, 12, 5]} intensity={lighting.dirI} castShadow
        shadow-mapSize-width={4096} shadow-mapSize-height={4096}
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

      {/* Deselect handled via ground click in handlePlace */}

      {/* === OBJECTS === */}
      {objects.map(obj => {
        if (obj.id === selectedId) return <SelectedTransform key={obj.id} obj={obj} mode={transformMode} onUpdate={onUpdateTransform} orbitRef={orbitRef} />;
        if (physicsEnabled) return <PhysicsObject key={obj.id} obj={obj} isSelected={false} onSelect={onSelect} onUpdatePosition={onUpdatePhysicsPos} simConfig={simConfig} />;
        return <ScenePrimitive key={obj.id} obj={obj} isSelected={false} onSelect={onSelect} />;
      })}

      {/* === GARDEN DEMO === */}
      {gardenActive && <GardenScene onHarvest={onGardenHarvest} onStatsUpdate={onStatsUpdate} />}

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
  const [simConfig, setSimConfig] = useState<SimulationConfig>({ ...DEFAULT_SIM });
  const [simPanelOpen, setSimPanelOpen] = useState(false);
  const [gardenActive, setGardenActive] = useState(false);
  const [harvestCount, setHarvestCount] = useState(0);
  const [computeStats, setComputeStats] = useState<ProofOfPlayStats | null>(null);
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
      animation: 'none',
      particles: 'none',
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
  const loadScene = useCallback((sceneId: string) => {
    const s = SCENES[sceneId]; if (!s) return;
    if (sceneId === 'garden') {
      setGardenActive(true); setObjects([]); setSelectedId(null); setHarvestCount(0); setLightingIdx(1); // Day lighting
      return;
    }
    setGardenActive(false);
    setObjects(s.objects.map((o, i) => ({ ...o, id: `s-${sceneId}-${i}-${Date.now()}`, animation: 'none' as AnimationType, particles: 'none' as ParticleType })));
    setSelectedId(null);
  }, []);
  const clearAll = useCallback(() => { if (objects.length === 0) return; playDeleteSound(); setObjects([]); setSelectedId(null); }, [objects.length]);
  const setAnimation = useCallback((anim: AnimationType) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, animation: anim } : o));
  }, [selectedId]);
  const setParticles = useCallback((p: ParticleType) => {
    if (!selectedId) return;
    setObjects(prev => prev.map(o => o.id === selectedId ? { ...o, particles: p } : o));
  }, [selectedId]);
  const togglePhysics = useCallback(() => {
    setPhysicsEnabled(prev => {
      if (!prev) setObjects(objs => objs.map(o => ({ ...o, position: [o.position[0], o.position[1] + 0.1, o.position[2]] as [number, number, number], velocity: [0, 0, 0] as [number, number, number] })));
      return !prev;
    });
  }, []);
  const exportScene = useCallback(() => {
    const data = { version: 2, objects: objects.map(({ id, ...r }) => r), lighting: lighting.id, simulation: simConfig };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }, [objects, lighting, simConfig]);

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
          <Canvas shadows dpr={[1, 2]} camera={{ position: [6, 5, 8], fov: 50 }}
            gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
            style={{ background: lighting.bgGradient }}>
            <Suspense fallback={null}>
              <SceneContent objects={objects} selectedId={selectedId} transformMode={transformMode}
                lighting={lighting} physicsEnabled={physicsEnabled} simConfig={simConfig}
                gardenActive={gardenActive}
                onSelect={setSelectedId} onPlace={handlePlace}
                onUpdateTransform={handleUpdateTransform} onUpdatePhysicsPos={handleUpdatePhysicsPos}
                onGardenHarvest={() => { setHarvestCount(c => c + 1); playPlaceSound(); }}
                onStatsUpdate={setComputeStats}
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
          {gardenActive && (
            <div className="play-garden-hud">
              <span>🥕 Garden</span>
              <span className="play-garden-counter">🌾 {harvestCount}</span>
              {computeStats && computeStats.totalJobs > 0 && (
                <span className="play-garden-gold">🪙 {computeStats.ecosystemValue.toFixed(0)} gold • {computeStats.totalJobs} jobs</span>
              )}
              <span className="play-garden-hint">① Place river 💧 ② Plant seeds 🌱 Growth fuels the ecosystem!</span>
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
            <div className="play-toolbar-label" style={{ marginTop: 12 }}>ANIMATION</div>
            <div className="play-anim-picker">
              {ANIMATION_PRESETS.map(a => (
                <button key={a.id} className={`play-anim-btn ${selectedObj.animation === a.id ? 'active' : ''}`}
                  onClick={() => setAnimation(a.id)} title={a.label}>
                  <span>{a.emoji}</span>
                  <span className="play-anim-btn-label">{a.label}</span>
                </button>
              ))}
            </div>
            <div className="play-toolbar-label" style={{ marginTop: 12 }}>PARTICLES</div>
            <div className="play-anim-picker">
              {PARTICLE_PRESETS.map(p => (
                <button key={p.id} className={`play-anim-btn ${selectedObj.particles === p.id ? 'active' : ''}`}
                  onClick={() => setParticles(p.id)} title={p.label}>
                  <span>{p.emoji}</span>
                  <span className="play-anim-btn-label">{p.label}</span>
                </button>
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
          <button className={`play-sim-toggle ${simPanelOpen ? 'active' : ''}`} onClick={() => setSimPanelOpen(v => !v)}>⚙️ Simulation</button>
        </div>
        <div className="play-footer-actions">
          <button className="play-action-btn" onClick={exportScene} disabled={objects.length === 0}>📤 Export</button>
          <button className="play-action-btn" onClick={() => { setObjects(prev => prev.slice(0, -1)); setSelectedId(null); }} disabled={objects.length === 0}>↩️ Undo</button>
          <button className="play-action-btn" onClick={clearAll} disabled={objects.length === 0}>🗑️ Clear</button>
        </div>
      </footer>

      {/* ── Simulation Panel (overlay, bottom-left) ── */}
      {simPanelOpen && (
        <div className="play-sim-panel">
          <div className="play-sim-header">
            <span>⚙️ Simulation</span>
            <button className="play-sim-close" onClick={() => setSimPanelOpen(false)}>✕</button>
          </div>
          <label className="play-sim-row">
            <span>Gravity</span>
            <input type="range" min={0} max={20} step={0.1} value={simConfig.gravity}
              onChange={e => setSimConfig(s => ({ ...s, gravity: +e.target.value }))} />
            <span className="play-sim-val">{simConfig.gravity.toFixed(1)}</span>
          </label>
          <label className="play-sim-row">
            <span>Wind X</span>
            <input type="range" min={-5} max={5} step={0.1} value={simConfig.wind[0]}
              onChange={e => setSimConfig(s => ({ ...s, wind: [+e.target.value, s.wind[1], s.wind[2]] }))} />
            <span className="play-sim-val">{simConfig.wind[0].toFixed(1)}</span>
          </label>
          <label className="play-sim-row">
            <span>Wind Z</span>
            <input type="range" min={-5} max={5} step={0.1} value={simConfig.wind[2]}
              onChange={e => setSimConfig(s => ({ ...s, wind: [s.wind[0], s.wind[1], +e.target.value] }))} />
            <span className="play-sim-val">{simConfig.wind[2].toFixed(1)}</span>
          </label>
          <label className="play-sim-row">
            <span>Friction</span>
            <input type="range" min={0} max={1} step={0.01} value={simConfig.friction}
              onChange={e => setSimConfig(s => ({ ...s, friction: +e.target.value }))} />
            <span className="play-sim-val">{simConfig.friction.toFixed(2)}</span>
          </label>
          <label className="play-sim-row">
            <span>Time Scale</span>
            <input type="range" min={0.1} max={3} step={0.1} value={simConfig.timeScale}
              onChange={e => setSimConfig(s => ({ ...s, timeScale: +e.target.value }))} />
            <span className="play-sim-val">{simConfig.timeScale.toFixed(1)}×</span>
          </label>
          <button className="play-action-btn" style={{ marginTop: 8, width: '100%' }}
            onClick={() => setSimConfig({ ...DEFAULT_SIM })}>🔄 Reset Defaults</button>
        </div>
      )}
    </div>
  );
}

// Preload all HoloScript-compiled GLB models
GLB_MODEL_TYPES.forEach(type => useGLTF.preload(`/models/${type}.glb`));
