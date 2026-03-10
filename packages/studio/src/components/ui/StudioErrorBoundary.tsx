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
import { extractASTPathFromStack, UnifiedError, UnifiedErrorSchema } from '@/lib/unified-error-schemas';

// ─── Error Classification ─────────────────────────────────────────────────────

function classifyError(error: any, componentStack?: string): UnifiedError {
  const msg = (error?.message || String(error)).toLowerCase();
  const stack = (error?.stack || '').toLowerCase();
  
  let category: UnifiedError['category'] = 'unknown';
  let suggestion = 'An unexpected error occurred. Check the console for details.';
  let recoverable = true;

  if (msg.includes('webgl') || msg.includes('context lost') || msg.includes('gl_')) {
    category = 'webgl';
    suggestion = 'Try reloading the 3D viewport or checking your shader code.';
  } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to load')) {
    category = 'network';
    suggestion = 'Check your network connection and API endpoints.';
  } else if (msg.includes('compile') || msg.includes('parse') || stack.includes('compiler') || error?.line !== undefined) {
    category = 'compiler';
    suggestion = 'Check your HoloScript source for syntax and type errors.';
  } else if (stack.includes('react') || stack.includes('render') || msg.includes('hydration')) {
    category = 'render';
    suggestion = 'A UI component failed to render. Try reloading the panel.';
  }

  let astPath = error?.astPath || 'Unknown Node';
  if (astPath === 'Unknown Node' && componentStack) {
     astPath = extractASTPathFromStack(componentStack);
  }
  
  // Format line column if present from compiler
  if (error?.line !== undefined && error?.column !== undefined) {
     astPath = `${astPath} (Line ${error.line}:${error.column})`;
  }

  // Allow predefined UnifiedErrors to pass through directly
  if (error?.category) category = error.category as UnifiedError['category'];
  if (error?.suggestion) suggestion = error.suggestion;
  if (error?.recoverable !== undefined) recoverable = !!error.recoverable;

  const unified: UnifiedError = {
    category,
    message: error?.message || String(error),
    astPath,
    recoverable,
    suggestion,
    rawStack: error?.stack || stack,
  };

  // Safe parse to ensure exact match to schema
  const parsed = UnifiedErrorSchema.safeParse(unified);
  return parsed.success ? parsed.data : unified;
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
  unified: UnifiedError | null;
}

export class StudioErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, unified: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, unified: classifyError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const unified = classifyError(error, info.componentStack || '');
    
    this.setState({ unified });
    console.error(`[StudioErrorBoundary][${unified.category}] AST Path: ${unified.astPath}`, error, info.componentStack);

    // FDA 21 CFR Part 11: Export Electronic Audit Trail of specific crashes
    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(unified),
    }).catch((err) => {
      console.warn('[StudioErrorBoundary] Failed to securely log crash to Audit API', err);
    });
    
    this.props.onError?.(error, info);
  }

  private handleReset = () => {
    this.setState({ error: null, unified: null });
  };

  render() {
    const { error, unified } = this.state;
    const { children, label, fallback } = this.props;

    if (!error || !unified) return <>{children}</>;

    if (fallback) return <>{fallback}</>;

    const CATEGORY_LABELS: Record<UnifiedError['category'], string> = {
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
            {CATEGORY_LABELS[unified.category]}
          </span>
          <p className="mt-1 max-w-xs text-xs text-red-400/80">{unified.message}</p>
          {unified.astPath !== 'Unknown Node' && (
            <div className="mt-2 text-left rounded bg-red-950/40 p-2 border border-red-500/20">
              <p className="text-[10.5px] font-mono text-red-300 break-words flex items-start gap-1">
                <span className="text-red-500 mt-0.5">↳</span> {unified.astPath}
              </p>
            </div>
          )}
          <p className="mt-2 max-w-xs text-[10px] text-red-400/60 font-medium">{unified.suggestion}</p>
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
