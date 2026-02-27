'use client';

import { useEffect, useRef } from 'react';
import { Copy, Trash2, Edit3, Layers } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  targetName?: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function ContextMenu({ x, y, targetName, onEdit, onDuplicate, onDelete, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 200),
    left: Math.min(x, window.innerWidth - 180),
    zIndex: 9999,
  };

  const items = [
    { icon: <Edit3 className="h-3.5 w-3.5" />, label: 'Edit Properties', action: onEdit, color: 'text-studio-text' },
    { icon: <Copy className="h-3.5 w-3.5" />, label: 'Duplicate', action: onDuplicate, color: 'text-studio-text' },
    null, // separator
    { icon: <Trash2 className="h-3.5 w-3.5" />, label: 'Delete', action: onDelete, color: 'text-red-400' },
  ];

  return (
    <div ref={ref} style={style} className="min-w-[160px] rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
      {targetName && (
        <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
          <Layers className="h-3 w-3 text-studio-muted" />
          <span className="max-w-[120px] truncate text-[11px] text-studio-muted">{targetName}</span>
        </div>
      )}
      <div className="p-1">
        {items.map((item, i) =>
          item === null ? (
            <div key={`sep-${i}`} className="my-1 h-px bg-studio-border" />
          ) : (
            <button
              key={item.label}
              onClick={() => { item.action?.(); onClose(); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition hover:bg-white/10 ${item.color}`}
            >
              {item.icon}
              {item.label}
            </button>
          )
        )}
      </div>
    </div>
  );
}
