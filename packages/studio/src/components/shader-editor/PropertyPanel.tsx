/**
 * Property Panel Component
 *
 * Right sidebar for editing selected node properties
 */

'use client';

import React, { useState } from 'react';
import { useNodeSelection } from '../../hooks/useNodeSelection';
import { useShaderGraph } from '../../hooks/useShaderGraph';
import { X } from 'lucide-react';

export function PropertyPanel() {
  const selectedNodes = useNodeSelection((state) => state.getSelectedNodes());
  const graph = useShaderGraph((state) => state.graph);
  const setNodeProperty = useShaderGraph((state) => state.setNodeProperty);
  const clearSelection = useNodeSelection((state) => state.clearSelection);

  if (selectedNodes.length === 0) {
    return (
      <div className="property-panel w-80 bg-gray-900 border-l border-gray-700 p-4">
        <div className="text-center text-gray-500 mt-8">
          <p className="text-sm">No node selected</p>
          <p className="text-xs mt-2">Select a node to edit its properties</p>
        </div>
      </div>
    );
  }

  if (selectedNodes.length > 1) {
    return (
      <div className="property-panel w-80 bg-gray-900 border-l border-gray-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Multiple Selection</h3>
          <button onClick={clearSelection} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="text-center text-gray-500 mt-8">
          <p className="text-sm">{selectedNodes.length} nodes selected</p>
          <p className="text-xs mt-2">Select a single node to edit properties</p>
        </div>
      </div>
    );
  }

  const nodeId = selectedNodes[0];
  const node = graph.getNode(nodeId);

  if (!node) {
    return null;
  }

  return (
    <div className="property-panel w-80 bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">{node.name}</h3>
          <p className="text-xs text-gray-400">{node.type}</p>
        </div>
        <button onClick={clearSelection} className="text-gray-400 hover:text-white ml-2">
          <X size={20} />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node Properties */}
        {node.properties && Object.keys(node.properties).length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Properties</h4>
            <div className="space-y-3">
              {Object.entries(node.properties).map(([key, value]) => (
                <PropertyEditor
                  key={key}
                  label={formatPropertyLabel(key)}
                  propertyKey={key}
                  value={value}
                  onChange={(newValue) => setNodeProperty(nodeId, key, newValue)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Input Ports */}
        {node.inputs.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Inputs</h4>
            <div className="space-y-2">
              {node.inputs.map((input) => (
                <div key={input.id} className="text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-300">{input.name}</span>
                    <span className="text-gray-500">{input.type}</span>
                  </div>
                  {input.connected ? (
                    <div className="text-green-500">Connected</div>
                  ) : (
                    <div className="text-gray-500">Disconnected</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Output Ports */}
        {node.outputs.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Outputs</h4>
            <div className="space-y-2">
              {node.outputs.map((output) => (
                <div key={output.id} className="text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">{output.name}</span>
                    <span className="text-gray-500">{output.type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PropertyEditorProps {
  label: string;
  propertyKey: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

function PropertyEditor({ label, propertyKey, value, onChange }: PropertyEditorProps) {
  // Color picker for color properties
  if (propertyKey.toLowerCase().includes('color') || ['r', 'g', 'b', 'a'].includes(propertyKey)) {
    return (
      <div>
        <label className="block text-sm text-gray-300 mb-2">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            className="flex-1"
            value={typeof value === 'number' ? value : 0}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
          <input
            type="number"
            min="0"
            max="1"
            step="0.01"
            className="w-16 px-2 py-1 text-xs bg-gray-800 text-white rounded border border-gray-700"
            value={typeof value === 'number' ? value.toFixed(2) : '0.00'}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
        </div>
      </div>
    );
  }

  // Vector3 editor (x, y, z)
  if (['x', 'y', 'z'].includes(propertyKey) || propertyKey.toLowerCase().includes('position')) {
    return (
      <div>
        <label className="block text-sm text-gray-300 mb-2">{label}</label>
        <input
          type="number"
          className="w-full px-3 py-2 bg-gray-800 text-white rounded border border-gray-700 focus:border-blue-500 outline-none"
          value={typeof value === 'number' ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          step={0.1}
        />
      </div>
    );
  }

  // Numeric slider for values
  if (typeof value === 'number') {
    const isInteger = Number.isInteger(value);
    const min = propertyKey.toLowerCase().includes('temperature') ? 0 : -10;
    const max = propertyKey.toLowerCase().includes('temperature') ? 10000 : 10;

    return (
      <div>
        <label className="block text-sm text-gray-300 mb-2">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={min}
            max={max}
            step={isInteger ? 1 : 0.01}
            className="flex-1"
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
          <input
            type="number"
            className="w-20 px-2 py-1 text-xs bg-gray-800 text-white rounded border border-gray-700"
            value={isInteger ? value : value.toFixed(2)}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            step={isInteger ? 1 : 0.01}
          />
        </div>
      </div>
    );
  }

  // String input
  if (typeof value === 'string') {
    return (
      <div>
        <label className="block text-sm text-gray-300 mb-2">{label}</label>
        <input
          type="text"
          className="w-full px-3 py-2 bg-gray-800 text-white rounded border border-gray-700 focus:border-blue-500 outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  // Boolean toggle
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-300">{label}</label>
        <input
          type="checkbox"
          className="w-4 h-4 bg-gray-800 border-gray-700 rounded"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm text-gray-300 mb-2">{label}</label>
      <div className="text-xs text-gray-500">Unsupported type</div>
    </div>
  );
}

function formatPropertyLabel(key: string): string {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
