'use client';

/**
 * useSceneVersions — manage version snapshots for a scene.
 * useMobileRemote — poll /api/remote?t=<token> for viewport commands.
 *
 * Session lifecycle:
 *   1. Studio calls createSession() to get a token + QR URL
 *   2. Phone opens /remote/[token] and PUTs viewport commands
 *   3. Studio polls GET /api/remote?t=<token> and applies commands to the viewport
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';
import { useEditorStore } from '@/lib/stores';

interface RemoteCommand {
  type: 'orbit' | 'zoom' | 'pan' | 'reset' | 'select';
  dx?: number;
  dy?: number;
  delta?: number;
  ts: number;
}

export type RemoteStatus = 'idle' | 'active' | 'expired' | 'error';

export function useMobileRemote() {
  const [token, setToken] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<RemoteStatus>('idle');
  const [commandCount, setCommandCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Apply an orbit command to the editor store camera
  const applyCommand = useCallback((cmd: RemoteCommand) => {
    // The editor store can have gizmo/camera mutation methods.
    // For now we log the command — full wiring depends on R3F camera ref.
    logger.debug('[MobileRemote] cmd', JSON.stringify(cmd));
    setCommandCount((c) => c + 1);
    // Future: useEditorStore.getState().applyRemoteCommand(cmd)
  }, []);

  const startPolling = useCallback(
    (tok: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/remote?t=${tok}`);
          if (res.status === 404) {
            setStatus('expired');
            clearInterval(pollRef.current!);
            return;
          }
          const data = (await res.json()) as { commands: RemoteCommand[] };
          data.commands.forEach(applyCommand);
        } catch {
          // network hiccup — keep polling
        }
      }, 500); // poll every 500ms
    },
    [applyCommand]
  );

  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/remote', { method: 'POST' });
      const data = (await res.json()) as { token: string; remoteUrl: string };
      setToken(data.token);
      setRemoteUrl(data.remoteUrl);
      setStatus('active');
      startPolling(data.token);
      return data;
    } catch (e) {
      setStatus('error');
      throw e;
    }
  }, [startPolling]);

  const endSession = useCallback(async () => {
    if (!token) return;
    if (pollRef.current) clearInterval(pollRef.current);
    await fetch(`/api/remote?t=${token}`, { method: 'DELETE' });
    setToken(null);
    setRemoteUrl(null);
    setStatus('idle');
    setCommandCount(0);
  }, [token]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  return { token, remoteUrl, status, commandCount, createSession, endSession };
}
