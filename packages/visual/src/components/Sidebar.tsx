/**
 * HoloScript Visual - Sidebar Component
 *
 * Node library sidebar for dragging nodes onto the canvas.
 */

import React, { memo, useCallback, useState } from 'react';
import type { NodeCategory, NodeTypeDefinition } from '../types';
import { CATEGORY_COLORS } from '../types';
import { EVENT_NODES, ACTION_NODES, LOGIC_NODES, DATA_NODES } from '../nodes/nodeRegistry';

/**
 * Node item props
 */
interface NodeItemProps {
  definition: NodeTypeDefinition;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

/**
 * Draggable node item
 */
const NodeItem: React.FC<NodeItemProps> = memo(({ definition, onDragStart }) => {
  const categoryColor = CATEGORY_COLORS[definition.category];

  return (
    <div
      className="node-item"
      draggable
      onDragStart={(e) => onDragStart(e, definition.type)}
      style={{
        padding: '8px 12px',
        marginBottom: 4,
        backgroundColor: '#2d2d3d',
        borderRadius: 6,
        borderLeft: `3px solid ${categoryColor}`,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        transition: 'transform 0.1s, box-shadow 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateX(4px)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateX(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span style={{ fontSize: 16 }}>{definition.icon || '○'}</span>
      <div>
        <div style={{ fontWeight: 500, color: '#e4e4e7' }}>{definition.label}</div>
        <div style={{ fontSize: 11, color: '#71717a' }}>{definition.description}</div>
      </div>
    </div>
  );
});

NodeItem.displayName = 'NodeItem';

/**
 * Category section props
 */
interface CategorySectionProps {
  title: string;
  category: NodeCategory;
  nodes: NodeTypeDefinition[];
  isExpanded: boolean;
  onToggle: () => void;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

/**
 * Collapsible category section
 */
const CategorySection: React.FC<CategorySectionProps> = memo(
  ({ title, category, nodes, isExpanded, onToggle, onDragStart }) => {
    const categoryColor = CATEGORY_COLORS[category];

    return (
      <div className="category-section" style={{ marginBottom: 12 }}>
        <button
          onClick={onToggle}
          style={{
            width: '100%',
            padding: '10px 12px',
            backgroundColor: categoryColor,
            border: 'none',
            borderRadius: 6,
            color: '#1e1e2e',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isExpanded ? 8 : 0,
          }}
        >
          <span>{title}</span>
          <span
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            ▶
          </span>
        </button>

        {isExpanded && (
          <div className="category-nodes" style={{ paddingLeft: 8 }}>
            {nodes.map((node) => (
              <NodeItem key={node.type} definition={node} onDragStart={onDragStart} />
            ))}
          </div>
        )}
      </div>
    );
  }
);

CategorySection.displayName = 'CategorySection';

/**
 * Sidebar props
 */
export interface SidebarProps {
  width?: number;
  onDragStart?: (event: React.DragEvent, nodeType: string) => void;
}

/**
 * Sidebar component
 */
const Sidebar: React.FC<SidebarProps> = ({ width = 260, onDragStart }) => {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    event: true,
    action: true,
    logic: false,
    data: false,
  });

  const [searchQuery, setSearchQuery] = useState('');

  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeType: string) => {
      event.dataTransfer.setData('application/holoscript-node', nodeType);
      event.dataTransfer.effectAllowed = 'move';
      onDragStart?.(event, nodeType);
    },
    [onDragStart]
  );

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  }, []);

  // Filter nodes by search
  const filterNodes = (nodes: NodeTypeDefinition[]): NodeTypeDefinition[] => {
    if (!searchQuery) return nodes;
    const query = searchQuery.toLowerCase();
    return nodes.filter(
      (n) => n.label.toLowerCase().includes(query) || n.description.toLowerCase().includes(query)
    );
  };

  return (
    <div
      className="sidebar"
      style={{
        width,
        height: '100%',
        backgroundColor: '#1e1e2e',
        borderRight: '1px solid #3d3d4d',
        padding: 12,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, color: '#e4e4e7', marginBottom: 8 }}>Node Library</h2>
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#2d2d3d',
            border: '1px solid #3d3d4d',
            borderRadius: 6,
            color: '#e4e4e7',
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* Categories */}
      <div style={{ flex: 1 }}>
        <CategorySection
          title="Events"
          category="event"
          nodes={filterNodes(EVENT_NODES)}
          isExpanded={expandedCategories.event}
          onToggle={() => toggleCategory('event')}
          onDragStart={handleDragStart}
        />

        <CategorySection
          title="Actions"
          category="action"
          nodes={filterNodes(ACTION_NODES)}
          isExpanded={expandedCategories.action}
          onToggle={() => toggleCategory('action')}
          onDragStart={handleDragStart}
        />

        <CategorySection
          title="Logic"
          category="logic"
          nodes={filterNodes(LOGIC_NODES)}
          isExpanded={expandedCategories.logic}
          onToggle={() => toggleCategory('logic')}
          onDragStart={handleDragStart}
        />

        <CategorySection
          title="Data"
          category="data"
          nodes={filterNodes(DATA_NODES)}
          isExpanded={expandedCategories.data}
          onToggle={() => toggleCategory('data')}
          onDragStart={handleDragStart}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          paddingTop: 12,
          borderTop: '1px solid #3d3d4d',
          fontSize: 11,
          color: '#71717a',
          textAlign: 'center',
        }}
      >
        Drag nodes to canvas
      </div>
    </div>
  );
};

export default memo(Sidebar);
