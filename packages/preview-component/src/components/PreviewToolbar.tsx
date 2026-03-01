/**
 * Toolbar for the HoloScript preview component.
 * Provides camera reset, wireframe toggle, grid/axes toggles, and code panel toggle.
 */

import React from 'react';

export interface PreviewToolbarProps {
  onResetCamera: () => void;
  onToggleWireframe: () => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onToggleCode?: () => void;
  wireframeActive: boolean;
  gridActive: boolean;
  axesActive: boolean;
  codeVisible?: boolean;
  showCodeToggle?: boolean;
}

const btnStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.1)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  color: '#fff',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: '12px',
  transition: 'all 0.2s',
  fontFamily: 'inherit',
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  background: '#007acc',
  borderColor: '#007acc',
};

export const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  onResetCamera,
  onToggleWireframe,
  onToggleGrid,
  onToggleAxes,
  onToggleCode,
  wireframeActive,
  gridActive,
  axesActive,
  codeVisible,
  showCodeToggle = false,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        display: 'flex',
        gap: '6px',
        zIndex: 10,
      }}
      role="toolbar"
      aria-label="Preview controls"
    >
      {showCodeToggle && (
        <button
          style={codeVisible ? activeBtnStyle : btnStyle}
          onClick={onToggleCode}
          title="Toggle code editor"
          aria-pressed={codeVisible}
          aria-label="Toggle code editor"
        >
          Code
        </button>
      )}
      <button
        style={btnStyle}
        onClick={onResetCamera}
        title="Reset camera"
        aria-label="Reset camera"
      >
        Reset
      </button>
      <button
        style={wireframeActive ? activeBtnStyle : btnStyle}
        onClick={onToggleWireframe}
        title="Toggle wireframe"
        aria-pressed={wireframeActive}
        aria-label="Toggle wireframe"
      >
        Wire
      </button>
      <button
        style={gridActive ? activeBtnStyle : btnStyle}
        onClick={onToggleGrid}
        title="Toggle grid"
        aria-pressed={gridActive}
        aria-label="Toggle grid"
      >
        Grid
      </button>
      <button
        style={axesActive ? activeBtnStyle : btnStyle}
        onClick={onToggleAxes}
        title="Toggle axes"
        aria-pressed={axesActive}
        aria-label="Toggle axes"
      >
        Axes
      </button>
    </div>
  );
};
