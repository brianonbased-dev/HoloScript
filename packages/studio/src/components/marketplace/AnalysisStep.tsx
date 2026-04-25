import React from 'react';
import type { DaemonProjectDNA } from '@/lib/daemon/types';

interface AnalysisStepProps {
  projectDNA: DaemonProjectDNA | null;
}

export const AnalysisStep: React.FC<AnalysisStepProps> = ({ projectDNA }) => {
  if (!projectDNA) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-studio-text-muted">No analysis data available. Please upload a file first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="mb-4 text-base font-semibold text-studio-text">Content Analysis</h3>
        
        <div className="space-y-3">
          <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
            <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Kind</div>
            <div className="mt-1 text-lg font-medium text-studio-text">{projectDNA.kind}</div>
          </div>

          {projectDNA.detectedStack && projectDNA.detectedStack.length > 0 && (
            <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
              <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Detected Stack</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {projectDNA.detectedStack.map((item, i) => (
                  <span key={i} className="inline-block rounded-full bg-studio-accent/20 px-3 py-1 text-xs font-medium text-studio-accent">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
            <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Confidence</div>
            <div className="mt-1 text-base font-medium text-studio-text">{(projectDNA.confidence * 100).toFixed(0)}%</div>
          </div>

          <div className="rounded-lg bg-studio-surface p-4 border border-studio-border">
            <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Recommended Profile</div>
            <div className="mt-1 text-base font-medium text-studio-text capitalize">{projectDNA.recommendedProfile}</div>
          </div>

          {projectDNA.notes && (
            <div className="rounded-lg bg-studio-info/10 p-4 border border-studio-info/30">
              <div className="text-xs font-semibold text-studio-text-muted uppercase tracking-wide">Notes</div>
              <div className="mt-2 text-sm text-studio-text">{projectDNA.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
