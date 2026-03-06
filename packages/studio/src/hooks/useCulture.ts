'use client';
/**
 * useCulture — Hook for culture runtime simulation
 */
import { useState, useCallback, useRef } from 'react';
import { CultureRuntime, type CultureEvent } from '@holoscript/core';

export interface UseCultureReturn {
  health: number;
  agentCount: number;
  events: CultureEvent[];
  tickCount: number;
  joinAgent: (id: string) => void;
  leaveAgent: (id: string) => void;
  tick: () => void;
  tickN: (n: number) => void;
  buildDemo: () => void;
  reset: () => void;
}

export function useCulture(): UseCultureReturn {
  const rt = useRef(new CultureRuntime({ maxEventHistory: 50 }));
  const [health, setHealth] = useState(1);
  const [agentCount, setAgentCount] = useState(0);
  const [events, setEvents] = useState<CultureEvent[]>([]);
  const [tickCount, setTickCount] = useState(0);

  const sync = useCallback(() => {
    const d = rt.current.dashboard();
    setHealth(d.health);
    setAgentCount(d.agents);
    setEvents(d.recentEvents.slice(0, 20));
    setTickCount(d.tickCount);
  }, []);

  const joinAgent = useCallback((id: string) => { rt.current.agentJoin(id); sync(); }, [sync]);
  const leaveAgent = useCallback((id: string) => { rt.current.agentLeave(id); sync(); }, [sync]);
  const tick = useCallback(() => { rt.current.tick(); sync(); }, [sync]);
  const tickN = useCallback((n: number) => { for (let i = 0; i < n; i++) rt.current.tick(); sync(); }, [sync]);

  const buildDemo = useCallback(() => {
    rt.current = new CultureRuntime({ defaultNorms: ['no_griefing', 'fair_trade', 'shared_resources'], maxEventHistory: 100 });
    rt.current.agentJoin('merchant-01', ['fair_trade']);
    rt.current.agentJoin('warrior-01', ['no_griefing']);
    rt.current.agentJoin('explorer-01', ['shared_resources']);
    rt.current.agentJoin('trickster-01');
    for (let i = 0; i < 5; i++) rt.current.tick();
    sync();
  }, [sync]);

  const reset = useCallback(() => { rt.current = new CultureRuntime({ maxEventHistory: 50 }); sync(); }, [sync]);

  return { health, agentCount, events, tickCount, joinAgent, leaveAgent, tick, tickN, buildDemo, reset };
}
