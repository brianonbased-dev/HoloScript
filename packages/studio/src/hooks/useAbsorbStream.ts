/**
 * useAbsorbStream — React Hook for SSE Progress Streaming
 *
 * Provides real-time progress updates for codebase absorb operations.
 * Uses Server-Sent Events to stream progress as files are scanned.
 *
 * @example
 * ```tsx
 * const { progress, phase, filesProcessed, totalFiles, startAbsorb, isRunning } = useAbsorbStream();
 *
 * const handleAbsorb = async () => {
 *   await startAbsorb('/path/to/project', 'shallow');
 * };
 *
 * return (
 *   <div>
 *     <button onClick={handleAbsorb} disabled={isRunning}>Absorb</button>
 *     {isRunning && (
 *       <div>
 *         <p>{phase} - {progress}%</p>
 *         <p>{filesProcessed} / {totalFiles} files</p>
 *       </div>
 *     )}
 *   </div>
 * );
 * ```
 */

import { useState, useCallback, useRef } from 'react';

interface AbsorbStreamState {
  jobId: string | null;
  progress: number;
  phase: string;
  filesProcessed: number;
  totalFiles: number;
  currentFile: string;
  isRunning: boolean;
  error: string | null;
  stats: Record<string, unknown> | null;
}

interface AbsorbStreamEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  jobId?: string;
  phase?: string;
  progress?: number;
  filesProcessed?: number;
  totalFiles?: number;
  currentFile?: string;
  stats?: Record<string, unknown>;
  error?: string;
}

export function useAbsorbStream() {
  const [state, setState] = useState<AbsorbStreamState>({
    jobId: null,
    progress: 0,
    phase: 'Idle',
    filesProcessed: 0,
    totalFiles: 0,
    currentFile: '',
    isRunning: false,
    error: null,
    stats: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const startAbsorb = useCallback(
    async (
      projectPath: string,
      depth: 'shallow' | 'medium' | 'deep' = 'shallow',
      force: boolean = false
    ): Promise<void> => {
      // Close any existing stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Reset state
      setState({
        jobId: null,
        progress: 0,
        phase: 'Initializing',
        filesProcessed: 0,
        totalFiles: 0,
        currentFile: '',
        isRunning: true,
        error: null,
        stats: null,
      });

      try {
        // POST to stream endpoint to initiate absorb
        const response = await fetch('/api/daemon/absorb/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath, depth, force }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check if browser supports EventSource
        if (typeof EventSource === 'undefined') {
          throw new Error('Browser does not support Server-Sent Events');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        // Read stream manually (since fetch + SSE is not natively supported)
        const processStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = JSON.parse(line.slice(6)) as AbsorbStreamEvent;

                  if (data.type === 'start') {
                    setState((prev) => ({
                      ...prev,
                      jobId: data.jobId || null,
                      phase: 'Starting',
                    }));
                  } else if (data.type === 'progress') {
                    setState((prev) => ({
                      ...prev,
                      phase: data.phase || prev.phase,
                      progress: data.progress ?? prev.progress,
                      filesProcessed: data.filesProcessed ?? prev.filesProcessed,
                      totalFiles: data.totalFiles ?? prev.totalFiles,
                      currentFile: data.currentFile ?? prev.currentFile,
                    }));
                  } else if (data.type === 'complete') {
                    setState((prev) => ({
                      ...prev,
                      phase: 'Complete',
                      progress: 100,
                      isRunning: false,
                      stats: data.stats || null,
                    }));
                  } else if (data.type === 'error') {
                    setState((prev) => ({
                      ...prev,
                      phase: 'Error',
                      isRunning: false,
                      error: data.error || 'Unknown error',
                    }));
                  }
                }
              }
            }
          } catch (err) {
            setState((prev) => ({
              ...prev,
              phase: 'Error',
              isRunning: false,
              error: err instanceof Error ? err.message : String(err),
            }));
          }
        };

        processStream();
      } catch (err) {
        setState((prev) => ({
          ...prev,
          phase: 'Error',
          isRunning: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false, phase: 'Cancelled' }));
  }, []);

  return {
    ...state,
    startAbsorb,
    cancel,
  };
}
