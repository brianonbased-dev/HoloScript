'use client';

/**
 * SceneOutliner — Hierarchical scene graph tree with search, drag-reorder, visibility.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  TreePine,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
  Search,
  ChevronRight,
  ChevronDown,
  Box,
  Lightbulb,
  Camera,
  Volume2,
  Sparkles,
} from 'lucide-react';

export type NodeType = 'mesh' | 'light' | 'camera' | 'audio' | 'particle' | 'empty' | 'group';

export interface SceneNode {
  id: string;
  name: string;
  type: NodeType;
  visible: boolean;
  locked: boolean;
  expanded: boolean;
  children: SceneNode[];
  selected: boolean;
}

const NODE_ICONS: Record<NodeType, typeof Box> = {
  mesh: Box,
  light: Lightbulb,
  camera: Camera,
  audio: Volume2,
  particle: Sparkles,
  empty: Box,
  group: TreePine,
};

const DEMO_TREE: SceneNode[] = [
  {
    id: '1',
    name: 'World',
    type: 'group',
    visible: true,
    locked: false,
    expanded: true,
    selected: false,
    children: [
      {
        id: '2',
        name: 'Player',
        type: 'mesh',
        visible: true,
        locked: false,
        expanded: false,
        selected: false,
        children: [],
      },
      {
        id: '3',
        name: 'Main Camera',
        type: 'camera',
        visible: true,
        locked: true,
        expanded: false,
        selected: false,
        children: [],
      },
      {
        id: '4',
        name: 'Sun Light',
        type: 'light',
        visible: true,
        locked: false,
        expanded: false,
        selected: false,
        children: [],
      },
      {
        id: '5',
        name: 'Environment',
        type: 'group',
        visible: true,
        locked: false,
        expanded: true,
        selected: false,
        children: [
          {
            id: '6',
            name: 'Ground',
            type: 'mesh',
            visible: true,
            locked: false,
            expanded: false,
            selected: false,
            children: [],
          },
          {
            id: '7',
            name: 'Trees',
            type: 'group',
            visible: true,
            locked: false,
            expanded: false,
            selected: false,
            children: [
              {
                id: '8',
                name: 'Oak 1',
                type: 'mesh',
                visible: true,
                locked: false,
                expanded: false,
                selected: false,
                children: [],
              },
              {
                id: '9',
                name: 'Oak 2',
                type: 'mesh',
                visible: true,
                locked: false,
                expanded: false,
                selected: false,
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: '10',
        name: 'Fire Particles',
        type: 'particle',
        visible: true,
        locked: false,
        expanded: false,
        selected: false,
        children: [],
      },
    ],
  },
];

function countNodes(nodes: SceneNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

export function SceneOutliner({ onSelect }: { onSelect?: (id: string) => void }) {
  const [tree, setTree] = useState<SceneNode[]>(DEMO_TREE);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const updateNode = useCallback(
    (nodes: SceneNode[], id: string, updater: (n: SceneNode) => SceneNode): SceneNode[] => {
      return nodes.map((n) =>
        n.id === id ? updater(n) : { ...n, children: updateNode(n.children, id, updater) }
      );
    },
    []
  );

  const toggleVisibility = useCallback(
    (id: string) => {
      setTree((prev) => updateNode(prev, id, (n) => ({ ...n, visible: !n.visible })));
    },
    [updateNode]
  );
  const toggleLock = useCallback(
    (id: string) => {
      setTree((prev) => updateNode(prev, id, (n) => ({ ...n, locked: !n.locked })));
    },
    [updateNode]
  );
  const toggleExpand = useCallback(
    (id: string) => {
      setTree((prev) => updateNode(prev, id, (n) => ({ ...n, expanded: !n.expanded })));
    },
    [updateNode]
  );
  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      onSelect?.(id);
    },
    [onSelect]
  );

  const matchesSearch = useCallback(
    (node: SceneNode): boolean => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        node.name.toLowerCase().includes(q) ||
        node.type.includes(q) ||
        node.children.some((c) => matchesSearch(c))
      );
    },
    [search]
  );

  const total = useMemo(() => countNodes(tree), [tree]);

  const renderNode = (node: SceneNode, depth: number) => {
    if (!matchesSearch(node)) return null;
    const Icon = NODE_ICONS[node.type];
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.id}>
        <div
          onClick={() => select(node.id)}
          className={`flex items-center gap-1 py-0.5 pr-2 cursor-pointer transition text-[11px] ${selectedId === node.id ? 'bg-studio-accent/15 text-studio-accent' : 'text-studio-text hover:bg-studio-panel/50'} ${!node.visible ? 'opacity-40' : ''}`}
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          {/* Expand chevron */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="shrink-0 text-studio-muted/50"
            >
              {node.expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <Icon className="h-3 w-3 shrink-0 text-studio-muted/60" />
          <span className="flex-1 truncate">{node.name}</span>
          {node.locked && <Lock className="h-2.5 w-2.5 text-amber-400/50" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleVisibility(node.id);
            }}
            className="shrink-0 opacity-0 group-hover:opacity-100 text-studio-muted/40 hover:text-studio-text"
          >
            {node.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
        </div>
        {hasChildren && node.expanded && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <TreePine className="h-4 w-4 text-green-400" />
        <span className="text-sm font-semibold text-studio-text">Outliner</span>
        <span className="text-[10px] text-studio-muted">{total}</span>
      </div>
      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1">
        <Search className="h-3 w-3 text-studio-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 bg-transparent text-xs text-studio-text outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto group">{tree.map((n) => renderNode(n, 0))}</div>
    </div>
  );
}
