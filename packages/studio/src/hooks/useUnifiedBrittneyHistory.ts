/**
 * Unified Brittney conversation history.
 *
 * ONE conversation that persists and follows the user across EVERY Brittney
 * surface — /start (BrittneyFullScreen), /build (BrittneyBuildSurface),
 * /vibe and /create (BrittneyChatPanel). Anchored on the active workspace so a
 * project keeps its own thread; with no workspace, a single shared studio
 * thread. Crucially there is NO per-route fragmentation.
 *
 * Before this hook, the surfaces fragmented the conversation three ways:
 *   - /start hardcoded `useAssistantHistory('start')`
 *   - /vibe + /create passed `routeScope: pathname` → separate per-page keys
 *   - /build used ephemeral useState — no persistence at all
 * (G-STUDIO-002, docs/STUDIO_IDE_REBOOT_AUDIT.md). Every surface now calls this
 * one hook, so the thread links and persists everywhere.
 */
'use client';

import { useAssistantHistory } from './useBrittneyHistory';
import { resolveBrittneyHistoryScope } from '@/lib/brittney/historyScope';
import { useWorkspaceStore } from '@/lib/stores/workspaceStore';

export function useUnifiedBrittneyHistory() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  // Only the workspace anchors the scope. No routeScope / sceneId is passed, so
  // the no-workspace fallback collapses to a single shared scope
  // (`project:studio:default`) instead of one key per page. When a workspace is
  // active every surface resolves to `workspace:${id}` and shares one thread.
  const scope = resolveBrittneyHistoryScope({ activeWorkspaceId });
  // `scope` is returned so callers that compare/propagate it (e.g. the panel's
  // load-guard) use the same single source of truth and cannot drift.
  return { scope, ...useAssistantHistory(scope) };
}
