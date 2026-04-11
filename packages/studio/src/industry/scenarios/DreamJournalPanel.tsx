'use client';

/**
 * DreamJournalPanel — Dream logging, symbol tracking, lucidity scoring.
 */

import { useState, _useCallback } from 'react';
import { Moon, _Plus, _Star, _Tag, Brain, Eye, Sparkles, Search } from 'lucide-react';

export type LucidityLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type DreamMood = 'peaceful' | 'anxious' | 'joyful' | 'fearful' | 'neutral' | 'surreal';

export interface DreamEntry {
  id: string;
  title: string;
  description: string;
  date: number;
  lucidity: LucidityLevel;
  mood: DreamMood;
  symbols: string[];
  recurring: boolean;
  vivid: boolean;
}

const MOOD_EMOJI: Record<DreamMood, string> = {
  peaceful: '😌',
  anxious: '😰',
  joyful: '😄',
  fearful: '😨',
  neutral: '😐',
  surreal: '🌀',
};

const DEMO_DREAMS: DreamEntry[] = [
  {
    id: '1',
    title: 'Flying Over Ocean',
    description:
      'Started on beach, suddenly could fly. Ocean was emerald green, sky shifting colors. Found floating island with crystal trees.',
    date: Date.now() - 86400000,
    lucidity: 3,
    mood: 'joyful',
    symbols: ['flying', 'ocean', 'crystals'],
    recurring: false,
    vivid: true,
  },
  {
    id: '2',
    title: 'The Endless Library',
    description:
      'Walking through infinite library. Books would open themselves, showing scenes from alternate lives. Met a guide who spoke in riddles.',
    date: Date.now() - 172800000,
    lucidity: 1,
    mood: 'surreal',
    symbols: ['library', 'books', 'guide'],
    recurring: true,
    vivid: true,
  },
  {
    id: '3',
    title: 'Chase Through City',
    description:
      'Running through unfamiliar city streets. Buildings kept rearranging. Could never see what was chasing me but felt urgent.',
    date: Date.now() - 259200000,
    lucidity: 0,
    mood: 'anxious',
    symbols: ['chase', 'city', 'unknown threat'],
    recurring: true,
    vivid: false,
  },
  {
    id: '4',
    title: 'Garden of Memories',
    description:
      'Each flower was a different memory. Could pick them and relive moments. Some flowers wilted as I watched.',
    date: Date.now() - 345600000,
    lucidity: 2,
    mood: 'peaceful',
    symbols: ['garden', 'flowers', 'memories'],
    recurring: false,
    vivid: true,
  },
];

export function DreamJournalPanel() {
  const [dreams, _setDreams] = useState<DreamEntry[]>(DEMO_DREAMS);
  const [selected, setSelected] = useState<string | null>('1');
  const [search, setSearch] = useState('');

  const filtered = dreams.filter(
    (d) =>
      !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.symbols.some((s) => s.includes(search.toLowerCase()))
  );
  const sel = dreams.find((d) => d.id === selected);

  // Symbol frequency
  const symbolFreq: Record<string, number> = {};
  dreams.forEach((d) =>
    d.symbols.forEach((s) => {
      symbolFreq[s] = (symbolFreq[s] || 0) + 1;
    })
  );
  const topSymbols = Object.entries(symbolFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const lucidityAvg = dreams.length
    ? (dreams.reduce((s, d) => s + d.lucidity, 0) / dreams.length).toFixed(1)
    : '0';
  const vividCount = dreams.filter((d) => d.vivid).length;
  const recurringCount = dreams.filter((d) => d.recurring).length;

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Moon className="h-4 w-4 text-indigo-400" />
        <span className="text-sm font-semibold text-studio-text">Dream Journal</span>
        <span className="text-[10px] text-studio-muted">{dreams.length} entries</span>
      </div>

      {/* Stats */}
      <div className="flex gap-2 border-b border-studio-border px-3 py-1.5 text-[10px] text-studio-muted">
        <span>
          <Brain className="inline h-3 w-3 mr-0.5" />
          Lucidity: {lucidityAvg}/5
        </span>
        <span>
          <Eye className="inline h-3 w-3 mr-0.5" />
          Vivid: {vividCount}
        </span>
        <span>
          <Sparkles className="inline h-3 w-3 mr-0.5" />
          Recurring: {recurringCount}
        </span>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1">
        <Search className="h-3 w-3 text-studio-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dreams..."
          className="flex-1 bg-transparent text-xs text-studio-text outline-none"
        />
      </div>

      {/* Dream List */}
      {filtered.map((d) => (
        <div
          key={d.id}
          onClick={() => setSelected(d.id)}
          className={`flex items-start gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === d.id ? 'bg-indigo-500/10' : 'hover:bg-studio-panel/50'}`}
        >
          <span className="text-lg">{MOOD_EMOJI[d.mood]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-studio-text">{d.title}</span>
              {d.recurring && <Sparkles className="h-3 w-3 text-purple-400" />}
              {d.vivid && <Eye className="h-3 w-3 text-cyan-400" />}
            </div>
            <div className="text-[10px] text-studio-muted truncate">
              {d.description.slice(0, 60)}...
            </div>
            <div className="flex gap-1 mt-0.5">
              {d.symbols.map((s) => (
                <span key={s} className="rounded bg-indigo-500/10 px-1 text-[8px] text-indigo-400">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end text-[9px]">
            <span className="text-studio-muted/50">{new Date(d.date).toLocaleDateString()}</span>
            <div className="flex">
              {[1, 2, 3, 4, 5].map((l) => (
                <div
                  key={l}
                  className={`h-1.5 w-1.5 rounded-full mx-px ${l <= d.lucidity ? 'bg-indigo-400' : 'bg-studio-muted/20'}`}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Symbol Analysis */}
      {topSymbols.length > 0 && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
            Recurring Symbols
          </div>
          <div className="flex flex-wrap gap-1">
            {topSymbols.map(([sym, count]) => (
              <span
                key={sym}
                className="rounded bg-studio-panel px-1.5 py-0.5 text-[10px] text-studio-muted"
              >
                {sym} <span className="text-indigo-400">×{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Full Entry */}
      {sel && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-xs font-semibold text-studio-text">
            {MOOD_EMOJI[sel.mood]} {sel.title}
          </div>
          <div className="text-[11px] text-studio-muted mt-1 leading-relaxed">
            {sel.description}
          </div>
        </div>
      )}
    </div>
  );
}

export default DreamJournalPanel;
