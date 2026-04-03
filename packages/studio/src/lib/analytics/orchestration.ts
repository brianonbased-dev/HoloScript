import { logger } from '@/lib/logger';
/**
 * orchestration.ts - Analytics tracking for orchestration features
 *
 * Tracks panel usage, tool calls, workflow execution, and template usage.
 * Integrates with Google Analytics (gtag) if available.
 */

declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
  }
}

export interface OrchestrationEventProps {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Track an orchestration event to analytics
 *
 * @param event Event name (e.g., 'panel_opened', 'workflow_executed')
 * @param props Event properties
 */
export function trackOrchestrationEvent(event: string, props: OrchestrationEventProps = {}) {
  // Send to Google Analytics if available
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', event, {
      event_category: 'orchestration',
      ...props,
    });
  }

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    logger.debug('[Analytics]', event, props);
  }
}

// ── Panel Events ──────────────────────────────────────────────────────────────

export function trackPanelOpened(panelName: string) {
  trackOrchestrationEvent('panel_opened', {
    panel_name: panelName,
    timestamp: Date.now(),
  });
}

export function trackPanelClosed(panelName: string, durationMs: number) {
  trackOrchestrationEvent('panel_closed', {
    panel_name: panelName,
    duration_ms: durationMs,
  });
}

// ── MCP Server Events ─────────────────────────────────────────────────────────

export function trackMCPServerConnected(serverName: string, toolCount: number) {
  trackOrchestrationEvent('mcp_server_connected', {
    server_name: serverName,
    tool_count: toolCount,
  });
}

export function trackMCPServerDisconnected(serverName: string) {
  trackOrchestrationEvent('mcp_server_disconnected', {
    server_name: serverName,
  });
}

export function trackToolCallSuccess(toolName: string, serverName: string, durationMs: number) {
  trackOrchestrationEvent('tool_call_success', {
    tool_name: toolName,
    server_name: serverName,
    duration_ms: durationMs,
  });
}

export function trackToolCallFailure(toolName: string, serverName: string, errorMessage: string) {
  trackOrchestrationEvent('tool_call_failure', {
    tool_name: toolName,
    server_name: serverName,
    error: errorMessage,
  });
}

// ── Workflow Events ───────────────────────────────────────────────────────────

export function trackWorkflowCreated(workflowId: string) {
  trackOrchestrationEvent('workflow_created', {
    workflow_id: workflowId,
  });
}

export function trackWorkflowExecuted(
  workflowId: string,
  nodeCount: number,
  executionTimeMs: number,
  success: boolean
) {
  trackOrchestrationEvent('workflow_executed', {
    workflow_id: workflowId,
    node_count: nodeCount,
    execution_time_ms: executionTimeMs,
    success,
  });
}

export function trackWorkflowNodeAdded(workflowId: string, nodeType: string) {
  trackOrchestrationEvent('workflow_node_added', {
    workflow_id: workflowId,
    node_type: nodeType,
  });
}

export function trackWorkflowSaved(workflowId: string, nodeCount: number, edgeCount: number) {
  trackOrchestrationEvent('workflow_saved', {
    workflow_id: workflowId,
    node_count: nodeCount,
    edge_count: edgeCount,
  });
}

// ── Behavior Tree Events ──────────────────────────────────────────────────────

export function trackBehaviorTreeCreated(treeId: string) {
  trackOrchestrationEvent('behavior_tree_created', {
    tree_id: treeId,
  });
}

export function trackBehaviorTreeNodeAdded(treeId: string, nodeType: string) {
  trackOrchestrationEvent('behavior_tree_node_added', {
    tree_id: treeId,
    node_type: nodeType,
  });
}

export function trackBehaviorTreeExecuted(
  treeId: string,
  nodeCount: number,
  executionTimeMs: number,
  status: 'success' | 'failure' | 'running'
) {
  trackOrchestrationEvent('behavior_tree_executed', {
    tree_id: treeId,
    node_count: nodeCount,
    execution_time_ms: executionTimeMs,
    status,
  });
}

// ── Template Events ───────────────────────────────────────────────────────────

export function trackTemplateLoaded(
  templateId: string,
  templateType: 'workflow' | 'behavior_tree'
) {
  trackOrchestrationEvent('template_loaded', {
    template_id: templateId,
    template_type: templateType,
  });
}

export function trackTemplateBrowserOpened() {
  trackOrchestrationEvent('template_browser_opened');
}

