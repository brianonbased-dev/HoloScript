'use client';

/**
 * DiscordReactionPanel — Control Panel for Discord Reaction Triggers
 *
 * MEME-009: Discord reaction triggers
 *
 * Features:
 * - Discord connection status
 * - Live reaction feedback
 * - Trigger management UI
 * - Testing/simulation controls
 * - Configuration settings
 */

import { useState } from 'react';
import { Wifi, WifiOff, Play, Pause, Settings, _Zap, Plus, Trash2, TestTube } from 'lucide-react';
import type { ReactionTrigger, DiscordReaction } from '@/integrations/discordWebhook';
import type { ReactionFeedback } from '@/lib/traits/reactionTriggerTrait';

interface DiscordReactionPanelProps {
  isConnected: boolean;
  isListening: boolean;
  triggers: ReactionTrigger[];
  feedback: ReactionFeedback[];
  lastReaction: DiscordReaction | null;
  onStart?: () => void;
  onStop?: () => void;
  onAddTrigger?: (emoji: string, action: string, value: string) => void;
  onRemoveTrigger?: (emoji: string) => void;
  onSimulateReaction?: (emoji: string) => void;
  onConnect?: (webhookUrl: string, botToken: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  pose: 'Trigger Pose',
  'emoji-burst': 'Emoji Burst',
  event: 'React Event',
  animation: 'Play Animation',
};

const ACTION_ICONS: Record<string, string> = {
  pose: '🕺',
  'emoji-burst': '💥',
  event: '⚡',
  animation: '🎬',
};

export function DiscordReactionPanel({
  isConnected,
  isListening,
  triggers,
  feedback,
  _lastReaction,
  onStart,
  onStop,
  onAddTrigger,
  onRemoveTrigger,
  onSimulateReaction,
  onConnect,
}: DiscordReactionPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTrigger, setShowAddTrigger] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [botToken, setBotToken] = useState('');

  // Add trigger form state
  const [newEmoji, setNewEmoji] = useState('');
  const [newAction, setNewAction] = useState<string>('pose');
  const [newValue, setNewValue] = useState('');

  const handleAddTrigger = () => {
    if (newEmoji && newAction && newValue && onAddTrigger) {
      onAddTrigger(newEmoji, newAction, newValue);
      setNewEmoji('');
      setNewValue('');
      setShowAddTrigger(false);
    }
  };

  const handleConnect = () => {
    if (onConnect && (webhookUrl || botToken)) {
      onConnect(webhookUrl, botToken);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-purple-500/30 bg-studio-panel p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💬</span>
          <div>
            <h3 className="text-sm font-bold text-white">Discord Reactions</h3>
            <p className="text-xs text-studio-muted">
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <Wifi className="h-3 w-3 text-green-400" />
                  Connected • {triggers.length} triggers
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <WifiOff className="h-3 w-3 text-red-400" />
                  Disconnected
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="rounded-lg p-2 text-studio-muted transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Connection Status */}
      <div className="rounded-lg border border-studio-border bg-black/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                <span className="text-xs font-medium text-green-400">Live</span>
              </>
            ) : (
              <>
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <span className="text-xs font-medium text-red-400">Offline</span>
              </>
            )}
          </div>

