'use client';

/**
 * VoiceAuthoringButton — drop-in mic button for the editor toolbar.
 *
 * Click → speak → shows emitted HoloScript in a panel → "Copy" or "Apply"
 * (Apply calls the optional onApply prop if provided; otherwise copies).
 *
 * Self-contained — no editor plumbing required. Drop anywhere.
 *
 * See:
 *  - packages/studio/src/hooks/useVoiceAuthoring.ts
 *  - research/quest3-iphone-moment/b-voice-intent-grammar.md
 */

import { useState } from 'react';
import { useVoiceAuthoring } from '../../hooks/useVoiceAuthoring';

interface VoiceAuthoringButtonProps {
  /** Called with the generated .holo source when user clicks Apply. */
  onApply?: (code: string) => void;
  /** Optional: pre-existing scene for edit-mode turns. */
  currentComposition?: string;
  /** Compact mode for space-constrained toolbars. Default: false. */
  compact?: boolean;
}

export function VoiceAuthoringButton({
  onApply,
  currentComposition,
  compact = false,
}: VoiceAuthoringButtonProps) {
  const { state, transcript, holoSource, lastError, supported, start, reset } = useVoiceAuthoring({
    // Edit-mode seed: whatever is already in Monaco becomes the "previous"
    // scene for the first turn. Subsequent turns in the session use the
    // hook's own prior result.
    currentComposition,
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const onMicClick = () => {
    setCopied(false);
    setPanelOpen(true);
    if (state === 'ready' || state === 'error') {
      // Re-start after a previous turn.
      reset();
      setTimeout(start, 0);
    } else if (state === 'idle') {
      start();
    }
  };

  const onApplyClick = async () => {
    if (!holoSource) return;
    if (onApply) {
      onApply(holoSource);
      setPanelOpen(false);
    } else {
      try {
        await navigator.clipboard.writeText(holoSource);
        setCopied(true);
      } catch {
        /* ignore clipboard failure */
      }
    }
  };

  const stateLabel = (): string => {
    switch (state) {
      case 'idle':
        return 'Tap to speak';
      case 'listening':
        return 'Listening…';
      case 'transcribing':
        return 'Heard you';
      case 'thinking':
        return 'Thinking…';
      case 'validating':
        return 'Validating…';
      case 'ready':
        return 'Ready';
      case 'error':
        return 'Error';
    }
  };

  const stateColor = (): string => {
    switch (state) {
      case 'listening':
        return '#ef4444';
      case 'thinking':
      case 'validating':
        return '#eab308';
      case 'ready':
        return '#22c55e';
      case 'error':
        return '#f97316';
      default:
        return '#64748b';
    }
  };

  if (!supported) {
    return (
      <button
        disabled
        title="SpeechRecognition not supported in this browser"
        style={{
          background: '#374151',
          color: '#9ca3af',
          border: 0,
          borderRadius: 6,
          padding: compact ? '4px 8px' : '8px 12px',
          fontSize: compact ? 11 : 13,
          cursor: 'not-allowed',
        }}
      >
        🎤 voice (unsupported)
      </button>
    );
  }

  return (
    <>
      <button
        onClick={onMicClick}
        title="Speak to generate a scene"
        style={{
          background: stateColor(),
          color: 'white',
          border: 0,
          borderRadius: 6,
          padding: compact ? '4px 10px' : '8px 14px',
          fontSize: compact ? 11 : 13,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontWeight: 500,
        }}
      >
        <span>🎤</span>
        <span>{compact ? stateLabel().slice(0, 12) : stateLabel()}</span>
      </button>

      {panelOpen && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 64,
            width: 420,
            maxHeight: '60vh',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: 12,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            color: '#e2e8f0',
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: stateColor(), fontWeight: 600 }}>
              {stateLabel()}
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: 0,
                cursor: 'pointer',
                fontSize: 18,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {transcript && (
            <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
              &ldquo;{transcript}&rdquo;
            </div>
          )}

          {lastError && (
            <div
              style={{
                background: '#7f1d1d',
                color: '#fca5a5',
                padding: 8,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <b>{lastError.kind}:</b> {lastError.message}
            </div>
          )}

          {holoSource && (
            <>
              <pre
                style={{
                  background: '#0f172a',
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 12,
                  fontFamily: 'ui-monospace, monospace',
                  overflow: 'auto',
                  maxHeight: 280,
                  whiteSpace: 'pre-wrap',
                  margin: 0,
                }}
              >
                {holoSource}
              </pre>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    reset();
                    start();
                  }}
                  style={{
                    background: '#475569',
                    color: 'white',
                    border: 0,
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
                <button
                  onClick={() => void onApplyClick()}
                  style={{
                    background: '#2563eb',
                    color: 'white',
                    border: 0,
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {onApply ? 'Apply to editor' : copied ? 'Copied!' : 'Copy code'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
