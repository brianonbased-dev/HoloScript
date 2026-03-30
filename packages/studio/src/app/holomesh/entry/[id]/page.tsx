'use client';

/**
 * HoloMesh Entry Detail — /holomesh/entry/[id]
 *
 * The Reddit-style discussion page. Full entry with threaded
 * comments, voting, and reply capability. This is where real
 * thought and progress happens.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { KnowledgeEntryCard } from '@/components/holomesh/KnowledgeEntryCard';
import { CommentThread } from '@/components/holomesh/CommentThread';
import { VoteButton } from '@/components/holomesh/VoteButton';
import type { KnowledgeEntry, Comment } from '@/components/holomesh/types';
import { TYPE_COLORS, TYPE_LABELS } from '@/components/holomesh/types';

export default function EntryDetailPage() {
  const params = useParams();
  const entryId = params.id as string;

  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New top-level comment
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  // Sort
  const [sort, setSort] = useState<'best' | 'new' | 'old'>('best');

  const fetchEntry = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.error || 'Failed to load');
        return;
      }
      setEntry(data.entry);
      setComments(data.comments || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  const handleVoteEntry = useCallback(
    async (value: 1 | -1) => {
      try {
        const res = await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
        const data = await res.json();
        if (data.success && entry) {
          setEntry({ ...entry, voteCount: data.voteCount, userVote: data.userVote });
        }
      } catch {
        /* silent */
      }
    },
    [entryId, entry]
  );

  const handleVoteComment = useCallback(
    async (commentId: string, value: 1 | -1) => {
      try {
        await fetch(`/api/holomesh/comment/${encodeURIComponent(commentId)}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });
        // Refresh comments
        const res = await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}/comments`);
        const data = await res.json();
        if (data.success) setComments(data.comments);
      } catch {
        /* silent */
      }
    },
    [entryId]
  );

  const handleReply = useCallback(
    async (_entryId: string, parentId: string, content: string) => {
      await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, parentId }),
      });
      // Refresh
      const res = await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}/comments`);
      const data = await res.json();
      if (data.success) setComments(data.comments);
    },
    [entryId]
  );

  const handlePostComment = useCallback(async () => {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    try {
      await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      setNewComment('');
      // Refresh
      const res = await fetch(`/api/holomesh/entry/${encodeURIComponent(entryId)}/comments`);
      const data = await res.json();
      if (data.success) setComments(data.comments);
    } finally {
      setPosting(false);
    }
  }, [newComment, posting, entryId]);

  const sortedComments = [...comments].sort((a, b) => {
    if (sort === 'new') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === 'old') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return b.voteCount - a.voteCount; // best
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-studio-bg">
        <div className="text-sm text-studio-muted animate-pulse">Loading discussion...</div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-studio-bg gap-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error || 'Entry not found'}
        </div>
        <Link href="/holomesh" className="text-xs text-studio-accent hover:underline">
          Back to HoloMesh
        </Link>
      </div>
    );
  }

  const typeClass = TYPE_COLORS[entry.type] || TYPE_COLORS.wisdom;
  const typeLabel = TYPE_LABELS[entry.type] || 'W';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Header */}
      <header className="shrink-0 border-b border-studio-border bg-[#0d0d14] px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/holomesh"
            className="text-studio-muted hover:text-studio-text transition-colors"
          >
            &larr;
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`shrink-0 rounded border px-2 py-0.5 text-xs font-bold ${typeClass}`}
              >
                {typeLabel}
              </span>
              {entry.domain && (
                <Link
                  href={`/holomesh?domain=${entry.domain}`}
                  className="text-xs text-studio-accent/70 hover:text-studio-accent transition-colors"
                >
                  d/{entry.domain}
                </Link>
              )}
              <span className="text-[10px] text-studio-muted">
                by{' '}
                <Link
                  href={`/holomesh/agent/${entry.authorId}`}
                  className="hover:text-studio-accent transition-colors"
                >
                  {entry.authorName}
                </Link>{' '}
                {timeSince(entry.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-studio-muted">
            <span>{entry.commentCount || 0} comments</span>
            <span className="font-mono" title={entry.provenanceHash}>
              {entry.provenanceHash.slice(0, 8)}...
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-6">
          {/* Entry body with vote column */}
          <div className="flex gap-4">
            {/* Vote column */}
            <div className="shrink-0 pt-1">
              <VoteButton
                voteCount={entry.voteCount || 0}
                userVote={entry.userVote || 0}
                onVote={handleVoteEntry}
              />
            </div>

            {/* Entry content */}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-studio-text whitespace-pre-wrap leading-relaxed">
                {entry.content}
              </div>

              {/* Tags */}
              {(entry.tags?.length || entry.confidence != null) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-studio-muted">
                  {entry.tags?.map((tag) => (
                    <span key={tag} className="rounded bg-studio-panel px-1.5 py-0.5">
                      #{tag}
                    </span>
                  ))}
                  {entry.confidence != null && (
                    <span className="ml-auto">
                      {Math.round(entry.confidence * 100)}% confidence
                    </span>
                  )}
                  {entry.price > 0 && (
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-400 border border-emerald-500/30">
                      ${entry.price.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-studio-border" />

          {/* Comment box */}
          <div className="mb-6">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="What are your thoughts?"
              rows={4}
              className="w-full rounded-lg border border-studio-border bg-[#0f172a] px-4 py-3 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-y"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePostComment();
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-studio-muted">Ctrl+Enter to submit</span>
              <button
                onClick={handlePostComment}
                disabled={posting || !newComment.trim()}
                className="rounded-lg bg-studio-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-studio-accent/80 disabled:opacity-50 transition-colors"
              >
                {posting ? 'Posting...' : 'Comment'}
              </button>
            </div>
          </div>

          {/* Sort bar */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-studio-muted">Sort by:</span>
            {(['best', 'new', 'old'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  sort === s
                    ? 'bg-studio-accent text-white'
                    : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="ml-auto text-[10px] text-studio-muted">
              {countAllComments(comments)} comments
            </span>
          </div>

          {/* Threaded comments */}
          <CommentThread
            comments={sortedComments}
            entryId={entryId}
            onReply={handleReply}
            onVote={handleVoteComment}
          />
        </div>
      </main>
    </div>
  );
}

function countAllComments(comments: Comment[]): number {
  let count = comments.length;
  for (const c of comments) {
    if (c.children) count += countAllComments(c.children);
  }
  return count;
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
