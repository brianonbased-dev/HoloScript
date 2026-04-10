/**
 * HoloScript Visual - Code Preview Component
 *
 * Shows live-updating generated code from the visual graph.
 */

import React, { memo, useMemo, useState } from 'react';
import type { VisualGraph, CodeGenResult } from '../types';
import { graphToCode, type CodeGenOptions } from '../codegen/GraphToCode';

/**
 * Code preview props
 */
export interface CodePreviewProps {
  graph: VisualGraph;
  width?: number;
  objectName?: string;
}

/**
 * Format selector
 */
type OutputFormat = 'hsplus' | 'hs' | 'holo';

/**
 * Code preview component
 */
const CodePreview: React.FC<CodePreviewProps> = ({
  graph,
  width = 300,
  objectName = 'myObject',
}) => {
  const [format, setFormat] = useState<OutputFormat>('hsplus');
  const [copied, setCopied] = useState(false);

  // Generate code whenever graph changes
  const result: CodeGenResult = useMemo(() => {
    return graphToCode(graph, {
      format,
      objectName,
      includeComments: true,
    });
  }, [graph, format, objectName]);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className="code-preview"
      style={{
        width,
        height: '100%',
        backgroundColor: '#1e1e2e',
        borderLeft: '1px solid #3d3d4d',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px',
          borderBottom: '1px solid #3d3d4d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, color: '#e4e4e7' }}>Generated Code</h3>

        {/* Format selector */}
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as OutputFormat)}
          style={{
            padding: '4px 8px',
            backgroundColor: '#2d2d3d',
            border: '1px solid #3d3d4d',
            borderRadius: 4,
            color: '#e4e4e7',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <option value="hsplus">.hsplus</option>
          <option value="hs">.hs</option>
          <option value="holo">.holo</option>
        </select>
      </div>

      {/* Errors and warnings */}
      {(result.errors.length > 0 || result.warnings.length > 0) && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #3d3d4d' }}>
          {result.errors.map((error, i) => (
            <div
              key={i}
              style={{
                color: '#f87171',
                fontSize: 12,
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>⛔</span>
              <span>{error.message}</span>
            </div>
          ))}
          {result.warnings.map((warning, i) => (
            <div
              key={i}
              style={{
                color: '#fbbf24',
                fontSize: 12,
                marginBottom: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>⚠️</span>
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Code display */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <pre
          style={{
            margin: 0,
            padding: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            lineHeight: 1.5,
            color: '#e4e4e7',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {result.code || '// Add nodes to generate code'}
        </pre>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '6px 12px',
            backgroundColor: copied ? '#22c55e' : '#3d3d4d',
            border: 'none',
            borderRadius: 4,
            color: '#e4e4e7',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #3d3d4d',
          fontSize: 11,
          color: '#71717a',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{graph.nodes.length} nodes</span>
        <span>{graph.edges.length} connections</span>
      </div>
    </div>
  );
};

export default memo(CodePreview);
