/**
 * Shader Node Component
 *
 * Custom React Flow node component with ports, properties, and previews
 */

'use client';

import React, { memo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { ShaderNode } from '../../hooks/useShaderGraph';
import { useShaderGraph } from '../../hooks/useShaderGraph';
import { useNodeSelection } from '../../hooks/useNodeSelection';
import { ChevronDown, ChevronRight } from 'lucide-react';
/** Port data as received from the shader graph editor (may include types beyond ShaderDataType) */
interface NodePort {
  id?: string;
  name: string;
  type: string;
  connected?: boolean;
  defaultValue?: unknown;
}

type NodeData = Omit<ShaderNode, 'inputs' | 'outputs'> & {
  collapsed?: boolean;
  name?: string;
  preview?: boolean;
  inputs: NodePort[];
  outputs: NodePort[];
};

// Type color mapping
const TYPE_COLORS: Record<string, string> = {
  float: '#22c55e',
  vec2: '#3b82f6',
  vec3: '#8b5cf6',
  vec4: '#ec4899',
  mat2: '#f59e0b',
  mat3: '#f97316',
  mat4: '#ef4444',
  int: '#06b6d4',
  ivec2: '#0891b2',
  ivec3: '#0e7490',
  ivec4: '#155e75',
  bool: '#84cc16',
  sampler2D: '#a855f7',
  samplerCube: '#9333ea',
};

// Color-blind accessible shape markers (shape + color = double signal)
const TYPE_SHAPES: Record<string, string> = {
  float: '●', // filled circle
  vec2: '▲', // triangle up
  vec3: '■', // filled square
  vec4: '◆', // diamond
  mat2: '★', // star
  mat3: '▼', // triangle down
  mat4: '▶', // triangle right
  int: '⧟', // double circle
  ivec2: '⧡', // dotted fence
  ivec3: '◈', // white diamond + dot
  ivec4: '▣', // square + dot
  bool: '☐', // ballot box
  sampler2D: '⬢', // black hexagon
  samplerCube: '◉', // fisheye
};

// Category icons (using Unicode symbols)
const CATEGORY_ICONS: Record<string, string> = {
  input: '📥',
  output: '📤',
  math: '➕',
  vector: '📐',
  color: '🎨',
  texture: '🖼️',
  utility: '🔧',
  material: '💎',
  volumetric: '☁️',
  custom: '⚙️',
};

export const ShaderNodeComponent = memo(({ data, id }: NodeProps<NodeData>) => {
  const [collapsed, setCollapsed] = useState(data.collapsed ?? false);
  const setNodeProperty = useShaderGraph((state) => state.setNodeProperty);
  const isSelected = useNodeSelection((state) => state.isSelected(id));

  const handlePropertyChange = (key: string, value: unknown) => {
    setNodeProperty(id, key, value);
  };

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
  };

  return (
    <div
      className={`shader-node bg-gray-800 rounded-lg border-2 transition-all ${
        isSelected ? 'border-blue-500 shadow-lg shadow-blue-500/50' : 'border-gray-700'
      }`}
      style={{ minWidth: 200 }}
    >
      {/* Node Header */}
      <div
        className="node-header flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-t-md cursor-pointer"
        onClick={toggleCollapse}
      >
        <span className="text-lg">{CATEGORY_ICONS[data.category] || '⚙️'}</span>
        <span className="text-white font-medium flex-1 truncate">{data.name}</span>
        {data.inputs.length > 0 && (
          <button className="text-gray-400 hover:text-white">
            {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>
        )}
      </div>

      {/* Node Body */}
      {!collapsed && (
        <div className="node-body p-3 space-y-2">
          {/* Input Ports */}
          {data.inputs.map((input: NodePort, index: number) => (
            <div key={input.id} className="flex items-center gap-2 relative">
              <Handle
                type="target"
                position={Position.Left}
                id={input.id}
                className="!w-3 !h-3 !border-2 !border-gray-700"
                style={{
                  backgroundColor: TYPE_COLORS[input.type] || '#6b7280',
                  left: -6,
                  top: 12 + index * 32,
                }}
                title={`${input.type} ${TYPE_SHAPES[input.type] ?? ''}`}
              />
              <span
                className="absolute text-[8px] select-none pointer-events-none"
                style={{ left: -18, top: 12 + index * 32 - 4, color: TYPE_COLORS[input.type] }}
                aria-hidden="true"
              >
                {TYPE_SHAPES[input.type] ?? ''}
              </span>
              <div className="flex-1 min-w-0">
                <label className="text-xs text-gray-400 block truncate">{input.name}</label>
                {!input.connected && input.type !== 'sampler2D' && input.type !== 'samplerCube' && (
                  <InlinePropertyEditor
                    type={input.type}
                    value={input.defaultValue as number | number[] | undefined}
                    onChange={(value) => handlePropertyChange(`input_${input.id}`, value)}
                  />
                )}
              </div>
            </div>
          ))}

          {/* Custom Properties */}
          {data.properties && Object.keys(data.properties).length > 0 && (
            <div className="border-t border-gray-700 pt-2 mt-2 space-y-2">
              {Object.entries(data.properties).map(([key, value]) => (
                <div key={key}>
                  <label className="text-xs text-gray-400 block mb-1">{key}</label>
                  <PropertyEditor
                    propertyKey={key}
                    value={value}
                    onChange={(newValue) => handlePropertyChange(key, newValue)}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Output Ports */}
          {data.outputs.map((output: NodePort, index: number) => (
            <div key={output.id} className="flex items-center gap-2 justify-end relative">
              <span className="text-xs text-gray-400 truncate">{output.name}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={output.id}
                className="!w-3 !h-3 !border-2 !border-gray-700"
                style={{
                  backgroundColor: TYPE_COLORS[output.type] || '#6b7280',
                  right: -6,
                  top: 12 + index * 32,
                }}
                title={`${output.type} ${TYPE_SHAPES[output.type] ?? ''}`}
              />
              <span
                className="absolute text-[8px] select-none pointer-events-none"
                style={{ right: -18, top: 12 + index * 32 - 4, color: TYPE_COLORS[output.type] }}
                aria-hidden="true"
              >
                {TYPE_SHAPES[output.type] ?? ''}
              </span>
            </div>
          ))}

          {/* Preview Thumbnail */}
          {data.preview && (data.type.includes('color') || data.type.includes('texture')) && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <div className="w-full h-16 rounded bg-gradient-to-r from-purple-500 to-pink-500"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ShaderNodeComponent.displayName = 'ShaderNodeComponent';

// Inline property editor for simple types
function InlinePropertyEditor({
  type,
  value,
  onChange,
}: {
  type: string;
  value?: number | number[];
  onChange: (value: number | number[]) => void;
}) {
  if (type === 'float' || type === 'int') {
    return (
      <input
        type="number"
        className="w-full px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 outline-none"
        value={typeof value === 'number' ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        step={type === 'int' ? 1 : 0.01}
      />
    );
  }

  if (type === 'bool') {
    return (
      <input
        type="checkbox"
        className="w-4 h-4 bg-gray-700 border-gray-600 rounded"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked ? 1 : 0)}
      />
    );
  }

  return null;
}

// Property editor for node properties
function PropertyEditor({
  propertyKey,
  value,
  onChange,
}: {
  propertyKey: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  // Color property
  if (propertyKey.toLowerCase().includes('color') || ['r', 'g', 'b', 'a'].includes(propertyKey)) {
    return (
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        className="w-full"
        value={typeof value === 'number' ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    );
  }

  // Numeric property
  if (typeof value === 'number') {
    return (
      <input
        type="number"
        className="w-full px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 outline-none"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        step={0.01}
      />
    );
  }

  // String property
  if (typeof value === 'string') {
    return (
      <input
        type="text"
        className="w-full px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return <div className="text-xs text-gray-500">Unsupported type</div>;
}
