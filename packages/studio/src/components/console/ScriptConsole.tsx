'use client';

/**
 * ScriptConsole — in-editor JS/HoloScript REPL with output log and history navigation.
 */

import { useRef, useEffect, KeyboardEvent } from 'react';
import { Terminal, X, Trash2, ChevronRight } from 'lucide-react';
import { useScriptConsole, type ConsoleEntry } from '@/hooks/useScriptConsole';

const LEVEL_STYLE: Record<string, string> = {
  log:    'text-studio-text',
  info:   'text-blue-400',
  warn:   'text-yellow-400',
  error:  'text-red-400',
  result: 'text-green-400',
};

const LEVEL_PREFIX: Record<string, string> = {
  log: '', info: 'ℹ', warn: '⚠', error: '✖', result: '←',
};

function LogLine({ entry }: { entry: ConsoleEntry }) {
  const prefix = LEVEL_PREFIX[entry.level] ?? '';
  return (
    <div className={`flex gap-1.5 px-3 py-0.5 font-mono text-[10px] leading-relaxed ${LEVEL_STYLE[entry.level] ?? 'text-studio-text'}`}>
      {prefix && <span className="shrink-0 opacity-60">{prefix}</span>}
      <span className="whitespace-pre-wrap break-all">{entry.content}</span>
    </div>
  );
}

interface ScriptConsoleProps { onClose: () => void; }

export function ScriptConsole({ onClose }: ScriptConsoleProps) {
  const { entries, input, setInput, evaluate, clear, historyUp, historyDown } = useScriptConsole();
  const logEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { evaluate(input); setInput(''); }
    if (e.key === 'ArrowUp') { e.preventDefault(); historyUp(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); historyDown(); }
    if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); clear(); }
  };

  return (
    <div className="flex h-full flex-col bg-[#0a0a12] text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2.5">
        <Terminal className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Script Console</span>
        <span className="ml-1 rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">JS/HoloScript</span>
        <div className="ml-auto flex gap-1">
          <button onClick={clear} title="Clear (Ctrl+L)" className="rounded p-1 text-studio-muted hover:text-studio-text">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto py-1" onClick={() => inputRef.current?.focus()}>
        {entries.map((entry) => <LogLine key={entry.id} entry={entry} />)}
        <div ref={logEndRef} />
      </div>

      {/* Input bar */}
      <div className="flex shrink-0 items-center gap-2 border-t border-studio-border bg-studio-panel/60 px-3 py-2">
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-studio-accent" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="scene.objects.length   // ↑↓ history · Enter run · Ctrl+L clear"
          className="flex-1 bg-transparent font-mono text-[10px] text-studio-text outline-none placeholder-studio-muted/30"
          autoComplete="off" spellCheck={false}
        />
      </div>

      {/* Hint bar */}
      <div className="shrink-0 border-t border-studio-border/40 bg-studio-panel/30 px-3 py-1">
        <p className="text-[7px] text-studio-muted">
          Available: <code className="text-studio-accent">scene.code</code> · <code className="text-studio-accent">scene.objects</code> · <code className="text-studio-accent">scene.lineCount</code> · <code className="text-studio-accent">Math</code> · <code className="text-studio-accent">JSON</code>
        </p>
      </div>
    </div>
  );
}
