import React from 'react';

interface SubmitStepProps {
  uploading: boolean;
  progress: number;
  daemonJobId?: string | null;
}

export const SubmitStep: React.FC<SubmitStepProps> = ({
  uploading,
  progress,
  daemonJobId,
}) => {
  if (uploading) {
    // Calculate progress classes - use discrete Tailwind width classes
    const progressClass = 
      progress >= 90 ? 'w-[90%]' :
      progress >= 80 ? 'w-[80%]' :
      progress >= 70 ? 'w-[70%]' :
      progress >= 60 ? 'w-[60%]' :
      progress >= 50 ? 'w-1/2' :
      progress >= 40 ? 'w-[40%]' :
      progress >= 30 ? 'w-[30%]' :
      progress >= 20 ? 'w-1/5' :
      progress >= 10 ? 'w-1/10' :
      'w-0';

    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="text-5xl">📤</div>
        <div className="font-medium text-studio-text">Uploading your content...</div>
        <div className="w-full max-w-xs">
          <div className="h-2 bg-studio-border rounded-full overflow-hidden">
            <div
              className={`h-full bg-studio-accent transition-all duration-300 ${progressClass}`}
              aria-label={`Upload progress: ${progress}%`}
            />
          </div>
          <div className="mt-2 text-xs text-studio-text-muted text-center">{progress}%</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-6">
      <div className="text-6xl">✅</div>
      <div>
        <h3 className="text-xl font-bold text-studio-text text-center">Upload Complete!</h3>
        <p className="mt-2 text-center text-studio-text-muted">
          Your content has been successfully published to the marketplace.
        </p>
      </div>

      {daemonJobId && (
        <div className="mt-4 rounded-lg bg-studio-info/10 p-4 border border-studio-info/30 w-full">
          <div className="text-xs font-semibold text-studio-accent uppercase tracking-wide mb-2">
            🤖 Daemon Job Started
          </div>
          <div className="text-sm text-studio-text">
            Job ID: <span className="font-mono text-xs">{daemonJobId}</span>
          </div>
          <div className="mt-2 text-xs text-studio-text-muted">
            Your content is being analyzed and optimized. Check back in a few minutes for results.
          </div>
        </div>
      )}

      <div className="mt-4 text-center text-sm text-studio-text-muted">
        You'll be redirected to your content page in a moment...
      </div>
    </div>
  );
};
