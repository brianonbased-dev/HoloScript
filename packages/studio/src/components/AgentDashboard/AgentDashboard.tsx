'use client';

/**
 * AgentDashboard — Main Dashboard for A2A Agent Visualization
 *
 * Composes AgentCard list, task timeline/history with state badges,
 * TaskFlowView detail pane, and EconomyPanel for x402 payment flows.
 * Designed for the HoloScript Studio workspace.
 */

import React, { useState, useMemo } from 'react';
import { Users, ListTodo, Activity, Search, ChevronRight } from 'lucide-react';
import { AgentCard } from './AgentCard';
import { TaskFlowView } from './TaskFlowView';
import { EconomyPanel } from './EconomyPanel';
import type { Agent, Task, TaskState, AgentDashboardProps } from './types';

// =============================================================================
// TASK STATE BADGE HELPERS
// =============================================================================

const TASK_STATE_BADGE: Record<TaskState, { label: string; bgClass: string; textClass: string }> = {
  submitted: { label: 'Submitted', bgClass: 'bg-gray-500/20', textClass: 'text-gray-300' },
  working: { label: 'Working', bgClass: 'bg-blue-500/20', textClass: 'text-blue-300' },
  'input-required': {
    label: 'Input Required',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-300',
  },
  completed: { label: 'Completed', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-300' },
  failed: { label: 'Failed', bgClass: 'bg-red-500/20', textClass: 'text-red-300' },
};

type TabId = 'agents' | 'tasks' | 'economy';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function AgentDashboard({
  agents,
  tasks,
  transactions,
  settlementStats,
  onAgentSelect,
  onTaskSelect,
  className = '',
}: AgentDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('agents');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Derived State ────────────────────────────────────────────────────────

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const filteredAgents = useMemo(() => {
    if (!searchQuery) return agents;
    const q = searchQuery.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.skills.some((s) => s.name.toLowerCase().includes(q))
    );
  }, [agents, searchQuery]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (selectedAgentId) {
      result = result.filter((t) => t.agentId === selectedAgentId);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }
    // Sort by most recent first
    return [...result].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [tasks, selectedAgentId, searchQuery]);

  // ── Stat Counters ────────────────────────────────────────────────────────

  const agentsByStatus = useMemo(() => {
    const online = agents.filter((a) => a.status === 'online').length;
    const offline = agents.filter((a) => a.status === 'offline').length;
    const error = agents.filter((a) => a.status === 'error').length;
    return { online, offline, error };
  }, [agents]);

  const tasksByState = useMemo(() => {
    const counts: Record<TaskState, number> = {
      submitted: 0,
      working: 0,
      'input-required': 0,
      completed: 0,
      failed: 0,
    };
    for (const t of tasks) {
      counts[t.state]++;
    }
    return counts;
  }, [tasks]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAgentSelect = (agent: Agent) => {
    setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id);
    onAgentSelect?.(agent);
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTaskId(task.id === selectedTaskId ? null : task.id);
    onTaskSelect?.(task);
  };

  // ── Tab Config ───────────────────────────────────────────────────────────

  const TABS: { id: TabId; label: string; Icon: typeof Users; count: number }[] = [
    { id: 'agents', label: 'Agents', Icon: Users, count: agents.length },
    { id: 'tasks', label: 'Tasks', Icon: ListTodo, count: tasks.length },
    { id: 'economy', label: 'Economy', Icon: Activity, count: transactions.length },
  ];

  return (
    <div className={`flex flex-col h-full bg-studio-panel text-studio-text ${className}`}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-studio-border px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-studio-text">Agent Dashboard</h2>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-studio-muted">{agentsByStatus.online} online</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-studio-muted">{tasksByState.working} active</span>
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-studio-surface rounded-md px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            type="text"
            placeholder="Search agents, tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-[11px] text-studio-text outline-none placeholder-studio-muted"
            aria-label="Search agents and tasks"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-2" role="tablist" aria-label="Dashboard sections">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            if (isActive) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`tab-${tab.id}`}
                  role="tab"
                  aria-selected="true"
                  aria-controls={`panel-${tab.id}`}
                  aria-label={`${tab.label} panel`}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors bg-studio-accent/15 text-studio-accent"
                >
                  <tab.Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  <span className="ml-0.5 px-1.5 py-0.5 rounded text-[9px] bg-studio-accent/20 text-studio-accent">
                    {tab.count}
                  </span>
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected="false"
                aria-controls={`panel-${tab.id}`}
                aria-label={`${tab.label} panel`}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors text-studio-muted hover:text-studio-text hover:bg-studio-panel/60"
              >
                <tab.Icon className="h-3.5 w-3.5" />
                {tab.label}
                <span className="ml-0.5 px-1.5 py-0.5 rounded text-[9px] bg-studio-border/30 text-studio-muted">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left panel: list */}
        <div
          className="w-[300px] shrink-0 border-r border-studio-border overflow-y-auto p-3"
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {/* AGENTS TAB */}
          {activeTab === 'agents' && (
            <div className="space-y-2">
              {filteredAgents.length === 0 && (
                <p className="text-studio-muted text-[11px] text-center py-6">
                  {searchQuery ? 'No matching agents' : 'No agents connected'}
                </p>
              )}
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  selected={agent.id === selectedAgentId}
                  onSelect={handleAgentSelect}
                />
              ))}
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === 'tasks' && (
            <div className="space-y-1">
              {/* Task state filter chips */}
              <div className="flex flex-wrap gap-1 mb-2">
                {(Object.keys(TASK_STATE_BADGE) as TaskState[]).map((state) => {
                  const badge = TASK_STATE_BADGE[state];
                  const count = tasksByState[state];
                  return (
                    <span
                      key={state}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ${badge.bgClass} ${badge.textClass}`}
                    >
                      {badge.label}
                      <span className="font-bold">{count}</span>
                    </span>
                  );
                })}
              </div>

              {/* Task list */}
              {filteredTasks.length === 0 && (
                <p className="text-studio-muted text-[11px] text-center py-6">
                  {searchQuery ? 'No matching tasks' : 'No tasks yet'}
                </p>
              )}
              {filteredTasks.map((task) => {
                const badge = TASK_STATE_BADGE[task.state];
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleTaskSelect(task)}
                    className={`w-full text-left rounded-md p-2 transition-colors border ${
                      task.id === selectedTaskId
                        ? 'border-studio-accent bg-studio-accent/10'
                        : 'border-studio-border/30 bg-studio-panel/20 hover:bg-studio-panel/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-studio-text truncate flex-1">
                        {task.title}
                      </span>
                      <ChevronRight className="h-3 w-3 text-studio-muted shrink-0" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.bgClass} ${badge.textClass}`}
                        data-testid={`task-badge-${task.state}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[9px] text-studio-muted">
                        {new Date(task.updatedAt).toLocaleTimeString('en-US', {
                          hour12: false,
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ECONOMY TAB */}
          {activeTab === 'economy' && (
            <EconomyPanel transactions={transactions} stats={settlementStats} />
          )}
        </div>

        {/* Right panel: detail view */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'agents' && selectedAgent && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-studio-text">
                Tasks for {selectedAgent.name}
              </h3>
              {filteredTasks.filter((t) => t.agentId === selectedAgent.id).length === 0 ? (
                <p className="text-studio-muted text-[11px]">No tasks for this agent.</p>
              ) : (
                <div className="space-y-4">
                  {filteredTasks
                    .filter((t) => t.agentId === selectedAgent.id)
                    .map((task) => (
                      <TaskFlowView key={task.id} task={task} />
                    ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'agents' && !selectedAgent && (
            <div className="flex items-center justify-center h-full text-studio-muted text-[12px]">
              Select an agent to view its tasks
            </div>
          )}

          {activeTab === 'tasks' && selectedTask && <TaskFlowView task={selectedTask} />}

          {activeTab === 'tasks' && !selectedTask && (
            <div className="flex items-center justify-center h-full text-studio-muted text-[12px]">
              Select a task to view details
            </div>
          )}

          {activeTab === 'economy' && (
            <div className="flex items-center justify-center h-full text-studio-muted text-[12px]">
              Economy overview is shown in the left panel
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
