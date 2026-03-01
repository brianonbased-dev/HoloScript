/**
 * Inline code editor panel for the HoloScript preview.
 * Allows editing and re-rendering HoloScript code inline.
 */

import React, { useRef, useCallback } from 'react';

export interface CodePanelProps {
  code: string;
  onChange: (code: string) => void;
  onRender: () => void;
  visible: boolean;
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  left: '10px',
  top: '50px',
  bottom: '50px',
  width: '380px',
  background: 'rgba(0, 0, 0, 0.9)',
  borderRadius: '8px',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 15,
};

const headerStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'rgba(255, 255, 255, 0.1)',
  fontWeight: 500,
  fontSize: '13px',
  color: '#fff',
};

const textareaStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  fontFamily: "'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
  fontSize: '12px',
  lineHeight: 1.5,
  background: 'transparent',
  color: '#e0e0e0',
  border: 'none',
  resize: 'none',
  outline: 'none',
  overflow: 'auto',
  tabSize: 2,
};

const renderBtnStyle: React.CSSProperties = {
  margin: '8px',
  background: '#007acc',
  border: 'none',
  borderRadius: '6px',
  color: 'white',
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: '13px',
  fontFamily: 'inherit',
};

export const CodePanel: React.FC<CodePanelProps> = ({ code, onChange, onRender, visible }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd+Enter to render
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onRender();
      }
      // Tab key inserts spaces instead of changing focus
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = textareaRef.current;
        if (ta) {
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const newValue = code.substring(0, start) + '  ' + code.substring(end);
          onChange(newValue);
          // Restore cursor position after React re-render
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          });
        }
      }
    },
    [code, onChange, onRender]
  );

  if (!visible) return null;

  return (
    <div style={panelStyle} role="region" aria-label="Code editor">
      <div style={headerStyle}>HoloScript Code</div>
      <textarea
        ref={textareaRef}
        style={textareaStyle}
        value={code}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        aria-label="HoloScript source code"
        placeholder={`// Write HoloScript here\norb myOrb {\n  geometry: "sphere"\n  color: "cyan"\n  position: [0, 1, 0]\n  animate: "float"\n}`}
      />
      <button
        style={renderBtnStyle}
        onClick={onRender}
        title="Render scene (Ctrl+Enter)"
        aria-label="Render scene"
      >
        Render (Ctrl+Enter)
      </button>
    </div>
  );
};
