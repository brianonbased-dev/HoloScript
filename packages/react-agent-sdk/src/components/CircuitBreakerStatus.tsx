/**
 * @hololand/react-agent-sdk - CircuitBreakerStatus Component
 *
 * Circuit state visualization
 */

import React from 'react';
import { useCircuitBreaker } from '../hooks';
import type { CircuitBreakerStatusProps } from '../types';

/**
 * CircuitBreakerStatus Component
 *
 * Displays circuit breaker state with visual indicators and metrics
 *
 * @example
 * ```tsx
 * <CircuitBreakerStatus
 *   queryName="myAgent"
 *   showMetrics
 * />
 * ```
 */
export function CircuitBreakerStatus({
  queryName,
  showMetrics = true,
  className = '',
  style = {},
}: CircuitBreakerStatusProps): JSX.Element {
  const { state, failureRate, lastError, reset, status } = useCircuitBreaker(queryName);

  return (
    <div className={`circuit-breaker ${className}`} style={style}>
      {/* Circuit State Indicator */}
      <div className="circuit-breaker__header">
        <div className={`circuit-breaker__indicator circuit-breaker__indicator--${state}`}>
          <div className="circuit-breaker__indicator-light" />
        </div>
        <div className="circuit-breaker__state">
          <div className="circuit-breaker__state-label">Circuit State</div>
          <div className="circuit-breaker__state-value">{state.toUpperCase()}</div>
        </div>
      </div>

      {/* Metrics */}
      {showMetrics && (
        <div className="circuit-breaker__metrics">
          <div className="circuit-breaker__metric">
            <span className="circuit-breaker__metric-label">Failure Rate:</span>
            <span className="circuit-breaker__metric-value">{(failureRate * 100).toFixed(2)}%</span>
          </div>

          <div className="circuit-breaker__metric">
            <span className="circuit-breaker__metric-label">Failures:</span>
            <span className="circuit-breaker__metric-value">{status.failureCount}</span>
          </div>

          <div className="circuit-breaker__metric">
            <span className="circuit-breaker__metric-label">Successes:</span>
            <span className="circuit-breaker__metric-value">{status.successCount}</span>
          </div>

          {status.timeUntilClose !== undefined && status.timeUntilClose > 0 && (
            <div className="circuit-breaker__metric">
              <span className="circuit-breaker__metric-label">Retry in:</span>
              <span className="circuit-breaker__metric-value">
                {Math.ceil(status.timeUntilClose / 1000)}s
              </span>
            </div>
          )}
        </div>
      )}

      {/* Last Error */}
      {lastError && (
        <div className="circuit-breaker__error">
          <div className="circuit-breaker__error-label">Last Error:</div>
          <div className="circuit-breaker__error-message">{lastError.message}</div>
        </div>
      )}

      {/* Reset Button */}
      {state === 'open' && (
        <button className="circuit-breaker__reset-button" onClick={reset}>
          Reset Circuit
        </button>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .circuit-breaker {
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: #ffffff;
        }

        .circuit-breaker__header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }

        .circuit-breaker__indicator {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid;
        }

        .circuit-breaker__indicator--closed {
          border-color: #4caf50;
          background: #e8f5e9;
        }

        .circuit-breaker__indicator--half-open {
          border-color: #ff9800;
          background: #fff3e0;
        }

        .circuit-breaker__indicator--open {
          border-color: #f44336;
          background: #ffebee;
        }

        .circuit-breaker__indicator-light {
          width: 20px;
          height: 20px;
          border-radius: 50%;
        }

        .circuit-breaker__indicator--closed .circuit-breaker__indicator-light {
          background: #4caf50;
          box-shadow: 0 0 8px #4caf50;
        }

        .circuit-breaker__indicator--half-open .circuit-breaker__indicator-light {
          background: #ff9800;
          box-shadow: 0 0 8px #ff9800;
        }

        .circuit-breaker__indicator--open .circuit-breaker__indicator-light {
          background: #f44336;
          box-shadow: 0 0 8px #f44336;
        }

        .circuit-breaker__state-label {
          font-size: 12px;
          color: #999;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .circuit-breaker__state-value {
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .circuit-breaker__metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .circuit-breaker__metric {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .circuit-breaker__metric-label {
          font-size: 12px;
          color: #666;
        }

        .circuit-breaker__metric-value {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .circuit-breaker__error {
          padding: 12px;
          background: #fff3e0;
          border-left: 4px solid #ff9800;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .circuit-breaker__error-label {
          font-size: 12px;
          font-weight: 600;
          color: #f57c00;
          margin-bottom: 4px;
        }

        .circuit-breaker__error-message {
          font-size: 14px;
          color: #333;
          font-family: monospace;
        }

        .circuit-breaker__reset-button {
          width: 100%;
          padding: 10px 16px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .circuit-breaker__reset-button:hover {
          background: #1565c0;
        }

        .circuit-breaker__reset-button:active {
          background: #0d47a1;
        }
      `,
        }}
      />
    </div>
  );
}
