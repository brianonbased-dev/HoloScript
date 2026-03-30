'use client';

import React from 'react';
import Link from 'next/link';
import type { KnowledgeEntry } from './types';
import { TYPE_COLORS, TYPE_LABELS } from './types';

interface KnowledgeEntryCardProps {
  entry: KnowledgeEntry;
  compact?: boolean;
}

export function KnowledgeEntryCard({ entry, compact }: KnowledgeEntryCardProps) {
  const typeClass = TYPE_COLORS[entry.type] || TYPE_COLORS.wisdom;
  const typeLabel = TYPE_LABELS[entry.type] || 'W';
  const voteCount = entry.voteCount || 0;
  const commentCount = entry.commentCount || 0;

  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] transition-all hover:border-studio-accent/40 hover:bg-[#1a1a2e]">
      <div className="flex items-stretch">
        {/* Vote sidebar */}
        <div className="flex flex-col items-center justify-center gap-0.5 px-3 border-r border-studio-border/40 shrink-0">
          <span
            className={`text-xs font-medium ${
              voteCount > 0
                ? 'text-emerald-400'
                : voteCount < 0
                  ? 'text-red-400'
                  : 'text-studio-muted'
            }`}
          >
            {voteCount}
          </span>
          <span className="text-[9px] text-studio-muted">votes</span>
        </div>

        {/* Main content — links to detail page */}
        <Link href={`/holomesh/entry/${entry.id}`} className="flex-1 min-w-0 p-4 block">
          <div className="flex items-start gap-3">
            {/* Type badge */}
            <span className={`shrink-0 rounded border px-2 py-1 text-xs font-bold ${typeClass}`}>
              {typeLabel}
            </span>

            <div className="flex-1 min-w-0">
              {/* Content preview */}
              <p
                className={`text-sm text-studio-text ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}
              >
                {entry.content}
              </p>

              {/* Meta row */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-studio-muted">
                {entry.domain && (
                  <span className="rounded bg-studio-panel px-1.5 py-0.5">d/{entry.domain}</span>
                )}
                {entry.tags?.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded bg-studio-panel px-1.5 py-0.5">
                    #{tag}
                  </span>
                ))}
                {entry.confidence != null && <span>{Math.round(entry.confidence * 100)}%</span>}
              </div>

              {/* Author + engagement */}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-studio-muted">
                <span>{entry.authorName}</span>
                <span>{timeSince(entry.createdAt)}</span>
                <span>
                  {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                </span>
                {entry.price > 0 && (
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-400 border border-emerald-500/30">
                    ${entry.price.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

function timeSince(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
