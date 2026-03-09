'use client';

/**
 * Chat Panel Component
 *
 * Collaborative chat sidebar with messages and mentions
 */

import { useState, useRef, useEffect } from 'react';
import { Send, X, MessageCircle, Trash2 } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import type { ChatMessage } from '@/lib/collaboration/types';

export interface ChatPanelProps {
  onClose: () => void;
}

export function ChatPanel({ onClose }: ChatPanelProps) {
  const { messages, sendMessage, clearMessages } = useChat();
  const [inputValue, setInputValue] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    // Parse mentions (words starting with @)
    const mentions = (inputValue.match(/@\w+/g) || []).map((m) => m.slice(1));

    sendMessage(inputValue, replyTo?.id, mentions.length > 0 ? mentions : undefined);
    setInputValue('');
    setReplyTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed right-0 top-16 bottom-0 w-80 border-l border-studio-border bg-studio-panel flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-bold text-studio-text">Chat</h3>
          <span className="text-xs text-studio-muted">({messages.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="rounded p-1 text-studio-muted hover:bg-studio-surface hover:text-red-400 transition"
              title="Clear all messages"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="h-12 w-12 text-studio-border mb-2" />
            <p className="text-sm text-studio-muted">No messages yet</p>
            <p className="text-xs text-studio-muted mt-1">Start a conversation!</p>
          </div>
        )}

        {messages.map((msg) => {
          const isReply = !!msg.replyTo;
          const replyToMsg = messages.find((m) => m.id === msg.replyTo);

          return (
            <div key={msg.id} className="space-y-1">
              {/* Reply indicator */}
              {isReply && replyToMsg && (
                <div className="ml-4 pl-2 border-l-2 border-studio-border text-xs text-studio-muted">
                  Replying to {replyToMsg.userName}
                </div>
              )}

              {/* Message */}
              <div className="group relative">
                <div className="flex items-start gap-2">
                  {/* Avatar */}
                  <div
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: msg.userColor }}
                  >
                    {msg.userName.charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium text-studio-text">{msg.userName}</span>
                      <span className="text-[10px] text-studio-muted">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-studio-text mt-0.5 break-words">{msg.message}</p>

                    {/* Mentions */}
                    {msg.mentions && msg.mentions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msg.mentions.map((mention, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400"
                          >
                            @{mention}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reply button */}
                <button
                  onClick={() => setReplyTo(msg)}
                  className="invisible group-hover:visible absolute top-0 right-0 rounded px-2 py-1 text-[10px] text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
                >
                  Reply
                </button>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-studio-border p-3">
        {/* Reply indicator */}
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded bg-studio-surface px-2 py-1">
            <span className="text-xs text-studio-muted">Replying to {replyTo.userName}</span>
            <button
              onClick={() => setReplyTo(null)}
              className="text-studio-muted hover:text-studio-text transition"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (use @name to mention)"
            className="flex-1 resize-none rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text placeholder-studio-muted focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="rounded-lg bg-sky-500 p-2 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[10px] text-studio-muted mt-2">
          Shift+Enter for new line • Enter to send
        </p>
      </div>
    </div>
  );
}
