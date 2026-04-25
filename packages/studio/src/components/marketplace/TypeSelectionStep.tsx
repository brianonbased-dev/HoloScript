import React from 'react';
import { type ContentType, CONTENT_TYPE_METADATA } from '@/lib/marketplace/types';

interface TypeSelectionStepProps {
  selectedType: ContentType | null;
  onChangeType: (type: ContentType) => void;
}

export const TypeSelectionStep: React.FC<TypeSelectionStepProps> = ({
  selectedType,
  onChangeType,
}) => {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="mb-4 text-base font-semibold text-studio-text">What are you uploading?</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Object.entries(CONTENT_TYPE_METADATA).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => onChangeType(key as ContentType)}
              className={`rounded-lg border-2 p-4 text-left transition-all ${
                selectedType === key
                  ? 'border-studio-accent bg-studio-accent/10'
                  : 'border-studio-border hover:border-studio-accent/50'
              }`}
            >
              <div className="text-2xl">{meta.emoji}</div>
              <div className="mt-2 font-medium text-studio-text">{meta.label}</div>
              <div className="mt-1 text-xs text-studio-text-muted">{meta.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
