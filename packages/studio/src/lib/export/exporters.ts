/**
 * Export Utility Functions for HoloScript Studio Orchestration Panels
 *
 * Provides export functions for workflows, behavior trees, and event logs
 * in multiple formats (JSON, TypeScript, CSV).
 */

import type { AgentWorkflow, BTNode, AgentEvent } from '../orchestrationStore';

// ============================================================================
// WORKFLOW EXPORT
// ============================================================================

/**
 * Export workflow as JSON string
 * @param workflow - The workflow to export
 * @returns JSON-formatted workflow string
 */
export function exportWorkflow(workflow: AgentWorkflow): string {
  return JSON.stringify(workflow, null, 2);
}

/**
 * Export workflow as TypeScript module
 * @param workflow - The workflow to export
 * @returns TypeScript module code with typed workflow export
 */
export function exportWorkflowAsTS(workflow: AgentWorkflow): string {
  return `import { AgentWorkflow } from '@/lib/orchestrationStore';

export const ${workflow.id}Workflow: AgentWorkflow = ${JSON.stringify(workflow, null, 2)};`;
}

// ============================================================================
// BEHAVIOR TREE EXPORT
// ============================================================================

/**
 * Export behavior tree as JSON string
 * @param tree - Array of behavior tree nodes to export
 * @returns JSON-formatted behavior tree string
 */
export function exportBehaviorTree(tree: BTNode[]): string {
  return JSON.stringify(tree, null, 2);
}

// ============================================================================
// EVENT LOG EXPORT
// ============================================================================

/**
 * Export events as CSV format
 * @param events - Array of agent events to export
 * @returns CSV-formatted string with header row
 */
export function exportEventsAsCSV(events: AgentEvent[]): string {
  const header = 'timestamp,topic,senderId,receivedBy,payload\n';
  const rows = events.map(e =>
    `${e.timestamp},"${e.topic}","${e.senderId}","${e.receivedBy.join(';')}","${JSON.stringify(e.payload).replace(/"/g, '""')}"`
  ).join('\n');
  return header + rows;
}

/**
 * Export events as JSON string
 * @param events - Array of agent events to export
 * @returns JSON-formatted events array string
 */
export function exportEventsAsJSON(events: AgentEvent[]): string {
  return JSON.stringify(events, null, 2);
}

// ============================================================================
// DOWNLOAD HELPER
// ============================================================================

/**
 * Trigger browser download of content as file
 * @param content - String content to download
 * @param filename - Name for downloaded file
 * @param mimeType - MIME type for file (default: application/json)
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'application/json'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// CONVENIENCE WRAPPER FUNCTIONS
// ============================================================================

/**
 * Export and download workflow as JSON
 * @param workflow - The workflow to export
 * @param filename - Optional custom filename (defaults to workflow name)
 */
export function downloadWorkflowJSON(workflow: AgentWorkflow, filename?: string): void {
  const content = exportWorkflow(workflow);
  const name = filename || `${workflow.name}-${workflow.id}.json`;
  downloadFile(content, name, 'application/json');
}

/**
 * Export and download workflow as TypeScript module
 * @param workflow - The workflow to export
 * @param filename - Optional custom filename (defaults to workflow name)
 */
export function downloadWorkflowTS(workflow: AgentWorkflow, filename?: string): void {
  const content = exportWorkflowAsTS(workflow);
  const name = filename || `${workflow.name}-${workflow.id}.ts`;
  downloadFile(content, name, 'text/typescript');
}

/**
 * Export and download behavior tree as JSON
 * @param tree - Array of behavior tree nodes to export
 * @param treeId - Identifier for the tree (used in filename)
 * @param filename - Optional custom filename
 */
export function downloadBehaviorTreeJSON(tree: BTNode[], treeId: string, filename?: string): void {
  const content = exportBehaviorTree(tree);
  const name = filename || `behavior-tree-${treeId}.json`;
  downloadFile(content, name, 'application/json');
}

/**
 * Export and download events as CSV
 * @param events - Array of agent events to export
 * @param filename - Optional custom filename (defaults to timestamped filename)
 */
export function downloadEventsCSV(events: AgentEvent[], filename?: string): void {
  const content = exportEventsAsCSV(events);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = filename || `agent-events-${timestamp}.csv`;
  downloadFile(content, name, 'text/csv');
}

/**
 * Export and download events as JSON
 * @param events - Array of agent events to export
 * @param filename - Optional custom filename (defaults to timestamped filename)
 */
export function downloadEventsJSON(events: AgentEvent[], filename?: string): void {
  const content = exportEventsAsJSON(events);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = filename || `agent-events-${timestamp}.json`;
  downloadFile(content, name, 'application/json');
}
