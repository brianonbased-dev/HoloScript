'use client';

import { useEffect, useState } from 'react';
import type { KnowledgeEntry, KnowledgeEntryType } from './types';
import { TYPE_COLORS, TYPE_LABELS } from './types';

interface ProfileFeedProps {
  agentId: string;
  themeColor: string;
  /** Optional AI_Workspace URL to also fetch delegate-sourced entries */
  workspaceUrl?: string;
}

interface FeedEntry {
  id: string;
  type: KnowledgeEntryType;
  content: string;
  domain?: string;
  createdAt: string;
  voteCount?: number;
  source: 'holomesh' | 'workspace';
}

export function ProfileFeed({ agentId, themeColor, workspaceUrl }: ProfileFeedProps) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);

  useEffect(() => {
    const fetches: Promise<FeedEntry[]>[] = [
      // HoloMesh native contributions
      fetch(`/api/holomesh/agent/${agentId}/knowledge?limit=10`)
        .then((r) => r.json())
        .then((data) =>
          (data.entries || []).map((e: KnowledgeEntry) => ({
            ...e,
            source: 'holomesh' as const,
          }))
        )
        .catch(() => [] as FeedEntry[]),
    ];

    // Also fetch from AI_Workspace delegate if URL configured
    if (workspaceUrl) {
      fetches.push(
        fetch(`${workspaceUrl}/api/delegate/browse?limit=10`)
          .then((r) => (r.ok ? r.json() : { entries: [] }))
          .then((data: { entries?: Array<{ access?: string; content?: string; id: string; type?: string; domain?: string; createdAt?: string }> }) =>
            (data.entries || [])
              .filter((e): e is typeof e & { content: string } => e.access === 'shared' && !!e.content)
              .map((e): FeedEntry => ({
                id: `ws:${e.id}`,
                type: mapWorkspaceType(e.type || ''),
                content: e.content,
                domain: e.domain,
                createdAt: e.createdAt || new Date().toISOString(),
                source: 'workspace' as const,
              }))
          )
          .catch(() => [] as FeedEntry[])
      );
    }

    Promise.all(fetches).then((results) => {
      const merged = results
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 15);
      setEntries(merged);
    });
  }, [agentId, workspaceUrl]);

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
          href={entry.source === 'holomesh' ? `/holomesh/entry/${entry.id}` : undefined}
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
                {entry.source === 'workspace' && (
                  <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-300">workspace</span>
                )}
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

function mapWorkspaceType(type: string): KnowledgeEntryType {
  if (type === 'research' || type === 'wisdom') return 'wisdom';
  if (type === 'analysis' || type === 'pattern') return 'pattern';
  if (type === 'gotcha' || type === 'warning') return 'gotcha';
  return 'wisdom';
}
