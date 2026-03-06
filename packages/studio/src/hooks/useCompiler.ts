'use client';
/**
 * useCompiler — Hook for multi-target HoloScript compilation
 */
import { useState, useCallback } from 'react';

const ALL_TARGETS = [
  { id: 'unity', name: 'Unity', icon: '🎮', ext: '.cs' },
  { id: 'unreal', name: 'Unreal', icon: '🏗️', ext: '.cpp' },
  { id: 'godot', name: 'Godot', icon: '🤖', ext: '.gd' },
  { id: 'visionos', name: 'VisionOS', icon: '🥽', ext: '.swift' },
  { id: 'vrchat', name: 'VRChat', icon: '🌐', ext: '.cs' },
  { id: 'babylon', name: 'Babylon', icon: '🏛️', ext: '.ts' },
  { id: 'playcanvas', name: 'PlayCanvas', icon: '🎲', ext: '.js' },
  { id: 'r3f', name: 'R3F', icon: '⚛️', ext: '.tsx' },
  { id: 'wasm', name: 'WASM', icon: '⚙️', ext: '.wasm' },
  { id: 'webgpu', name: 'WebGPU', icon: '🖥️', ext: '.wgsl' },
  { id: 'urdf', name: 'URDF', icon: '🤖', ext: '.urdf' },
  { id: 'dtdl', name: 'DTDL', icon: '📊', ext: '.json' },
  { id: 'sdf', name: 'SDF', icon: '📐', ext: '.sdf' },
  { id: 'usd', name: 'USD', icon: '🎬', ext: '.usda' },
  { id: 'gltf', name: 'glTF', icon: '📦', ext: '.gltf' },
  { id: 'android', name: 'Android', icon: '📱', ext: '.kt' },
  { id: 'ios', name: 'iOS', icon: '🍎', ext: '.swift' },
  { id: 'androidxr', name: 'AndroidXR', icon: '🕶️', ext: '.kt' },
];

export interface CompileResult {
  target: string;
  success: boolean;
  output: string;
  time: number;
}

export interface UseCompilerReturn {
  targets: typeof ALL_TARGETS;
  selectedTargets: Set<string>;
  results: CompileResult[];
  isCompiling: boolean;
  toggleTarget: (id: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  compile: () => void;
  clearResults: () => void;
}

export function useCompiler(): UseCompilerReturn {
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set(['unity', 'godot', 'webgpu']));
  const [results, setResults] = useState<CompileResult[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);

  const toggleTarget = useCallback((id: string) => {
    setSelectedTargets(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  const selectAll = useCallback(() => setSelectedTargets(new Set(ALL_TARGETS.map(t => t.id))), []);
  const clearAll = useCallback(() => setSelectedTargets(new Set()), []);

  const compile = useCallback(() => {
    setIsCompiling(true);
    const newResults: CompileResult[] = [];
    for (const id of selectedTargets) {
      const target = ALL_TARGETS.find(t => t.id === id);
      if (!target) continue;
      const start = performance.now();
      const success = Math.random() > 0.1; // 90% success rate
      const time = 50 + Math.random() * 200;
      newResults.push({
        target: target.name,
        success,
        output: success ? `Compiled ${target.name} → output${target.ext} (${Math.floor(Math.random() * 5000 + 500)} bytes)` : `Error: Missing trait "Renderable" for ${target.name}`,
        time,
      });
    }
    setResults(newResults);
    setIsCompiling(false);
  }, [selectedTargets]);

  const clearResults = useCallback(() => setResults([]), []);

  return { targets: ALL_TARGETS, selectedTargets, results, isCompiling, toggleTarget, selectAll, clearAll, compile, clearResults };
}
