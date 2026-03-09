/**
 * useScenarioReplay — React hook for scenario replay integration
 *
 * Connects any scenario panel to the replay service for automatic
 * interaction recording and playback.
 *
 * Usage:
 *   const { record, isRecording, sessionId } = useScenarioReplay('dna');
 *   <input onChange={e => { record('slider', 'depth', +e.target.value); setDepth(+e.target.value); }} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { replayService, type ReplayEventType } from '@/lib/ScenarioReplayService';

export function useScenarioReplay(scenarioId: string) {
  const sessionIdRef = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Start recording when component mounts
  useEffect(() => {
    const id = replayService.startSession(scenarioId);
    sessionIdRef.current = id;
    setIsRecording(true);

    return () => {
      replayService.endSession(id);
      sessionIdRef.current = null;
      setIsRecording(false);
    };
  }, [scenarioId]);

  const record = useCallback(
    (type: ReplayEventType, target: string, value: unknown, previousValue?: unknown) => {
      replayService.record({ type, target, value, previousValue });
    },
    []
  );

  const exportSession = useCallback((): string => {
    if (!sessionIdRef.current) return '{}';
    return replayService.exportSession(sessionIdRef.current);
  }, []);

  return {
    record,
    isRecording,
    sessionId: sessionIdRef.current,
    exportSession,
    replayService,
  };
}

export default useScenarioReplay;
