/**
 * @hololand/react-agent-sdk - AgentErrorBoundary Component
 *
 * Error boundary for agent failures
 */

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, resetError: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * AgentErrorBoundary Component
 *
 * Catches and handles errors in agent operations
 *
 * @example
 * ```tsx
 * <AgentErrorBoundary
 *   fallback={(error, reset) => (
 *     <div>
 *       <h2>Agent Error</h2>
 *       <p>{error.message}</p>
 *       <button onClick={reset}>Retry</button>
 *     </div>
 *   )}
 *   onError={(error) => console.error('Agent error:', error)}
 * >
 *   <MyAgentComponent />
 * </AgentErrorBoundary>
 * ```
 */
export class AgentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      return (
        <div className="agent-error-boundary">
          <div className="agent-error-boundary__content">
            <h2 className="agent-error-boundary__title">Agent Error</h2>
            <p className="agent-error-boundary__message">{this.state.error.message}</p>
            <button className="agent-error-boundary__reset-button" onClick={this.resetError}>
              Try Again
            </button>
          </div>

          <style
            dangerouslySetInnerHTML={{
              __html: `
            .agent-error-boundary {
              padding: 40px;
              background: #ffebee;
              border-radius: 8px;
              text-align: center;
            }

            .agent-error-boundary__content {
              max-width: 500px;
              margin: 0 auto;
            }

            .agent-error-boundary__title {
              color: #d32f2f;
              margin-bottom: 16px;
            }

            .agent-error-boundary__message {
              color: #333;
              margin-bottom: 24px;
              font-family: monospace;
            }

            .agent-error-boundary__reset-button {
              padding: 10px 20px;
              background: #d32f2f;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.2s;
            }

            .agent-error-boundary__reset-button:hover {
              background: #c62828;
            }
          `,
            }}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
