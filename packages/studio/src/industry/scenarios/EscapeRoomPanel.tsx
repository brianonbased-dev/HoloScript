'use client';

/**
 * EscapeRoomPanel — Puzzle designer, room layout, clue/lock system.
 */

import { useState, useCallback } from 'react';
import {
  Key,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  Link,
} from 'lucide-react';

export type PuzzleType = 'code' | 'physical' | 'logic' | 'search' | 'pattern' | 'sequence';
export type PuzzleStatus = 'locked' | 'available' | 'solved';

export interface Puzzle {
  id: string;
  name: string;
  type: PuzzleType;
  difficulty: 1 | 2 | 3 | 4 | 5;
  status: PuzzleStatus;
  solution: string;
  hint: string;
  requiresIds: string[]; // prerequisites
  timeLimit?: number; // seconds
}

export interface Room {
  id: string;
  name: string;
  puzzles: Puzzle[];
  timeLimit: number;
  theme: string;
}

const PUZZLE_ICONS: Record<PuzzleType, string> = {
  code: '🔢',
  physical: '🔧',
  logic: '🧩',
  search: '🔍',
  pattern: '🎨',
  sequence: '📝',
};

const DEMO_ROOM: Room = {
  id: '1',
  name: "The Alchemist's Lab",
  timeLimit: 3600,
  theme: 'Medieval',
  puzzles: [
    {
      id: 'p1',
      name: 'Journal Entry',
      type: 'search',
      difficulty: 1,
      status: 'available',
      solution: 'hidden note',
      hint: 'Check under the desk',
      requiresIds: [],
    },
    {
      id: 'p2',
      name: 'Cipher Wheel',
      type: 'code',
      difficulty: 3,
      status: 'locked',
      solution: 'MERCURY',
      hint: 'The periodic table is your friend',
      requiresIds: ['p1'],
    },
    {
      id: 'p3',
      name: 'Potion Sequence',
      type: 'sequence',
      difficulty: 4,
      status: 'locked',
      solution: 'red-blue-green-gold',
      hint: 'Follow the recipe backwards',
      requiresIds: ['p2'],
    },
    {
      id: 'p4',
      name: 'Mirror Alignment',
      type: 'pattern',
      difficulty: 2,
      status: 'available',
      solution: 'align to N',
      hint: 'The compass rose on the floor may be useful',
      requiresIds: [],
    },
    {
      id: 'p5',
      name: 'Final Lock',
      type: 'physical',
      difficulty: 5,
      status: 'locked',
      solution: '3 keys combined',
      hint: 'You need everything to escape',
      requiresIds: ['p3', 'p4'],
    },
  ],
};

const STATUS_COLORS: Record<PuzzleStatus, string> = {
  locked: 'text-red-400',
  available: 'text-amber-400',
  solved: 'text-emerald-400',
};
const STATUS_ICONS: Record<PuzzleStatus, typeof Lock> = {
  locked: Lock,
  available: AlertCircle,
  solved: CheckCircle,
};

export function EscapeRoomPanel() {
  const [room, setRoom] = useState<Room>(DEMO_ROOM);
  const [selected, setSelected] = useState<string | null>(null);

  const solvePuzzle = useCallback((id: string) => {
    setRoom((prev) => {
      const puzzles = prev.puzzles.map((p) =>
        p.id === id ? { ...p, status: 'solved' as PuzzleStatus } : p
      );
      // Unlock dependents
      return {
        ...prev,
        puzzles: puzzles.map((p) => {
          if (
            p.status === 'locked' &&
            p.requiresIds.every(
              (reqId) => puzzles.find((pp) => pp.id === reqId)?.status === 'solved'
            )
          ) {
            return { ...p, status: 'available' as PuzzleStatus };
          }
          return p;
        }),
      };
    });
  }, []);

  const sel = room.puzzles.find((p) => p.id === selected);
  const solved = room.puzzles.filter((p) => p.status === 'solved').length;
  const progress = (solved / room.puzzles.length) * 100;

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Key className="h-4 w-4 text-yellow-400" />
        <span className="text-sm font-semibold text-studio-text">{room.name}</span>
      </div>

      {/* Progress */}
      <div className="border-b border-studio-border px-3 py-2">
        <div className="flex justify-between text-[10px] text-studio-muted mb-1">
          <span>
            {solved}/{room.puzzles.length} puzzles solved
          </span>
          <span>
            <Clock className="inline h-3 w-3 mr-0.5" />
            {Math.floor(room.timeLimit / 60)}min
          </span>
        </div>
        <div className="h-2 rounded-full bg-studio-panel">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Puzzle Flow (dependency graph) */}
      <div className="border-b border-studio-border px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
          Puzzle Flow
        </div>
        <div className="flex flex-wrap gap-1 items-center">
          {room.puzzles.map((p, _i) => {
            const Icon = STATUS_ICONS[p.status];
            return (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelected(p.id)}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] ${selected === p.id ? 'border-yellow-400 bg-yellow-500/10' : 'border-studio-border'} ${STATUS_COLORS[p.status]}`}
                >
                  <Icon className="h-3 w-3" />
                  {p.name}
                </button>
                {p.requiresIds.length > 0 && <Link className="h-3 w-3 text-studio-muted/20" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Puzzle List */}
      {room.puzzles.map((p) => {
        const Icon = STATUS_ICONS[p.status];
        return (
          <div
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`flex items-center gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === p.id ? 'bg-yellow-500/10' : 'hover:bg-studio-panel/50'}`}
          >
            <Icon className={`h-3.5 w-3.5 ${STATUS_COLORS[p.status]}`} />
            <span className="text-lg">{PUZZLE_ICONS[p.type]}</span>
            <div className="flex-1">
              <span className="text-xs text-studio-text">{p.name}</span>
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((d) => (
                <div
                  key={d}
                  className={`h-1.5 w-3 rounded-sm ${d <= p.difficulty ? 'bg-yellow-400' : 'bg-studio-muted/15'}`}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Detail */}
      {sel && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-studio-text">
              {PUZZLE_ICONS[sel.type]} {sel.name}
            </span>
            {sel.status === 'available' && (
              <button
                onClick={() => solvePuzzle(sel.id)}
                className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400"
              >
                ✓ Mark Solved
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] text-studio-muted">💡 Hint: {sel.hint}</div>
          {sel.requiresIds.length > 0 && (
            <div className="mt-0.5 text-[10px] text-studio-muted/50">
              Requires:{' '}
              {sel.requiresIds.map((r) => room.puzzles.find((p) => p.id === r)?.name).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EscapeRoomPanel;
