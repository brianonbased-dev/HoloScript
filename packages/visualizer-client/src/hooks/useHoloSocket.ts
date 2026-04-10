import { useEffect, useState, useRef } from 'react';
import type { OrbData } from '../types';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface TimeState {
  julianDate: number;
  date: string;
  timeScale: number;
  isPaused: boolean;
}

export function useHoloSocket(port: number = 8080) {
  const [orbs, setOrbs] = useState<Map<string, OrbData>>(new Map());
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [timeState, setTimeState] = useState<TimeState | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setStatus('connecting');
    const ws = new WebSocket(`ws://localhost:${port}`);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('error');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, payload, orbs: initialOrbs, time } = message;

        if (type === 'init') {
          const newMap = new Map();
          initialOrbs.forEach((orb: OrbData) => newMap.set(orb.id, orb));
          setOrbs(newMap);

          // Set initial time state
          if (time) {
            setTimeState(time);
          }
        } else if (type === 'orb_created' || type === 'orb_update') {
          setOrbs((prev) => {
            const next = new Map(prev);
            if (payload && payload.orb) {
              const existing = next.get(payload.orb.id);
              next.set(payload.orb.id, { ...existing, ...payload.orb });
            }
            return next;
          });
        } else if (type === 'time_update') {
          // Update time state
          setTimeState(payload);
        }
      } catch (e) {
        console.error('Failed to parse message', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [port]);

  const sendTimeControl = (command: string, value?: unknown) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'time_control',
          command,
          value,
        })
      );
    }
  };

  return {
    orbs: Array.from(orbs.values()),
    status,
    timeState,
    sendTimeControl,
  };
}
