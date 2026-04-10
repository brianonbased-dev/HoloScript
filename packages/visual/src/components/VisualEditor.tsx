/**
 * HoloScript Visual - Visual Editor Component
 *
 * Main visual programming editor that combines all components.
 */

import React, { memo, useCallback, useEffect } from 'react';
import Canvas from './Canvas';
import Sidebar from './Sidebar';
import CodePreview from './CodePreview';
import { useGraphStore } from '../store/graphStore';
import type { VisualGraph } from '../types';

/**
 * Toolbar button component
 */
interface ToolbarButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = memo(
  ({ onClick, disabled, children, title }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '6px 12px',
        backgroundColor: disabled ? '#1e1e2e' : '#2d2d3d',
        border: '1px solid #3d3d4d',
        borderRadius: 4,
        color: disabled ? '#71717a' : '#e4e4e7',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
    </button>
  )
);

ToolbarButton.displayName = 'ToolbarButton';

/**
 * Visual editor props
 */
export interface VisualEditorProps {
  /** Initial graph to load */
  initialGraph?: VisualGraph;
  /** Object name for code generation */
  objectName?: string;
  /** Callback when graph changes */
  onChange?: (graph: VisualGraph) => void;
  /** Callback when code is generated */
  onCodeGenerated?: (code: string) => void;
  /** Sidebar width in pixels */
  sidebarWidth?: number;
  /** Code preview width in pixels */
  codePreviewWidth?: number;
  /** Show toolbar */
  showToolbar?: boolean;
  /** Show code preview panel */
  showCodePreview?: boolean;
  /** Editor height */
  height?: string | number;
}

/**
 * Visual programming editor for HoloScript
 */
const VisualEditor: React.FC<VisualEditorProps> = ({
  initialGraph,
  objectName = 'myObject',
  onChange,
  onCodeGenerated,
  sidebarWidth = 260,
  codePreviewWidth = 300,
  showToolbar = true,
  showCodePreview = true,
  height = '100vh',
}) => {
  // Store state and actions
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const metadata = useGraphStore((s) => s.metadata);
  const selectedNodes = useGraphStore((s) => s.selectedNodes);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const exportGraph = useGraphStore((s) => s.exportGraph);
  const clear = useGraphStore((s) => s.clear);
  const undo = useGraphStore((s) => s.undo);
  const redo = useGraphStore((s) => s.redo);
  const canUndo = useGraphStore((s) => s.canUndo);
  const canRedo = useGraphStore((s) => s.canRedo);
  const removeNode = useGraphStore((s) => s.removeNode);
  const duplicateNodes = useGraphStore((s) => s.duplicateNodes);

  // Load initial graph
  useEffect(() => {
    if (initialGraph) {
      loadGraph(initialGraph);
    }
  }, [initialGraph, loadGraph]);

  // Notify parent of changes
  useEffect(() => {
    const graph = exportGraph();
    onChange?.(graph);
  }, [nodes, edges, onChange, exportGraph]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        redo();
      }
      // Delete: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodes.length > 0) {
        e.preventDefault();
        selectedNodes.forEach((id) => removeNode(id));
      }
      // Duplicate: Ctrl+D
      if (e.ctrlKey && e.key === 'd' && selectedNodes.length > 0) {
        e.preventDefault();
        duplicateNodes(selectedNodes);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedNodes, removeNode, duplicateNodes]);

  // Handle new graph
  const handleNew = useCallback(() => {
    if (nodes.length > 0) {
      if (!window.confirm('Clear current graph and create a new one?')) {
        return;
      }
    }
    clear();
  }, [nodes.length, clear]);

  // Handle export
  const handleExport = useCallback(() => {
    const graph = exportGraph();
    const json = JSON.stringify(graph, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.name.replace(/\s+/g, '_')}.hologr`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportGraph, metadata.name]);

  // Handle import
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.hologr,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const graph = JSON.parse(text) as VisualGraph;
        loadGraph(graph);
      } catch (err) {
        alert('Failed to import graph: Invalid file format');
      }
    };
    input.click();
  }, [loadGraph]);

  // Current graph for code preview
  const currentGraph: VisualGraph = {
    nodes,
    edges,
    metadata,
  };

  return (
    <div
      className="visual-editor"
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0d0d14',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#e4e4e7',
      }}
    >
      {/* Toolbar */}
      {showToolbar && (
        <div
          className="toolbar"
          style={{
            height: 48,
            padding: '0 12px',
            borderBottom: '1px solid #3d3d4d',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#1e1e2e',
          }}
        >
          <ToolbarButton onClick={handleNew} title="New graph">
            📄 New
          </ToolbarButton>
          <ToolbarButton onClick={handleImport} title="Import graph">
            📂 Import
          </ToolbarButton>
          <ToolbarButton onClick={handleExport} title="Export graph">
            💾 Export
          </ToolbarButton>

          <div style={{ width: 1, height: 24, backgroundColor: '#3d3d4d', margin: '0 8px' }} />

          <ToolbarButton onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">
            ↩️ Undo
          </ToolbarButton>
          <ToolbarButton onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Y)">
            ↪️ Redo
          </ToolbarButton>

          <div style={{ flex: 1 }} />

          <span style={{ fontSize: 14, color: '#71717a' }}>{metadata.name}</span>
        </div>
      )}

      {/* Main editor area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Sidebar width={sidebarWidth} />

        {/* Canvas */}
        <Canvas />

        {/* Code preview */}
        {showCodePreview && (
          <CodePreview graph={currentGraph} width={codePreviewWidth} objectName={objectName} />
        )}
      </div>
    </div>
  );
};

export default memo(VisualEditor);
