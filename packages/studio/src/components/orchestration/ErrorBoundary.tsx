'use client';

/**
 * OrchestrationErrorBoundary - Error boundary for orchestration panels
 *
 * Provides graceful error handling for the 6 orchestration components:
 * - MCPServerConfigPanel
 * - AgentOrchestrationGraphEditor
 * - BehaviorTreeVisualEditor
 * - DesktopAgentEnsemble
 * - AgentEventMonitorPanel
 * - ToolCallGraphVisualizer
 *
 * Features:
 * - React error boundary lifecycle methods
 * - Graceful error UI with clear messaging
 * - Reset mechanism to recover from errors
 * - Console logging for debugging
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for orchestration panels
 *
 * Catches errors in child components and displays a user-friendly error message
 * with the option to retry. Logs detailed error information to console for debugging.
 */
export class OrchestrationErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /**
   * Update state when an error is caught
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /**
   * Log error details to console for debugging
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Orchestration component error:', error, errorInfo);
  }

  /**
   * Reset error state to retry rendering
   */
  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center bg-studio-panel">
          <div className="text-center max-w-md px-6">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-studio-text mb-2">
              Component Error
            </h2>
            <p className="text-sm text-studio-muted mt-2 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleReset}
              className="mt-4 px-4 py-2 bg-studio-accent text-studio-text rounded hover:bg-studio-accent/80 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
