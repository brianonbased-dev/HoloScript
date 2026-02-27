/**
 * GenerativePresets — 6 hand-crafted generative art presets.
 *
 * Each preset defines a shader node graph configuration
 * (nodes + edges) to be loaded into the node graph store,
 * plus display metadata for the preset picker.
 */

import type { Node } from 'reactflow';
import type { Edge } from 'reactflow';

export type GenNode = Node<Record<string, unknown>>;

export interface GenerativePreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  accentColor: string;
  nodes: GenNode[];
  edges: Edge[];
  /** Optional particle system params */
  particles?: {
    count: number;
    speed: number;
    spread: number;
    colorA: string;
    colorB: string;
    lifetime: number;
  };
}

const base = (
  id: string, x: number, y: number,
  type: string, data: Record<string, unknown>
): GenNode => ({ id, type, position: { x, y }, data });

export const GENERATIVE_PRESETS: GenerativePreset[] = [
  // ── 1. Lava ─────────────────────────────────────────────────────────────────
  {
    id: 'lava',
    name: 'Lava',
    description: 'Hot molten rock — Voronoi noise drives orange/red color ramp',
    emoji: '🌋',
    accentColor: '#f97316',
    nodes: [
      base('uv1', 80, 180,  'uvNode',       { type: 'uv',      label: 'UV',      channel: 0 }),
      base('t1',  80, 280,  'timeNode',     { type: 'time',    label: 'Time' }),
      base('m1', 280, 200,  'mathNode',     { type: 'math',    label: 'Add',     op: 'add' }),
      base('m2', 480, 200,  'mathNode',     { type: 'math',    label: 'Voronoi', op: 'voronoi' }),
      base('m3', 680, 200,  'mathNode',     { type: 'math',    label: 'Gradient',op: 'gradient' }),
      base('o1', 880, 200,  'outputNode',   { type: 'output',  label: 'Output',  outputType: 'fragColor' }),
    ],
    edges: [
      { id: 'e1', source: 'uv1', sourceHandle: 'out', target: 'm1', targetHandle: 'a', animated: true },
      { id: 'e2', source: 't1',  sourceHandle: 'out', target: 'm1', targetHandle: 'b', animated: true },
      { id: 'e3', source: 'm1',  sourceHandle: 'out', target: 'm2', targetHandle: 'a', animated: true },
      { id: 'e4', source: 'm2',  sourceHandle: 'out', target: 'm3', targetHandle: 'a', animated: true },
      { id: 'e5', source: 'm3',  sourceHandle: 'out', target: 'o1', targetHandle: 'rgb', animated: true },
    ],
    particles: { count: 8000, speed: 0.4, spread: 1.5, colorA: '#ff6b00', colorB: '#ff0000', lifetime: 2.5 },
  },

  // ── 2. Aurora ───────────────────────────────────────────────────────────────
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights — sin waves on UV with teal/purple gradient',
    emoji: '🌌',
    accentColor: '#06b6d4',
    nodes: [
      base('uv1', 80, 140,  'uvNode',       { type: 'uv',      label: 'UV-X',    channel: 0 }),
      base('uv2', 80, 260,  'uvNode',       { type: 'uv',      label: 'UV-Y',    channel: 1 }),
      base('t1',  80, 380,  'timeNode',     { type: 'time',    label: 'Time' }),
      base('m1', 280, 160,  'mathNode',     { type: 'math',    label: 'Sin',     op: 'sin' }),
      base('m2', 280, 320,  'mathNode',     { type: 'math',    label: 'Mul',     op: 'mul' }),
      base('m3', 480, 200,  'mathNode',     { type: 'math',    label: 'Add',     op: 'add' }),
      base('m4', 680, 200,  'mathNode',     { type: 'math',    label: 'Gradient',op: 'gradient' }),
      base('o1', 880, 200,  'outputNode',   { type: 'output',  label: 'Output',  outputType: 'fragColor' }),
    ],
    edges: [
      { id: 'e1', source: 'uv1', sourceHandle: 'out', target: 'm1', targetHandle: 'a', animated: true },
      { id: 'e2', source: 't1',  sourceHandle: 'out', target: 'm2', targetHandle: 'a', animated: true },
      { id: 'e3', source: 'uv2', sourceHandle: 'out', target: 'm2', targetHandle: 'b', animated: true },
      { id: 'e4', source: 'm1',  sourceHandle: 'out', target: 'm3', targetHandle: 'a', animated: true },
      { id: 'e5', source: 'm2',  sourceHandle: 'out', target: 'm3', targetHandle: 'b', animated: true },
      { id: 'e6', source: 'm3',  sourceHandle: 'out', target: 'm4', targetHandle: 'a', animated: true },
      { id: 'e7', source: 'm4',  sourceHandle: 'out', target: 'o1', targetHandle: 'rgb', animated: true },
    ],
    particles: { count: 15000, speed: 0.15, spread: 3.0, colorA: '#00ffcc', colorB: '#8b5cf6', lifetime: 4.0 },
  },

  // ── 3. Digital Rain ─────────────────────────────────────────────────────────
  {
    id: 'digital_rain',
    name: 'Digital Rain',
    description: 'Matrix-style falling green — UV fract + time scroll',
    emoji: '💻',
    accentColor: '#22c55e',
    nodes: [
      base('uv1', 80, 140,  'uvNode',       { type: 'uv',      label: 'UV-X',    channel: 0 }),
      base('uv2', 80, 260,  'uvNode',       { type: 'uv',      label: 'UV-Y',    channel: 1 }),
      base('t1',  80, 380,  'timeNode',     { type: 'time',    label: 'Time' }),
      base('m1', 280, 260,  'mathNode',     { type: 'math',    label: 'Add',     op: 'add' }),
      base('m2', 480, 200,  'mathNode',     { type: 'math',    label: 'Fract',   op: 'fract' }),
      base('m3', 680, 200,  'mathNode',     { type: 'math',    label: 'Mul',     op: 'mul' }),
      base('c1', 680, 320,  'constantNode', { type: 'constant',label: 'Green',   value: 0.9 }),
      base('o1', 880, 200,  'outputNode',   { type: 'output',  label: 'Output',  outputType: 'fragColor' }),
    ],
    edges: [
      { id: 'e1', source: 'uv2', sourceHandle: 'out', target: 'm1', targetHandle: 'a', animated: true },
      { id: 'e2', source: 't1',  sourceHandle: 'out', target: 'm1', targetHandle: 'b', animated: true },
      { id: 'e3', source: 'm1',  sourceHandle: 'out', target: 'm2', targetHandle: 'a', animated: true },
      { id: 'e4', source: 'm2',  sourceHandle: 'out', target: 'm3', targetHandle: 'a', animated: true },
      { id: 'e5', source: 'c1',  sourceHandle: 'out', target: 'm3', targetHandle: 'b', animated: true },
      { id: 'e6', source: 'm3',  sourceHandle: 'out', target: 'o1', targetHandle: 'rgb', animated: true },
    ],
    particles: { count: 20000, speed: 1.2, spread: 2.0, colorA: '#00ff41', colorB: '#003b00', lifetime: 1.5 },
  },

  // ── 4. Psychedelic UV ───────────────────────────────────────────────────────
  {
    id: 'psychedelic_uv',
    name: 'Psychedelic UV',
    description: 'Kaleidoscopic sin/cos color cycling across UV space',
    emoji: '🌀',
    accentColor: '#ec4899',
    nodes: [
      base('uv1', 80, 120,  'uvNode',       { type: 'uv',      label: 'UV-X',    channel: 0 }),
      base('uv2', 80, 240,  'uvNode',       { type: 'uv',      label: 'UV-Y',    channel: 1 }),
      base('t1',  80, 360,  'timeNode',     { type: 'time',    label: 'Time' }),
      base('m1', 280, 120,  'mathNode',     { type: 'math',    label: 'Sin',     op: 'sin' }),
      base('m2', 280, 240,  'mathNode',     { type: 'math',    label: 'Cos',     op: 'cos' }),
      base('m3', 280, 360,  'mathNode',     { type: 'math',    label: 'Mul',     op: 'mul' }),
      base('m4', 480, 200,  'mathNode',     { type: 'math',    label: 'Add',     op: 'add' }),
      base('m5', 680, 200,  'mathNode',     { type: 'math',    label: 'Mix',     op: 'mix' }),
      base('o1', 880, 200,  'outputNode',   { type: 'output',  label: 'Output',  outputType: 'fragColor' }),
    ],
    edges: [
      { id: 'e1', source: 'uv1', sourceHandle: 'out', target: 'm1', targetHandle: 'a', animated: true },
      { id: 'e2', source: 'uv2', sourceHandle: 'out', target: 'm2', targetHandle: 'a', animated: true },
      { id: 'e3', source: 't1',  sourceHandle: 'out', target: 'm3', targetHandle: 'a', animated: true },
      { id: 'e4', source: 'm1',  sourceHandle: 'out', target: 'm4', targetHandle: 'a', animated: true },
      { id: 'e5', source: 'm2',  sourceHandle: 'out', target: 'm4', targetHandle: 'b', animated: true },
      { id: 'e6', source: 'm4',  sourceHandle: 'out', target: 'm5', targetHandle: 'a', animated: true },
      { id: 'e7', source: 'm3',  sourceHandle: 'out', target: 'm5', targetHandle: 'b', animated: true },
      { id: 'e8', source: 'm5',  sourceHandle: 'out', target: 'o1', targetHandle: 'rgb', animated: true },
    ],
    particles: { count: 12000, speed: 0.3, spread: 2.5, colorA: '#ff00ff', colorB: '#00ffff', lifetime: 3.0 },
  },

  // ── 5. Voronoi Crystal ──────────────────────────────────────────────────────
  {
    id: 'voronoi_crystal',
    name: 'Voronoi Crystal',
    description: 'Geometric cell shards — Voronoi distance field with icy blues',
    emoji: '💠',
    accentColor: '#3b82f6',
    nodes: [
      base('uv1', 80, 180,  'uvNode',       { type: 'uv',      label: 'UV',      channel: 0 }),
      base('t1',  80, 300,  'timeNode',     { type: 'time',    label: 'Time' }),
      base('m1', 280, 200,  'mathNode',     { type: 'math',    label: 'Voronoi', op: 'voronoi' }),
      base('m2', 480, 200,  'mathNode',     { type: 'math',    label: 'Smoothstep', op: 'smoothstep' }),
      base('m3', 680, 200,  'mathNode',     { type: 'math',    label: 'Gradient',op: 'gradient' }),
      base('o1', 880, 200,  'outputNode',   { type: 'output',  label: 'Output',  outputType: 'fragColor' }),
    ],
    edges: [
      { id: 'e1', source: 'uv1', sourceHandle: 'out', target: 'm1', targetHandle: 'a', animated: true },
      { id: 'e2', source: 't1',  sourceHandle: 'out', target: 'm1', targetHandle: 'b', animated: true },
      { id: 'e3', source: 'm1',  sourceHandle: 'out', target: 'm2', targetHandle: 'a', animated: true },
      { id: 'e4', source: 'm2',  sourceHandle: 'out', target: 'm3', targetHandle: 'a', animated: true },
      { id: 'e5', source: 'm3',  sourceHandle: 'out', target: 'o1', targetHandle: 'rgb', animated: true },
    ],
    particles: { count: 5000, speed: 0.05, spread: 1.0, colorA: '#bae6fd', colorB: '#1e40af', lifetime: 6.0 },
  },

  // ── 6. Time Warp ────────────────────────────────────────────────────────────
  {
    id: 'time_warp',
    name: 'Time Warp',
    description: 'Warped spacetime — nested sin/cos ripple with length distortion',
    emoji: '⏳',
    accentColor: '#f59e0b',
    nodes: [
      base('uv1', 80, 120,  'uvNode',       { type: 'uv',      label: 'UV-X',    channel: 0 }),
      base('uv2', 80, 240,  'uvNode',       { type: 'uv',      label: 'UV-Y',    channel: 1 }),
      base('t1',  80, 360,  'timeNode',     { type: 'time',    label: 'Time' }),
      base('m1', 280, 180,  'mathNode',     { type: 'math',    label: 'Add',     op: 'add' }),
      base('m2', 280, 300,  'mathNode',     { type: 'math',    label: 'Sin',     op: 'sin' }),
      base('m3', 480, 200,  'mathNode',     { type: 'math',    label: 'Length',  op: 'length' }),
      base('m4', 680, 200,  'mathNode',     { type: 'math',    label: 'Sin',     op: 'sin' }),
      base('m5', 880, 200,  'mathNode',     { type: 'math',    label: 'Gradient',op: 'gradient' }),
      base('o1',1080, 200,  'outputNode',   { type: 'output',  label: 'Output',  outputType: 'fragColor' }),
    ],
    edges: [
      { id: 'e1', source: 'uv1', sourceHandle: 'out', target: 'm1', targetHandle: 'a', animated: true },
      { id: 'e2', source: 'uv2', sourceHandle: 'out', target: 'm1', targetHandle: 'b', animated: true },
      { id: 'e3', source: 't1',  sourceHandle: 'out', target: 'm2', targetHandle: 'a', animated: true },
      { id: 'e4', source: 'm1',  sourceHandle: 'out', target: 'm3', targetHandle: 'a', animated: true },
      { id: 'e5', source: 'm2',  sourceHandle: 'out', target: 'm3', targetHandle: 'b', animated: true },
      { id: 'e6', source: 'm3',  sourceHandle: 'out', target: 'm4', targetHandle: 'a', animated: true },
      { id: 'e7', source: 'm4',  sourceHandle: 'out', target: 'm5', targetHandle: 'a', animated: true },
      { id: 'e8', source: 'm5',  sourceHandle: 'out', target: 'o1', targetHandle: 'rgb', animated: true },
    ],
    particles: { count: 10000, speed: 0.8, spread: 2.0, colorA: '#fbbf24', colorB: '#7c3aed', lifetime: 2.0 },
  },
];
