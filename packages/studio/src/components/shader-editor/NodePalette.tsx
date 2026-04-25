/**
 * Node Palette Component
 *
 * Categorized node library with search and drag-to-add functionality
 */

'use client';

import React, { useState, useMemo } from 'react';
import { NODE_TEMPLATES } from '@/lib/shaderGraph';
import type { INodeTemplate } from '@/lib/shaderGraph';
// Flatten NODE_TEMPLATES catalog to a flat array for search/filter
const ALL_NODE_TEMPLATES = Object.values(NODE_TEMPLATES).flat();
type NodeCategory = keyof typeof NODE_TEMPLATES;
import { useShaderGraph } from '../../hooks/useShaderGraph';
import { Search, Star, ChevronDown, ChevronRight } from 'lucide-react';

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  input: 'Input',
  output: 'Output',
  math: 'Math',
  vector: 'Vector',
  color: 'Color',
  texture: 'Texture',
  utility: 'Utility',
  material: 'Material',
  volumetric: 'Volumetric',
  custom: 'Custom',
  procedural: 'Procedural',
};

const FAVORITES_KEY = 'holoscript_shader_editor_favorites';
const RECENT_NODES_KEY = 'holoscript_shader_editor_recent';
const MAX_RECENT = 10;

export function NodePalette() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(
    new Set(['input', 'output', 'math'])
  );
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(FAVORITES_KEY);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [recentNodes, setRecentNodes] = useState<string[]>(() => {
    const saved = localStorage.getItem(RECENT_NODES_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const createNode = useShaderGraph((state) => state.createNode);

  // Filter and group nodes
  const { categorizedNodes } = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = ALL_NODE_TEMPLATES.filter(
      (template) =>
        template.name.toLowerCase().includes(query) || template.type.toLowerCase().includes(query)
    );

    const categorized: Partial<Record<NodeCategory, INodeTemplate[]>> = {};
    filtered.forEach((template) => {
      if (!categorized[template.category]) {
        categorized[template.category] = [];
      }
      categorized[template.category]!.push(template);
    });

    return { categorizedNodes: categorized, filteredNodes: filtered };
  }, [searchQuery]);

  // Get favorite nodes
  const favoriteNodes = useMemo(() => {
    return ALL_NODE_TEMPLATES.filter((t) => favorites.has(t.type));
  }, [favorites]);

  // Get recent nodes
  const recentNodeTemplates = useMemo(() => {
    return recentNodes
      .map((type) => ALL_NODE_TEMPLATES.find((t) => t.type === type))
      .filter((t): t is INodeTemplate => t !== undefined);
  }, [recentNodes]);

  const toggleCategory = (category: NodeCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleFavorite = (type: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const addToRecent = (type: string) => {
    setRecentNodes((prev) => {
      const next = [type, ...prev.filter((t) => t !== type)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_NODES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleNodeClick = (template: INodeTemplate) => {
    // Add node at center of canvas (will be improved with drag-and-drop)
    const centerX = 400;
    const centerY = 300;
    createNode(template.type, { x: centerX, y: centerY });
    addToRecent(template.type);
  };

  const handleDragStart = (e: React.DragEvent, template: INodeTemplate) => {
    e.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: template.type,
        name: template.name,
      })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="node-palette w-80 bg-gray-900 border-r border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white mb-3">Node Library</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search nodes..."
            className="w-full pl-10 pr-3 py-2 bg-gray-800 text-white rounded border border-gray-700 focus:border-blue-500 outline-none text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {/* Favorites */}
        {favoriteNodes.length > 0 && (
          <NodeSection
            title="Favorites"
            icon={<Star size={16} className="text-yellow-500" />}
            nodes={favoriteNodes}
            onNodeClick={handleNodeClick}
            onNodeDragStart={handleDragStart}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
            defaultExpanded
          />
        )}

        {/* Recent */}
        {recentNodeTemplates.length > 0 && (
          <NodeSection
            title="Recent"
            icon={<span className="text-sm">🕒</span>}
            nodes={recentNodeTemplates}
            onNodeClick={handleNodeClick}
            onNodeDragStart={handleDragStart}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
            defaultExpanded
          />
        )}

        {/* Categorized Nodes */}
        {Object.entries(categorizedNodes).map(([category, nodes]) => (
          <NodeSection
            key={category}
            title={CATEGORY_LABELS[category as NodeCategory]}
            nodes={nodes || []}
            onNodeClick={handleNodeClick}
            onNodeDragStart={handleDragStart}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
            isExpanded={expandedCategories.has(category as NodeCategory)}
            onToggle={() => toggleCategory(category as NodeCategory)}
          />
        ))}
      </div>
    </div>
  );
}

interface NodeSectionProps {
  title: string;
  icon?: React.ReactNode;
  nodes: INodeTemplate[];
  onNodeClick: (template: INodeTemplate) => void;
  onNodeDragStart: (e: React.DragEvent, template: INodeTemplate) => void;
  onToggleFavorite: (type: string) => void;
  favorites: Set<string>;
  isExpanded?: boolean;
  onToggle?: () => void;
  defaultExpanded?: boolean;
}

function NodeSection({
  title,
  icon,
  nodes,
  onNodeClick,
  onNodeDragStart,
  onToggleFavorite,
  favorites,
  isExpanded,
  onToggle,
  defaultExpanded = false,
}: NodeSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isControlled = isExpanded !== undefined;
  const actualExpanded = isControlled ? isExpanded : expanded;

  const handleToggle = () => {
    if (isControlled && onToggle) {
      onToggle();
    } else {
      setExpanded(!expanded);
    }
  };

  return (
    <div className="border-b border-gray-800">
      <button
        className="w-full px-4 py-2 flex items-center gap-2 hover:bg-gray-800 transition-colors text-left"
        onClick={handleToggle}
      >
        {actualExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {icon}
        <span className="text-sm font-medium text-white flex-1">{title}</span>
        <span className="text-xs text-gray-400">{nodes.length}</span>
      </button>

      {actualExpanded && (
        <div className="pb-2 max-h-56 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          {nodes.map((template) => (
            <div
              key={template.type}
              className="mx-2 mb-1 p-2 bg-gray-800 rounded hover:bg-gray-700 cursor-move transition-colors group"
              draggable
              onDragStart={(e) => onNodeDragStart(e, template)}
              onClick={() => onNodeClick(template)}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{template.name}</div>
                  <div className="text-xs text-gray-400 line-clamp-2">{template.description}</div>
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(template.type);
                  }}
                >
                  <Star
                    size={14}
                    className={
                      favorites.has(template.type)
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-400'
                    }
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
