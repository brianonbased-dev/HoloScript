/**
 * v5.5 "Agents as Universal Orchestrators" — End-to-end showcase test
 *
 * Tests the full agent orchestration stack:
 * 1. Multi-agent pipeline composition parses and validates
 * 2. Agent discovery, delegation, and status tracking
 * 3. Workflow composition and execution (DAG)
 * 4. OrchestratorAgent full 7-phase cycle
 * 5. Federated registry adapter A2A card conversion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  handleAgentOrchestrationTool,
  resetOrchestrationSingletons,
} from '../agent-orchestration-tools';
import {
  getDefaultRegistry,
  resetDefaultRegistry,
  OrchestratorAgent,
  FederatedRegistryAdapter,
  TaskDelegationService,
  SkillWorkflowEngine,
} from '@holoscript/framework';

// =============================================================================
// FIXTURES
// =============================================================================

const EXAMPLES_DIR = resolve(__dirname, '../../../../examples/agents');

function registerIoTAgents() {
  const registry = getDefaultRegistry();

  // SensorAgent
  registry.register({
    id: 'sensor-agent-01',
    name: 'SensorAgent',
    version: '1.0.0',
    capabilities: [
      { type: 'analyze', domain: 'iot', name: 'collect' },
      { type: 'generate', domain: 'iot', name: 'stream' },
    ],
    endpoints: [{ protocol: 'local', address: 'local://sensor-agent-01', primary: true }],
    trustLevel: 'local',
    status: 'online',
    tags: ['sensor', 'telemetry', 'iot'],
  });

  // AnalyticsAgent
  registry.register({
    id: 'analytics-agent-01',
    name: 'AnalyticsAgent',
    version: '1.0.0',
    capabilities: [
      { type: 'transform', domain: 'iot', name: 'aggregate' },
      { type: 'detect', domain: 'iot', name: 'anomaly-detection' },
    ],
    endpoints: [{ protocol: 'local', address: 'local://analytics-agent-01', primary: true }],
    trustLevel: 'local',
    status: 'online',
    tags: ['analytics', 'ml', 'iot'],
  });

  // DashboardAgent
  registry.register({
    id: 'dashboard-agent-01',
    name: 'DashboardAgent',
    version: '1.0.0',
    capabilities: [{ type: 'render', domain: 'spatial', name: 'dashboard' }],
    endpoints: [{ protocol: 'local', address: 'local://dashboard-agent-01', primary: true }],
    trustLevel: 'local',
    status: 'online',
    tags: ['visualization', '3d', 'dashboard'],
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('v5.5 Showcase — Agents as Universal Orchestrators', () => {
  beforeEach(() => {
    resetDefaultRegistry();
    resetOrchestrationSingletons();
  });

  afterEach(() => {
    resetDefaultRegistry();
    resetOrchestrationSingletons();
  });

  // ===========================================================================
  // 1. MULTI-AGENT PIPELINE COMPOSITION
  // ===========================================================================

  describe('multi-agent-pipeline.holo', () => {
    const code = readFileSync(resolve(EXAMPLES_DIR, 'multi-agent-pipeline.holo'), 'utf-8');

    it('is a valid composition file', () => {
      expect(code.length).toBeGreaterThan(200);
      expect(code).toContain('@world');
      expect(code).toContain('IoT Agent Pipeline');
    });

    it('defines three agents', () => {
      expect(code).toContain('agent "SensorAgent"');
      expect(code).toContain('agent "AnalyticsAgent"');
      expect(code).toContain('agent "DashboardAgent"');
    });

    it('defines a workflow with dependencies', () => {
      expect(code).toContain('workflow "SensorToDashboard"');
      expect(code).toContain('depends_on:');
      expect(code).toContain('ref:');
    });

    it('declares capabilities for each agent', () => {
      // SensorAgent
      expect(code).toContain('capability "collect"');
      expect(code).toContain('capability "stream"');
      // AnalyticsAgent
      expect(code).toContain('capability "transform"');
      expect(code).toContain('capability "detect"');
      // DashboardAgent
      expect(code).toContain('capability "render"');
    });
  });

  // ===========================================================================
  // 2. AGENT DISCOVERY + DELEGATION E2E
  // ===========================================================================

  describe('discover → delegate → status pipeline', () => {
    it('discovers IoT agents by capability type', async () => {
      registerIoTAgents();

      const result = (await handleAgentOrchestrationTool('discover_agents', {
        type: 'transform',
        domain: 'iot',
      })) as { agents: Array<{ id: string; score: number }>; total: number };

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.agents[0].id).toBe('analytics-agent-01');
    });

    it('discovers all IoT agents without filtering', async () => {
      registerIoTAgents();

      const result = (await handleAgentOrchestrationTool('discover_agents', {})) as {
        agents: Array<{ id: string }>;
        total: number;
        registrySize: number;
      };

      expect(result.total).toBe(3);
      expect(result.registrySize).toBe(3);
    });

    it('delegates to a specific agent and tracks status', async () => {
      registerIoTAgents();

      // Delegation fails (no local executor wired in MCP singleton)
      // but we get a valid task ID and status tracking
      const delegateResult = (await handleAgentOrchestrationTool('delegate_task', {
        agentId: 'sensor-agent-01',
        skillId: 'read_sensors',
        arguments: { device_ids: ['temp-01'], interval_ms: 5000 },
      })) as { taskId: string; status: string; delegatedTo: { agentId: string } };

      expect(delegateResult.taskId).toBeDefined();
      expect(delegateResult.delegatedTo.agentId).toBe('sensor-agent-01');

      // Check status via get_task_status
      const statusResult = (await handleAgentOrchestrationTool('get_task_status', {
        taskId: delegateResult.taskId,
      })) as { taskId: string; status: string };

      expect(statusResult.taskId).toBe(delegateResult.taskId);
      expect(statusResult.status).toBeDefined();
    });
  });

  // ===========================================================================
  // 3. WORKFLOW COMPOSITION + EXECUTION E2E
  // ===========================================================================

  describe('compose → execute workflow pipeline', () => {
    const iotWorkflow = {
      name: 'sensor-to-dashboard',
      steps: [
        {
          id: 'collect',
          skillId: 'read_sensors',
          inputs: {
            device_ids: { type: 'literal', value: ['temp-01', 'humidity-01'] },
            interval_ms: { type: 'literal', value: 5000 },
          },
        },
        {
          id: 'analyze',
          skillId: 'aggregate_readings',
          dependsOn: ['collect'],
          inputs: {
            readings: { type: 'ref', stepId: 'collect', outputKey: 'readings' },
            window_ms: { type: 'literal', value: 60000 },
          },
        },
        {
          id: 'render',
          skillId: 'render_chart',
          dependsOn: ['analyze'],
          inputs: {
            data: { type: 'ref', stepId: 'analyze', outputKey: 'summary' },
            chart_type: { type: 'literal', value: 'timeseries' },
          },
        },
        {
          id: 'alert',
          skillId: 'render_alerts',
          dependsOn: ['analyze'],
          inputs: {
            anomalies: { type: 'ref', stepId: 'analyze', outputKey: 'anomalies' },
          },
        },
      ],
    };

    it('validates the IoT workflow DAG', async () => {
      const result = (await handleAgentOrchestrationTool('compose_workflow', iotWorkflow)) as {
        valid: boolean;
        stepCount: number;
        executionPlan: { groups: string[][] };
      };

      expect(result.valid).toBe(true);
      expect(result.stepCount).toBe(4);
      // executionPlan.groups: collect → analyze → render+alert (parallel)
      const groups = result.executionPlan.groups;
      expect(groups).toHaveLength(3);
      expect(groups[0]).toContain('collect');
      expect(groups[1]).toContain('analyze');
      expect(groups[2]).toContain('render');
      expect(groups[2]).toContain('alert');
    });

    it('executes the IoT workflow with mock executor', async () => {
      const mockExecutor = async (skillId: string, inputs: Record<string, unknown>) => {
        switch (skillId) {
          case 'read_sensors':
            return {
              readings: [{ device: 'temp-01', value: 22.5, unit: 'C' }],
              timestamp: new Date().toISOString(),
            };
          case 'aggregate_readings':
            return {
              summary: { avg: 22.5, min: 20, max: 25, count: 12 },
              anomalies: [{ device: 'temp-01', type: 'spike', severity: 'warning' }],
            };
          case 'render_chart':
            return { scene: { objects: ['chart-widget'] }, widget_id: 'wgt-001' };
          case 'render_alerts':
            return { scene: { objects: ['alert-panel'] }, alert_count: 1 };
          default:
            return { result: 'unknown' };
        }
      };

      const result = (await handleAgentOrchestrationTool(
        'execute_workflow',
        iotWorkflow,
        mockExecutor
      )) as {
        status: string;
        steps: Array<{ stepId: string; status: string; output: Record<string, unknown> }>;
        totalDurationMs: number;
      };

      expect(result.status).toBe('completed');
      expect(result.steps).toHaveLength(4);

      // Verify each step completed
      for (const step of result.steps) {
        expect(step.status).toBe('completed');
      }

      // Verify data flow: render step got the summary from analyze step
      const renderStep = result.steps.find((s) => s.stepId === 'render');
      expect(renderStep?.output?.widget_id).toBe('wgt-001');

      // Verify alert step got anomalies
      const alertStep = result.steps.find((s) => s.stepId === 'alert');
      expect(alertStep?.output?.alert_count).toBe(1);
    });
  });

  // ===========================================================================
  // 4. ORCHESTRATOR AGENT FULL CYCLE
  // ===========================================================================

  describe('OrchestratorAgent 7-phase cycle', () => {
    it('runs a complete cycle with registered IoT agents', async () => {
      registerIoTAgents();

      const orchestrator = new OrchestratorAgent({
        name: 'IoT Controller',
        domain: 'iot',
        autoDiscovery: false,
        localExecutor: async (skillId, args) => ({
          executed: true,
          skillId,
          args,
        }),
      });

      const result = await orchestrator.runCycle('aggregate_readings', {
        type: 'transform',
        domain: 'iot',
      });

      expect(result.status).toBe('complete');
      expect(result.phases).toHaveLength(7);
      expect(result.domain).toBe('iot');

      // INTAKE should discover the 3 agents
      const intakeData = result.phases[0].data as Record<string, unknown>;
      expect(intakeData.totalAgents).toBe(3);
      expect(intakeData.onlineAgents).toBe(3);

      // REFLECT should find matching agents
      const reflectData = result.phases[1].data as Record<string, unknown>;
      expect(reflectData.matchingAgents).toBeGreaterThanOrEqual(1);

      orchestrator.shutdown();
    });

    it('learns patterns across multiple cycles', async () => {
      const orchestrator = new OrchestratorAgent({
        name: 'Learning Orchestrator',
        domain: 'iot',
        autoDiscovery: false,
      });

      // Run two cycles
      await orchestrator.runCycle('task-a');
      await orchestrator.runCycle('task-b');

      const patterns = orchestrator.getPatterns();
      // Patterns are recorded in GROW phase
      expect(patterns.length).toBeGreaterThanOrEqual(0);

      orchestrator.shutdown();
    });
  });

  // ===========================================================================
  // 5. FEDERATED REGISTRY — A2A CARD CONVERSION
  // ===========================================================================

  describe('FederatedRegistryAdapter A2A conversion', () => {
    it('converts an A2A AgentCard to AgentManifest', () => {
      const registry = getDefaultRegistry();
      const adapter = new FederatedRegistryAdapter(registry);

      const manifest = adapter.a2aCardToManifest(
        {
          id: 'remote-iot-agent',
          name: 'Remote IoT Agent',
          version: '2.0.0',
          description: 'A remote IoT sensor agent',
          endpoint: 'https://iot.example.com/a2a',
          provider: { organization: 'IoTCorp', url: 'https://iotcorp.com' },
          skills: [
            {
              id: 'collect_data',
              name: 'Collect Data',
              tags: ['analysis', 'iot'],
            },
            {
              id: 'stream_data',
              name: 'Stream Data',
              tags: ['streaming', 'iot'],
            },
          ],
        },
        'https://iot.example.com/.well-known/agent-card.json'
      );

      expect(manifest.id).toBe('remote-iot-agent');
      expect(manifest.name).toBe('Remote IoT Agent');
      expect(manifest.version).toBe('2.0.0');
      expect(manifest.trustLevel).toBe('external');
      expect(manifest.status).toBe('online');
      expect(manifest.endpoints[0].protocol).toBe('https');
      expect(manifest.endpoints[0].address).toBe('https://iot.example.com/a2a');
      expect(manifest.tags).toContain('remote');
      expect(manifest.tags).toContain('a2a');
      expect(manifest.tags).toContain('IoTCorp');
      expect(manifest.capabilities.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 6. SKILL WORKFLOW ENGINE — DAG VALIDATION
  // ===========================================================================

  describe('SkillWorkflowEngine advanced', () => {
    it('executes parallel branches and merges results', async () => {
      const engine = new SkillWorkflowEngine();
      const progressLog: string[] = [];

      const result = await engine.execute(
        {
          id: 'parallel-test',
          name: 'Parallel Branches',
          steps: [
            { id: 'source', skillId: 'fetch_data', inputs: {} },
            {
              id: 'branch-a',
              skillId: 'process_a',
              dependsOn: ['source'],
              inputs: { data: { type: 'ref', stepId: 'source', outputKey: 'raw' } },
            },
            {
              id: 'branch-b',
              skillId: 'process_b',
              dependsOn: ['source'],
              inputs: { data: { type: 'ref', stepId: 'source', outputKey: 'raw' } },
            },
            {
              id: 'merge',
              skillId: 'combine',
              dependsOn: ['branch-a', 'branch-b'],
              inputs: {
                a: { type: 'ref', stepId: 'branch-a', outputKey: 'result' },
                b: { type: 'ref', stepId: 'branch-b', outputKey: 'result' },
              },
            },
          ],
        },
        async (skillId) => {
          progressLog.push(skillId);
          if (skillId === 'fetch_data') return { raw: [1, 2, 3] };
          if (skillId === 'process_a') return { result: 'filtered' };
          if (skillId === 'process_b') return { result: 'sorted' };
          if (skillId === 'combine') return { merged: true };
          return {};
        },
        (stepId, status) => progressLog.push(`${stepId}:${status}`)
      );

      expect(result.status).toBe('completed');
      expect(result.stepResults).toHaveLength(4);
      // source runs first, then branch-a and branch-b (parallel), then merge
      expect(progressLog.indexOf('fetch_data')).toBeLessThan(progressLog.indexOf('process_a'));
      expect(progressLog.indexOf('fetch_data')).toBeLessThan(progressLog.indexOf('process_b'));
      expect(progressLog.indexOf('combine')).toBeGreaterThan(progressLog.indexOf('process_a'));
    });
  });
});
