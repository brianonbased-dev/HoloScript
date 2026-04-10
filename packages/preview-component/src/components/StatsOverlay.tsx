/**
 * Stats overlay showing object count and optional file name.
 */

import React from 'react';

export interface StatsOverlayProps {
  objectCount: number;
  fileName?: string;
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  padding: '10px 14px',
  background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
  color: '#fff',
  fontSize: '13px',
  pointerEvents: 'none',
  zIndex: 5,
};

const statsStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '10px',
  left: '10px',
  background: 'rgba(0, 0, 0, 0.8)',
  padding: '8px 12px',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '11px',
  fontFamily: "'JetBrains Mono', monospace",
  zIndex: 5,
  pointerEvents: 'none',
};

export const StatsOverlay: React.FC<StatsOverlayProps> = ({ objectCount, fileName }) => {
  return (
    <>
      {fileName && (
        <div style={overlayStyle} aria-label="File info">
          {fileName}
        </div>
      )}
      <div style={statsStyle} aria-label="Scene statistics">
        Objects: {objectCount}
      </div>
    </>
  );
};
