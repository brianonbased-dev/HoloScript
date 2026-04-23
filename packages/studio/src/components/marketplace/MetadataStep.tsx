import React from 'react';
import { Metadata } from '@holoscript/types';

interface MetadataStepProps {
  metadata: Metadata;
  onChangeMetadata: (key: string, value: any) => void;
}

export const MetadataStep: React.FC<MetadataStepProps> = ({
  metadata,
  onChangeMetadata,
}) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    onChangeMetadata(name, value);
  };

  const handleTagChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.currentTarget;
      const newTag = input.value.trim();
      if (newTag && !metadata.tags?.includes(newTag)) {
        onChangeMetadata('tags', [...(metadata.tags || []), newTag]);
        input.value = '';
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChangeMetadata('tags', (metadata.tags || []).filter(t => t !== tagToRemove));
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="mb-6 text-base font-semibold text-studio-text">Content Details</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-studio-text mb-2">Title *</label>
            <input
              type="text"
              name="name"
              value={metadata.name || ''}
              onChange={handleInputChange}
              placeholder="Enter title"
              className="w-full rounded-lg border border-studio-border bg-studio-surface px-4 py-2 text-studio-text placeholder-studio-text-muted focus:border-studio-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-studio-text mb-2">Description *</label>
            <textarea
              name="description"
              value={metadata.description || ''}
              onChange={handleInputChange}
              placeholder="Describe your content"
              rows={4}
              className="w-full rounded-lg border border-studio-border bg-studio-surface px-4 py-2 text-studio-text placeholder-studio-text-muted focus:border-studio-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="category-select" className="block text-sm font-medium text-studio-text mb-2">Category *</label>
              <select
                id="category-select"
                name="category"
                value={metadata.category || ''}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-studio-border bg-studio-surface px-4 py-2 text-studio-text focus:border-studio-accent focus:outline-none"
              >
                <option value="">Select category</option>
                <option value="scene">Scene</option>
                <option value="component">Component</option>
                <option value="tutorial">Tutorial</option>
                <option value="tool">Tool</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="license-select" className="block text-sm font-medium text-studio-text mb-2">License</label>
              <select
                id="license-select"
                name="license"
                value={metadata.license || 'MIT'}
                onChange={handleInputChange}
                className="w-full rounded-lg border border-studio-border bg-studio-surface px-4 py-2 text-studio-text focus:border-studio-accent focus:outline-none"
              >
                <option value="MIT">MIT</option>
                <option value="Apache-2.0">Apache 2.0</option>
                <option value="GPL-3.0">GPL 3.0</option>
                <option value="CC0">CC0 (Public Domain)</option>
                <option value="proprietary">Proprietary</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-studio-text mb-2">Tags</label>
            <input
              type="text"
              placeholder="Type and press Enter to add tags"
              onKeyDown={handleTagChange}
              className="w-full rounded-lg border border-studio-border bg-studio-surface px-4 py-2 text-studio-text placeholder-studio-text-muted focus:border-studio-accent focus:outline-none"
            />
            {metadata.tags && metadata.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metadata.tags.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-2 rounded-full bg-studio-accent/20 px-3 py-1">
                    <span className="text-xs font-medium text-studio-accent">{tag}</span>
                    <button
                      onClick={() => removeTag(tag)}
                      className="text-studio-accent/60 hover:text-studio-accent"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-studio-text mb-2">Version</label>
            <input
              type="text"
              name="version"
              value={metadata.version || '1.0.0'}
              onChange={handleInputChange}
              placeholder="1.0.0"
              className="w-full rounded-lg border border-studio-border bg-studio-surface px-4 py-2 text-studio-text placeholder-studio-text-muted focus:border-studio-accent focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
