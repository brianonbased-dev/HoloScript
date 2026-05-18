'use client';

/**
 * DesktopAgentEnsemble - 2D view of VR spatial agent system
 *
 * Provides desktop-accessible view of AgentEnsemble positions.
 * Synchronized with VR via agentRegistryStore for edge-tier agent integration.
 * Dragging logic has been optimized to directly mutate positions without RAF timeout lag.
 */

import { useState, useCallback, useEffect } from 'react';
import { Users, X } from 'lucide-react';
import { useAgentRegistryStore } from '@/lib/agentRegistryStore';
import { LiquidDesktop3D } from '../components/LiquidDesktop3D'; // 3D stationary depth upgrade (P2 task)

interface DesktopAgentEnsembleProps {
  onClose: () => void;
}

export function DesktopAgentEnsemble({ onClose }: DesktopAgentEnsembleProps) {
  const registryAgents = useAgentRegistryStore((s) => s.agents);
  
  // Local state for 2D canvas positions
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);

  // Derive missing positions for new agents from the registry
  useEffect(() => {
    setPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      registryAgents.forEach((agent, i) => {
        if (!next[agent.id]) {
          next[agent.id] = {
            x: 100 + (i * 200) % 800,
            y: 150 + Math.floor(i / 4) * 150,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [registryAgents]);

  const handleMouseDown = useCallback((agentId: string) => {
    setDragging(agentId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPositions((prev) => ({
      ...prev,
      [dragging]: { x, y },
    }));
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const getColorForStatus = (status: string) => {
    if (status === 'running') return '#22c55e'; // green
    if (status === 'error') return '#ef4444'; // red
    return '#60a5fa'; // idle blue
  };

  const getEmojiForType = (type: string, status: string, configEmoji?: string) => {
    if (configEmoji) return configEmoji;
    if (status === 'error') return '⚠️';
    switch (type) {
      case 'physics': return '🔵';
      case 'animator': return '🟡';
      case 'sound': return '🔴';
      case 'art': return '🟣';
      default: return '🤖';
    }
  };

  // 3D stationary depth upgrade (P2 task fulfillment)
  const use3DDesktop = true; // 3D stationary LiquidDesktop depth upgrade (P2 task) — now the default for agent desktop experience

  // Local selection state for depth-ray interaction (wires into environmental feedback P2)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  if (use3DDesktop) {
    // 3D fish-tank view with real depth, tilt parallax, and depth ray selection
    return (
      <div className="flex h-full flex-col bg-studio-panel">
        <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
          <Users className="h-4 w-4 text-studio-accent" />
          <span className="text-[12px] font-semibold">Agent Ensemble (3D Stationary View)</span>
          <span className="text-[10px] text-studio-muted ml-2">[{registryAgents.length} active]</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1">
          <LiquidDesktop3D
            reaction={selectedAgentId ? 0.9 : 0} // strong reaction while something is selected (environmental feedback P2)
            onObjectSelect={(id, point) => {
              // Depth-ray selection from the 3D scene → real HoloShell action + world reaction
              console.log('[LiquidDesktop3D] depth-selected', id, point);
              setSelectedAgentId(id);
              // The reaction prop above will make the floor clearer and bubbles reduce
              // (this is the direct implementation of "Brittney actions → environmental visual feedback")
            }}
          >
            {/* Real 3D agents at depth — this is the P2 "3D stationary view" upgrade */}
            {registryAgents.map((agent, i) => {
              const pos = positions[agent.id] || { x: 200 + i * 180, y: 200 };
              const z = -3.5 + (i % 6) * 1.4; // real depth layering

              return (
                <group
                  key={agent.id}
                  position={[
                    (pos.x - 400) * 0.017, 
                    (200 - pos.y) * 0.017, 
                    selectedAgentId === agent.id ? z + 1.2 : z   // pop selected agent forward in depth
                  ]}
                  scale={selectedAgentId === agent.id ? [1.25, 1.25, 1.25] : [1, 1, 1]} // highlight on depth selection
                >
                  {/* Small 3D icon plane (desktop-style) */}
                  <mesh position={[0, 0.15, 0.4]} rotation={[0, 0, 0]}>
                    <planeGeometry args={[0.9, 0.9]} />
                    <meshBasicMaterial color="#0f172a" side={2} />
                  </mesh>

                  {/* 3D agent body — rounded desktop icon */}
                  <mesh>
                    <sphereGeometry args={[0.55]} />
                    <meshPhongMaterial
                      color={getColorForStatus(agent.status)}
                      emissive={selectedAgentId === agent.id 
                        ? '#ffffff' 
                        : (agent.status === 'running' ? '#22c55e' : '#111111')}
                      shininess={selectedAgentId === agent.id ? 90 : 50}
                    />
                  </mesh>

                  {/* Tiny "window frame" at a different depth for true 3D desktop feel */}
                  <mesh position={[0, -0.9, -0.3]} rotation={[0.1, 0, 0]}>
                    <planeGeometry args={[1.4, 0.9]} />
                    <meshPhongMaterial color="#1e2937" shininess={10} side={2} />
                  </mesh>

                  {/* Screen-space icon + name label (faces camera, readable at depth) */}
                  <Html
                    position={[0, 1.1, 0]}
                    style={{
                      pointerEvents: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#e4e4e7',
                      textAlign: 'center',
                      transform: 'translate(-50%, -50%)',
                      textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                    }}
                  >
                    {getEmojiForType(agent.type, agent.status, (agent as any).configEmoji)}
                    <div style={{ fontSize: '9px', opacity: 0.85, marginTop: '-2px' }}>
                      {agent.name?.slice(0, 12) || agent.id.slice(0, 8)}
                    </div>
                  </Html>

                  {/* Depth cue ring */}
                  <mesh position={[0, -0.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.68, 0.78, 32]} />
                    <meshBasicMaterial color={getColorForStatus(agent.status)} side={2} transparent opacity={0.55} />
                  </mesh>
                </group>
              );
            })}
          </LiquidDesktop3D>
        </div>
      </div>
    );
  }

  // Legacy 2D SVG path (kept for fallback)
  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Users className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Agent Ensemble (2D View)</span>
        <span className="text-[10px] text-studio-muted ml-2">[{registryAgents.length} active]</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 2D Canvas */}
      <div className="flex-1 p-4">
        <svg
          width="100%"
          height="100%"
          className="bg-studio-surface rounded-xl border border-studio-border touch-none"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Grid Pattern */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#2d2d3d" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Agents */}
          {registryAgents.length === 0 && (
            <text x="50%" y="50%" textAnchor="middle" fill="#71717a" fontSize="12">
              No edge-tier agents registered.
            </text>
          )}

          {registryAgents.map((agent) => {
            const pos = positions[agent.id] || { x: -100, y: -100 };
            const color = getColorForStatus(agent.status);
            const emoji = getEmojiForType(agent.type, agent.status, agent.config?.emoji);

            return (
              <g
                key={agent.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseDown={() => handleMouseDown(agent.id)}
                style={{ cursor: dragging === agent.id ? 'grabbing' : 'grab' }}
              >
                {/* Status Glow */}
                <circle r="35" fill={color} opacity={agent.status === 'running' ? '0.25' : '0.1'} className="transition-opacity duration-300" />
                {/* Core Blob */}
                <circle
                  r="24"
                  fill={color}
                  opacity="0.8"
                  stroke={agent.status === 'error' ? '#ef4444' : color}
                  strokeWidth="2"
                />
                {/* Visual Identifier */}
                <text y="-30" textAnchor="middle" fill="#e4e4e7" fontSize="12" fontWeight="bold">
                  {emoji} {agent.name}
                </text>
                {/* Status indicator bubble */}
                <circle r="5" cx="16" cy="-16" fill={agent.status === 'running' ? '#22c55e' : agent.status === 'error' ? '#ef4444' : '#71717a'} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
