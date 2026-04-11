'use client';

/**
 * SceneSearch — Fuzzy search across scene objects, traits, properties.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Search,
  X,
  _Filter,
  Box,
  Lightbulb,
  Camera,
  Sparkles,
  Clock,
  ArrowRight,
} from 'lucide-react';

export type SearchCategory = 'all' | 'objects' | 'traits' | 'properties' | 'scripts';

export interface SearchResult {
  id: string;
  name: string;
  type: string; // 'mesh', 'light', 'trait', 'property', 'script'
  path: string; // breadcrumb: World > Player > @mesh.color
  preview: string; // snippet
  score: number; // relevance 0-1
}

// Simple fuzzy matching
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 1;
  let qi = 0,
    score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 1 / (ti + 1);
      qi++;
    }
  }
  return qi === q.length ? score / q.length : 0;
}

// Demo data
const DEMO_ITEMS: SearchResult[] = [
  {
    id: '1',
    name: 'Player',
    type: 'mesh',
    path: 'World > Player',
    preview: '@mesh { geometry: "capsule" }',
    score: 0,
  },
  {
    id: '2',
    name: 'Main Camera',
    type: 'camera',
    path: 'World > MainCamera',
    preview: '@camera { fov: 60, near: 0.1 }',
    score: 0,
  },
  {
    id: '3',
    name: 'Sun Light',
    type: 'light',
    path: 'World > SunLight',
    preview: '@light { type: "directional", intensity: 3 }',
    score: 0,
  },
  {
    id: '4',
    name: 'color',
    type: 'property',
    path: 'World > Player > @material > color',
    preview: 'color: "#6366f1"',
    score: 0,
  },
  {
    id: '5',
    name: 'Fire',
    type: 'trait',
    path: 'World > Torch > @particle',
    preview: '@particle { rate: 80, lifetime: 1.5 }',
    score: 0,
  },
  {
    id: '6',
    name: 'move_script',
    type: 'script',
    path: 'World > Player > @script',
    preview: 'fn update(dt) { self.position.y += 2 * dt }',
    score: 0,
  },
  {
    id: '7',
    name: 'Ground',
    type: 'mesh',
    path: 'World > Environment > Ground',
    preview: '@mesh { geometry: "plane" }',
    score: 0,
  },
  {
    id: '8',
    name: 'gravity',
    type: 'property',
    path: 'World > @physics > gravity',
    preview: 'gravity: [0, -9.8, 0]',
    score: 0,
  },
  {
    id: '9',
    name: 'Oak Tree',
    type: 'mesh',
    path: 'World > Forest > Oak',
    preview: '@mesh { model: "oak_tree.glb" }',
    score: 0,
  },
  {
    id: '10',
    name: 'ambient_sound',
    type: 'trait',
    path: 'World > @audio',
    preview: '@audio { src: "forest.ogg", spatial: true }',
    score: 0,
  },
];

const TYPE_ICONS: Record<string, typeof Box> = {
  mesh: Box,
  light: Lightbulb,
  camera: Camera,
  trait: Sparkles,
  property: ArrowRight,
  script: Clock,
};

export function SceneSearch({ onSelect }: { onSelect?: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [history, setHistory] = useState<string[]>([]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return DEMO_ITEMS.map((item) => ({
      ...item,
      score: Math.max(
        fuzzyMatch(query, item.name),
        fuzzyMatch(query, item.path) * 0.7,
        fuzzyMatch(query, item.preview) * 0.5
      ),
    }))
      .filter((r) => r.score > 0.1)
      .filter(
        (r) =>
          category === 'all' ||
          (category === 'objects' && ['mesh', 'light', 'camera'].includes(r.type)) ||
          (category === 'traits' && r.type === 'trait') ||
          (category === 'properties' && r.type === 'property') ||
          (category === 'scripts' && r.type === 'script')
      )
      .sort((a, b) => b.score - a.score);
  }, [query, category]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect?.(id);
      if (query && !history.includes(query)) setHistory((prev) => [query, ...prev.slice(0, 9)]);
    },
    [query, history, onSelect]
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Search className="h-4 w-4 text-studio-accent" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scene..."
          autoFocus
          className="flex-1 bg-transparent text-sm text-studio-text outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-studio-muted hover:text-studio-text">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-studio-border px-2 py-1">
        {(['all', 'objects', 'traits', 'properties', 'scripts'] as SearchCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded px-2 py-0.5 text-[10px] transition ${category === c ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {query && results.length === 0 && (
          <div className="p-4 text-center text-xs text-studio-muted">No results for "{query}"</div>
        )}

        {results.map((r) => {
          const Icon = TYPE_ICONS[r.type] || Box;
          return (
            <div
              key={r.id}
              onClick={() => handleSelect(r.id)}
              className="flex items-start gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer hover:bg-studio-panel/50 transition"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-studio-muted/60" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-studio-text">{r.name}</div>
                <div className="text-[10px] text-studio-muted/60 truncate">{r.path}</div>
                <div className="text-[10px] text-studio-muted font-mono truncate mt-0.5">
                  {r.preview}
                </div>
              </div>
              <span className="shrink-0 text-[9px] text-studio-muted/30">
                {(r.score * 100).toFixed(0)}%
              </span>
            </div>
          );
        })}

        {!query && history.length > 0 && (
          <div className="px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
              Recent
            </div>
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => setQuery(h)}
                className="flex items-center gap-1 w-full px-1 py-0.5 text-[11px] text-studio-muted hover:text-studio-text"
              >
                <Clock className="h-3 w-3 text-studio-muted/30" />
                {h}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
