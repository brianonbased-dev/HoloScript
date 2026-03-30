'use client';

/**
 * TimeCapsulePanel — Time capsule creation, sealing, and scheduling.
 */

import { useState, useCallback } from 'react';
import { Clock, Lock, Unlock, Plus, Trash2, Calendar, Archive, Gift, Eye } from 'lucide-react';

export type CapsuleStatus = 'open' | 'sealed' | 'scheduled' | 'revealed';

export interface CapsuleItem {
  id: string;
  type: 'text' | 'photo' | 'audio' | 'scene' | 'code';
  label: string;
  preview: string;
  addedAt: number;
}

export interface TimeCapsule {
  id: string;
  name: string;
  status: CapsuleStatus;
  items: CapsuleItem[];
  createdAt: number;
  sealedAt?: number;
  revealDate?: number;
  message?: string;
}

const DEMO_CAPSULES: TimeCapsule[] = [
  {
    id: '1',
    name: 'Studio Launch Day',
    status: 'sealed',
    items: [
      {
        id: 'a',
        type: 'text',
        label: 'Vision Statement',
        preview: 'We set out to build the ultimate spatial...',
        addedAt: Date.now() - 2592000000,
      },
      {
        id: 'b',
        type: 'scene',
        label: 'First Scene',
        preview: 'hello_world.holo',
        addedAt: Date.now() - 2592000000,
      },
      {
        id: 'c',
        type: 'photo',
        label: 'Team Screenshot',
        preview: 'team_day1.png',
        addedAt: Date.now() - 2592000000,
      },
    ],
    createdAt: Date.now() - 2592000000,
    sealedAt: Date.now() - 2500000000,
    revealDate: Date.now() + 31536000000,
    message: 'Open in 1 year to see how far we have come!',
  },
  {
    id: '2',
    name: 'Sprint 100 Milestone',
    status: 'open',
    items: [
      {
        id: 'd',
        type: 'code',
        label: 'Test Count',
        preview: '17,740 tests passing',
        addedAt: Date.now() - 172800000,
      },
    ],
    createdAt: Date.now() - 172800000,
    message: 'Record our progress at Sprint 100',
  },
];

const STATUS_ICONS: Record<CapsuleStatus, typeof Clock> = {
  open: Unlock,
  sealed: Lock,
  scheduled: Calendar,
  revealed: Gift,
};
const STATUS_COLORS: Record<CapsuleStatus, string> = {
  open: 'text-emerald-400',
  sealed: 'text-amber-400',
  scheduled: 'text-blue-400',
  revealed: 'text-purple-400',
};
const TYPE_EMOJI: Record<string, string> = {
  text: '📝',
  photo: '📷',
  audio: '🎵',
  scene: '🌍',
  code: '💻',
};

function timeUntil(ts: number): string {
  const d = ts - Date.now();
  if (d < 0) return 'Past due';
  const days = Math.floor(d / 86400000);
  if (days > 365) return `${Math.floor(days / 365)}y ${days % 365}d`;
  if (days > 0) return `${days}d`;
  return `${Math.floor(d / 3600000)}h`;
}

export function TimeCapsulePanel() {
  const [capsules, setCapsules] = useState<TimeCapsule[]>(DEMO_CAPSULES);
  const [selected, setSelected] = useState<string | null>('2');

  const seal = useCallback((id: string) => {
    setCapsules((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'sealed', sealedAt: Date.now() } : c))
    );
  }, []);

  const reveal = useCallback((id: string) => {
    setCapsules((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'revealed' } : c)));
  }, []);

  const addItem = useCallback((capsuleId: string) => {
    setCapsules((prev) =>
      prev.map((c) =>
        c.id === capsuleId
          ? {
              ...c,
              items: [
                ...c.items,
                {
                  id: String(Date.now()),
                  type: 'text',
                  label: 'New Entry',
                  preview: '',
                  addedAt: Date.now(),
                },
              ],
            }
          : c
      )
    );
  }, []);

  const sel = capsules.find((c) => c.id === selected);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Archive className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-semibold text-studio-text">Time Capsules</span>
        <span className="text-[10px] text-studio-muted">{capsules.length}</span>
      </div>

      {/* Capsule List */}
      {capsules.map((c) => {
        const Icon = STATUS_ICONS[c.status];
        return (
          <div
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`flex items-start gap-2 border-b border-studio-border/50 px-3 py-2 cursor-pointer transition ${selected === c.id ? 'bg-purple-500/10' : 'hover:bg-studio-panel/50'}`}
          >
            <Icon className={`h-4 w-4 mt-0.5 ${STATUS_COLORS[c.status]}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-studio-text">{c.name}</div>
              <div className="flex gap-2 text-[10px] text-studio-muted">
                <span>{c.items.length} items</span>
                <span className={STATUS_COLORS[c.status]}>{c.status}</span>
                {c.revealDate && <span>opens: {timeUntil(c.revealDate)}</span>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Selected Capsule Detail */}
      {sel && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-studio-text">{sel.name}</span>
            {sel.status === 'open' && (
              <button
                onClick={() => seal(sel.id)}
                className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400"
              >
                <Lock className="h-3 w-3" />
                Seal
              </button>
            )}
            {sel.status === 'sealed' && (
              <button
                onClick={() => reveal(sel.id)}
                className="flex items-center gap-1 rounded bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-400"
              >
                <Eye className="h-3 w-3" />
                Reveal
              </button>
            )}
          </div>
          {sel.message && (
            <div className="rounded bg-studio-panel/50 px-2 py-1 text-[11px] text-studio-muted italic mb-2">
              "{sel.message}"
            </div>
          )}
          {sel.items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 py-1 text-[11px]">
              <span>{TYPE_EMOJI[item.type]}</span>
              <span className="text-studio-text">{item.label}</span>
              <span className="flex-1 truncate text-studio-muted/50 font-mono text-[9px]">
                {item.preview}
              </span>
            </div>
          ))}
          {sel.status === 'open' && (
            <button
              onClick={() => addItem(sel.id)}
              className="mt-1 flex items-center gap-1 text-[10px] text-studio-muted hover:text-studio-text"
            >
              <Plus className="h-3 w-3" />
              Add Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default TimeCapsulePanel;
