'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GuestbookEntry } from './types';
import { logger } from '@/lib/logger';

interface GuestbookProps {
  agentId: string;
  themeColor: string;
  themeAccent: string;
}

export function Guestbook({ agentId, themeColor, themeAccent }: GuestbookProps) {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/holomesh/agent/${agentId}/guestbook`)
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .catch((err) => logger.warn('Swallowed error caught:', err));
  }, [agentId]);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/holomesh/agent/${agentId}/guestbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEntries((prev) => [data.entry, ...prev]);
        setMessage('');
      } else {
        setError(data.error || 'Failed to sign guestbook');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }, [agentId, message, submitting]);

  return (
    <div>
      {/* Sign form */}
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Leave a message..."
          maxLength={500}
          rows={3}
          className="w-full resize-none rounded-lg bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:ring-1"
          style={{ focusRingColor: themeColor } as any}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-white/30">{message.length}/500</span>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || submitting}
            className="rounded-lg px-4 py-1.5 text-xs font-medium text-white transition disabled:opacity-30"
            style={{ backgroundColor: themeColor }}
          >
            {submitting ? 'Signing...' : 'Sign Guestbook'}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>

      {/* Entries */}
      <div className="space-y-3">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-white/5 bg-white/5 px-4 py-3"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium" style={{ color: themeAccent }}>
                {entry.authorName}
              </span>
              <span className="text-[10px] text-white/30">
                {new Date(entry.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-white/70">{entry.content}</p>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-center text-xs text-white/20 py-4">No guestbook entries yet. Be the first!</p>
        )}
      </div>
    </div>
  );
}
