import React, { useCallback } from 'react';
import type { DaemonProjectDNA } from '@/lib/daemon/types';
import { inferProjectDNA } from '../../lib/marketplace/projectDNAInference';

interface FileUploadStepProps {
  contentFile: File | null;
  projectDNA: DaemonProjectDNA | null;
  onChangeFile: (file: File) => void;
  onProjectDNADetected: (dna: DaemonProjectDNA) => void;
}

export const FileUploadStep: React.FC<FileUploadStepProps> = ({
  contentFile,
  projectDNA,
  onChangeFile,
  onProjectDNADetected,
}) => {
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onChangeFile(file);
      const detected = inferProjectDNA(file);
      onProjectDNADetected(detected);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      onChangeFile(file);
      const detected = inferProjectDNA(file);
      onProjectDNADetected(detected);
    }
  }, [onChangeFile, onProjectDNADetected]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="mb-4 text-base font-semibold text-studio-text">Upload your content</h3>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="rounded-lg border-2 border-dashed border-studio-border bg-studio-surface/50 p-12 text-center transition-colors hover:border-studio-accent/50"
        >
          <div className="mb-4 text-4xl">📤</div>
          <p className="mb-2 font-medium text-studio-text">Drag and drop your file</p>
          <p className="mb-6 text-sm text-studio-text-muted">or click to browse</p>
          <input
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            id="content-file-input"
          />
          <label
            htmlFor="content-file-input"
            className="inline-block rounded-lg bg-studio-accent px-4 py-2 font-medium text-white cursor-pointer hover:bg-studio-accent/90"
          >
            Select File
          </label>
        </div>
      </div>

      {contentFile && (
        <div className="rounded-lg bg-studio-success/10 p-4 border border-studio-success/30">
          <div className="font-medium text-studio-text">✓ File selected: {contentFile.name}</div>
          <div className="mt-2 text-sm text-studio-text-muted">{(contentFile.size / 1024 / 1024).toFixed(2)} MB</div>
        </div>
      )}

      {projectDNA && (
        <div className="rounded-lg bg-studio-info/10 p-4 border border-studio-info/30">
          <div className="font-medium text-studio-text">🔍 Detected: {projectDNA.kind}</div>
          <div className="mt-2 text-sm text-studio-text-muted">{projectDNA.notes}</div>
          {projectDNA.detectedStack && (
            <div className="mt-2 text-xs text-studio-text-muted">
              Stack: {projectDNA.detectedStack.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
