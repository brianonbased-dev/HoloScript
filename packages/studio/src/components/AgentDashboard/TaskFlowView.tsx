'use client';

/**
 * TaskFlowView — Task State Machine + Message Thread + Artifact Display
 *
 * Visualizes the A2A task lifecycle with a state machine diagram,
 * multi-turn message thread, and artifact renderer (code, text, JSON).
 */

import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  FileCode2,
  FileText,
  FileJson,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Task, TaskState, TaskMessage, TaskArtifact } from './types';

export interface TaskFlowViewProps {
  task: Task;
  className?: string;
}

// =============================================================================
// STATE MACHINE CONSTANTS
// =============================================================================

const STATES: TaskState[] = [
  'submitted',
  'working',
  'input-required',
  'completed',
  'failed',
];

const STATE_META: Record<
  TaskState,
  { label: string; color: string; bgClass: string; textClass: string; Icon: typeof Send }
> = {
  submitted: {
    label: 'Submitted',
    color: '#6b7280',
    bgClass: 'bg-gray-500/20',
    textClass: 'text-gray-300',
    Icon: Send,
  },
  working: {
    label: 'Working',
    color: '#3b82f6',
    bgClass: 'bg-blue-500/20',
    textClass: 'text-blue-300',
    Icon: Loader2,
  },
  'input-required': {
    label: 'Input Required',
    color: '#f59e0b',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-300',
    Icon: AlertCircle,
  },
  completed: {
    label: 'Completed',
    color: '#10b981',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-300',
    Icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    color: '#ef4444',
    bgClass: 'bg-red-500/20',
    textClass: 'text-red-300',
    Icon: XCircle,
  },
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** State machine diagram rendered with CSS flexbox */
function StateMachineDiagram({ currentState }: { currentState: TaskState }) {
  const currentIdx = STATES.indexOf(currentState);

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2" role="img" aria-label={`Task state: ${currentState}`}>
      {STATES.map((state, i) => {
        const meta = STATE_META[state];
        const isCurrent = state === currentState;
        const isPast = i < currentIdx;
        // For failed/completed, only highlight up to current
        const isReachable = i <= currentIdx;

        return (
          <React.Fragment key={state}>
            {i > 0 && (
              <div
                className={`h-0.5 flex-1 min-w-[12px] ${
                  isPast ? 'bg-studio-accent/60' : 'bg-studio-border/40'
                }`}
                aria-hidden="true"
              />
            )}
            <div
              className={`flex flex-col items-center shrink-0 ${
                isCurrent ? 'scale-110' : ''
              } transition-transform`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                  isCurrent
                    ? `border-current ${meta.bgClass} ${meta.textClass}`
                    : isPast
                    ? 'border-studio-accent/40 bg-studio-accent/10 text-studio-accent/60'
                    : 'border-studio-border/30 bg-studio-panel/20 text-studio-muted/40'
                }`}
              >
                <meta.Icon
                  className={`h-3.5 w-3.5 ${
                    isCurrent && state === 'working' ? 'animate-spin' : ''
                  }`}
                />
              </div>
              <span
                className={`text-[8px] mt-0.5 whitespace-nowrap ${
                  isCurrent ? meta.textClass + ' font-semibold' : 'text-studio-muted/50'
                }`}
              >
                {meta.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Artifact display with syntax-appropriate rendering */
function ArtifactView({ artifact }: { artifact: TaskArtifact }) {
  const [expanded, setExpanded] = useState(false);

  const IconMap: Record<string, typeof FileCode2> = {
    code: FileCode2,
    text: FileText,
    json: FileJson,
  };
  const Icon = IconMap[artifact.type] || FileText;

  return (
    <div className="border border-studio-border/30 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 bg-studio-panel/30 hover:bg-studio-panel/50 transition-colors text-left"
        aria-expanded={expanded}
        aria-label={`Toggle artifact: ${artifact.name}`}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-studio-muted" />
        ) : (
          <ChevronRight className="h-3 w-3 text-studio-muted" />
        )}
        <Icon className="h-3 w-3 text-studio-accent" />
        <span className="text-[10px] text-studio-text font-medium truncate flex-1">
          {artifact.name}
        </span>
        <span className="text-[9px] text-studio-muted uppercase">{artifact.type}</span>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-[10px] text-studio-text/80 bg-studio-surface/30 overflow-x-auto max-h-[200px] overflow-y-auto font-mono leading-relaxed">
          {artifact.type === 'json'
            ? tryFormatJson(artifact.content)
            : artifact.content}
        </pre>
      )}
    </div>
  );
}

function tryFormatJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

/** Single message in the conversation thread */
function MessageBubble({ message }: { message: TaskMessage }) {
  const isAgent = message.role === 'agent';

  return (
    <div
      className={`flex flex-col gap-1 ${isAgent ? 'items-start' : 'items-end'}`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
          isAgent
            ? 'bg-studio-panel/60 text-studio-text'
            : 'bg-studio-accent/20 text-studio-accent'
        }`}
      >
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[9px] font-semibold uppercase text-studio-muted">
            {message.role}
          </span>
          <span className="text-[8px] text-studio-muted/60">
            {new Date(message.timestamp).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>

      {/* Inline artifacts */}
      {message.artifacts && message.artifacts.length > 0 && (
        <div className="max-w-[85%] space-y-1">
          {message.artifacts.map((artifact) => (
            <ArtifactView key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function TaskFlowView({ task, className = '' }: TaskFlowViewProps) {
  const stateMeta = STATE_META[task.state];

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Task header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-studio-text truncate flex-1">
          {task.title}
        </h3>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${stateMeta.bgClass} ${stateMeta.textClass}`}
          data-testid={`task-state-badge-${task.state}`}
        >
          <stateMeta.Icon
            className={`h-3 w-3 ${task.state === 'working' ? 'animate-spin' : ''}`}
          />
          {stateMeta.label}
        </span>
      </div>

      {/* State machine visualization */}
      <StateMachineDiagram currentState={task.state} />

      {/* Error display */}
      {task.error && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300">{task.error}</p>
        </div>
      )}

      {/* Message thread */}
      {task.messages.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
            Messages ({task.messages.length})
          </h4>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {task.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        </div>
      )}

      {/* Task-level artifacts */}
      {task.artifacts.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
            Artifacts ({task.artifacts.length})
          </h4>
          {task.artifacts.map((artifact) => (
            <ArtifactView key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}

      {/* Timestamps */}
      <div className="flex items-center gap-3 text-[9px] text-studio-muted/60">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Created: {new Date(task.createdAt).toLocaleString('en-US', { hour12: false })}
        </span>
        {task.completedAt && (
          <span>
            Completed: {new Date(task.completedAt).toLocaleString('en-US', { hour12: false })}
          </span>
        )}
      </div>
    </div>
  );
}
