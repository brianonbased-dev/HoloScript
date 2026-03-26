'use client';

import { useState, useCallback, useRef } from 'react';
import { SceneViewer } from './SceneViewer';
import { generateMockScene, refineMockScene } from '../lib/mock-generator';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StudioWidgetProps {
  /** Initial HoloScript code to display */
  initialCode?: string;
  /** Custom API endpoint for AI generation (overrides mock) */
  generateEndpoint?: string;
  /** Callback when code changes */
  onCodeChange?: (code: string) => void;
  /** Callback when errors occur */
  onErrors?: (errors: Array<{ message: string }>) => void;
  /** CSS class for the outer container */
  className?: string;
  /** Inline styles for the outer container */
  style?: React.CSSProperties;
  /** Show code overlay in the 3D viewport */
  showCode?: boolean;
  /** Suggestion prompts to display */
  suggestions?: string[];
  /** Background color for the 3D viewport */
  backgroundColor?: string;
}

const DEFAULT_SUGGESTIONS = [
  'A floating island with waterfalls',
  'A neon cyberpunk street corner',
  'A cozy medieval tavern',
  'A space station control room',
  'An underwater coral reef',
  'A zen garden with cherry blossoms',
];

// ─── Inline styles (no Tailwind dependency) ─────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    background: '#0d0d14',
    color: '#e8e0ff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  viewport: {
    flex: 1,
    position: 'relative' as const,
    minHeight: 0,
  },
  bottomBar: {
    padding: '12px 16px',
    borderTop: '1px solid #1e1e2e',
    background: '#111118',
  },
  inputRow: {
    display: 'flex',
    gap: 8,
  },
  textarea: {
    flex: 1,
    resize: 'none' as const,
    background: '#1a1a24',
    border: '1px solid #2d2d3d',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#e8e0ff',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
  },
  button: {
    background: '#6c5ce7',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
  },
  buttonDisabled: {
    opacity: 0.4,
    cursor: 'default' as const,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 8,
  },
  chip: {
    background: '#1a1a24',
    border: '1px solid #2d2d3d',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 12,
    color: '#888',
    cursor: 'pointer',
  },
  status: {
    fontSize: 12,
    color: '#6c5ce7',
    marginTop: 6,
  },
  error: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
  },
  codeOverlay: {
    position: 'absolute' as const,
    top: 8,
    right: 8,
    maxWidth: 300,
    maxHeight: '60%',
    overflow: 'auto',
    background: 'rgba(13,13,20,0.85)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 11,
    fontFamily: '"Fira Code", "Cascadia Code", monospace',
    color: '#aaa',
    whiteSpace: 'pre-wrap' as const,
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(45,45,61,0.5)',
  },
};

// ─── Widget ─────────────────────────────────────────────────────────────────

/**
 * Self-contained HoloScript Studio widget.
 * Includes prompt bar + 3D viewer + mock AI generator.
 * Zero external dependencies beyond React 18, R3F 8, @holoscript/core.
 */
export function StudioWidget({
  initialCode = '',
  generateEndpoint,
  onCodeChange,
  onErrors,
  className,
  style,
  showCode = false,
  suggestions = DEFAULT_SUGGESTIONS,
  backgroundColor,
}: StudioWidgetProps) {
  const [code, setCode] = useState(initialCode);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const updateCode = useCallback(
    (newCode: string) => {
      setCode(newCode);
      onCodeChange?.(newCode);
    },
    [onCodeChange]
  );

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;

    setGenerating(true);
    setError('');

    try {
      // Try custom endpoint first (if provided)
      if (generateEndpoint) {
        const res = await fetch(generateEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: trimmed,
            existingCode: code || undefined,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.code) {
            updateCode(data.code);
            setPrompt('');
            setGenerating(false);
            return;
          }
        }
      }

      // Fallback: mock generator (always works)
      const mockCode = code ? refineMockScene(code, trimmed) : generateMockScene(trimmed);
      updateCode(mockCode);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [prompt, generating, code, generateEndpoint, updateCode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className={className} style={{ ...styles.container, ...style }}>
      {/* 3D Viewport */}
      <div style={styles.viewport}>
        <SceneViewer code={code} backgroundColor={backgroundColor} onErrors={onErrors} />
        {showCode && code && <div style={styles.codeOverlay}>{code}</div>}
      </div>

      {/* Bottom prompt bar */}
      <div style={styles.bottomBar}>
        <div style={styles.inputRow}>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              code
                ? 'Refine your scene... "Add a dragon" or "Make it nighttime"'
                : 'Describe your 3D scene...'
            }
            disabled={generating}
            rows={1}
            style={{
              ...styles.textarea,
              ...(generating ? { opacity: 0.5 } : {}),
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            style={{
              ...styles.button,
              ...(generating || !prompt.trim() ? styles.buttonDisabled : {}),
            }}
          >
            {generating ? 'Creating...' : code ? 'Refine' : 'Create'}
          </button>
        </div>

        {generating && <div style={styles.status}>Generating your scene...</div>}
        {error && <div style={styles.error}>{error}</div>}

        {/* Suggestion chips */}
        {!code && !generating && suggestions.length > 0 && (
          <div style={styles.chips}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                style={styles.chip}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.borderColor = '#6c5ce7';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.borderColor = '#2d2d3d';
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
