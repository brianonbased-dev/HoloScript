'use client';

/**
 * MultiplayerPanel — right-rail peer presence + chat panel.
 */

import { useState } from 'react';
import { Users, X, MessageCircle, Send, Wifi, WifiOff, Circle } from 'lucide-react';
import { useMultiplayerRoom, type Peer, type ChatMessage } from '@/hooks/useMultiplayerRoom';

interface MultiplayerPanelProps {
  onClose: () => void;
}

function PeerAvatar({ peer }: { peer: Peer }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-studio-border bg-studio-surface p-2">
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: peer.color }}
      >
        {peer.user.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-studio-text">{peer.user}</p>
        {peer.selectedObject && (
          <p className="truncate text-[9px] text-studio-muted">→ {peer.selectedObject}</p>
        )}
      </div>
      <Circle className="h-2 w-2 fill-green-400 text-green-400" />
    </div>
  );
}

export function MultiplayerPanel({ onClose }: MultiplayerPanelProps) {
  const [roomId, setRoomId] = useState('studio-room-1');
  const [userName, setUserName] = useState(`User${Math.floor(Math.random() * 9000 + 1000)}`);
  const [joined, setJoined] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'peers' | 'chat'>('peers');

  const { connected, peers, chat, sendChat } = useMultiplayerRoom({
    roomId,
    userName,
    enabled: joined,
  });

  const handleJoin = () => setJoined(true);
  const handleLeave = () => setJoined(false);

  const handleSend = () => {
    if (!msg.trim()) return;
    sendChat(msg.trim());
    setMsg('');
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Users className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Multiplayer</span>
        <div className="ml-auto flex items-center gap-2">
          {joined ? (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <Wifi className="h-3 w-3" />
              {connected ? 'Live' : 'Reconnecting…'}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-studio-muted">
              <WifiOff className="h-3 w-3" />
              Offline
            </span>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:text-studio-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Room config */}
        {!joined && (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[10px] text-studio-muted">Room ID</label>
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] outline-none focus:border-studio-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-studio-muted">Display name</label>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] outline-none focus:border-studio-accent"
              />
            </div>
            <button
              onClick={handleJoin}
              className="w-full rounded-xl bg-studio-accent py-2 text-[11px] font-semibold text-white hover:brightness-110"
            >
              Join Room
            </button>
          </div>
        )}

        {joined && (
          <>
            {/* Leave + room info */}
            <div className="flex items-center justify-between rounded-xl border border-studio-border bg-studio-surface px-3 py-2">
              <div>
                <p className="text-[11px] font-medium text-studio-text">{roomId}</p>
                <p className="text-[9px] text-studio-muted">
                  as {userName} · {peers.length + 1} online
                </p>
              </div>
              <button onClick={handleLeave} className="text-[10px] text-red-400 hover:text-red-300">
                Leave
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg border border-studio-border overflow-hidden text-[10px]">
              {(['peers', 'chat'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`flex-1 py-1.5 capitalize transition ${activeTab === t ? 'bg-studio-accent text-white' : 'bg-studio-surface text-studio-muted hover:text-studio-text'}`}
                >
                  {t} {t === 'chat' && chat.length > 0 && `(${chat.length})`}
                </button>
              ))}
            </div>

            {activeTab === 'peers' && (
              <div className="space-y-1.5">
                {peers.length === 0 ? (
                  <p className="py-4 text-center text-[10px] text-studio-muted">
                    No other users in this room yet.
                  </p>
                ) : (
                  peers.map((p) => <PeerAvatar key={p.user} peer={p} />)
                )}
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="space-y-1.5">
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {chat.length === 0 && (
                    <p className="py-4 text-center text-[10px] text-studio-muted">
                      No messages yet.
                    </p>
                  )}
                  {chat.map((m) => (
                    <div key={m.ts} className="flex gap-2">
                      <div
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full text-[6px] flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.user.slice(0, 1)}
                      </div>
                      <div>
                        <span className="text-[9px] font-semibold" style={{ color: m.color }}>
                          {m.user}:{' '}
                        </span>
                        <span className="text-[9px] text-studio-text">{m.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Say something…"
                    className="flex-1 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] outline-none focus:border-studio-accent"
                  />
                  <button
                    onClick={handleSend}
                    className="rounded-lg bg-studio-accent px-3 py-1.5 text-white"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