export function trackTemplateSearched(query: string, resultsCount: number) {
  trackOrchestrationEvent('template_searched', {
    query,
    results_count: resultsCount,
  });
}

// ── Agent Ensemble Events ─────────────────────────────────────────────────────

export function trackAgentPositionChanged(agentId: string, x: number, y: number) {
  trackOrchestrationEvent('agent_position_changed', {
    agent_id: agentId,
    x,
    y,
  });
}

export function trackAgentEnsembleOpened(agentCount: number) {
  trackOrchestrationEvent('agent_ensemble_opened', {
    agent_count: agentCount,
  });
}

// ── Event Monitor Events ──────────────────────────────────────────────────────

export function trackEventMonitorOpened(eventCount: number) {
  trackOrchestrationEvent('event_monitor_opened', {
    event_count: eventCount,
  });
}

export function trackEventMonitorFiltered(filterType: string, filterValue: string) {
  trackOrchestrationEvent('event_monitor_filtered', {
    filter_type: filterType,
    filter_value: filterValue,
  });
}

export function trackEventMonitorCleared(eventCountCleared: number) {
  trackOrchestrationEvent('event_monitor_cleared', {
    event_count_cleared: eventCountCleared,
  });
}

// ── Undo/Redo Events ──────────────────────────────────────────────────────────

export function trackUndoPerformed(context: string, historyPosition: number) {
  trackOrchestrationEvent('undo_performed', {
    context,
    history_position: historyPosition,
  });
}

export function trackRedoPerformed(context: string, historyPosition: number) {
  trackOrchestrationEvent('redo_performed', {
    context,
    history_position: historyPosition,
  });
}

// ── Export/Import Events ──────────────────────────────────────────────────────

export function trackWorkflowExported(workflowId: string, format: 'json' | 'typescript') {
  trackOrchestrationEvent('workflow_exported', {
    workflow_id: workflowId,
    format,
  });
}

export function trackBehaviorTreeExported(treeId: string, format: 'json' | 'dsl') {
  trackOrchestrationEvent('behavior_tree_exported', {
    tree_id: treeId,
    format,
  });
}

export function trackWorkflowImported(success: boolean, errorMessage?: string) {
  trackOrchestrationEvent('workflow_imported', {
    success,
    error: errorMessage,
  });
}

// ── Error Events ──────────────────────────────────────────────────────────────

export function trackOrchestrationError(
  component: string,
  errorMessage: string,
  errorStack?: string
) {
  trackOrchestrationEvent('orchestration_error', {
    component,
    error_message: errorMessage,
    error_stack: errorStack,
  });
}

// ── Session Metrics ───────────────────────────────────────────────────────────

let sessionStartTime = Date.now();
const panelOpenTimes: Record<string, number> = {};

export function trackSessionStart() {
  sessionStartTime = Date.now();
  trackOrchestrationEvent('session_started');
}

export function trackSessionEnd() {
  const sessionDuration = Date.now() - sessionStartTime;
  trackOrchestrationEvent('session_ended', {
    session_duration_ms: sessionDuration,
  });
}

/**
 * Track panel open time for duration calculation
 */
export function recordPanelOpenTime(panelName: string) {
  panelOpenTimes[panelName] = Date.now();
}

/**
 * Get panel open duration and clear tracking
 */
export function getPanelDuration(panelName: string): number {
  const openTime = panelOpenTimes[panelName];
  if (!openTime) return 0;

  const duration = Date.now() - openTime;
  delete panelOpenTimes[panelName];
  return duration;
}

// ── Aggregated Stats ──────────────────────────────────────────────────────────

export interface OrchestrationStats {
  totalWorkflows: number;
  totalBehaviorTrees: number;
  totalToolCalls: number;
  totalEvents: number;
  mostUsedServer: string | null;
  averageWorkflowNodes: number;
  averageExecutionTime: number;
}

let statsCache: OrchestrationStats = {
  totalWorkflows: 0,
  totalBehaviorTrees: 0,
  totalToolCalls: 0,
  totalEvents: 0,
  mostUsedServer: null,
  averageWorkflowNodes: 0,
  averageExecutionTime: 0,
};

export function updateStats(stats: Partial<OrchestrationStats>) {
  statsCache = { ...statsCache, ...stats };
}

export function getStats(): OrchestrationStats {
  return { ...statsCache };
}

export function trackStatsSnapshot() {
  trackOrchestrationEvent('stats_snapshot', statsCache as unknown as OrchestrationEventProps);
}
