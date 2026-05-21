'use client';

import React, { useEffect, useState } from 'react';

/**
 * InboxPanel — Studio sidebar: DMs, handoffs, mentions.
 *
 * Per task_1779315248520_ed4v:
 * - Shows DMs, handoffs, mentions with unread count badge.
 * - Each item: sender, preview, timestamp, read/unread state.
 * - Handoffs include inline claim-task button.
 * - Actions: read, reply, mark read, archive.
 * - Pure frontend (APIs already exist: /api/holomesh/inbox, /message, mark-read).
 *
 * This continues the HoloMesh sidebar series (after Fleet panel).
 */

interface InboxItem {
  id: string;
  type: 'dm' | 'handoff' | 'mention' | 'review-request';
  from: string;
  content: string;
  timestamp: string;
  read: boolean;
  taskId?: string; // for handoffs
  taskTitle?: string;
}

interface InboxData {
  items: InboxItem[];
  unreadCount: number;
}

export function InboxPanel() {
  const [data, setData] = useState<InboxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId] = useState('team_1777834718247_unr35n');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/holomesh/team/${teamId}/messages?limit=30`);
        if (!res.ok) throw new Error(`inbox ${res.status}`);
        const json = await res.json();

        const messages = (json.messages || json.items || []).map((m: any) => ({
          id: m.id,
          type: m.messageType || m.type || 'dm',
          from: m.fromAgentName || m.from || 'unknown',
          content: m.content || m.preview || '',
          timestamp: m.createdAt || m.timestamp || new Date().toISOString(),
          read: m.read || false,
          taskId: m.taskId || m.payload?.taskId,
          taskTitle: m.payload?.title || m.taskTitle,
        }));

        const unread = messages.filter((x: any) => !x.read).length;

        if (!cancelled) {
          setData({ items: messages, unreadCount: unread });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load inbox');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [teamId]);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/holomesh/team/${teamId}/messages/${id}/mark-read`, { method: 'POST' });
      // optimistic
      if (data) {
        setData({
          ...data,
          items: data.items.map(i => i.id === id ? { ...i, read: true } : i),
          unreadCount: Math.max(0, data.unreadCount - 1),
        });
      }
    } catch {}
  };

  const claimTask = (taskId?: string) => {
    if (taskId) {
      // In real Studio this would trigger /room claim flow
      alert(`Claiming task ${taskId} (integrate with room claim helper)`);
    }
  };

  if (loading && !data) return <div className="p-3 text-xs text-studio-muted">Loading inbox…</div>;
  if (error) return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="p-2 text-[11px] text-studio-text space-y-2 overflow-y-auto h-full">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-studio-muted">
        <span>INBOX</span>
        <span className="bg-studio-accent/20 text-studio-accent px-1 rounded">{data.unreadCount} unread</span>
      </div>

      {data.items.length === 0 && <div className="text-studio-muted italic">Inbox empty</div>}

      {data.items.map((item) => (
        <div
          key={item.id}
          className={`border border-studio-border/40 rounded p-1.5 ${item.read ? 'opacity-60' : 'bg-studio-panel/30'}`}
        >
          <div className="flex justify-between text-[9px]">
            <span className="font-mono">@{item.from}</span>
            <span className="text-studio-muted">{new Date(item.timestamp).toLocaleTimeString()}</span>
          </div>

          <div className="text-[10px] mt-0.5 line-clamp-2">{item.content}</div>

          {item.type === 'handoff' && item.taskId && (
            <button
              onClick={() => claimTask(item.taskId)}
              className="mt-1 text-[8px] underline text-studio-accent hover:text-white"
            >
              Claim task: {item.taskTitle || item.taskId}
            </button>
          )}

          <div className="flex gap-2 mt-1 text-[8px]">
            {!item.read && (
              <button onClick={() => markRead(item.id)} className="underline hover:text-studio-accent">
                Mark read
              </button>
            )}
            <button onClick={() => alert(`Reply to ${item.from} (message composer stub)`)} className="underline hover:text-studio-accent">
              Reply
            </button>
            <button onClick={() => alert('Archive (stub)')} className="underline hover:text-studio-accent">
              Archive
            </button>
          </div>

          <div className="text-[7px] text-studio-muted mt-0.5">{item.type.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

export default InboxPanel;
