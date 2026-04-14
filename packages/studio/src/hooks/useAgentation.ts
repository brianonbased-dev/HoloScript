'use client';

import { useCallback, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Annotation } from 'agentation';
import { useToast } from '../app/providers';

const KNOWLEDGE_ENDPOINT =
  'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync';

/**
 * Full Agentation integration hook.
 *
 * Wires annotation lifecycle → toast notifications, local API persistence,
 * and knowledge store promotion for cross-agent visibility.
 */
export function useAgentation() {
  const pathname = usePathname();
  const { addToast } = useToast();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const annotationBuffer = useRef<Annotation[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────

  const apiBase = '/api/annotations';

  const persistToApi = useCallback(
    async (annotations: Annotation[], sid?: string) => {
      try {
        const res = await fetch(apiBase, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sid ?? sessionId,
            annotations,
            route: pathname,
            metadata: {
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
              },
              userAgent: navigator.userAgent,
            },
          }),
        });
        const data = await res.json();
        if (data.created && data.session?.id) {
          setSessionId(data.session.id);
        }
        return data;
      } catch {
        // Silent fail — annotations are also in localStorage via Agentation
      }
    },
    [sessionId, pathname]
  );

  /** Batch flush — debounce rapid annotation adds into one API call */
  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      if (annotationBuffer.current.length > 0) {
        const batch = [...annotationBuffer.current];
        annotationBuffer.current = [];
        persistToApi(batch);
      }
    }, 500);
  }, [persistToApi]);

  // ── Knowledge Store Promotion ───────────────────────────────────

  const promoteToKnowledge = useCallback(
    async (annotations: Annotation[]) => {
      // Only promote blocking/important annotations or explicit submits
      const worth = annotations.filter(
        (a) =>
          a.severity === 'blocking' ||
          a.severity === 'important' ||
          a.intent === 'fix'
      );
      if (worth.length === 0) return;

      const apiKey = process.env.NEXT_PUBLIC_MCP_API_KEY || process.env.HOLOSCRIPT_API_KEY;
      if (!apiKey) return;

      const entries = worth.map((a) => ({
        id: `ann.${a.id}`,
        workspace_id: 'ai-ecosystem',
        type: a.intent === 'fix' ? 'gotcha' : 'pattern',
        content: [
          `[Visual Annotation] ${a.comment}`,
          `Element: ${a.element} (${a.elementPath})`,
          a.reactComponents ? `Components: ${a.reactComponents}` : null,
          a.sourceFile ? `Source: ${a.sourceFile}` : null,
          a.selectedText ? `Selected: "${a.selectedText}"` : null,
          `Route: ${pathname}`,
          `Severity: ${a.severity ?? 'suggestion'}`,
          `Intent: ${a.intent ?? 'change'}`,
        ]
          .filter(Boolean)
          .join('\n'),
        metadata: {
          domain: 'visual-feedback',
          route: pathname,
          severity: a.severity,
          intent: a.intent,
          element: a.element,
          selector: a.elementPath,
        },
      }));

      try {
        await fetch(KNOWLEDGE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mcp-api-key': apiKey,
          },
          body: JSON.stringify({
            workspace_id: 'ai-ecosystem',
            entries,
          }),
        });
      } catch {
        // Non-critical — knowledge promotion is best-effort
      }
    },
    [pathname]
  );

  // ── Agentation Callbacks ────────────────────────────────────────

  const onAnnotationAdd = useCallback(
    (annotation: Annotation) => {
      const severity = annotation.severity ?? 'suggestion';
      const toastType =
        severity === 'blocking' ? 'error' : severity === 'important' ? 'warning' : 'info';
      addToast(
        `Annotation: ${annotation.comment.slice(0, 60)}${annotation.comment.length > 60 ? '...' : ''}`,
        toastType,
        3000
      );
      // Immediate persist — no waiting for submit button
      persistToApi([annotation]);
    },
    [addToast, persistToApi]
  );

  const onAnnotationDelete = useCallback(
    (annotation: Annotation) => {
      // Remove from buffer if not yet flushed
      annotationBuffer.current = annotationBuffer.current.filter(
        (a) => a.id !== annotation.id
      );
      addToast('Annotation removed', 'info', 2000);
    },
    [addToast]
  );

  const onAnnotationUpdate = useCallback(
    (annotation: Annotation) => {
      // Update in buffer or push as new
      const idx = annotationBuffer.current.findIndex((a) => a.id === annotation.id);
      if (idx >= 0) {
        annotationBuffer.current[idx] = annotation;
      } else {
        annotationBuffer.current.push(annotation);
      }
      scheduleFlush();
    },
    [scheduleFlush]
  );

  const onAnnotationsClear = useCallback(
    (annotations: Annotation[]) => {
      annotationBuffer.current = [];
      addToast(`Cleared ${annotations.length} annotations`, 'info', 2000);
    },
    [addToast]
  );

  const onSubmit = useCallback(
    async (markdown: string, annotations: Annotation[]) => {
      // Immediate persist (bypass debounce)
      annotationBuffer.current = [];
      if (flushTimer.current) clearTimeout(flushTimer.current);

      await persistToApi(annotations);
      await promoteToKnowledge(annotations);

      const blocking = annotations.filter((a) => a.severity === 'blocking').length;
      const total = annotations.length;
      addToast(
        `Submitted ${total} annotation${total !== 1 ? 's' : ''}${blocking ? ` (${blocking} blocking)` : ''} — synced to agents`,
        'success',
        4000
      );

      // Copy markdown to clipboard as well
      try {
        await navigator.clipboard.writeText(markdown);
      } catch {
        // Clipboard may not be available
      }
    },
    [persistToApi, promoteToKnowledge, addToast]
  );

  const onCopy = useCallback(
    (_markdown: string) => {
      addToast('Annotations copied to clipboard', 'success', 2000);
      // Also persist current state
      if (annotationBuffer.current.length > 0) {
        const batch = [...annotationBuffer.current];
        annotationBuffer.current = [];
        persistToApi(batch);
      }
    },
    [addToast, persistToApi]
  );

  const onSessionCreated = useCallback(
    (id: string) => {
      setSessionId(id);
      addToast(`Annotation session: ${id.slice(0, 12)}...`, 'info', 2000);
    },
    [addToast]
  );

  // ── Return props ready to spread onto <Agentation /> ────────────

  return {
    agentationProps: {
      onAnnotationAdd,
      onAnnotationDelete,
      onAnnotationUpdate,
      onAnnotationsClear,
      onSubmit,
      onCopy,
      onSessionCreated,
      endpoint: typeof window !== 'undefined' ? window.location.origin + apiBase : undefined,
    },
    sessionId,
  };
}
