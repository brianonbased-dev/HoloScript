'use client';

export default function CreateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isWebGL = error.message?.includes('WebGL') || error.message?.includes('context lost');
  const isShader = error.message?.includes('shader') || error.message?.includes('GLSL');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-red-400"
        >
          <polygon points="12 2 2 22 22 22" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold">
          {isWebGL
            ? 'WebGL Context Lost'
            : isShader
              ? 'Shader Compilation Error'
              : 'Editor Crashed'}
        </h1>
        <p className="max-w-md text-sm text-studio-muted">
          {isWebGL
            ? 'The 3D viewport lost its WebGL context. This usually happens when GPU resources are exhausted. Your scene has been auto-saved.'
            : isShader
              ? 'A shader failed to compile. Try simplifying the material or removing custom shader code.'
              : error.message ||
                'The scene editor encountered an error. Your work has been auto-saved.'}
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-studio-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-studio-accent/80"
        >
          Reload Editor
        </button>
        <a
          href="/projects"
          className="rounded-lg border border-studio-border px-6 py-2.5 text-sm font-medium text-studio-muted transition hover:border-studio-text hover:text-studio-text"
        >
          Back to Projects
        </a>
      </div>
      {error.digest && <p className="text-xs text-studio-muted">Error ID: {error.digest}</p>}
    </div>
  );
}
