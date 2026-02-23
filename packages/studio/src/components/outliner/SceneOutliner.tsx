'use client';

/**
 * SceneOutliner — hierarchical tree view of all scene objects parsed from code.
 * Click any node to select/highlight it.
 */

import { useState } from 'react';
import { Layers, ChevronRight, ChevronDown, Box, Lightbulb, Video, FolderOpen, Globe, X } from 'lucide-react';
import { useSceneOutliner, type OutlinerNode } from '@/hooks/useSceneOutliner';

const TYPE_ICON: Record<string, React.FC<{ className?: string }>> = {
  scene: Globe,
  object: Box,
  light: Lightbulb,
  camera: Video,
  group: FolderOpen,
};

const TYPE_COLOR: Record<string, string> = {
  scene: 'text-purple-400',
  object: 'text-blue-400',
  light: 'text-yellow-400',
  camera: 'text-green-400',
  group: 'text-orange-400',
};

interface NodeRowProps {
  node: OutlinerNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function NodeRow({ node, selectedId, onSelect }: NodeRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const Icon = TYPE_ICON[node.type] ?? Box;
  const color = TYPE_COLOR[node.type] ?? 'text-studio-muted';

  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className={`flex w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:bg-studio-surface/80 ${selectedId === node.id ? 'bg-studio-accent/15 ring-1 ring-studio-accent/30' : ''}`}
        style={{ paddingLeft: `${8 + node.depth * 14}px` }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="mr-0.5 shrink-0 text-studio-muted hover:text-studio-text">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="mr-0.5 w-3 shrink-0" />
        )}

        {/* Type icon */}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />

        {/* Name */}
        <span className={`flex-1 truncate text-[10px] font-medium ${selectedId === node.id ? 'text-studio-text' : 'text-studio-text/80'}`}>
          {node.name}
        </span>

        {/* Trait chips */}
        {node.traits.slice(0, 3).map((t) => (
          <span key={t} className="shrink-0 rounded-full bg-studio-border/60 px-1 text-[7px] text-studio-muted">@{t}</span>
        ))}
        {node.traits.length > 3 && (
          <span className="shrink-0 text-[7px] text-studio-muted">+{node.traits.length - 3}</span>
        )}

        {/* Line number */}
        <span className="shrink-0 text-[8px] text-studio-muted/50">L{node.line}</span>
      </button>

      {/* Children */}
      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <NodeRow key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SceneOutlinerProps { onClose: () => void; }

export function SceneOutliner({ onClose }: SceneOutlinerProps) {
  const { tree, allNodes, selectedNode, selectedId, select } = useSceneOutliner();

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Layers className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Scene Outliner</span>
        <span className="rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">{allNodes.length} nodes</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Empty state */}
      {tree.length === 0 && (
        <p className="py-8 text-center text-[10px] text-studio-muted">No objects in scene. Add some HoloScript code to start.</p>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1.5 px-1">
        {tree.map((node) => (
          <NodeRow key={node.id} node={node} selectedId={selectedId} onSelect={select} />
        ))}
      </div>

      {/* Selected node details */}
      {selectedNode && (
        <div className="shrink-0 border-t border-studio-border bg-studio-surface/40 px-3 py-2">
          <p className="text-[9px] font-semibold text-studio-text">{selectedNode.name}</p>
          <p className="text-[8px] text-studio-muted">
            {selectedNode.type} · Line {selectedNode.line}
            {selectedNode.traits.length > 0 && ` · @${selectedNode.traits.join(' @')}`}
          </p>
        </div>
      )}
    </div>
  );
}
