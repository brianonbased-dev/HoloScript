/**
 * Test and Usage Examples for Export Utility Functions
 *
 * This file demonstrates how to use the export functions with sample data.
 */

import type { AgentWorkflow, BTNode, AgentEvent } from './orchestrationStore';
import {
  exportWorkflow,
  exportWorkflowAsTS,
  exportBehaviorTree,
  exportEventsAsCSV,
  exportEventsAsJSON,
  downloadWorkflowJSON,
  downloadWorkflowTS,
  downloadBehaviorTreeJSON,
  downloadEventsCSV,
  downloadEventsJSON,
} from './exporters';

// ============================================================================
// SAMPLE DATA
// ============================================================================

const sampleWorkflow: AgentWorkflow = {
  id: 'workflow_1234567890_abc123',
  name: 'Scene Generation Pipeline',
  description: 'Multi-agent workflow for creating 3D scenes',
  nodes: [
    {
      id: 'node_1',
      type: 'agent',
      label: 'Scene Designer',
      position: { x: 100, y: 100 },
      data: {
        type: 'agent',
        agentId: 'art-director',
        systemPrompt: 'You are a creative scene designer.',
        temperature: 0.8,
        tools: ['generate_layout', 'suggest_assets'],
        maxTokens: 2000,
      },
    },
    {
      id: 'node_2',
      type: 'tool',
      label: 'Asset Loader',
      position: { x: 300, y: 100 },
      data: {
        type: 'tool',
        server: 'brittney-hololand',
        toolName: 'load_assets',
        args: { category: 'environment' },
        timeout: 5000,
      },
    },
  ],
  edges: [
    {
      id: 'edge_1',
      source: 'node_1',
      target: 'node_2',
      label: 'Assets selected',
    },
  ],
  createdAt: new Date('2026-02-28T10:00:00Z'),
  updatedAt: new Date('2026-02-28T11:30:00Z'),
};

const sampleBehaviorTree: BTNode[] = [
  {
    id: 'bt_root',
    type: 'sequence',
    label: 'Root Sequence',
    position: { x: 200, y: 50 },
    children: ['bt_check', 'bt_action'],
    data: {},
  },
  {
    id: 'bt_check',
    type: 'condition',
    label: 'Check Scene Loaded',
    position: { x: 100, y: 150 },
    data: {
      conditionCode: 'return scene.isLoaded === true;',
    },
  },
  {
    id: 'bt_action',
    type: 'action',
    label: 'Render Scene',
    position: { x: 300, y: 150 },
    data: {
      actionCode: 'renderer.render(scene, camera);',
    },
  },
];

const sampleEvents: AgentEvent[] = [
  {
    id: 'event_1',
    topic: 'scene.created',
    payload: { sceneId: 'scene_001', name: 'Forest Environment' },
    senderId: 'art-director',
    timestamp: Date.now() - 60000,
    receivedBy: ['animator', 'physics'],
  },
  {
    id: 'event_2',
    topic: 'asset.loaded',
    payload: { assetId: 'tree_001', type: 'model' },
    senderId: 'brittney',
    timestamp: Date.now() - 30000,
    receivedBy: ['art-director'],
  },
  {
    id: 'event_3',
    topic: 'animation.completed',
    payload: { animationId: 'wind_sway', duration: 2.5 },
    senderId: 'animator',
    timestamp: Date.now(),
    receivedBy: ['physics', 'sound'],
  },
];

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

console.log('=== Export Utility Function Examples ===\n');

// 1. Workflow Export (JSON)
console.log('1. Workflow JSON Export:');
const workflowJSON = exportWorkflow(sampleWorkflow);
console.log(workflowJSON.substring(0, 200) + '...\n');

// 2. Workflow Export (TypeScript)
console.log('2. Workflow TypeScript Export:');
const workflowTS = exportWorkflowAsTS(sampleWorkflow);
console.log(workflowTS.substring(0, 200) + '...\n');

// 3. Behavior Tree Export
console.log('3. Behavior Tree JSON Export:');
const btJSON = exportBehaviorTree(sampleBehaviorTree);
console.log(btJSON.substring(0, 200) + '...\n');

// 4. Events CSV Export
console.log('4. Events CSV Export:');
const eventsCSV = exportEventsAsCSV(sampleEvents);
console.log(eventsCSV.substring(0, 300) + '...\n');

// 5. Events JSON Export
console.log('5. Events JSON Export:');
const eventsJSON = exportEventsAsJSON(sampleEvents);
console.log(eventsJSON.substring(0, 200) + '...\n');

// ============================================================================
// DOWNLOAD EXAMPLES (commented out to prevent browser interaction in tests)
// ============================================================================

/*
// Download workflow as JSON
downloadWorkflowJSON(sampleWorkflow);
// Downloads: "Scene Generation Pipeline-workflow_1234567890_abc123.json"

// Download workflow as TypeScript module
downloadWorkflowTS(sampleWorkflow);
// Downloads: "Scene Generation Pipeline-workflow_1234567890_abc123.ts"

// Download behavior tree as JSON
downloadBehaviorTreeJSON(sampleBehaviorTree, 'main-tree');
// Downloads: "behavior-tree-main-tree.json"

// Download events as CSV
downloadEventsCSV(sampleEvents);
// Downloads: "agent-events-2026-02-28T12-00-00-000Z.csv"

// Download events as JSON
downloadEventsJSON(sampleEvents);
// Downloads: "agent-events-2026-02-28T12-00-00-000Z.json"

// Custom filenames
downloadWorkflowJSON(sampleWorkflow, 'my-custom-workflow.json');
downloadEventsCSV(sampleEvents, 'event-log-backup.csv');
*/

// ============================================================================
// INTEGRATION EXAMPLE WITH ORCHESTRATION STORE
// ============================================================================

/*
// Example of integrating with React component using orchestrationStore

import { useOrchestrationStore } from './orchestrationStore';
import { downloadWorkflowJSON, downloadEventsCSV } from './exporters';

function WorkflowExportButton() {
  const workflows = useOrchestrationStore((state) => state.workflows);
  const activeWorkflow = useOrchestrationStore((state) => state.activeWorkflow);

  const handleExport = () => {
    if (!activeWorkflow) return;
    const workflow = workflows.get(activeWorkflow);
    if (workflow) {
      downloadWorkflowJSON(workflow);
    }
  };

  return (
    <button onClick={handleExport} disabled={!activeWorkflow}>
      Export Workflow
    </button>
  );
}

function EventLogExportButton() {
  const events = useOrchestrationStore((state) => state.events);

  const handleExportCSV = () => {
    downloadEventsCSV(events);
  };

  const handleExportJSON = () => {
    downloadEventsJSON(events);
  };

  return (
    <div>
      <button onClick={handleExportCSV}>Export Events (CSV)</button>
      <button onClick={handleExportJSON}>Export Events (JSON)</button>
    </div>
  );
}
*/

export {
  sampleWorkflow,
  sampleBehaviorTree,
  sampleEvents,
};
