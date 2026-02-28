/**
 * Test and Usage Examples for Export Utility Functions
 *
 * This file demonstrates how to use the export functions with sample data.
 */

import { describe, it, expect } from 'vitest';

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
// TESTS
// ============================================================================

describe('Export Utility Functions', () => {
  it('exportWorkflow() returns valid JSON string', () => {
    const json = exportWorkflow(sampleWorkflow);
    expect(json.length).toBeGreaterThan(0);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('Scene Generation Pipeline');
  });

  it('exportWorkflowAsTS() returns TypeScript code', () => {
    const ts = exportWorkflowAsTS(sampleWorkflow);
    expect(ts.length).toBeGreaterThan(0);
    expect(ts).toContain('Scene Generation Pipeline');
  });

  it('exportBehaviorTree() returns valid JSON with nodes', () => {
    const json = exportBehaviorTree(sampleBehaviorTree);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(3);
  });

  it('exportEventsAsCSV() returns CSV with header row', () => {
    const csv = exportEventsAsCSV(sampleEvents);
    expect(csv.length).toBeGreaterThan(0);
    expect(csv.split('\n').length).toBeGreaterThan(1);
  });

  it('exportEventsAsJSON() returns valid JSON array', () => {
    const json = exportEventsAsJSON(sampleEvents);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(3);
  });
});

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

export {
  sampleWorkflow,
  sampleBehaviorTree,
  sampleEvents,
};
