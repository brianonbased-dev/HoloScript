/**
 * HoloScript Visual - HoloNode Component
 *
 * Custom React Flow node component for HoloScript nodes.
 */

import React, { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { HoloNodeData, PortDefinition } from '../types';
import { CATEGORY_COLORS } from '../types';

/**
 * Port type colors
 */
const PORT_COLORS: Record<string, string> = {
  flow: '#ffffff',
  string: '#f472b6', // Pink
  number: '#60a5fa', // Blue
  boolean: '#fb923c', // Orange
  any: '#a1a1aa', // Gray
  object: '#4ade80', // Green
  array: '#c084fc', // Purple
};

/**
 * HoloNode component props
 */
interface HoloNodeProps extends NodeProps<HoloNodeData> {
  onPropertyChange?: (nodeId: string, property: string, value: unknown) => void;
}

/**
 * Input handle component
 */
const InputHandle: React.FC<{ port: PortDefinition; index: number; total: number }> = memo(
  ({ port, index, total }) => {
    const top = total === 1 ? 50 : 30 + ((index * 40) / Math.max(total - 1, 1)) * (total - 1);

    return (
      <Handle
        type="target"
        position={Position.Left}
        id={port.id}
        style={{
          top: `${top}%`,
          background: PORT_COLORS[port.type] || PORT_COLORS.any,
          width: port.type === 'flow' ? 12 : 10,
          height: port.type === 'flow' ? 12 : 10,
          border: '2px solid #1e1e2e',
          borderRadius: port.type === 'flow' ? 2 : '50%',
        }}
        title={`${port.label} (${port.type})`}
      />
    );
  }
);

InputHandle.displayName = 'InputHandle';

/**
 * Output handle component
 */
const OutputHandle: React.FC<{ port: PortDefinition; index: number; total: number }> = memo(
  ({ port, index, total }) => {
    const top = total === 1 ? 50 : 30 + ((index * 40) / Math.max(total - 1, 1)) * (total - 1);

    return (
      <Handle
        type="source"
        position={Position.Right}
        id={port.id}
        style={{
          top: `${top}%`,
          background: PORT_COLORS[port.type] || PORT_COLORS.any,
          width: port.type === 'flow' ? 12 : 10,
          height: port.type === 'flow' ? 12 : 10,
          border: '2px solid #1e1e2e',
          borderRadius: port.type === 'flow' ? 2 : '50%',
        }}
        title={`${port.label} (${port.type})`}
      />
    );
  }
);

OutputHandle.displayName = 'OutputHandle';

/**
 * HoloNode component
 */
const HoloNode: React.FC<HoloNodeProps> = ({ id, data, selected }) => {
  const categoryColor = CATEGORY_COLORS[data.category];

  return (
    <div
      className="holo-node"
      style={{
        minWidth: 160,
        backgroundColor: '#2d2d3d',
        borderRadius: 8,
        border: `2px solid ${selected ? '#60a5fa' : categoryColor}`,
        boxShadow: selected ? `0 0 12px ${categoryColor}80` : '0 4px 6px rgba(0, 0, 0, 0.3)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        className="holo-node-header"
        style={{
          backgroundColor: categoryColor,
          padding: '8px 12px',
          color: '#1e1e2e',
          fontWeight: 600,
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>{data.label}</span>
      </div>

      {/* Body */}
      <div
        className="holo-node-body"
        style={{
          padding: '8px 12px',
          minHeight: 40,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        {/* Input labels */}
        <div className="holo-node-inputs" style={{ fontSize: 11, color: '#a1a1aa' }}>
          {data.inputs.map((port) => (
            <div key={port.id} style={{ marginBottom: 4 }}>
              {port.label}
            </div>
          ))}
        </div>

        {/* Output labels */}
        <div
          className="holo-node-outputs"
          style={{ fontSize: 11, color: '#a1a1aa', textAlign: 'right' }}
        >
          {data.outputs.map((port) => (
            <div key={port.id} style={{ marginBottom: 4 }}>
              {port.label}
            </div>
          ))}
        </div>
      </div>

      {/* Input handles */}
      {data.inputs.map((port, index) => (
        <InputHandle key={port.id} port={port} index={index} total={data.inputs.length} />
      ))}

      {/* Output handles */}
      {data.outputs.map((port, index) => (
        <OutputHandle key={port.id} port={port} index={index} total={data.outputs.length} />
      ))}
    </div>
  );
};

export default memo(HoloNode);
