'use client';

/**
 * ContentTypeFilter - Multi-select content type filter
 *
 * Checkbox grid for filtering marketplace by content type.
 */

import { useState } from 'react';
import type { ContentType } from '@/lib/marketplace/types';
import { CONTENT_TYPE_METADATA } from '@/lib/marketplace/types';
import * as LucideIcons from 'lucide-react';

interface ContentTypeFilterProps {
  selectedTypes: ContentType[];
  onChange: (types: ContentType[]) => void;
}

export function ContentTypeFilter({ selectedTypes, onChange }: ContentTypeFilterProps) {
  const [expanded, setExpanded] = useState(true);

  const handleToggle = (type: ContentType) => {
    if (selectedTypes.includes(type)) {
      onChange(selectedTypes.filter((t) => t !== type));
    } else {
      onChange([...selectedTypes, type]);
    }
  };

  const handleSelectAll = () => {
    onChange(Object.keys(CONTENT_TYPE_METADATA) as ContentType[]);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  // Group types by category
  const typesByCategory: Record<string, ContentType[]> = {};
  Object.entries(CONTENT_TYPE_METADATA).forEach(([type, metadata]) => {
    const category = metadata.category;
    if (!typesByCategory[category]) {
      typesByCategory[category] = [];
    }
    typesByCategory[category].push(type as ContentType);
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm font-semibold text-studio-text hover:text-studio-accent transition-colors"
        >
          Content Types
          <span className="ml-2 text-[10px] text-studio-muted">
            ({selectedTypes.length}/{Object.keys(CONTENT_TYPE_METADATA).length})
          </span>
        </button>
        <div className="flex gap-1">
          <button
            onClick={handleSelectAll}
            className="text-[9px] text-studio-accent hover:underline"
          >
            All
          </button>
          <span className="text-[9px] text-studio-muted">|</span>
          <button
            onClick={handleClearAll}
            className="text-[9px] text-studio-muted hover:text-studio-text hover:underline"
          >
            None
          </button>
        </div>
      </div>

      {/* Checkboxes grid */}
      {expanded && (
        <div className="flex flex-col gap-3">
          {Object.entries(typesByCategory).map(([category, types]) => (
            <div key={category} className="flex flex-col gap-1.5">
              <div className="text-[10px] font-semibold text-studio-muted uppercase tracking-wide">
                {category.replace(/-/g, ' ')}
              </div>
              <div className="flex flex-col gap-1">
                {types.map((type) => {
                  const metadata = CONTENT_TYPE_METADATA[type];
                  const IconComponent = (LucideIcons as any)[metadata.icon] || LucideIcons.Box;
                  const isSelected = selectedTypes.includes(type);

                  return (
                    <label
                      key={type}
                      className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-studio-surface transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(type)}
                        className="h-3 w-3 rounded border-studio-border bg-studio-surface text-studio-accent focus:ring-1 focus:ring-studio-accent"
                      />
                      <IconComponent className="h-3.5 w-3.5 text-studio-accent" />
                      <span className="text-[11px] text-studio-text flex-1">
                        {metadata.label}
                      </span>
                      <span className="text-[9px] text-studio-muted font-mono">
                        {metadata.fileExtension}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
