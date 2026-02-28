'use client';

import { useState, useCallback, useRef, useId } from 'react';
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
  Type,
} from 'lucide-react';
import { useSceneGraphStore } from '@/lib/store';
import { useEditorStore } from '@/lib/store';
import type { SceneNode } from '@/lib/store';

const NODE_ICONS = {
  mesh: Box,
  light: Lightbulb,
  camera: Camera,
  audio: Music,
  group: Folder,
  splat: Layers,
} as const;

const NODE_COLORS = {
  mesh: 'text-blue-400',
  light: 'text-yellow-400',
  camera: 'text-green-400',
  audio: 'text-pink-400',
  group: 'text-gray-400',
  splat: 'text-purple-400',
} as const;

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a flat ordered list of node IDs as they appear in the visible tree,
 * respecting the expanded/collapsed state of each node.
 */
function getFlatVisibleIds(
  nodes: SceneNode[],
  expandedMap: Map<string, boolean>
): string[] {
  const result: string[] = [];
  const rootNodes = nodes.filter((n) => n.parentId === null);

  function walk(node: SceneNode) {
    result.push(node.id);
    const isExpanded = expandedMap.get(node.id) ?? true;
    if (!isExpanded) return;
    const children = nodes.filter((n) => n.parentId === node.id);
    children.forEach(walk);
  }

  rootNodes.forEach(walk);
  return result;
}

// ─── Tree Row ─────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: SceneNode;
  allNodes: SceneNode[];
  depth: number;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (node: SceneNode) => void;
  contextMenu: ContextMenuState | null;
  setContextMenu: (m: ContextMenuState | null) => void;
}

