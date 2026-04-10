'use client';

/**
 * useLivePreview — SSE-based live preview sync.
 *
 * - Connect to GET /api/preview?sceneId=<id> (Server-Sent Events)
 * - Broadcast current code to POST /api/preview on demand (or auto on code change)
 * - Used by LivePreviewBar to show connection status
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export type PreviewStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface PreviewEvent {
  code: string;
  sceneId: string;
  ts: number;
}

export interface LivePreviewOptions {
  sceneId?: string;
  autoSync?: boolean; // auto-POST on broadcast() calls
  onRemoteCode?: (code: string) => void; // called when remote code arrives
}

export function useLivePreview(options?: LivePreviewOptions) {
  const { sceneId = 'default', onRemoteCode } = options ?? {};
  const [status, setStatus] = useState<PreviewStatus>('disconnected');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  
  const onRemoteCodeRef = useRef(onRemoteCode);
  useEffect(() => {
    onRemoteCodeRef.current = onRemoteCode;
  }, [onRemoteCode]);

  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setStatus('connecting');

    const es = new EventSource(`/api/preview?sceneId=${encodeURIComponent(sceneId)}`);
    esRef.current = es;

    es.addEventListener('preview', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as PreviewEvent;
        onRemoteCodeRef.current?.(data.code);
        setLastSync(data.ts);
      } catch {
        /* ignore malformed */
      }
    });

    es.onopen = () => setStatus('connected');
    es.onerror = () => {
      setStatus('error');
      es.close();
      esRef.current = null;
    };
  }, [sceneId]);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setStatus('disconnected');
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);

  const broadcast = useCallback(
    async (code: string) => {
      try {
        await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, sceneId }),
        });
        setLastSync(Date.now());
      } catch {
        /* noop */
      }
    },
    [sceneId]
  );

  return { status, lastSync, connect, disconnect, broadcast };
}
