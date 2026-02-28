/**
 * @hololand/react-agent-sdk - TaskMonitor Component
 *
 * Visual task progress indicator
 */

import React from 'react';
import { useTaskStatus } from '../hooks';
import type { TaskMonitorProps } from '../types';

/**
 * TaskMonitor Component
 *
 * Displays real-time task progress with logs and phase information
 *
 * @example
 * ```tsx
 * <TaskMonitor
 *   taskId="task-123"
 *   showLogs
 *   showProgress
 *   showPhase
 * />
 * ```
 */
export function TaskMonitor({
  taskId,
  showLogs = true,
  showProgress = true,
  showPhase = true,
  className = '',
  style = {},
}: TaskMonitorProps): JSX.Element {
  const { status, progress, estimatedTime, logs, phase } = useTaskStatus(taskId);

  return (
    <div className={`task-monitor ${className}`} style={style}>
      {/* Status Badge */}
      <div className="task-monitor__status">
        <span className={`task-monitor__status-badge task-monitor__status-badge--${status}`}>
          {status}
        </span>
      </div>

      {/* Progress Bar */}
      {showProgress && (
        <div className="task-monitor__progress">
          <div className="task-monitor__progress-bar">
            <div
              className="task-monitor__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="task-monitor__progress-text">{progress}%</span>
        </div>
      )}

      {/* Phase Info */}
      {showPhase && phase && (
        <div className="task-monitor__phase">
          <span className="task-monitor__phase-label">Phase:</span>
          <span className="task-monitor__phase-value">{phase}</span>
        </div>
      )}

      {/* Estimated Time */}
      {estimatedTime !== undefined && (
        <div className="task-monitor__eta">
          <span className="task-monitor__eta-label">ETA:</span>
          <span className="task-monitor__eta-value">
            {Math.ceil(estimatedTime / 1000)}s
          </span>
        </div>
      )}

      {/* Logs */}
      {showLogs && logs.length > 0 && (
        <div className="task-monitor__logs">
          <div className="task-monitor__logs-header">Logs</div>
          <div className="task-monitor__logs-content">
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className={`task-monitor__log task-monitor__log--${log.level}`}
              >
                <span className="task-monitor__log-time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="task-monitor__log-level">[{log.level}]</span>
                <span className="task-monitor__log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .task-monitor {
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: #ffffff;
        }

        .task-monitor__status {
          margin-bottom: 12px;
        }

        .task-monitor__status-badge {
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
        }

        .task-monitor__status-badge--idle {
          background: #f5f5f5;
          color: #666;
        }

        .task-monitor__status-badge--pending {
          background: #fff3e0;
          color: #f57c00;
        }

        .task-monitor__status-badge--running {
          background: #e3f2fd;
          color: #1976d2;
        }

        .task-monitor__status-badge--success {
          background: #e8f5e9;
          color: #388e3c;
        }

        .task-monitor__status-badge--error {
          background: #ffebee;
          color: #d32f2f;
        }

        .task-monitor__status-badge--cancelled {
          background: #fce4ec;
          color: #c2185b;
        }

        .task-monitor__progress {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .task-monitor__progress-bar {
          flex: 1;
          height: 8px;
          background: #f5f5f5;
          border-radius: 4px;
          overflow: hidden;
        }

        .task-monitor__progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #1976d2, #42a5f5);
          transition: width 0.3s ease;
        }

        .task-monitor__progress-text {
          font-size: 14px;
          font-weight: 500;
          color: #666;
        }

        .task-monitor__phase,
        .task-monitor__eta {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 14px;
        }

        .task-monitor__phase-label,
        .task-monitor__eta-label {
          color: #666;
        }

        .task-monitor__phase-value,
        .task-monitor__eta-value {
          font-weight: 500;
          color: #333;
        }

        .task-monitor__logs {
          margin-top: 16px;
          border-top: 1px solid #e0e0e0;
          padding-top: 16px;
        }

        .task-monitor__logs-header {
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
        }

        .task-monitor__logs-content {
          max-height: 200px;
          overflow-y: auto;
          font-family: monospace;
          font-size: 12px;
        }

        .task-monitor__log {
          display: flex;
          gap: 8px;
          padding: 4px 0;
        }

        .task-monitor__log-time {
          color: #999;
        }

        .task-monitor__log-level {
          font-weight: 600;
        }

        .task-monitor__log--debug .task-monitor__log-level {
          color: #666;
        }

        .task-monitor__log--info .task-monitor__log-level {
          color: #1976d2;
        }

        .task-monitor__log--warn .task-monitor__log-level {
          color: #f57c00;
        }

        .task-monitor__log--error .task-monitor__log-level {
          color: #d32f2f;
        }

        .task-monitor__log-message {
          color: #333;
        }
      ` }} />
    </div>
  );
}
