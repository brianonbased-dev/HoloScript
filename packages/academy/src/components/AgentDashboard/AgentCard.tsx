'use client';

/**
 * AgentCard — Individual A2A Agent Display
 *
 * Shows agent identity, capabilities, skill tags, connection status,
 * and last activity timestamp. Used within AgentDashboard's agent list.
 */

import React from 'react';
import { Bot, Wifi, WifiOff, AlertTriangle, Clock } from 'lucide-react';
import type { Agent, ConnectionStatus } from './types';

export interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onSelect?: (agent: Agent) => void;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotClass: string; Icon: typeof Wifi }
> = {
  online: { label: 'Online', dotClass: 'bg-emerald-400', Icon: Wifi },
  offline: { label: 'Offline', dotClass: 'bg-gray-500', Icon: WifiOff },
  error: { label: 'Error', dotClass: 'bg-red-500', Icon: AlertTriangle },
};

/** Color palette for skill chips — cycles through 6 distinct hues */
const SKILL_COLORS = [
  'bg-blue-500/20 text-blue-300',
  'bg-purple-500/20 text-purple-300',
  'bg-amber-500/20 text-amber-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-cyan-500/20 text-cyan-300',
  'bg-rose-500/20 text-rose-300',
];

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AgentCard({ agent, selected = false, onSelect }: AgentCardProps) {
  const statusCfg = STATUS_CONFIG[agent.status];
  const StatusIcon = statusCfg.Icon;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(agent)}
      aria-label={`Select agent ${agent.name}`}
      aria-pressed={selected}
      className={`w-full text-left rounded-lg p-3 transition-colors border ${
        selected
          ? 'border-studio-accent bg-studio-accent/10'
          : 'border-studio-border/50 bg-studio-panel/40 hover:bg-studio-panel/70'
      }`}
    >
      {/* Header row: icon + name + status */}
      <div className="flex items-center gap-2 mb-1.5">
        <Bot className="h-4 w-4 text-studio-accent shrink-0" />
        <span className="text-sm font-semibold text-studio-text truncate flex-1">{agent.name}</span>
        <div className="flex items-center gap-1 shrink-0" title={statusCfg.label}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${statusCfg.dotClass}`}
            data-testid={`status-dot-${agent.status}`}
          />
          <StatusIcon className="h-3 w-3 text-studio-muted" />
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-studio-muted mb-2 line-clamp-2">{agent.description}</p>

      {/* Capabilities */}
      {agent.capabilities.length > 0 && (
        <div className="text-[10px] text-studio-muted/70 mb-2">
          {agent.capabilities.join(' · ')}
        </div>
      )}

      {/* Skill chips */}
      {agent.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {agent.skills.map((skill, i) => (
            <span
              key={skill.id}
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                SKILL_COLORS[i % SKILL_COLORS.length]
              }`}
              title={skill.description}
            >
              {skill.name}
            </span>
          ))}
        </div>
      )}

      {/* Last activity */}
      <div className="flex items-center gap-1 text-[10px] text-studio-muted">
        <Clock className="h-3 w-3" />
        <span>Last active: {formatRelativeTime(agent.lastActivityAt)}</span>
      </div>
    </button>
  );
}
