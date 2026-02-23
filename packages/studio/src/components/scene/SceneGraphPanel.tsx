'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Lightbulb,
  Camera,
  Music,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Copy,
  Layers,
} from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';
import type { SceneNode } from '@/lib/store';

// ─── Node icon map ────────────────────────────────────────────────────────────

const NODE_ICONS: Record<SceneNode['type'], React.ComponentType<{ className?: string }>> = {
  mesh: Box,
  light: Lightbulb,
  camera: Camera,
  audio: Music,
  group: Folder,
  splat: Layers,
};

const NODE_COLORS: Record<SceneNode['type'], string> = {
  mesh: 'text-blue-400',
  light: 'text-yellow-400',
  camera: 'text-green-400',
  audio: 'text-pink-400',
  group: 'text-studio-muted',
  splat: 'text-purple-400',
};

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

// ─── Tree Node ───────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: SceneNode;
  allNodes: SceneNode[];
  depth: number;
  contextMenu: ContextMenuState | null;
  setContextMenu: (m: ContextMenuState | null) => void;
}

function TreeNode({ node, allNodes, depth, contextMenu: _cm, setContextMenu }: TreeNodeProps) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const removeNode = useSceneGraphStore((s) => s.removeNode);
  const addNode = useSceneGraphStore((s) => s.addNode);

  const [expanded, setExpanded] = useState(true);

  const children = allNodes.filter((n) => n.parentId === node.id);
  const hasChildren = children.length > 0;
  const isSelected = selectedId === node.id;

  const Icon = NODE_ICONS[node.type];
  const iconColor = NODE_COLORS[node.type];

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    },
    [node.id, setContextMenu]
  );

  const handleDuplicate = useCallback(() => {
    const newId = `${node.id}-copy-${Date.now()}`;
    addNode({ ...node, id: newId, name: `${node.name} Copy` });
  }, [node, addNode]);

  const handleDelete = useCallback(() => {
    if (selectedId === node.id) setSelectedId(null);
    removeNode(node.id);
  }, [node.id, selectedId, setSelectedId, removeNode]);

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-1 rounded-md px-2 py-[3px] text-sm transition-colors ${
          isSelected
            ? 'bg-studio-accent/20 text-studio-text'
            : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => setSelectedId(isSelected ? null : node.id)}
        onContextMenu={handleContextMenu}
      >
        {/* Expand arrow */}
        <span
          className="flex h-4 w-4 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3 w-3 opacity-60" />
            ) : (
              <ChevronRight className="h-3 w-3 opacity-60" />
            )
          ) : (
            <span className="h-3 w-3" />
          )}
        </span>

        {/* Type icon */}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />

        {/* Name */}
        <span className="truncate font-medium">{node.name}</span>

        {/* Trait badge */}
        {node.traits.length > 0 && (
          <span className="ml-auto rounded-full bg-studio-accent/20 px-1.5 text-[10px] text-studio-accent">
            {node.traits.length}
          </span>
        )}

        {/* Action buttons (on hover) */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDuplicate();
            }}
            className="rounded p-0.5 hover:bg-studio-border"
            title="Duplicate"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              allNodes={allNodes}
              depth={depth + 1}
              contextMenu={null}
              setContextMenu={setContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Add Object Dropdown ──────────────────────────────────────────────────────

const OBJECT_TYPES: Array<{ type: SceneNode['type']; label: string }> = [
  { type: 'mesh', label: 'Mesh Object' },
  { type: 'light', label: 'Point Light' },
  { type: 'camera', label: 'Camera' },
  { type: 'audio', label: 'Audio Source' },
  { type: 'group', label: 'Empty Group' },
  { type: 'splat', label: 'Gaussian Splat' },
];

function AddObjectMenu({ onAdd }: { onAdd: (type: SceneNode['type']) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border border-studio-border bg-studio-panel shadow-xl">
          {OBJECT_TYPES.map(({ type, label }) => {
            const Icon = NODE_ICONS[type];
            const color = NODE_COLORS[type];
            return (
              <button
                key={type}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
                onClick={() => {
                  onAdd(type);
                  setOpen(false);
                }}
              >
                <Icon className={`h-3.5 w-3.5 ${color}`} />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function SceneGraphPanel() {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const rootNodes = nodes.filter((n) => n.parentId === null);

  const handleAddObject = useCallback(
    (type: SceneNode['type']) => {
      const id = `obj-${Date.now()}`;
      const labelMap: Record<SceneNode['type'], string> = {
        mesh: 'Object',
        light: 'Light',
        camera: 'Camera',
        audio: 'Audio',
        group: 'Group',
        splat: 'Splat',
      };
      addNode({
        id,
        name: `${labelMap[type]} ${nodes.length + 1}`,
        type,
        parentId: null,
        traits: [],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
    },
    [nodes.length, addNode]
  );

  return (
    <div
      className="flex h-full flex-col bg-studio-panel select-none"
      onClick={() => setContextMenu(null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-studio-muted">
          Scene
        </span>
        <AddObjectMenu onAdd={handleAddObject} />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {nodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-studio-muted">
            <p className="mb-2">Empty scene</p>
            <p className="opacity-60">Add objects or generate a scene with AI</p>
          </div>
        ) : (
          rootNodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              allNodes={nodes}
              depth={0}
              contextMenu={contextMenu}
              setContextMenu={setContextMenu}
            />
          ))
        )}
      </div>

      {/* Footer: node count */}
      {nodes.length > 0 && (
        <div className="border-t border-studio-border px-3 py-1.5 text-[10px] text-studio-muted">
          {nodes.length} object{nodes.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
