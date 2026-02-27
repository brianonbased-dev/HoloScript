'use client';

/**
 * useNodeInspector — parses the selected scene object out of scene code
 * and returns structured, editable properties.
 *
 * Strategy:
 *  1. Find the currently selected node name from the scene store.
 *  2. Scan the scene code for `object <name> {` block boundaries.
 *  3. Extract @transform, @material, @light, @physics, @animation, @particles
 *     trait params into typed property groups.
 *  4. Provide a `setProperty(trait, key, value)` action that rewrites
 *     the relevant line in the scene code.
 */

import { useCallback, useMemo } from 'react';
import { useSceneStore } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PropType = 'float' | 'vec3' | 'color' | 'boolean' | 'enum' | 'string';

export interface SceneProp {
  key: string;
  type: PropType;
  label: string;
  value: string | number | boolean | [number, number, number];
  min?: number;
  max?: number;
  step?: number;
  options?: string[];   // for enum
}

export interface PropGroup {
  trait: string;       // e.g. 'transform', 'material', 'light'
  label: string;
  icon: string;
  props: SceneProp[];
}

export interface InspectorResult {
  objectName: string | null;
  objectType: string | null;         // e.g. 'object', 'scene'
  groups: PropGroup[];
  lineRange: [number, number] | null; // [start, end] 1-indexed in code
  setProperty: (trait: string, key: string, value: string | number | boolean | [number,number,number]) => void;
}

// ─── Trait schemas ────────────────────────────────────────────────────────────

const TRAIT_SCHEMA: Record<string, { label: string; icon: string; props: Omit<SceneProp, 'value'>[] }> = {
  transform: {
    label: 'Transform',
    icon: '↔',
    props: [
      { key: 'position', type: 'vec3', label: 'Position' },
      { key: 'rotation', type: 'vec3', label: 'Rotation', min: -360, max: 360, step: 1 },
      { key: 'scale',    type: 'vec3', label: 'Scale',    min: 0.001, max: 100, step: 0.01 },
    ],
  },
  material: {
    label: 'Material',
    icon: '🎨',
    props: [
      { key: 'albedo',           type: 'color',   label: 'Albedo' },
      { key: 'emissive',         type: 'color',   label: 'Emissive' },
      { key: 'metallic',         type: 'float',   label: 'Metallic',    min: 0, max: 1, step: 0.01 },
      { key: 'roughness',        type: 'float',   label: 'Roughness',   min: 0, max: 1, step: 0.01 },
      { key: 'opacity',          type: 'float',   label: 'Opacity',     min: 0, max: 1, step: 0.01 },
      { key: 'emissiveIntensity',type: 'float',   label: 'Emissive Intensity', min: 0, max: 20, step: 0.1 },
    ],
  },
  light: {
    label: 'Light',
    icon: '💡',
    props: [
      { key: 'type',      type: 'enum',  label: 'Type',      options: ['point','spot','directional','area'] },
      { key: 'color',     type: 'color', label: 'Color' },
      { key: 'intensity', type: 'float', label: 'Intensity',  min: 0, max: 20,  step: 0.1 },
      { key: 'range',     type: 'float', label: 'Range',      min: 0, max: 500, step: 0.5 },
      { key: 'castShadow',type: 'boolean',label: 'Cast Shadow' },
    ],
  },
  physics: {
    label: 'Physics',
    icon: '⚡',
    props: [
      { key: 'type',  type: 'enum',  label: 'Body Type', options: ['static','dynamic','kinematic'] },
      { key: 'mass',  type: 'float', label: 'Mass (kg)',  min: 0, max: 1000, step: 0.1 },
    ],
  },
  particles: {
    label: 'Particles',
    icon: '✨',
    props: [
      { key: 'type',     type: 'enum',  label: 'Emitter',  options: ['fire','smoke','sparkle','rain','snow','dust','debris','custom'] },
      { key: 'rate',     type: 'float', label: 'Rate/s',   min: 0, max: 500, step: 1 },
      { key: 'lifetime', type: 'float', label: 'Lifetime', min: 0, max: 30,  step: 0.1 },
      { key: 'size',     type: 'float', label: 'Size',     min: 0, max: 10,  step: 0.01 },
      { key: 'color',    type: 'color', label: 'Color' },
    ],
  },
  animation: {
    label: 'Animation',
    icon: '🎬',
    props: [
      { key: 'speed', type: 'float',  label: 'Speed',  min: 0, max: 10, step: 0.1 },
      { key: 'loop',  type: 'boolean',label: 'Loop' },
    ],
  },
  audio: {
    label: 'Audio',
    icon: '🎵',
    props: [
      { key: 'src',         type: 'string',  label: 'Source' },
      { key: 'volume',      type: 'float',   label: 'Volume',  min: 0, max: 1, step: 0.01 },
      { key: 'loop',        type: 'boolean', label: 'Loop' },
      { key: 'spatial',     type: 'boolean', label: 'Spatial' },
      { key: 'maxDistance', type: 'float',   label: 'Max Dist', min: 0, max: 100, step: 0.5 },
    ],
  },
};

// ─── Parser helpers ───────────────────────────────────────────────────────────

function parseVec3(raw: string): [number, number, number] {
  const m = raw.replace(/[\[\]]/g, '').split(',').map(Number);
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
}

