/**
 * Chat Hook
 *
 * Manages collaborative chat messages using Yjs
 */

import { useEffect, useState, useCallback } from 'react';
import { getCollaborationClient } from '@/lib/collaboration/client';
import type { ChatMessage } from '@/lib/collaboration/types';
import type * as Y from 'yjs';

export interface UseChatOptions {
  enabled?: boolean;
  maxMessages?: number;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  sendMessage: (message: string, replyTo?: string, mentions?: string[]) => void;
  clearMessages: () => void;
}

export function useChat({ enabled = true, maxMessages = 100 }: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const sendMessage = useCallback(
    (message: string, replyTo?: string, mentions?: string[]) => {
      if (!enabled || !message.trim()) return;

      try {
        const client = getCollaborationClient();
        client.sendMessage(message.trim(), replyTo, mentions);
      } catch (err) {
        console.error('Send message error:', err);
      }
    },
    [enabled]
  );

  const clearMessages = useCallback(() => {
    try {
      const client = getCollaborationClient();
      const chatArray = client.getChatArray();
      chatArray.delete(0, chatArray.length);
      setMessages([]);
    } catch (err) {
      console.error('Clear messages error:', err);
    }
  }, []);

  // Observe chat messages
  useEffect(() => {
    if (!enabled) return;

    try {
      const client = getCollaborationClient();
      const chatArray = client.getChatArray();

      // Load existing messages
      const existingMessages = chatArray.toArray();
      setMessages(existingMessages.slice(-maxMessages));

      // Observe new messages
      const unobserve = client.observeChat((event: Y.YArrayEvent<ChatMessage>) => {
        const allMessages = chatArray.toArray();
        setMessages(allMessages.slice(-maxMessages));
      });

      return () => {
        unobserve();
      };
    } catch (err) {
      // Client not initialized - ignore
    }
  }, [enabled, maxMessages]);

  return {
    messages,
    sendMessage,
    clearMessages,
  };
}
