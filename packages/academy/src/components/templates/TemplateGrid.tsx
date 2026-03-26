'use client';

import { TemplateCard } from './TemplateCard';
import type { TemplateInfo } from '@/types';

interface TemplateGridProps {
  templates: TemplateInfo[];
  onSelect: (template: TemplateInfo) => void;
}

export function TemplateGrid({ templates, onSelect }: TemplateGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} onSelect={onSelect} />
      ))}
    </div>
  );
}
