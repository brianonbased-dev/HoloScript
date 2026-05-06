/**
 * Assistant chat history persistence.
 *
 * Key: `assistant-history-${projectId}` with legacy fallback to
 * `brittney-history-${projectId}` during migration.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

const PREFIX = 'assistant-history-';
const LEGACY_PREFIX = 'brittney-history-';
const MAX_MESSAGES = 200; // cap to avoid hitting quota

function storageKey(projectId: string): string {
  return `${PREFIX}${projectId || 'default'}`;
}

function legacyStorageKey(projectId: string): string {
  return `${LEGACY_PREFIX}${projectId || 'default'}`;
}

function readFromStorage(projectId: string): ChatMessage[] {
  try {
    const raw =
      localStorage.getItem(storageKey(projectId)) ?? localStorage.getItem(legacyStorageKey(projectId));
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
    localStorage.removeItem(legacyStorageKey(projectId));
  } catch {
    // Storage quota — silently ignore
  }
}

function removeFromStorage(projectId: string): void {
  for (const key of [storageKey(projectId), legacyStorageKey(projectId)]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable — state still clears in memory
    }
  }
}

export function useAssistantHistory(projectId: string) {
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
    removeFromStorage(projectId);
    setHistory([]);
  }, [projectId]);

  return { history, addMessage, clearHistory };
}

export const useBrittneyHistory = useAssistantHistory;
