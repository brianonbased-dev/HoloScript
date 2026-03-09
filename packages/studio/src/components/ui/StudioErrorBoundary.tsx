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
import { extractASTPathFromStack } from '@/lib/unified-error-schemas';

// ─── Error Classification ─────────────────────────────────────────────────────

export type ErrorCategory = 'render' | 'webgl' | 'network' | 'compiler' | 'unknown';

export interface ClassifiedError {
  error: Error;
  category: ErrorCategory;
  recoverable: boolean;
  suggestion: string;
}

function classifyError(error: Error): ClassifiedError {
  const msg = error.message.toLowerCase();
  const stack = (error.stack || '').toLowerCase();

  if (msg.includes('webgl') || msg.includes('context lost') || msg.includes('gl_')) {
    return { error, category: 'webgl', recoverable: true, suggestion: 'Try reloading the 3D viewport.' };
  }
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to load')) {
    return { error, category: 'network', recoverable: true, suggestion: 'Check your network connection and retry.' };
  }
  if (msg.includes('compile') || msg.includes('parse') || stack.includes('compiler')) {
    return { error, category: 'compiler', recoverable: true, suggestion: 'Check your HoloScript source for syntax errors.' };
  }
  if (stack.includes('react') || stack.includes('render') || msg.includes('hydration')) {
    return { error, category: 'render', recoverable: true, suggestion: 'A component failed to render. Try clicking Retry.' };
  }
  return { error, category: 'unknown', recoverable: true, suggestion: 'An unexpected error occurred.' };
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  classified: ClassifiedError | null;
  astPath: string | null;
}

export class StudioErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, classified: null, astPath: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, classified: classifyError(error), astPath: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const classified = classifyError(error);
    const astPath = extractASTPathFromStack(info.componentStack || '');
    
    this.setState({ astPath });
    console.error(`[StudioErrorBoundary][${classified.category}] AST Path: ${astPath}`, error, info.componentStack);
    
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ error: null, classified: null, astPath: null });
  };

  render() {
    const { error, classified } = this.state;
    const { children, label, fallback } = this.props;

    if (!error || !classified) return <>{children}</>;

    if (fallback) return <>{fallback}</>;

    const CATEGORY_LABELS: Record<ErrorCategory, string> = {
      render: 'Render Error',
      webgl: 'WebGL Error',
      network: 'Network Error',
      compiler: 'Compiler Error',
      unknown: 'Error',
    };

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
          <span className="mt-1 inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
            {CATEGORY_LABELS[classified.category]}
          </span>
          <p className="mt-1 max-w-xs text-xs text-red-400/80">{error.message}</p>
          {this.state.astPath && (
            <p className="mt-1.5 max-w-xs text-[10.5px] font-mono text-red-400">
              AST Path: {this.state.astPath}
            </p>
          )}
          <p className="mt-1 max-w-xs text-[10px] text-red-400/60">{classified.suggestion}</p>
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
