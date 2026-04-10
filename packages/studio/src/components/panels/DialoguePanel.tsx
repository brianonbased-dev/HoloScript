'use client';
/**
 * DialoguePanel — Interactive dialogue graph editor + playback
 */
import React from 'react';
import { useDialogue } from '../../hooks/useDialogue';

const NODE_TYPE_COLORS: Record<string, string> = {
  text: 'text-cyan-400',
  choice: 'text-amber-400',
  branch: 'text-purple-400',
  event: 'text-emerald-400',
  end: 'text-red-400',
};

const NODE_TYPE_ICONS: Record<string, string> = {
  text: '💬',
  choice: '🔀',
  branch: '🔀',
  event: '⚡',
  end: '🏁',
};

export function DialoguePanel() {
  const { currentNode, choices, history, isComplete, nodeCount, start, advance, reset, loadDemo } =
    useDialogue();

  return (
    <div className="p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text">💬 Dialogue Editor</h3>
        <span className="text-[10px] text-studio-muted">{nodeCount} nodes</span>
      </div>

      {/* Controls */}
      <div className="flex gap-1.5">
        <button
          onClick={loadDemo}
          className="px-2 py-1 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition flex-1"
        >
          Load Demo
        </button>
        <button
          onClick={() => start('greet')}
          disabled={nodeCount === 0}
          className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition disabled:opacity-40"
        >
          ▶ Start
        </button>
        <button
          onClick={reset}
          className="px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
        >
          ↺
        </button>
      </div>

      {/* Current node */}
      {currentNode ? (
        <div className="bg-studio-panel/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span>{NODE_TYPE_ICONS[currentNode.type] || '💬'}</span>
            <span className={`font-medium ${NODE_TYPE_COLORS[currentNode.type]}`}>
              {currentNode.type}
            </span>
            <span className="text-studio-muted">·</span>
            <span className="text-studio-text font-medium">{currentNode.speaker}</span>
          </div>
          {currentNode.text && (
            <p className="text-studio-text leading-relaxed border-l-2 border-studio-accent/30 pl-2">
              &quot;{currentNode.text}&quot;
            </p>
          )}

          {/* Choices */}
          {choices.length > 0 && (
            <div className="space-y-1 mt-2">
              {choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => advance(i)}
                  className="w-full text-left px-2.5 py-1.5 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/20 transition text-[11px]"
                >
                  {i + 1}. {c.text}
                </button>
              ))}
            </div>
          )}

          {/* Auto-advance for text nodes */}
          {currentNode.type === 'text' && choices.length === 0 && (
            <button
              onClick={() => advance()}
              className="w-full px-2 py-1.5 bg-studio-accent/20 text-studio-accent rounded hover:bg-studio-accent/30 transition"
            >
              Continue →
            </button>
          )}
        </div>
      ) : isComplete ? (
        <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
          <span className="text-emerald-400 font-medium">🏁 Dialogue complete</span>
        </div>
      ) : nodeCount === 0 ? (
        <div className="bg-studio-panel/30 rounded-lg p-3 text-center text-studio-muted">
          Click &quot;Load Demo&quot; to try the merchant dialogue
        </div>
      ) : (
        <div className="bg-studio-panel/30 rounded-lg p-3 text-center text-studio-muted">
          Click ▶ Start to begin
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <h4 className="text-studio-muted font-medium mb-1">History</h4>
          <div className="flex flex-wrap gap-1">
            {history.map((id, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 bg-studio-panel/40 rounded text-[10px] text-studio-muted font-mono"
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
