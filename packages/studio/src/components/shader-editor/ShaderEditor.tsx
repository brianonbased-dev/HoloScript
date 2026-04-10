/**
 * Shader Editor Main Component
 *
 * Integrates all shader editor components into a complete UI
 */

'use client';

import React from 'react';
import { ShaderEditorToolbar } from './ShaderEditorToolbar';
import { ShaderEditorCanvas } from './ShaderEditorCanvas';
import { NodePalette } from './NodePalette';
import { PropertyPanel } from './PropertyPanel';
import { MaterialPreview } from './MaterialPreview';
import { ShaderCodePanel } from './ShaderCodePanel';
import { useAutoSave } from '../../hooks/useAutoSave';

export function ShaderEditor() {
  // Initialize auto-save
  useAutoSave();

  return (
    <div className="shader-editor w-full h-screen flex flex-col bg-gray-950 text-white">
      {/* Toolbar */}
      <ShaderEditorToolbar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Node Palette */}
        <NodePalette />

        {/* Center - Canvas and Preview */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 relative">
            <ShaderEditorCanvas snapToGrid snapGrid={[20, 20]} />
          </div>

          {/* Bottom Split - Preview and Code */}
          <div className="h-80 flex border-t border-gray-700">
            {/* Material Preview */}
            <div className="w-1/2 border-r border-gray-700">
              <MaterialPreview />
            </div>

            {/* Code Panel */}
            <div className="w-1/2">
              <ShaderCodePanel />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Property Panel */}
        <PropertyPanel />
      </div>
    </div>
  );
}
