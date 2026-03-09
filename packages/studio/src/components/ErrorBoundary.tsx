'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  astPath?: string;
}

/**
 * ErrorBoundary — Catches React render errors and displays a recovery UI.
 * Prevents the entire app from crashing when a single component fails.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Extract component name from stack trace to form a mock AST path
    const componentMatch = info.componentStack?.match(/at\s+([A-Za-z0-9_]+)/);
    const componentName = componentMatch ? componentMatch[1] : 'Unknown';
    const astPath = `AST_PATH::[Component:${componentName}]`;
    
    console.error(`[HoloScript Studio] AST_PATH_ERROR ${astPath}:`, error, info.componentStack);
    this.setState({ astPath });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-red-400"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h2 className="mb-2 text-xl font-semibold text-studio-text">Something went wrong</h2>
            <p className="max-w-md text-sm text-studio-muted">
              {this.state.error?.message || 'An unexpected error occurred in the editor.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-studio-accent/80"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-studio-border px-4 py-2 text-sm font-medium text-studio-muted transition hover:border-studio-text hover:text-studio-text"
            >
              Reload Page
            </button>
          </div>
          <details className="mt-4 max-w-lg text-left">
            <summary className="cursor-pointer text-xs text-studio-muted hover:text-studio-text">
              Technical Details
            </summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-studio-panel p-3 text-xs text-red-300">
              {this.state.astPath && (
                <div className="mb-2 font-bold text-red-400 border-b border-red-500/20 pb-1">
                  {this.state.astPath}
                </div>
              )}
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}
