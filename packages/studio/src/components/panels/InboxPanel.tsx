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
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

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
          read: !!m.read || (Array.isArray(m.readBy) && m.readBy.length > 0),
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
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [teamId]);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/holomesh/team/${teamId}/messages/${id}/mark-read`, { method: 'POST' });
      // optimistic
      if (data) {
        setData({
          ...data,
          items: data.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
          unreadCount: Math.max(0, data.unreadCount - 1),
        });
      }
    } catch {}
  };

  const claimTask = async (taskId?: string) => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/board/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      });
      setNotice(res.ok ? `Claimed ${taskId}` : `Claim failed: ${res.status}`);
    } catch (e: any) {
      setNotice(`Claim error: ${e.message}`);
    }
  };

  const sendReply = async (item: InboxItem) => {
    const text = replyText.trim();
    if (!text) return;
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dm',
          content: `@${item.from}: ${text}`,
          inReplyTo: item.id,
          to: item.from,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setReplyText('');
      setReplyingTo(null);
      setNotice(`Reply sent to ${item.from}`);
      await markRead(item.id);
    } catch (e: any) {
      setNotice(`Reply failed: ${e.message}`);
    }
  };

  const archiveItem = async (item: InboxItem) => {
    await markRead(item.id);
    if (data) {
      setData({
        ...data,
        items: data.items.filter((candidate) => candidate.id !== item.id),
        unreadCount: item.read ? data.unreadCount : Math.max(0, data.unreadCount - 1),
      });
    }
  };

  if (loading && !data) return <div className="p-3 text-xs text-studio-muted">Loading inbox…</div>;
  if (error) return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="p-2 text-[11px] text-studio-text space-y-2 overflow-y-auto h-full">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-studio-muted">
        <span>INBOX</span>
        <span className="bg-studio-accent/20 text-studio-accent px-1 rounded">
          {data.unreadCount} unread
        </span>
      </div>
      {notice && (
        <div className="rounded border border-studio-border/40 px-1.5 py-1 text-[9px] text-studio-muted">
          {notice}
        </div>
      )}

      {data.items.length === 0 && <div className="text-studio-muted italic">Inbox empty</div>}

      {data.items.map((item) => (
        <div
          key={item.id}
          className={`border border-studio-border/40 rounded p-1.5 ${item.read ? 'opacity-60' : 'bg-studio-panel/30'}`}
        >
          <div className="flex justify-between text-[9px]">
            <span className="font-mono">@{item.from}</span>
            <span className="text-studio-muted">
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
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

          {replyingTo === item.id && (
            <div className="mt-1 flex gap-1">
              <input
                className="min-w-0 flex-1 rounded border border-studio-border/40 bg-black/30 px-1 text-[9px]"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
              />
              <button
                onClick={() => sendReply(item)}
                className="text-[8px] underline hover:text-studio-accent"
              >
                Send
              </button>
            </div>
          )}

          <div className="flex gap-2 mt-1 text-[8px]">
            {!item.read && (
              <button
                onClick={() => markRead(item.id)}
                className="underline hover:text-studio-accent"
              >
                Mark read
              </button>
            )}
            <button
              onClick={() => setReplyingTo(replyingTo === item.id ? null : item.id)}
              className="underline hover:text-studio-accent"
            >
              Reply
            </button>
            <button
              onClick={() => archiveItem(item)}
              className="underline hover:text-studio-accent"
            >
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
