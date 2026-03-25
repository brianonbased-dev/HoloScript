'use client';

/**
 * EmojiReactionPanel — Control Panel for Emoji Reactions
 *
 * MEME-003: Trigger and configure emoji reactions
 */

import { useState } from 'react';
import { Sparkles, Zap, Heart, TrendingUp, DollarSign, Skull } from 'lucide-react';

interface EmojiReactionPanelProps {
  onSpawnEmoji: (emoji: string) => void;
  onBurst: (count: number, emoji?: string) => void;
  onReactToEvent: (eventType: string) => void;
  onToggleContinuous: (active: boolean) => void;
  isActive: boolean;
  particleCount: number;
}

const EMOJI_PRESETS = [
  { emoji: '💀', label: 'Death', color: 'gray', event: 'death' },
  { emoji: '🔥', label: 'Fire', color: 'orange', event: 'hype' },
  { emoji: '😂', label: 'LOL', color: 'yellow', event: 'interaction' },
  { emoji: '💎', label: 'Diamond', color: 'blue', event: 'money' },
  { emoji: '🚀', label: 'Rocket', color: 'purple', event: 'hype' },
  { emoji: '💯', label: '100', color: 'red', event: 'achievement' },
  { emoji: '❤️', label: 'Love', color: 'pink', event: 'love' },
  { emoji: '👀', label: 'Eyes', color: 'white', event: 'interaction' },
];

const EVENT_TRIGGERS = [
  { type: 'interaction', label: 'Interaction', icon: Sparkles, color: 'purple' },
  { type: 'achievement', label: 'Achievement', icon: TrendingUp, color: 'green' },
  { type: 'hype', label: 'Hype', icon: Zap, color: 'yellow' },
  { type: 'love', label: 'Love', icon: Heart, color: 'pink' },
  { type: 'money', label: 'Money', icon: DollarSign, color: 'green' },
  { type: 'death', label: 'Death', icon: Skull, color: 'gray' },
];

export function EmojiReactionPanel({
  onSpawnEmoji,
  onBurst,
  onReactToEvent,
  onToggleContinuous,
  isActive,
  particleCount,
}: EmojiReactionPanelProps) {
  const [burstCount, setBurstCount] = useState(5);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-purple-500/30 bg-studio-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✨</span>
          <div>
            <h3 className="text-sm font-bold text-white">Emoji Reactions</h3>
            <p className="text-xs text-studio-muted">Viral particle effects</p>
          </div>
        </div>

        {/* Particle count */}
        <div className="rounded-lg bg-black/30 px-2 py-1">
          <p className="text-xs text-studio-muted">
            <span className="font-bold text-purple-400">{particleCount}</span> active
          </p>
        </div>
      </div>

      {/* Continuous spawn toggle */}
      <div className="flex items-center justify-between rounded-lg border border-studio-border bg-black/20 p-3">
        <div>
          <p className="text-sm font-semibold text-white">Continuous Spawn</p>
          <p className="text-xs text-studio-muted">Auto-spawn emojis</p>
        </div>
        <button
          onClick={() => onToggleContinuous(!isActive)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            isActive ? 'bg-purple-500' : 'bg-gray-600'
          }`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              isActive ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Quick spawn buttons */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Quick Spawn
        </p>
        <div className="grid grid-cols-4 gap-2">
          {EMOJI_PRESETS.map(({ emoji, label, color }) => (
            <button
              key={emoji}
              onClick={() => onSpawnEmoji(emoji)}
              className="group relative flex aspect-square flex-col items-center justify-center rounded-lg border border-studio-border bg-black/20 transition-all hover:scale-105 hover:border-purple-500/40 hover:bg-purple-500/10"
              title={label}
            >
              <span className="text-2xl transition-transform group-hover:scale-110">{emoji}</span>
              <span className="mt-1 text-[9px] text-studio-muted">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Burst control */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Burst
        </p>
        <div className="flex gap-2">
          <input
            type="range"
            min="1"
            max="20"
            value={burstCount}
            onChange={(e) => setBurstCount(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-8 text-center text-sm font-bold text-purple-400">{burstCount}</span>
          <button
            onClick={() => onBurst(burstCount)}
            className="rounded-lg border border-purple-500/40 bg-purple-500/20 px-4 py-2 text-xs font-semibold text-purple-300 transition-all hover:bg-purple-500/30 active:scale-95"
          >
            Burst
          </button>
        </div>
      </div>

      {/* Event triggers */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
          Event Triggers
        </p>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TRIGGERS.map(({ type, label, icon: Icon, color }) => (
            <button
              key={type}
              onClick={() => onReactToEvent(type)}
              className={`flex items-center gap-2 rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-left text-xs font-semibold transition-all hover:border-${color}-500/40 hover:bg-${color}-500/10 active:scale-95`}
            >
              <Icon className={`h-4 w-4 text-${color}-400`} />
              <span className="text-studio-text">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hotkeys */}
      <div className="rounded-lg border border-studio-border bg-black/10 p-2">
        <p className="text-[10px] text-studio-muted">
          <span className="font-semibold text-studio-text">Hotkeys:</span> Press{' '}
          <kbd className="rounded bg-black/40 px-1 py-0.5 font-mono text-[9px]">E</kbd> for quick
          emoji
        </p>
      </div>
    </div>
  );
}
