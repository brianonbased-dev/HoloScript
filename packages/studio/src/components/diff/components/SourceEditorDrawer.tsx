import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SourceEditorDrawerProps {
  codeA: string;
  codeB: string;
  onChangeA: (v: string) => void;
  onChangeB: (v: string) => void;
}

export function SourceEditorDrawer({
  codeA,
  codeB,
  onChangeA,
  onChangeB,
}: SourceEditorDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-studio-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[10px] text-studio-muted hover:text-studio-text"
      >
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
        Edit Sources
      </button>
      {open && (
        <div className="flex gap-2 p-2" style={{ maxHeight: 200 }}>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[8px] text-red-400 font-semibold">Version A</span>
            <textarea
              value={codeA}
              onChange={(e) => onChangeA(e.target.value)}
              className="flex-1 resize-none rounded border border-studio-border bg-studio-bg px-2 py-1 text-[9px] font-mono text-studio-text outline-none focus:border-studio-accent"
              spellCheck={false}
            />
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[8px] text-green-400 font-semibold">Version B</span>
            <textarea
              value={codeB}
              onChange={(e) => onChangeB(e.target.value)}
              className="flex-1 resize-none rounded border border-studio-border bg-studio-bg px-2 py-1 text-[9px] font-mono text-studio-text outline-none focus:border-studio-accent"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
