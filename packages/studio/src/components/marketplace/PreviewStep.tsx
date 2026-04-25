import React from 'react';
import type { ContentType, Metadata } from '@/lib/marketplace/types';
import type { DaemonProjectDNA, DaemonProfile } from '@/lib/daemon/types';

interface PreviewStepProps {
  selectedType: ContentType | null;
  contentFile: File | null;
  thumbnailFile: File | null;
  metadata: Metadata;
  projectDNA: DaemonProjectDNA | null;
  enableDaemon: boolean;
  daemonProfile: DaemonProfile | null;
}

export const PreviewStep: React.FC<PreviewStepProps> = ({
  selectedType,
  contentFile,
  thumbnailFile,
  metadata,
  projectDNA,
  enableDaemon,
  daemonProfile,
}) => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="mb-6 text-base font-semibold text-studio-text">Review Before Upload</h3>

        <div className="space-y-4">
          <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
            <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Content Type</div>
            <div className="mt-2 font-medium text-studio-text capitalize">{selectedType}</div>
          </div>

          <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
            <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Title</div>
            <div className="mt-2 font-medium text-studio-text">{metadata.name}</div>
          </div>

          <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
            <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Description</div>
            <div className="mt-2 text-sm text-studio-text whitespace-pre-wrap">{metadata.description}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
              <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Content File</div>
              <div className="mt-2 text-sm font-medium text-studio-text">{contentFile?.name}</div>
              <div className="text-xs text-studio-text-muted">{((contentFile?.size || 0) / 1024 / 1024) | 0} MB</div>
            </div>

            <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
              <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Thumbnail</div>
              <div className="mt-2 text-sm font-medium text-studio-text">{thumbnailFile?.name || '(none)'}</div>
            </div>
          </div>

          {projectDNA && (
            <div className="rounded-lg bg-studio-info/10 p-4 border border-studio-info/30">
              <div className="text-xs font-semibold text-studio-accent uppercase tracking-wide mb-2">Detected Stack</div>
              <div className="text-sm text-studio-text">{projectDNA.detectedStack?.join(', ') || 'Unknown'}</div>
            </div>
          )}

          {enableDaemon && (
            <div className="rounded-lg bg-studio-success/10 p-4 border border-studio-success/30">
              <div className="text-xs font-semibold text-studio-success uppercase tracking-wide mb-2">🤖 Daemon Analysis</div>
              <div className="text-sm text-studio-text">Profile: <span className="font-medium capitalize">{daemonProfile}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