          {isConnected && (
            <button
              onClick={isListening ? onStop : onStart}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                isListening
                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              }`}
            >
              {isListening ? (
                <>
                  <Pause className="h-3 w-3" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Listen
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Connection Settings */}
      {showSettings && (
        <div className="rounded-lg border border-studio-border bg-black/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
            Discord Connection
          </p>

          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs text-studio-text">Webhook URL</label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-xs text-white placeholder:text-studio-muted focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-studio-text">Bot Token (Optional)</label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="MTk4NjIyNDgzN..."
                className="w-full rounded-lg border border-studio-border bg-black/20 px-3 py-2 text-xs text-white placeholder:text-studio-muted focus:border-purple-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleConnect}
              className="w-full rounded-lg bg-purple-500 py-2 text-xs font-medium text-white transition-colors hover:bg-purple-600 active:scale-95"
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Live Feedback */}
      {feedback.length > 0 && (
        <div className="rounded-lg border border-studio-border bg-black/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
            Recent Reactions
          </p>
          <div className="space-y-1">
            {feedback.slice(-3).map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg bg-black/20 p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{item.emoji}</span>
                  <div>
                    <p className="font-medium text-white">{item.userName}</p>
                    <p className="text-studio-muted">
                      {ACTION_LABELS[item.action]} • {item.value}
                    </p>
                  </div>
                </div>
                <span className="text-studio-muted">
                  {Math.round((Date.now() - item.timestamp) / 1000)}s ago
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trigger List */}
      <div className="rounded-lg border border-studio-border bg-black/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-studio-muted">
            Active Triggers ({triggers.length})
          </p>
          <button
            onClick={() => setShowAddTrigger(!showAddTrigger)}
            className="flex items-center gap-1 rounded-lg bg-purple-500/20 px-2 py-1 text-xs font-medium text-purple-400 transition-colors hover:bg-purple-500/30"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        {/* Add Trigger Form */}
        {showAddTrigger && (
          <div className="mb-3 space-y-2 rounded-lg border border-purple-500/30 bg-black/20 p-3">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                placeholder="🔥"
                maxLength={2}
                className="rounded-lg border border-studio-border bg-black/20 px-2 py-1.5 text-center text-sm text-white placeholder:text-studio-muted focus:border-purple-500 focus:outline-none"
              />
              <select
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                className="rounded-lg border border-studio-border bg-black/20 px-2 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="pose">Pose</option>
                <option value="emoji-burst">Emoji Burst</option>
                <option value="event">Event</option>
                <option value="animation">Animation</option>
              </select>
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="dab"
                className="rounded-lg border border-studio-border bg-black/20 px-2 py-1.5 text-xs text-white placeholder:text-studio-muted focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAddTrigger}
              className="w-full rounded-lg bg-purple-500 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-600"
            >
              Add Trigger
            </button>
          </div>
        )}

        {/* Trigger Grid */}
        <div className="space-y-1">
          {triggers.map((trigger) => (
            <div
              key={trigger.emoji}
              className="flex items-center justify-between rounded-lg border border-studio-border bg-black/20 p-2 transition-all hover:border-purple-500/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{trigger.emoji}</span>
                <div className="text-xs">
                  <p className="font-medium text-white">
                    <span className="mr-1">{ACTION_ICONS[trigger.action]}</span>
                    {ACTION_LABELS[trigger.action]}
                  </p>
                  <p className="font-mono text-studio-muted">{trigger.value}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {onSimulateReaction && (
                  <button
                    onClick={() => onSimulateReaction(trigger.emoji)}
                    className="rounded-lg p-1.5 text-studio-muted transition-colors hover:bg-white/5 hover:text-purple-400"
                    title="Test trigger"
                  >
                    <TestTube className="h-3.5 w-3.5" />
                  </button>
                )}

                {onRemoveTrigger && (
                  <button
                    onClick={() => onRemoveTrigger(trigger.emoji)}
                    className="rounded-lg p-1.5 text-studio-muted transition-colors hover:bg-red-500/20 hover:text-red-400"
                    title="Remove trigger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {triggers.length === 0 && (
            <p className="py-4 text-center text-xs text-studio-muted">
              No triggers configured. Add triggers to respond to Discord reactions.
            </p>
          )}
        </div>
      </div>

      {/* Quick Test Buttons */}
      {onSimulateReaction && (
        <div className="rounded-lg border border-studio-border bg-black/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-studio-muted">
            Quick Test
          </p>
          <div className="grid grid-cols-5 gap-2">
            {['🔥', '💀', '😂', '❤️', '💎', '🚀', '💯', '👀', '🎉', '⚡'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSimulateReaction(emoji)}
                className="flex aspect-square items-center justify-center rounded-lg border border-studio-border bg-black/20 text-2xl transition-all hover:border-purple-500/60 hover:bg-purple-500/10 active:scale-95"
                title={`Test ${emoji} reaction`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="rounded-lg border border-studio-border bg-black/10 p-2">
        <p className="text-[10px] text-studio-muted">
          <span className="font-semibold text-studio-text">How it works:</span> Configure Discord
          webhook or bot token, then character reacts automatically when users add emoji reactions
          in Discord. Test triggers with the buttons above!
        </p>
      </div>
    </div>
  );
}
