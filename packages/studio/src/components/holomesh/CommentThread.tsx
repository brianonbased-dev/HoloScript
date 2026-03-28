'use client';

/**
 * CommentThread — Threaded discussion on knowledge entries.
 *
 * Reddit-style nested comments with reply, vote, and collapse.
 * Recursively renders children at increasing indent depth.
 */

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import type { Comment } from './types';
import { VoteButton } from './VoteButton';

interface CommentThreadProps {
  comments: Comment[];
  entryId: string;
  onReply: (entryId: string, parentId: string, content: string) => Promise<void>;
  onVote: (commentId: string, value: 1 | -1) => Promise<void>;
}

export function CommentThread({ comments, entryId, onReply, onVote }: CommentThreadProps) {
  if (comments.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-studio-muted">No comments yet</p>
        <p className="text-xs text-studio-muted/60 mt-1">Be the first to share your thoughts</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0">
      {comments.map((comment) => (
        <CommentNode
          key={comment.id}
          comment={comment}
          entryId={entryId}
          onReply={onReply}
          onVote={onVote}
        />
      ))}
    </div>
  );
}

function CommentNode({
  comment,
  entryId,
  onReply,
  onVote,
}: {
  comment: Comment;
  entryId: string;
  onReply: (entryId: string, parentId: string, content: string) => Promise<void>;
  onVote: (commentId: string, value: 1 | -1) => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitReply = useCallback(async () => {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReply(entryId, comment.id, replyContent.trim());
      setReplyContent('');
      setReplying(false);
    } finally {
      setSubmitting(false);
    }
  }, [replyContent, submitting, onReply, entryId, comment.id]);

  const indent = Math.min(comment.depth, 6);

  return (
    <div
      className="border-l-2 border-studio-border/40 hover:border-studio-accent/30 transition-colors"
      style={{ marginLeft: indent > 0 ? `${indent * 20}px` : '0' }}
    >
      <div className="py-2 px-3">
        {/* Comment header */}
        <div className="flex items-center gap-2 text-[10px] text-studio-muted">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hover:text-studio-text transition-colors"
          >
            {collapsed ? '[+]' : '[-]'}
          </button>
          <Link
            href={`/holomesh/agent/${comment.authorId}`}
            className="font-medium text-studio-accent/80 hover:text-studio-accent transition-colors"
          >
            {comment.authorName}
          </Link>
          <span>{timeSince(comment.createdAt)}</span>
          {comment.voteCount !== 0 && (
            <span className={comment.voteCount > 0 ? 'text-emerald-400' : 'text-red-400'}>
              {comment.voteCount > 0 ? '+' : ''}{comment.voteCount}
            </span>
          )}
        </div>

        {/* Comment body */}
        {!collapsed && (
          <>
            <div className="mt-1 text-sm text-studio-text/90 whitespace-pre-wrap">
              {comment.content}
            </div>

            {/* Actions */}
            <div className="mt-1.5 flex items-center gap-3 text-[10px]">
              <VoteButton
                voteCount={comment.voteCount}
                userVote={comment.userVote || 0}
                onVote={(v) => onVote(comment.id, v)}
                compact
              />
              <button
                onClick={() => setReplying(!replying)}
                className="text-studio-muted hover:text-studio-text transition-colors"
              >
                reply
              </button>
            </div>

            {/* Reply form */}
            {replying && (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  rows={3}
                  className="w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-y"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmitReply();
                  }}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmitReply}
                    disabled={submitting || !replyContent.trim()}
                    className="rounded-lg bg-studio-accent px-3 py-1 text-xs font-medium text-white hover:bg-studio-accent/80 disabled:opacity-50"
                  >
                    {submitting ? 'Posting...' : 'Reply'}
                  </button>
                  <button
                    onClick={() => { setReplying(false); setReplyContent(''); }}
                    className="rounded-lg px-3 py-1 text-xs text-studio-muted hover:text-studio-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Children */}
            {comment.children && comment.children.length > 0 && (
              <div className="mt-1">
                {comment.children.map((child) => (
                  <CommentNode
                    key={child.id}
                    comment={child}
                    entryId={entryId}
                    onReply={onReply}
                    onVote={onVote}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Collapsed indicator */}
        {collapsed && comment.children && comment.children.length > 0 && (
          <div className="mt-1 text-[10px] text-studio-muted italic">
            {comment.children.length} {comment.children.length === 1 ? 'reply' : 'replies'} hidden
          </div>
        )}
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
