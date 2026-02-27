/**
 * StudioErrorBoundary — Catches render errors in studio panels and shows a
 * graceful fallback instead of crashing the whole page.
 *
 * Usage:
 *   <StudioErrorBoundary label="3D Viewport">
 *     <SceneRenderer ... />
 *   </StudioErrorBoundary>
 */

'use client';

import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Human-readable panel name shown in the error UI */
  label?: string;
  /** Optional custom fallback */
  fallback?: React.ReactNode;
  /** Callback fired on error — useful for error reporting */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class StudioErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[StudioErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, label, fallback } = this.props;

    if (!error) return <>{children}</>;

    if (fallback) return <>{fallback}</>;

    return (
      <div
        role="alert"
        className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border border-red-500/30 bg-red-950/20 p-6 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-300">
            {label ? `${label} crashed` : 'Panel crashed'}
          </p>
          <p className="mt-1 max-w-xs text-xs text-red-400/80">{error.message}</p>
        </div>
        <button
          onClick={this.handleReset}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
          aria-label="Retry crashed panel"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-2 w-full text-left">
            <summary className="cursor-pointer text-[10px] text-red-500/60 hover:text-red-400">
              Stack trace
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto text-[9px] text-red-500/50 whitespace-pre-wrap">
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
