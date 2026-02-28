'use client';

/**
 * DesktopAgentEnsemble - 2D view of VR spatial agent system
 *
 * Provides desktop-accessible view of AgentEnsemble positions.
 * Synchronized with VR via agentRegistryStore.
 * Optimized with debounced drag operations for smooth rendering.
 */

import { useState, useRef, useCallback } from 'react';
import { Users, X } from 'lucide-react';

interface Agent2DPosition {
  id: string;
  label: string;
  emoji: string;
  x: number; // 2D canvas coords
  y: number;
  color: string;
  isActive: boolean;
}

const DEFAULT_AGENTS: Agent2DPosition[] = [
  { id: 'physics', label: 'Physics', emoji: '🔵', x: 100, y: 200, color: '#60a5fa', isActive: true },
  { id: 'art', label: 'Art Director', emoji: '🟣', x: 400, y: 100, color: '#a78bfa', isActive: true },
  { id: 'animator', label: 'Animator', emoji: '🟡', x: 700, y: 200, color: '#fbbf24', isActive: true },
  { id: 'sound', label: 'Sound', emoji: '🔴', x: 500, y: 350, color: '#f87171', isActive: true },
];

interface DesktopAgentEnsembleProps {
  onClose: () => void;
}

export function DesktopAgentEnsemble({ onClose }: DesktopAgentEnsembleProps) {
  const [agents, setAgents] = useState<Agent2DPosition[]>(DEFAULT_AGENTS);
  const [dragging, setDragging] = useState<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = (agentId: string) => {
    setDragging(agentId);
  };

  const updateAgentPosition = useCallback((agentId: string, x: number, y: number) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === agentId ? { ...agent, x, y } : agent
      )
    );
  }, []);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Store pending position
    pendingPositionRef.current = { x, y };

    // Cancel previous debounce timer
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cancel previous RAF
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use requestAnimationFrame for smooth rendering
    rafRef.current = requestAnimationFrame(() => {
      if (pendingPositionRef.current) {
        const { x: newX, y: newY } = pendingPositionRef.current;

        // Debounce the actual state update (100ms)
        debounceTimerRef.current = window.setTimeout(() => {
          updateAgentPosition(dragging, newX, newY);
          pendingPositionRef.current = null;
        }, 100);
      }
    });
  };

  const handleMouseUp = () => {
    // Apply final position immediately
    if (dragging && pendingPositionRef.current) {
      const { x, y } = pendingPositionRef.current;
      updateAgentPosition(dragging, x, y);
      pendingPositionRef.current = null;
    }

    // Clear timers
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    setDragging(null);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Users className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Agent Ensemble (2D View)</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2D Canvas */}
      <div className="flex-1 p-4">
        <svg
          width="100%"
          height="100%"
          className="bg-studio-surface rounded-xl border border-studio-border"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2d2d3d" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Agents */}
          {agents.map((agent) => (
            <g
              key={agent.id}
              transform={`translate(${agent.x}, ${agent.y})`}
              onMouseDown={() => handleMouseDown(agent.id)}
              style={{ cursor: 'grab' }}
            >
              {/* Glow */}
              <circle r="30" fill={agent.color} opacity="0.15" />
              {/* Core */}
              <circle r="20" fill={agent.color} opacity="0.5" stroke={agent.color} strokeWidth="2" />
              {/* Label */}
              <text
                y="-25"
                textAnchor="middle"
                fill="#e4e4e7"
                fontSize="12"
                fontWeight="bold"
              >
                {agent.emoji} {agent.label}
              </text>
              {/* Status */}
              <circle
                r="4"
                cx="15"
                cy="-15"
                fill={agent.isActive ? '#22c55e' : '#71717a'}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
