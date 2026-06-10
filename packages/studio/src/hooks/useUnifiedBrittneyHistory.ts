/**
 * Unified Brittney conversation history — server-synced, multi-thread.
 *
 * ONE active conversation that persists and follows the user across EVERY
 * Brittney surface — /start (BrittneyFullScreen), /build (BrittneyBuildSurface),
 * /vibe and /create (BrittneyChatPanel). Anchored on the active workspace so a
 * project keeps its own threads; with no workspace, a single shared studio
 * scope. Crucially there is NO per-route fragmentation (G-STUDIO-002).
 *
 * Persistence layers:
 *   1. localStorage (useAssistantHistory) — instant, offline-safe cache of the
 *      ACTIVE thread. 200-message cap. Works signed-out.
 *   2. /api/brittney/conversations — durable server record (full history,
 *      cross-device, multiple threads per scope). Synced when authenticated;
 *      every server call is fail-soft so chat never breaks without it.
 *
 * Sync model:
 *   - On mount/scope change (authenticated): list conversations for the scope,
 *     pick the remembered (or most recent) thread, hydrate local cache from the
 *     server when the server has more messages.
 *   - A legacy localStorage-only thread is migrated to a server conversation
 *     the first time the scope has none.
 *   - addMessage writes locally first, then enqueues a server append (the
 *     conversation row is created lazily on the first message of a new thread).
 *   - Switching threads replaces the local cache with the server thread.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAssistantHistory, type ChatMessage } from './useBrittneyHistory';
import { resolveBrittneyHistoryScope } from '@/lib/brittney/historyScope';
import {
  appendConversationMessages,
  createConversation,
  deleteConversation as deleteConversationRequest,
  fetchConversation,
  listConversations,
  patchConversation,
  type ConversationSummary,
  type MessageUpload,
  type ServerChatMessage,
} from '@/lib/brittney/conversationsClient';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';

const ACTIVE_CONVERSATION_PREFIX = 'assistant-active-conversation-';

function activeConversationKey(scope: string): string {
  return `${ACTIVE_CONVERSATION_PREFIX}${scope}`;
}

function readActiveConversationId(scope: string): string | null {
  try {
    return localStorage.getItem(activeConversationKey(scope));
  } catch {
    return null;
  }
}

function writeActiveConversationId(scope: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(activeConversationKey(scope), id);
    else localStorage.removeItem(activeConversationKey(scope));
  } catch {
    // Storage unavailable — in-memory state still tracks the active thread.
  }
}

function serverMessagesToLocal(messages: ServerChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp ? new Date(m.timestamp).getTime() : new Date(m.createdAt).getTime(),
  }));
}

export function useUnifiedBrittneyHistory() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  // Only the workspace anchors the scope. No routeScope / sceneId is passed, so
  // the no-workspace fallback collapses to a single shared scope
  // (`project:studio:default`) instead of one key per page. When a workspace is
  // active every surface resolves to `workspace:${id}` and shares one thread.
  const scope = resolveBrittneyHistoryScope({ activeWorkspaceId });
  const local = useAssistantHistory(scope);
  const { status: sessionStatus } = useSession();
  const syncEnabled = sessionStatus === 'authenticated';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);

  // Refs the async sync machinery reads without re-binding callbacks.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConversationId;
  const pendingRef = useRef<MessageUpload[]>([]);
  const flushingRef = useRef(false);
  // Generation counter — a scope change or sign-out invalidates in-flight work.
  const generationRef = useRef(0);

  const upsertConversation = useCallback((convo: ConversationSummary) => {
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== convo.id);
      return [convo, ...rest];
    });
  }, []);

  /** Drain the pending upload queue into the active (or a new) conversation. */
  const flushPending = useCallback(async () => {
    if (flushingRef.current || !syncEnabled) return;
    flushingRef.current = true;
    const generation = generationRef.current;
    try {
      while (pendingRef.current.length > 0 && generation === generationRef.current) {
        let convoId = activeIdRef.current;
        if (!convoId) {
          const created = await createConversation(scopeRef.current);
          if (!created || generation !== generationRef.current) return;
          convoId = created.id;
          activeIdRef.current = convoId;
          setActiveConversationId(convoId);
          writeActiveConversationId(scopeRef.current, convoId);
          upsertConversation(created);
        }

        const batch = pendingRef.current.splice(0, pendingRef.current.length);
        const result = await appendConversationMessages(convoId, batch);
        if (!result) {
          // Server unavailable — requeue and retry on the next message.
          pendingRef.current.unshift(...batch);
          return;
        }
        if (generation !== generationRef.current) return;
        upsertConversation(result.conversation);
      }
    } finally {
      flushingRef.current = false;
    }
  }, [syncEnabled, upsertConversation]);

  // ─── Hydration: list threads for the scope, pick one, pull newer history ───
  const { isLoaded: localLoaded, history: localHistory, replaceHistory } = local;
  const hydratedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!localLoaded) return;
    if (!syncEnabled) {
      // Signed-out / loading: pure localStorage mode.
      setConversationsLoaded(sessionStatus === 'unauthenticated');
      return;
    }
    if (hydratedScopeRef.current === scope) return;
    hydratedScopeRef.current = scope;
    generationRef.current += 1;
    const generation = generationRef.current;
    pendingRef.current = [];
    setConversationsLoaded(false);

    (async () => {
      const list = await listConversations(scope);
      if (generation !== generationRef.current) return;
      if (list === null) {
        // Server unreachable — stay in local-only mode for this scope.
        setConversations([]);
        setActiveConversationId(null);
        setConversationsLoaded(true);
        return;
      }
      setConversations(list);

      const storedId = readActiveConversationId(scope);
      const active =
        list.find((c) => c.id === storedId && !c.archivedAt) ??
        list.find((c) => !c.archivedAt) ??
        null;

      if (!active) {
        if (localHistory.length > 0) {
          // Legacy localStorage-only thread → migrate it to a server conversation.
          const created = await createConversation(scope);
          if (generation !== generationRef.current) return;
          if (created) {
            const uploads: MessageUpload[] = localHistory
              .filter((m) => m.content.length > 0)
              .map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }));
            const result = await appendConversationMessages(created.id, uploads);
            if (generation !== generationRef.current) return;
            upsertConversation(result?.conversation ?? created);
            setActiveConversationId(created.id);
            writeActiveConversationId(scope, created.id);
          }
        }
        setConversationsLoaded(true);
        return;
      }

      setActiveConversationId(active.id);
      writeActiveConversationId(scope, active.id);
      if (active.messageCount > localHistory.length) {
        // Server has history this browser doesn't — hydrate the cache.
        const fetched = await fetchConversation(active.id);
        if (generation !== generationRef.current) return;
        if (fetched) replaceHistory(serverMessagesToLocal(fetched.messages));
      }
      setConversationsLoaded(true);
    })();
  }, [
    scope,
    syncEnabled,
    sessionStatus,
    localLoaded,
    localHistory,
    replaceHistory,
    upsertConversation,
  ]);

  // ─── Public API ─────────────────────────────────────────────────────────────

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      const timestamp = msg.timestamp ?? Date.now();
      local.addMessage({ ...msg, timestamp });
      if (syncEnabled && msg.content.length > 0) {
        pendingRef.current.push({ role: msg.role, content: msg.content, timestamp });
        void flushPending();
      }
    },
    [local, syncEnabled, flushPending]
  );

  /** Start a fresh thread. The server row is created lazily on first message. */
  const newConversation = useCallback(() => {
    generationRef.current += 1;
    pendingRef.current = [];
    activeIdRef.current = null;
    setActiveConversationId(null);
    writeActiveConversationId(scopeRef.current, null);
    local.clearHistory();
  }, [local]);

  /** Switch to another thread — replaces the local cache with the server copy. */
  const selectConversation = useCallback(
    async (id: string) => {
      if (id === activeIdRef.current) return;
      const fetched = await fetchConversation(id);
      if (!fetched) return;
      generationRef.current += 1;
      pendingRef.current = [];
      activeIdRef.current = id;
      setActiveConversationId(id);
      writeActiveConversationId(scopeRef.current, id);
      replaceHistory(serverMessagesToLocal(fetched.messages));
      upsertConversation(fetched.conversation);
    },
    [replaceHistory, upsertConversation]
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const updated = await patchConversation(id, { title });
      if (updated) upsertConversation(updated);
      return updated !== null;
    },
    [upsertConversation]
  );

  const archiveConversation = useCallback(
    async (id: string) => {
      const updated = await patchConversation(id, { archived: true });
      if (!updated) return false;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeIdRef.current === id) newConversation();
      return true;
    },
    [newConversation]
  );

  /**
   * Clear the current thread: deletes the active server conversation (when
   * one exists) and resets to a fresh local thread.
   */
  const clearHistory = useCallback(() => {
    const id = activeIdRef.current;
    if (id) {
      void deleteConversationRequest(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    }
    newConversation();
  }, [newConversation]);

  // `scope` is returned so callers that compare/propagate it (e.g. the panel's
  // load-guard) use the same single source of truth and cannot drift.
  // `threadKey` additionally changes on thread switch within a scope, so UIs
  // keyed on it rebuild their message state when the user changes threads.
  return {
    scope,
    threadKey: `${scope}:${activeConversationId ?? 'local'}`,
    history: local.history,
    addMessage,
    clearHistory,
    isLoaded: local.isLoaded,
    conversations,
    activeConversationId,
    conversationsLoaded,
    newConversation,
    selectConversation,
    renameConversation,
    archiveConversation,
  };
}
