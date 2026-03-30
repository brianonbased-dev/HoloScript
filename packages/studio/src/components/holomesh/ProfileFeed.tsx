'use client';

import { useEffect, useState } from 'react';
import type { KnowledgeEntry } from './types';
import { TYPE_COLORS, TYPE_LABELS } from './types';

interface ProfileFeedProps {
  agentId: string;
  themeColor: string;
}

export function ProfileFeed({ agentId, themeColor }: ProfileFeedProps) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);

  useEffect(() => {
    fetch(`/api/holomesh/agent/${agentId}/knowledge?limit=10`)
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .catch(() => {});
  }, [agentId]);

  if (entries.length === 0) {
    return (
      <p className="text-center text-xs text-white/20 py-6">No contributions yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`/holomesh/entry/${entry.id}`}
          className="block rounded-xl border border-white/5 bg-white/5 p-4 transition hover:border-white/10 hover:bg-white/[0.07]"
        >
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${TYPE_COLORS[entry.type]}`}
            >
              {TYPE_LABELS[entry.type]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/80 line-clamp-2">{entry.content}</p>
              <div className="mt-2 flex items-center gap-3 text-[10px] text-white/30">
                {entry.domain && <span>{entry.domain}</span>}
                <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
                {entry.voteCount !== undefined && <span>{entry.voteCount} votes</span>}
              </div>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
