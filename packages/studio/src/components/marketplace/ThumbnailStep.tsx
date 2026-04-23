import React, { useCallback } from 'react';

interface ThumbnailStepProps {
  thumbnailFile: File | null;
  onChangeThumbnail: (file: File) => void;
}

export const ThumbnailStep: React.FC<ThumbnailStepProps> = ({
  thumbnailFile,
  onChangeThumbnail,
}) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onChangeThumbnail(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      onChangeThumbnail(file);
    }
  }, [onChangeThumbnail]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="mb-4 text-base font-semibold text-studio-text">Add a thumbnail (optional)</h3>
        
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="rounded-lg border-2 border-dashed border-studio-border bg-studio-surface/50 p-12 text-center transition-colors hover:border-studio-accent/50"
        >
          <div className="mb-4 text-4xl">🖼️</div>
          <p className="mb-2 font-medium text-studio-text">Drag and drop thumbnail</p>
          <p className="mb-6 text-sm text-studio-text-muted">PNG, JPG, or WebP (recommended: 1200x675px)</p>
          <input
            type="file"
            onChange={handleFileSelect}
            accept="image/*"
            className="hidden"
            id="thumbnail-file-input"
          />
          <label
            htmlFor="thumbnail-file-input"
            className="inline-block rounded-lg bg-studio-accent px-4 py-2 font-medium text-white cursor-pointer hover:bg-studio-accent/90"
          >
            Select Thumbnail
          </label>
        </div>
      </div>

      {thumbnailFile && (
        <div className="rounded-lg bg-studio-success/10 p-4 border border-studio-success/30">
          <div className="font-medium text-studio-text">✓ Thumbnail selected: {thumbnailFile.name}</div>
          <div className="mt-2 text-sm text-studio-text-muted">{(thumbnailFile.size / 1024).toFixed(2)} KB</div>
        </div>
      )}
    </div>
  );
};
