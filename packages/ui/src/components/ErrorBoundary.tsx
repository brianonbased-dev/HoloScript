'use client';

import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Human-readable panel name shown in the error UI */
  label?: string;
  /** Optional custom fallback — static ReactNode */
  fallback?: React.ReactNode;
  /** Render-function fallback — receives the error and a reset callback */
  renderFallback?: (error: Error, resetError: () => void) => React.ReactNode;
  /** Callback fired on error — useful for error reporting */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Show a "Reload Page" button alongside "Retry" (useful for app-level boundaries) */
  showReloadButton?: boolean;
}

interface State {
  error: Error | null;
  /** Component name extracted from the React component stack */
  astPath: string | null;
}

/**
 * ErrorBoundary — Canonical error boundary for the HoloScript UI layer.
 *
 * Features:
 * - `label` for contextual crash messages ("Viewport crashed" vs generic)
 * - `fallback` (static) or `renderFallback` (function) for custom error UIs
 * - `onError` callback for telemetry / error reporting
 * - `showReloadButton` for app-level boundaries
 * - AST path extraction from React component stack (dev diagnostics)
 * - Dev-only stack trace disclosure
 * - Accessible: `role="alert"`, `aria-label` on retry button
 *
 * @example
 * ```tsx
 * // Panel-level (compact)
 * <ErrorBoundary label="Viewport" onError={reportCrash}>
 *   <ViewportCanvas />
 * </ErrorBoundary>
 *
 * // App-level (with reload)
 * <ErrorBoundary showReloadButton>
 *   <App />
 * </ErrorBoundary>
 *
 * // Render-function fallback
 * <ErrorBoundary renderFallback={(err, reset) => <MyUI error={err} onRetry={reset} />}>
 *   <RiskyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, astPath: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Extract component name from stack trace for diagnostics
    const componentMatch = info.componentStack?.match(/at\s+([A-Za-z0-9_]+)/);
    const componentName = componentMatch ? componentMatch[1] : null;
    const astPath = componentName ? `AST_PATH::[Component:${componentName}]` : null;

    console.error(
      `[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`,
      astPath ?? '',
      error,
      info.componentStack,
    );

    this.setState({ astPath });
    this.props.onError?.(error, info);
  }

  handleReset = () => {
    this.setState({ error: null, astPath: null });
  };

  render() {
    const { error, astPath } = this.state;
    const { children, label, fallback, renderFallback, showReloadButton } = this.props;

    if (!error) return <>{children}</>;
    if (renderFallback) return <>{renderFallback(error, this.handleReset)}</>;
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
            {label ? `${label} crashed` : 'Component crashed'}
          </p>
          <span className="mt-1 inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
            Error
          </span>
          <p className="mt-1 max-w-xs text-xs text-red-400/80">{error.message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
            aria-label="Retry crashed component"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
          {showReloadButton && (
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-red-500/30 px-4 py-2 text-xs font-medium text-red-400/70 transition hover:border-red-400 hover:text-red-300"
            >
              Reload Page
            </button>
          )}
        </div>
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-2 w-full text-left">
            <summary className="cursor-pointer text-[10px] text-red-500/60 hover:text-red-400">
              Stack trace
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto text-[9px] text-red-500/50 whitespace-pre-wrap">
              {astPath && (
                <span className="mb-1 block font-bold text-red-400">{astPath}</span>
              )}
              {error.stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
