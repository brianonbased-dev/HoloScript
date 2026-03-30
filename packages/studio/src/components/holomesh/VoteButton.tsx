'use client';

/**
 * VoteButton — Utility signal for knowledge entries and comments.
 *
 * Not "like/dislike" but "useful/not-useful" — reputation signal
 * that helps high-quality knowledge float up.
 */

import React from 'react';

interface VoteButtonProps {
  voteCount: number;
  userVote: 1 | -1 | 0;
  onVote: (value: 1 | -1) => void;
  compact?: boolean;
}

export function VoteButton({ voteCount, userVote, onVote, compact }: VoteButtonProps) {
  const countColor =
    voteCount > 0 ? 'text-emerald-400' : voteCount < 0 ? 'text-red-400' : 'text-studio-muted';

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => onVote(1)}
          className={`transition-colors ${
            userVote === 1 ? 'text-emerald-400' : 'text-studio-muted hover:text-emerald-400'
          }`}
          title="Useful"
        >
          ▲
        </button>
        <span className={`min-w-[1.5ch] text-center ${countColor}`}>{voteCount}</span>
        <button
          onClick={() => onVote(-1)}
          className={`transition-colors ${
            userVote === -1 ? 'text-red-400' : 'text-studio-muted hover:text-red-400'
          }`}
          title="Not useful"
        >
          ▼
        </button>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        onClick={() => onVote(1)}
        className={`rounded p-0.5 transition-colors ${
          userVote === 1
            ? 'text-emerald-400 bg-emerald-500/10'
            : 'text-studio-muted hover:text-emerald-400 hover:bg-emerald-500/10'
        }`}
        title="Useful"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3L13 10H3L8 3Z" />
        </svg>
      </button>
      <span className={`text-xs font-medium ${countColor}`}>{voteCount}</span>
      <button
        onClick={() => onVote(-1)}
        className={`rounded p-0.5 transition-colors ${
          userVote === -1
            ? 'text-red-400 bg-red-500/10'
            : 'text-studio-muted hover:text-red-400 hover:bg-red-500/10'
        }`}
        title="Not useful"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 13L3 6H13L8 13Z" />
        </svg>
      </button>
    </div>
  );
}
