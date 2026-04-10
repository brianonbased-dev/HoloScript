/**
 * Degraded Mode Banner Component
 *
 * Displays user-friendly banner when circuit breakers are open
 * Shows which services are affected and expected recovery time
 */

import React, { useEffect, useState } from 'react';
import { CircuitState } from './CircuitBreaker';
import { GraphQLCircuitBreakerClient } from './GraphQLCircuitBreakerClient';

export interface DegradedModeBannerProps {
  /** GraphQL client instance */
  client: GraphQLCircuitBreakerClient;
  /** Refresh interval for checking circuit states (ms) */
  refreshInterval?: number;
  /** Custom CSS class */
  className?: string;
  /** Position of banner */
  position?: 'top' | 'bottom';
  /** Enable auto-dismiss when recovered */
  autoDismiss?: boolean;
}

interface CircuitStatus {
  operationName: string;
  state: CircuitState;
  failureRate: number;
  estimatedRecoveryTime?: Date;
}

/**
 * Degraded Mode Banner Component
 */
export const DegradedModeBanner: React.FC<DegradedModeBannerProps> = ({
  client,
  refreshInterval = 5000,
  className = '',
  position = 'top',
  autoDismiss = true,
}) => {
  const [openCircuits, setOpenCircuits] = useState<CircuitStatus[]>([]);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Initial check
    checkCircuitStates();

    // Set up polling
    const interval = setInterval(checkCircuitStates, refreshInterval);

    return () => clearInterval(interval);
  }, [client, refreshInterval]);

  const checkCircuitStates = () => {
    const stats = client.getCircuitStats();
    const open = stats.filter((stat) => stat.state === CircuitState.OPEN);

    setOpenCircuits(
      open.map((stat) => ({
        operationName: stat.operationName,
        state: stat.state,
        failureRate: stat.failureRate,
        estimatedRecoveryTime: new Date(Date.now() + 30000), // 30s from now
      }))
    );

    // Auto-dismiss if all circuits recovered
    if (autoDismiss && open.length === 0 && openCircuits.length > 0) {
      setIsDismissed(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Don't render if no open circuits or dismissed
  if (openCircuits.length === 0 || isDismissed) {
    return null;
  }

  const positionStyles =
    position === 'top' ? { top: 0, left: 0, right: 0 } : { bottom: 0, left: 0, right: 0 };

  return (
    <div
      className={`degraded-mode-banner ${className}`}
      style={{
        position: 'fixed',
        zIndex: 9999,
        backgroundColor: '#fff3cd',
        borderBottom: position === 'top' ? '2px solid #ffc107' : undefined,
        borderTop: position === 'bottom' ? '2px solid #ffc107' : undefined,
        padding: '12px 16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        ...positionStyles,
      }}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
          {/* Warning Icon */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#856404"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>

          {/* Message */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: '#856404', marginBottom: '4px' }}>
              Service Degraded
            </div>
            <div style={{ fontSize: '14px', color: '#856404' }}>
              {openCircuits.length === 1
                ? `${openCircuits[0].operationName} is currently unavailable.`
                : `${openCircuits.length} services are currently unavailable.`}{' '}
              Showing cached or fallback data. Attempting automatic recovery...
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: '#fff',
                  borderRadius: '4px',
                  border: '1px solid #ffc107',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#856404' }}>
                  Affected Services:
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {openCircuits.map((circuit, index) => (
                    <li key={index} style={{ marginBottom: '6px', color: '#856404' }}>
                      <strong>{circuit.operationName}</strong>
                      <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '2px' }}>
                        Failure rate: {(circuit.failureRate * 100).toFixed(1)}%
                        {circuit.estimatedRecoveryTime && (
                          <>
                            {' '}
                            • Retry in ~
                            {Math.round(
                              (circuit.estimatedRecoveryTime.getTime() - Date.now()) / 1000
                            )}
                            s
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {openCircuits.length > 1 && (
            <button
              onClick={handleExpand}
              style={{
                padding: '6px 12px',
                backgroundColor: 'transparent',
                border: '1px solid #856404',
                borderRadius: '4px',
                color: '#856404',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
              }}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Hide details' : 'Show details'}
            >
              {isExpanded ? 'Hide Details' : 'Details'}
            </button>
          )}

          <button
            onClick={handleDismiss}
            style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: '#856404',
              lineHeight: 1,
            }}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      <div
        style={{
          marginTop: '8px',
          height: '2px',
          backgroundColor: '#fff',
          borderRadius: '1px',
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-label="Recovery progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={50}
      >
        <div
          style={{
            height: '100%',
            width: '50%',
            backgroundColor: '#ffc107',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        />
      </div>

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}
      </style>
    </div>
  );
};

/**
 * Hook for monitoring circuit breaker states
 */
export const useDegradedMode = (client: GraphQLCircuitBreakerClient, refreshInterval = 5000) => {
  const [isDegraded, setIsDegraded] = useState(false);
  const [openCircuits, setOpenCircuits] = useState<string[]>([]);

  useEffect(() => {
    const checkHealth = () => {
      const health = client.getSystemHealth();
      setIsDegraded(health.degradedMode);

      const stats = client.getCircuitStats();
      const open = stats
        .filter((stat) => stat.state === CircuitState.OPEN)
        .map((stat) => stat.operationName);

      setOpenCircuits(open);
    };

    checkHealth();
    const interval = setInterval(checkHealth, refreshInterval);

    return () => clearInterval(interval);
  }, [client, refreshInterval]);

  return { isDegraded, openCircuits };
};

/**
 * Simple text-based degraded mode indicator (for non-React apps)
 */
export class DegradedModeIndicator {
  private element: HTMLDivElement | null = null;

  constructor(
    private client: GraphQLCircuitBreakerClient,
    private container: HTMLElement = document.body
  ) {}

  /**
   * Show degraded mode indicator
   */
  show(openCircuits: string[]): void {
    if (this.element) {
      this.update(openCircuits);
      return;
    }

    this.element = document.createElement('div');
    this.element.className = 'degraded-mode-indicator';
    this.element.setAttribute('role', 'alert');
    this.element.setAttribute('aria-live', 'polite');

    this.update(openCircuits);
    this.container.appendChild(this.element);
  }

  /**
   * Update indicator content
   */
  private update(openCircuits: string[]): void {
    if (!this.element) return;

    const message =
      openCircuits.length === 1
        ? `Service degraded: ${openCircuits[0]}`
        : `Service degraded: ${openCircuits.length} services affected`;

    this.element.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #fff3cd;
        border-bottom: 2px solid #ffc107;
        padding: 12px 16px;
        z-index: 9999;
        font-family: system-ui, -apple-system, sans-serif;
        color: #856404;
      ">
        ⚠️ ${message} - Showing cached data
      </div>
    `;
  }

  /**
   * Hide indicator
   */
  hide(): void {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }

  /**
   * Start monitoring circuit states
   */
  startMonitoring(intervalMs: number = 5000): void {
    setInterval(() => {
      const stats = this.client.getCircuitStats();
      const open = stats
        .filter((stat) => stat.state === CircuitState.OPEN)
        .map((stat) => stat.operationName);

      if (open.length > 0) {
        this.show(open);
      } else {
        this.hide();
      }
    }, intervalMs);
  }
}
