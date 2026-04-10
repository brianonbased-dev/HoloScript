'use client';

import { Loader2, Check, AlertCircle } from 'lucide-react';

interface Step2ImportProgressProps {
  importStatus: 'idle' | 'cloning' | 'absorbing' | 'detecting' | 'done' | 'error';
  importError: string | null;
  importProgress: number;
  repoName: string;
  branch: string;
  retryImport: () => void;
}

export function Step2ImportProgress({
  importStatus,
  importError,
  importProgress,
  repoName,
  branch,
  retryImport,
}: Step2ImportProgressProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-8">
      {importStatus === 'error' ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-red-400">Import Failed</p>
            <p className="text-[11px] text-studio-muted mt-1 max-w-xs">{importError}</p>
          </div>
          <button
            onClick={retryImport}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-4 py-1.5 text-sm text-blue-400 transition hover:bg-blue-500/30"
          >
            Retry
          </button>
        </>
      ) : (
        <>
          <div className="relative">
            <Loader2
              className={`h-12 w-12 text-blue-400 ${importStatus !== 'done' ? 'animate-spin' : ''}`}
            />
            {importStatus === 'done' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-400" />
              </div>
            )}
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-studio-text">
              {importStatus === 'cloning' && 'Cloning repository...'}
              {importStatus === 'absorbing' && 'Absorbing codebase...'}
              {importStatus === 'detecting' && 'Detecting Project DNA...'}
              {importStatus === 'done' && 'Import complete!'}
              {importStatus === 'idle' && 'Preparing...'}
            </p>
            <p className="text-[11px] text-studio-muted mt-1">
              {importStatus === 'cloning' && `Cloning ${repoName} (${branch})...`}
              {importStatus === 'absorbing' && 'Scanning files, symbols, and import graph...'}
              {importStatus === 'detecting' && 'Classifying repo type and risk profile...'}
              {importStatus === 'done' && 'All scans complete.'}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-700 ease-out"
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-studio-muted mt-1 text-center">{importProgress}%</p>
          </div>
        </>
      )}
    </div>
  );
}