function TreeNode({
  node,
  allNodes,
  depth,
  isExpanded,
  onToggleExpand,
  onSelect,
  onDelete,
  onDuplicate,
  setContextMenu,
}: TreeNodeProps) {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const isSelected = selectedId === node.id;
  const children = allNodes.filter((n) => n.parentId === node.id);
  const hasChildren = children.length > 0;

  // Get icon and color with proper typing
  const getIcon = () => {
    const iconKey = node.type as keyof typeof NODE_ICONS;
    return NODE_ICONS[iconKey] ?? Box;
  };
  const getIconColor = () => {
    const colorKey = node.type as keyof typeof NODE_COLORS;
    return NODE_COLORS[colorKey] ?? 'text-gray-400';
  };

  const Icon = getIcon();
  const iconColor = getIconColor();

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    },
    [node.id, setContextMenu]
  );

  return (
    <div role="none">
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-level={depth + 1}
        tabIndex={isSelected ? 0 : -1}
        data-nodeid={node.id}
        className={`group flex cursor-pointer items-center gap-1 rounded-md px-2 py-[3px] text-sm transition-colors outline-none focus-visible:ring-1 focus-visible:ring-studio-accent ${
          isSelected
            ? 'bg-studio-accent/20 text-studio-text'
            : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
        }`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(node.id)}
        onContextMenu={handleContextMenu}
      >
        {/* Expand arrow */}
        <span
          className="flex h-4 w-4 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
          aria-hidden="true"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 opacity-60" />
            ) : (
              <ChevronRight className="h-3 w-3 opacity-60" />
            )
          ) : (
            <span className="h-3 w-3" />
          )}
        </span>

        {/* Type icon */}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />

        {/* Name */}
        <span className="truncate font-medium">{node.name}</span>

        {/* Trait badge */}
        {node.traits.length > 0 && (
          <span
            className="ml-auto rounded-full bg-studio-accent/20 px-1.5 text-[10px] text-studio-accent"
            title={`${node.traits.length} trait${node.traits.length !== 1 ? 's' : ''}`}
          >
            {node.traits.length}
          </span>
        )}

        {/* Action buttons (on hover) */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(node);
            }}
            className="rounded p-0.5 hover:bg-studio-border"
            title="Duplicate"
            aria-label={`Duplicate ${node.name}`}
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
            className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-400"
            title="Delete"
            aria-label={`Delete ${node.name}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div role="group">
          {children.map((child) => (
            <ConnectedTreeNode
              key={child.id}
              node={child}
              allNodes={allNodes}
              depth={depth + 1}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              setContextMenu={setContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ConnectedTreeNode resolves expandedMap from parent for children
interface ConnectedTreeNodeProps extends Omit<TreeNodeProps, 'isExpanded' | 'contextMenu'> {}

// We pass the expandedMap down via closure in the panel
// For simplicity TreeNode reads expanded from props (passed from panel-level map)
function ConnectedTreeNode(props: ConnectedTreeNodeProps & { expandedMap?: Map<string, boolean> }) {
  const { expandedMap = new Map(), ...rest } = props;
  return (
    <TreeNode
      {...rest}
      isExpanded={expandedMap.get(props.node.id) ?? true}
      contextMenu={null}
    />
  );
}

// ─── Add Object Dropdown ──────────────────────────────────────────────────────

const ADD_TYPES: { type: SceneNode['type']; label: string }[] = [
  { type: 'mesh', label: 'Mesh Object' },
  { type: 'light', label: 'Point Light' },
  { type: 'camera', label: 'Camera' },
  { type: 'audio', label: 'Audio Source' },
  { type: 'group', label: 'Empty Group' },
  { type: 'splat', label: 'Gaussian Splat' },
];

function AddObjectMenu({ onAdd }: { onAdd: (type: SceneNode['type']) => void }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-medium text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
        title="Add object"
        aria-label="Add scene object"
      >
        <Plus className="h-3 w-3" />
        Add
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label="Object types"
          className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-studio-border bg-studio-panel shadow-xl"
        >
          {ADD_TYPES.map((item) => (
            <button
              key={item.type}
              role="option"
              aria-selected={false}
              onClick={() => {
                onAdd(item.type);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function ContextMenuPopup({
  state,
  onDuplicate,
  onRename,
  onDelete,
  onClose,
}: {
  state: ContextMenuState;
  onDuplicate: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-[100] min-w-32 overflow-hidden rounded-xl border border-studio-border bg-studio-panel shadow-xl"
      style={{ left: state.x, top: state.y }}
      role="menu"
      aria-label="Scene node actions"
    >
      <button
        role="menuitem"
        onClick={() => { onDuplicate(state.nodeId); onClose(); }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-studio-muted hover:bg-studio-surface hover:text-studio-text"
      >
        <Copy className="h-3 w-3" /> Duplicate
      </button>
      <button
        role="menuitem"
        onClick={() => { onRename(state.nodeId); onClose(); }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-studio-muted hover:bg-studio-surface hover:text-studio-text"
      >
        <Type className="h-3 w-3" /> Rename
      </button>
      <button
        role="menuitem"
        onClick={() => { onDelete(state.nodeId); onClose(); }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 className="h-3 w-3" /> Delete
      </button>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function SceneGraphPanel() {
  const nodes         = useSceneGraphStore((s) => s.nodes);
  const addNode       = useSceneGraphStore((s) => s.addNode);
  const removeNode    = useSceneGraphStore((s) => s.removeNode);
  const updateNode    = useSceneGraphStore((s) => s.updateNode);
  const selectedId    = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);

  const [contextMenu, setContextMenu]   = useState<ContextMenuState | null>(null);
  // Tracks expanded state per node id (default: expanded)
  const [expandedMap, setExpandedMap]   = useState<Map<string, boolean>>(new Map());
  const treeRef           = useRef<HTMLDivElement>(null);

  const rootNodes = nodes.filter((n) => n.parentId === null);

  // ─── Node actions ──────────────────────────────────────────────────────────

  const handleAddObject = useCallback(
    (type: SceneNode['type']) => {
      const id = `obj-${Date.now()}`;
      const labelMap: Record<string, string> = {
        mesh: 'Object', light: 'Light', camera: 'Camera',
        audio: 'Audio', group: 'Group', splat: 'Splat',
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
      setSelectedId(id);
    },
    [nodes.length, addNode, setSelectedId]
  );

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedMap((prev) => {
      const next = new Map(prev);
      next.set(id, !(prev.get(id) ?? true));
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(selectedId === id ? null : id);
  }, [selectedId, setSelectedId]);

  const handleDelete = useCallback((id: string) => {
    if (selectedId === id) setSelectedId(null);
    removeNode(id);
  }, [selectedId, setSelectedId, removeNode]);

  const handleDuplicate = useCallback((nodeOrId: SceneNode | string) => {
    const node = typeof nodeOrId === 'string'
      ? nodes.find((n) => n.id === nodeOrId)
      : nodeOrId;
    if (!node) return;
    const newId = `${node.id}-copy-${Date.now()}`;
    addNode({ ...node, id: newId, name: `${node.name} Copy` });
    setSelectedId(newId);
  }, [nodes, addNode, setSelectedId]);

  const handleRename = useCallback((id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const newName = window.prompt(`Rename "${node.name}"`, node.name);
    if (newName && newName.trim() !== '') {
      updateNode(id, { name: newName.trim() });
    }
  }, [nodes, updateNode]);

  // ─── Keyboard navigation ───────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const flatIds = getFlatVisibleIds(nodes, expandedMap);
      if (flatIds.length === 0) return;

      const idx = selectedId ? flatIds.indexOf(selectedId) : -1;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = flatIds[Math.min(idx + 1, flatIds.length - 1)];
          setSelectedId(next);
          // Focus the row element
          treeRef.current
            ?.querySelector<HTMLElement>(`[data-nodeid="${next}"]`)
            ?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = flatIds[Math.max(idx - 1, 0)];
          setSelectedId(prev);
          treeRef.current
            ?.querySelector<HTMLElement>(`[data-nodeid="${prev}"]`)
            ?.focus();
          break;
        }
        case 'ArrowRight': {
          // Expand selected node
          if (selectedId) {
            e.preventDefault();
            setExpandedMap((m) => { const n = new Map(m); n.set(selectedId, true); return n; });
          }
          break;
        }
        case 'ArrowLeft': {
          // Collapse selected node
          if (selectedId) {
            e.preventDefault();
            setExpandedMap((m) => { const n = new Map(m); n.set(selectedId, false); return n; });
          }
          break;
        }
        case 'Enter': {
          // Toggle selection (select if not selected, deselect if selected)
          if (selectedId) {
            e.preventDefault();
            setSelectedId(selectedId === selectedId ? selectedId : null);
          } else if (flatIds.length > 0) {
            e.preventDefault();
            setSelectedId(flatIds[0]);
          }
          break;
        }
        case 'Delete':
        case 'Backspace': {
          if (selectedId && e.target === treeRef.current) {
            e.preventDefault();
            handleDelete(selectedId);
          }
          break;
        }
        case 'Escape': {
          setSelectedId(null);
          setContextMenu(null);
          break;
        }
        default:
          break;
      }
    },
    [nodes, expandedMap, selectedId, setSelectedId, handleDelete]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

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

      {/* Tree — keyboard nav container */}
      <div
        ref={treeRef}
        role="tree"
        aria-label="Scene graph"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto py-1 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-studio-accent/40"
      >
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
              isExpanded={expandedMap.get(node.id) ?? true}
              onToggleExpand={handleToggleExpand}
              onSelect={handleSelect}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
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
          {selectedId && (
            <span className="ml-2 text-studio-accent">
              · {nodes.find(n => n.id === selectedId)?.name ?? 'selected'}
            </span>
          )}
          <span className="ml-auto float-right opacity-50">↑↓ navigate · Del delete</span>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenuPopup
          state={contextMenu}
          onDuplicate={handleDuplicate}
          onRename={handleRename}
          onDelete={handleDelete}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
