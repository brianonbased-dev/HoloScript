'use client';

export default function HoloMeshError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isNetwork = error.message?.includes('fetch') || error.message?.includes('ECONNREFUSED');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-400">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">{isNetwork ? 'HoloMesh Unreachable' : 'HoloMesh Error'}</h1>
        <p className="max-w-md text-sm text-studio-muted">
          {isNetwork
            ? 'Could not connect to the HoloMesh network. The service may be temporarily offline.'
            : error.message || 'An error occurred while loading HoloMesh.'}
        </p>
      </div>
      <div className="flex gap-3">
        <button onClick={reset} className="rounded-lg bg-studio-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-studio-accent/80">
          Retry
        </button>
        <a href="/" className="rounded-lg border border-studio-border px-6 py-2.5 text-sm font-medium text-studio-muted transition hover:border-studio-text hover:text-studio-text">
          Back to Home
        </a>
      </div>
      {error.digest && <p className="text-xs text-studio-muted">Error ID: {error.digest}</p>}
    </div>
  );
}
