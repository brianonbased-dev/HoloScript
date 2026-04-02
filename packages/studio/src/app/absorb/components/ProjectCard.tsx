'use client';

import React from 'react';
import { timeSince } from './utils';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    sourceType: string;
    status: string;
    totalSpentCents: number;
    totalOperations: number;
    lastAbsorbedAt: string | null;
    createdAt: string;
  };
  selected: boolean;
  onSelect: () => void;
  onAbsorb: () => void;
  onImprove: () => void;
  onExtractKnowledge?: () => void;
}

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-400',
  absorbing: 'bg-blue-500/20 text-blue-400 animate-pulse',
  ready: 'bg-emerald-500/20 text-emerald-400',
  improving: 'bg-purple-500/20 text-purple-400 animate-pulse',
  error: 'bg-red-500/20 text-red-400',
};

export function ProjectCard({
  project,
  selected,
  onSelect,
  onAbsorb,
  onImprove,
  onExtractKnowledge,
}: ProjectCardProps) {
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border p-4 transition-all ${
        selected
          ? 'border-studio-accent bg-studio-accent/10 shadow-lg shadow-studio-accent/5'
          : 'border-studio-border bg-[#111827] hover:border-studio-accent/40'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-studio-text">{project.name}</h3>
          <p className="mt-1 text-xs text-studio-muted">{project.sourceType}</p>
        </div>
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[project.status] || statusColors.pending}`}
        >
          {project.status}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-studio-muted">
        <span>${(project.totalSpentCents / 100).toFixed(2)} spent</span>
        <span>{project.totalOperations} ops</span>
        {project.lastAbsorbedAt && (
          <span className="ml-auto">{timeSince(project.lastAbsorbedAt)}</span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAbsorb();
          }}
          disabled={project.status === 'absorbing' || project.status === 'improving'}
          className="rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
        >
          Absorb
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onImprove();
          }}
          disabled={project.status !== 'ready'}
          className="rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/30 disabled:opacity-50"
        >
          Improve
        </button>
        {onExtractKnowledge && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExtractKnowledge();
            }}
            disabled={project.status !== 'ready'}
            className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 disabled:opacity-50"
          >
            Extract W/P/G
          </button>
        )}
      </div>
    </div>
  );
}
