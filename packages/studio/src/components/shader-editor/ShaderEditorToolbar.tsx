/**
 * Shader Editor Toolbar Component
 *
 * Top toolbar with action buttons for save/load, undo/redo, export
 */

'use client';

import React, { useState, useRef } from 'react';
import { useShaderGraph } from '../../hooks/useShaderGraph';
import { useAutoSave } from '../../hooks/useAutoSave';
import { useShaderCompilation } from '../../hooks/useShaderCompilation';
import {
import { logger } from '@/lib/logger';
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  Copy,
  Scissors,
  ClipboardPaste,
  Download,
  Grid3x3,
  FileJson,
  Plus,
} from 'lucide-react';

export function ShaderEditorToolbar() {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [gridSnap, setGridSnap] = useState(20);
  const [showGridSettings, setShowGridSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const graph = useShaderGraph((state) => state.graph);
  const serializeGraph = useShaderGraph((state) => state.serializeGraph);
  const loadGraph = useShaderGraph((state) => state.loadGraph);
  const clearGraph = useShaderGraph((state) => state.clearGraph);
  const undo = useShaderGraph((state) => state.undo);
  const redo = useShaderGraph((state) => state.redo);
  const canUndo = useShaderGraph((state) => state.canUndo());
  const canRedo = useShaderGraph((state) => state.canRedo());

  const { loadAutoSave, clearAutoSave } = useAutoSave();
  const { compiled, lastCompileTime, exportGLSL, exportWGSL, exportHLSL } = useShaderCompilation();

  // Save graph to file
  const handleSave = () => {
    const serialized = serializeGraph();
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${graph.name.replace(/\s+/g, '_')}.shadergraph.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Load graph from file
  const handleLoad = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        loadGraph(content);
      } catch (error) {
        logger.error('Failed to load graph:', error);
        alert('Failed to load shader graph file');
      }
    };
    reader.readAsText(file);
  };

  // Load autosave
  const handleLoadAutoSave = () => {
    const autosave = loadAutoSave();
    if (autosave) {
      const date = new Date(autosave.timestamp);
      if (
        confirm(
          `Load autosaved graph from ${date.toLocaleString()}? This will replace the current graph.`
        )
      ) {
        loadGraph(autosave.data);
      }
    } else {
      alert('No autosave found');
    }
  };

  // Export options — delegates to useShaderCompilation download helpers
  const handleExport = (format: 'wgsl' | 'glsl' | 'hlsl') => {
    if (format === 'glsl') exportGLSL();
    else if (format === 'wgsl') exportWGSL();
    else if (format === 'hlsl') exportHLSL();
    setShowExportMenu(false);
  };

  return (
    <div className="shader-editor-toolbar bg-gray-900 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.shadergraph.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Left Section - File Operations */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (confirm('Create new shader graph? Current graph will be lost.')) {
              clearGraph();
            }
          }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          title="New Graph"
        >
          <Plus size={16} />
          New
        </button>

        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          title="Save Graph (Ctrl+S)"
        >
          <Save size={16} />
          Save
        </button>

        <button
          onClick={handleLoad}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          title="Load Graph (Ctrl+O)"
        >
          <FolderOpen size={16} />
          Load
        </button>

        <button
          onClick={handleLoadAutoSave}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
          title="Load Autosave"
        >
          Autosave
        </button>

        <div className="h-6 w-px bg-gray-700 mx-1"></div>

        {/* Undo/Redo */}
        <button
          onClick={undo}
          disabled={!canUndo}
          className={`p-1.5 rounded transition-colors ${
            canUndo ? 'text-white hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={18} />
        </button>

        <button
          onClick={redo}
          disabled={!canRedo}
          className={`p-1.5 rounded transition-colors ${
            canRedo ? 'text-white hover:bg-gray-700' : 'text-gray-600 cursor-not-allowed'
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={18} />
        </button>

        <div className="h-6 w-px bg-gray-700 mx-1"></div>

        {/* Clipboard Operations */}
        <button
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Cut (Ctrl+X)"
        >
          <Scissors size={18} />
        </button>

        <button
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Copy (Ctrl+C)"
        >
          <Copy size={18} />
        </button>

        <button
          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
          title="Paste (Ctrl+V)"
        >
          <ClipboardPaste size={18} />
        </button>
      </div>

      {/* Center Section - Graph Name */}
      <div className="flex-1 flex items-center justify-center">
        <input
          type="text"
          className="px-3 py-1 bg-transparent text-white text-center border-b border-transparent hover:border-gray-600 focus:border-blue-500 outline-none"
          value={graph.name}
          onChange={(e) => {
            graph.name = e.target.value;
          }}
          placeholder="Untitled Shader"
        />
      </div>

      {/* Right Section - Settings and Export */}
      <div className="flex items-center gap-2">
        {/* Grid Settings */}
        <div className="relative">
          <button
            onClick={() => setShowGridSettings(!showGridSettings)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            title="Grid Settings"
          >
            <Grid3x3 size={16} />
            {gridSnap}px
          </button>

          {showGridSettings && (
            <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg p-3 z-10">
              <div className="text-xs text-gray-400 mb-2">Snap to Grid</div>
              <div className="flex gap-2">
                {[10, 20, 50].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setGridSnap(size);
                      setShowGridSettings(false);
                    }}
                    className={`px-2 py-1 text-xs rounded ${
                      gridSnap === size
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {size}px
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Export Menu */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            title="Export Shader"
          >
            <Download size={16} />
            Export
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 z-10 min-w-[120px]">
              <button
                onClick={() => handleExport('wgsl')}
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 transition-colors"
              >
                WGSL
              </button>
              <button
                onClick={() => handleExport('glsl')}
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 transition-colors"
              >
                GLSL
              </button>
              <button
                onClick={() => handleExport('hlsl')}
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 transition-colors"
              >
                HLSL
              </button>
              <div className="border-t border-gray-700 my-1"></div>
              <button
                onClick={() => {
                  const serialized = serializeGraph();
                  const blob = new Blob([serialized], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `${graph.name}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                  setShowExportMenu(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-white hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <FileJson size={14} />
                JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
