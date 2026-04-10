'use client';

import { Sparkles } from 'lucide-react';
import type { TemplateInfo } from '@/types';

interface TemplateCardProps {
  template: TemplateInfo;
  onSelect: (template: TemplateInfo) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  nature: 'text-green-400 bg-green-400/10 border-green-400/20',
  scifi: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  art: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  zen: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  urban: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
};

export function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const colorClass = CATEGORY_COLORS[template.category] || CATEGORY_COLORS.art;

  return (
    <button
      onClick={() => onSelect(template)}
      className="group flex flex-col rounded-xl border border-studio-border bg-studio-panel p-5 text-left transition hover:border-studio-accent hover:shadow-lg hover:shadow-studio-accent/10"
    >
      {/* Visual placeholder */}
      <div className="mb-4 flex h-32 items-center justify-center rounded-lg bg-studio-surface">
        <Sparkles className="h-8 w-8 text-studio-muted transition group-hover:text-studio-accent" />
      </div>

      <h3 className="mb-1 font-semibold text-studio-text">{template.name}</h3>
      <p className="mb-3 text-sm text-studio-muted">{template.description}</p>

      <span
        className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs ${colorClass}`}
      >
        {template.category}
      </span>
    </button>
  );
}
