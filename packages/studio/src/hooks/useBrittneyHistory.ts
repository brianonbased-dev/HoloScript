/**
 * useBrittneyHistory — persist Brittney conversation history to localStorage
 *
 * Key: `brittney-history-${projectId}` → JSON array of ChatMessage.
 * Falls back gracefully if localStorage is unavailable (SSR, private browsing).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

const PREFIX = 'brittney-history-';
const MAX_MESSAGES = 200; // cap to avoid hitting quota

function storageKey(projectId: string): string {
  return `${PREFIX}${projectId || 'default'}`;
}

function readFromStorage(projectId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(projectId: string, messages: ChatMessage[]): void {
  try {
    const capped = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(projectId), JSON.stringify(capped));
  } catch {
    // Storage quota — silently ignore
  }
}

export function useBrittneyHistory(projectId: string) {
  const [history, setHistory] = useState<ChatMessage[]>(() => {
    // Avoid SSR hydration mismatch — populate on mount via effect
    return [];
  });

  // Load from storage on mount / projectId change
  useEffect(() => {
    setHistory(readFromStorage(projectId));
  }, [projectId]);

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      setHistory((prev) => {
        const next = [...prev, { ...msg, timestamp: msg.timestamp ?? Date.now() }];
        writeToStorage(projectId, next);
        return next;
      });
    },
    [projectId]
  );

  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(storageKey(projectId));
    } catch {
      /**/
    }
    setHistory([]);
  }, [projectId]);

  return { history, addMessage, clearHistory };
}