function parseValue(raw: string, type: PropType): SceneProp['value'] {
  raw = raw.trim().replace(/"/g, '');
  if (type === 'boolean') return raw === 'true';
  if (type === 'float') return parseFloat(raw) || 0;
  if (type === 'vec3') return parseVec3(raw);
  return raw; // color, enum, string
}

function formatValue(value: SceneProp['value'], type: PropType): string {
  if (type === 'vec3' && Array.isArray(value))
    return `[${(value as [number,number,number]).map((v) => v.toFixed(3)).join(', ')}]`;
  if (type === 'color') return `"${value}"`;
  if (type === 'string') return `"${value}"`;
  return String(value);
}

function findObjectBlock(lines: string[], name: string): [number, number] | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startRe = new RegExp(`^\\s*(object|scene|group|light)\\s+"${escapedName}"\\s*\\{?`);
  let start = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1 && startRe.test(lines[i])) { start = i; }
    if (start !== -1) {
      depth += (lines[i].match(/\{/g) ?? []).length;
      depth -= (lines[i].match(/\}/g) ?? []).length;
      if (depth <= 0 && start !== i) return [start + 1, i + 1];
    }
  }
  return start !== -1 ? [start + 1, lines.length] : null;
}

function extractGroups(lines: string[], start: number, end: number): PropGroup[] {
  const groups: PropGroup[] = [];
  let currentTrait: string | null = null;
  let propMap: Record<string, string> = {};

  const flush = () => {
    if (!currentTrait || !(currentTrait in TRAIT_SCHEMA)) return;
    const schema = TRAIT_SCHEMA[currentTrait];
    const props: SceneProp[] = schema.props.map((p) => ({
      ...p,
      value: propMap[p.key] != null ? parseValue(propMap[p.key], p.type) : (
        p.type === 'float' ? 0 : p.type === 'boolean' ? false : p.type === 'vec3' ? [0,0,0] as [number,number,number] : ''
      ),
    }));
    groups.push({ trait: currentTrait, label: schema.label, icon: schema.icon, props });
  };

  for (let i = start - 1; i < end - 1; i++) {
    const line = lines[i];
    const traitMatch = line.trim().match(/^@(\w+)\s*\{?/);
    if (traitMatch) {
      flush();
      currentTrait = traitMatch[1];
      propMap = {};
      continue;
    }
    if (currentTrait) {
      const paramMatch = line.trim().match(/^(\w+)\s*:\s*(.+)$/);
      if (paramMatch) propMap[paramMatch[1]] = paramMatch[2].trim();
    }
  }
  flush();
  return groups;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Pass the name of the object to inspect.
 * NodeInspectorPanel owns the selected-name state (search/dropdown).
 */
export function useNodeInspector(objectName: string | null): InspectorResult {
  const code = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  const parsed = useMemo(() => {
    if (!objectName) return null;
    const lines = code.split('\n');
    const lineRange = findObjectBlock(lines, objectName);
    if (!lineRange) return null;
    const groups = extractGroups(lines, lineRange[0], lineRange[1]);
    // Determine object type from the opening line (lineRange is 1-indexed)
    const openLine = lines[lineRange[0] - 1] ?? '';
    const typeMatch = openLine.trim().match(/^(object|scene|group|light)\s+/);
    return { lineRange, groups, objectType: typeMatch?.[1] ?? 'object' };
  }, [code, objectName]);

  const setProperty = useCallback((trait: string, key: string, value: SceneProp['value']) => {
    if (!objectName) return;
    const schema = TRAIT_SCHEMA[trait];
    if (!schema) return;
    const propDef = schema.props.find((p) => p.key === key);
    if (!propDef) return;
    const formatted = formatValue(value, propDef.type);
    const lines = code.split('\n');
    const range = findObjectBlock(lines, objectName);
    if (!range) return;

    // Try to update existing line first
    let found = false;
    for (let i = range[0] - 1; i < range[1] - 1; i++) {
      if (new RegExp(`^\\s*${key}\\s*:`).test(lines[i])) {
        lines[i] = lines[i].replace(/:\s*.+$/, `: ${formatted}`);
        found = true;
        break;
      }
    }

    if (!found) {
      // Append to the @trait block if it exists, else insert new block
      let traitLine = -1;
      let traitDepth = 0;
      for (let i = range[0] - 1; i < range[1] - 1; i++) {
        if (new RegExp(`^\\s*@${trait}\\s*\\{?`).test(lines[i])) traitLine = i;
        if (traitLine !== -1) {
          traitDepth += (lines[i].match(/\{/g) ?? []).length;
          traitDepth -= (lines[i].match(/\}/g) ?? []).length;
          if (traitDepth <= 0) {
            lines.splice(i, 0, `    ${key}: ${formatted}`);
            found = true;
            break;
          }
        }
      }
      if (!found) {
        const indent = '  ';
        const newBlock = [`${indent}@${trait} {`, `${indent}  ${key}: ${formatted}`, `${indent}}`];
        lines.splice(range[1] - 1, 0, ...newBlock);
      }
    }
    setCode(lines.join('\n'));
  }, [code, setCode, objectName]);

  return {
    objectName,
    objectType: parsed?.objectType ?? null,
    groups: parsed?.groups ?? [],
    lineRange: parsed?.lineRange ?? null,
    setProperty,
  };
}
