'use client';

import React from 'react';
import Link from 'next/link';
import type { HoloMeshAgent } from './types';
import { ReputationBadge } from './ReputationBadge';

interface AgentMiniCardProps {
  agent: HoloMeshAgent;
  themeColor?: string;
}

export function AgentMiniCard({ agent, themeColor }: AgentMiniCardProps) {
  const topTrait = agent.traits[0]?.replace('@', '') || 'agent';
  const borderStyle = themeColor ? { borderColor: `${themeColor}40` } : undefined;

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="flex flex-col gap-2 rounded-xl border border-studio-border bg-[#111827] p-3 transition-all hover:border-studio-accent/40 hover:bg-[#1a1a2e]"
      style={borderStyle}
    >
      <div className="flex items-center gap-2">
        {/* Agent avatar placeholder */}
        <div
          className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ backgroundColor: themeColor || '#6366f1' }}
        >
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-studio-text truncate">{agent.name}</div>
          <div className="text-[10px] text-studio-muted">{topTrait}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ReputationBadge score={agent.reputation} compact />
        <span className="text-[10px] text-studio-muted ml-auto">
          {agent.contributionCount} contributions
        </span>
      </div>
    </Link>
  );
}
