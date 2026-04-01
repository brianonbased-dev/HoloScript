/**
 * Built-in Behavior Tree Templates for HoloScript Studio
 *
 * Pre-configured behavior trees for common AI behaviors.
 */

import type { BTNode, WorkflowEdge } from '../orchestrationStore';

export interface BehaviorTreeTemplate {
  id: string;
  name: string;
  description: string;
  category: 'behavior-tree';
  nodes: BTNode[];
  edges: WorkflowEdge[];
  tags: string[];
}

export const BEHAVIOR_TREE_TEMPLATES: BehaviorTreeTemplate[] = [
  {
    id: 'agent-patrol',
    name: 'Agent Patrol Behavior',
    description: 'AI agent patrols waypoints and investigates points of interest',
    category: 'behavior-tree',
    tags: ['patrol', 'navigation', 'ai', 'guard'],
    nodes: [
      {
        id: 'root',
        type: 'selector',
        label: 'Root Selector',
        position: { x: 400, y: 50 },
        data: {},
      },
      {
        id: 'threat_detected_seq',
        type: 'sequence',
        label: 'Threat Detected',
        position: { x: 200, y: 150 },
        data: {},
      },
      {
        id: 'check_threat',
        type: 'condition',
        label: 'Threat Nearby?',
        position: { x: 100, y: 250 },
        data: {
          conditionCode: 'return detectThreats().length > 0',
        },
      },
      {
        id: 'investigate',
        type: 'action',
        label: 'Investigate',
        position: { x: 250, y: 250 },
        data: {
          actionCode: 'moveToThreat(); investigateArea();',
        },
      },
      {
        id: 'patrol_seq',
        type: 'sequence',
        label: 'Patrol Route',
        position: { x: 600, y: 150 },
        data: {},
      },
      {
        id: 'check_waypoint',
        type: 'condition',
        label: 'Has Waypoint?',
        position: { x: 500, y: 250 },
        data: {
          conditionCode: 'return getCurrentWaypoint() !== null',
        },
      },
      {
        id: 'move_to_waypoint',
        type: 'action',
        label: 'Move to Waypoint',
        position: { x: 650, y: 250 },
        data: {
          actionCode: 'const wp = getCurrentWaypoint(); moveTo(wp); markVisited(wp);',
        },
      },
      {
        id: 'next_waypoint',
        type: 'action',
        label: 'Next Waypoint',
        position: { x: 800, y: 250 },
        data: {
          actionCode: 'setNextWaypoint();',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'threat_detected_seq' },
      { id: 'e2', source: 'root', target: 'patrol_seq' },
      { id: 'e3', source: 'threat_detected_seq', target: 'check_threat' },
      { id: 'e4', source: 'threat_detected_seq', target: 'investigate' },
      { id: 'e5', source: 'patrol_seq', target: 'check_waypoint' },
      { id: 'e6', source: 'patrol_seq', target: 'move_to_waypoint' },
      { id: 'e7', source: 'patrol_seq', target: 'next_waypoint' },
    ],
  },
  {
    id: 'resource-management',
    name: 'Resource Management',
    description: 'Prioritize and allocate resources based on needs and availability',
    category: 'behavior-tree',
    tags: ['resources', 'management', 'strategy'],
    nodes: [
      {
        id: 'root',
        type: 'sequence',
        label: 'Resource Manager',
        position: { x: 400, y: 50 },
        data: {},
      },
      {
        id: 'assess_needs',
        type: 'action',
        label: 'Assess Needs',
        position: { x: 200, y: 150 },
        data: {
          actionCode: 'const needs = assessResourceNeeds(); prioritizeNeeds(needs);',
        },
      },
      {
        id: 'allocation_selector',
        type: 'selector',
        label: 'Allocation Strategy',
        position: { x: 400, y: 150 },
        data: {},
      },
      {
        id: 'critical_seq',
        type: 'sequence',
        label: 'Critical Priority',
        position: { x: 200, y: 250 },
        data: {},
      },
      {
        id: 'check_critical',
        type: 'condition',
        label: 'Critical Need?',
        position: { x: 100, y: 350 },
        data: {
          conditionCode: 'return hasCriticalNeeds()',
        },
      },
      {
        id: 'allocate_critical',
        type: 'action',
        label: 'Allocate to Critical',
        position: { x: 250, y: 350 },
        data: {
          actionCode: 'allocateResources(getCriticalNeeds());',
        },
      },
      {
        id: 'normal_seq',
        type: 'sequence',
        label: 'Normal Priority',
        position: { x: 500, y: 250 },
        data: {},
      },
      {
        id: 'check_available',
        type: 'condition',
        label: 'Resources Available?',
        position: { x: 450, y: 350 },
        data: {
          conditionCode: 'return getAvailableResources() > 0',
        },
      },
      {
        id: 'distribute',
        type: 'action',
        label: 'Distribute Evenly',
        position: { x: 600, y: 350 },
        data: {
          actionCode: 'distributeResourcesEvenly();',
        },
      },
      {
        id: 'verify',
        type: 'action',
        label: 'Verify Allocation',
        position: { x: 600, y: 150 },
        data: {
          actionCode: 'verifyAllocation(); logResourceUsage();',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'assess_needs' },
      { id: 'e2', source: 'root', target: 'allocation_selector' },
      { id: 'e3', source: 'root', target: 'verify' },
      { id: 'e4', source: 'allocation_selector', target: 'critical_seq' },
      { id: 'e5', source: 'allocation_selector', target: 'normal_seq' },
      { id: 'e6', source: 'critical_seq', target: 'check_critical' },
      { id: 'e7', source: 'critical_seq', target: 'allocate_critical' },
      { id: 'e8', source: 'normal_seq', target: 'check_available' },
      { id: 'e9', source: 'normal_seq', target: 'distribute' },
    ],
  },
  {
    id: 'combat-ai',
    name: 'Combat AI',
    description: 'Enemy behavior with decision making for attack, defense, and retreat',
    category: 'behavior-tree',
    tags: ['combat', 'enemy', 'ai', 'decision'],
    nodes: [
      {
        id: 'root',
        type: 'selector',
        label: 'Combat Root',
        position: { x: 400, y: 50 },
        data: {},
      },
      {
        id: 'retreat_seq',
        type: 'sequence',
        label: 'Retreat',
        position: { x: 150, y: 150 },
        data: {},
      },
      {
        id: 'check_low_health',
        type: 'condition',
        label: 'Low Health?',
        position: { x: 50, y: 250 },
        data: {
          conditionCode: 'return getHealth() < 0.3',
        },
      },
      {
        id: 'flee',
        type: 'action',
        label: 'Flee to Safety',
        position: { x: 200, y: 250 },
        data: {
          actionCode: 'findSafeLocation(); moveToSafety();',
        },
      },
      {
        id: 'attack_seq',
        type: 'sequence',
        label: 'Attack',
        position: { x: 400, y: 150 },
        data: {},
      },
      {
        id: 'check_in_range',
        type: 'condition',
        label: 'Enemy in Range?',
        position: { x: 300, y: 250 },
        data: {
          conditionCode: 'return isEnemyInRange()',
        },
      },
      {
        id: 'select_attack',
        type: 'selector',
        label: 'Select Attack',
        position: { x: 450, y: 250 },
        data: {},
      },
      {
        id: 'special_attack',
        type: 'sequence',
        label: 'Special Attack',
        position: { x: 350, y: 350 },
        data: {},
      },
      {
        id: 'check_cooldown',
        type: 'condition',
        label: 'Special Ready?',
        position: { x: 300, y: 450 },
        data: {
          conditionCode: 'return isSpecialAttackReady()',
        },
      },
      {
        id: 'do_special',
        type: 'action',
        label: 'Execute Special',
        position: { x: 450, y: 450 },
        data: {
          actionCode: 'executeSpecialAttack();',
        },
      },
      {
        id: 'basic_attack',
        type: 'action',
        label: 'Basic Attack',
        position: { x: 600, y: 350 },
        data: {
          actionCode: 'executeBasicAttack();',
        },
      },
      {
        id: 'patrol',
        type: 'action',
        label: 'Patrol Area',
        position: { x: 650, y: 150 },
        data: {
          actionCode: 'patrolArea(); scanForEnemies();',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'retreat_seq' },
      { id: 'e2', source: 'root', target: 'attack_seq' },
      { id: 'e3', source: 'root', target: 'patrol' },
      { id: 'e4', source: 'retreat_seq', target: 'check_low_health' },
      { id: 'e5', source: 'retreat_seq', target: 'flee' },
      { id: 'e6', source: 'attack_seq', target: 'check_in_range' },
      { id: 'e7', source: 'attack_seq', target: 'select_attack' },
      { id: 'e8', source: 'select_attack', target: 'special_attack' },
      { id: 'e9', source: 'select_attack', target: 'basic_attack' },
      { id: 'e10', source: 'special_attack', target: 'check_cooldown' },
      { id: 'e11', source: 'special_attack', target: 'do_special' },
    ],
  },
  {
    id: 'task-planner',
    name: 'Task Planning Agent',
    description: 'AI agent that plans and executes tasks with retry logic',
    category: 'behavior-tree',
    tags: ['planning', 'tasks', 'retry'],
    nodes: [
      {
        id: 'root',
        type: 'sequence',
        label: 'Task Planner',
        position: { x: 400, y: 50 },
        data: {},
      },
      {
        id: 'analyze',
        type: 'action',
        label: 'Analyze Task',
        position: { x: 200, y: 150 },
        data: {
          actionCode: 'const task = getCurrentTask(); analyzeRequirements(task);',
        },
      },
      {
        id: 'retry_wrapper',
        type: 'retry',
        label: 'Retry (3x)',
        position: { x: 400, y: 150 },
        data: {
          maxRetries: 3,
        },
      },
      {
        id: 'execution_seq',
        type: 'sequence',
        label: 'Execute Plan',
        position: { x: 400, y: 250 },
        data: {},
      },
      {
        id: 'plan',
        type: 'action',
        label: 'Create Plan',
        position: { x: 250, y: 350 },
        data: {
          actionCode: 'const plan = createExecutionPlan(); validatePlan(plan);',
        },
      },
      {
        id: 'timeout_wrapper',
        type: 'timeout',
        label: 'Timeout (30s)',
        position: { x: 400, y: 350 },
        data: {
          timeoutMs: 30000,
        },
      },
      {
        id: 'execute',
        type: 'action',
        label: 'Execute',
        position: { x: 400, y: 450 },
        data: {
          actionCode: 'executePlan();',
        },
      },
      {
        id: 'validate',
        type: 'action',
        label: 'Validate Result',
        position: { x: 550, y: 350 },
        data: {
          actionCode: 'validateExecution(); logResults();',
        },
      },
      {
        id: 'report',
        type: 'action',
        label: 'Report Status',
        position: { x: 600, y: 150 },
        data: {
          actionCode: 'reportTaskStatus(); updateMetrics();',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'analyze' },
      { id: 'e2', source: 'root', target: 'retry_wrapper' },
      { id: 'e3', source: 'root', target: 'report' },
      { id: 'e4', source: 'retry_wrapper', target: 'execution_seq' },
      { id: 'e5', source: 'execution_seq', target: 'plan' },
      { id: 'e6', source: 'execution_seq', target: 'timeout_wrapper' },
      { id: 'e7', source: 'execution_seq', target: 'validate' },
      { id: 'e8', source: 'timeout_wrapper', target: 'execute' },
    ],
  },

  // ── IoT Orchestration Templates (domain-agnostic) ─────────────────────────

  {
    id: 'sensor-threshold-monitor',
    name: 'Sensor Threshold Monitor',
    description: 'Generic multi-sensor threshold monitor. Reads N sensors, compares against target ranges, actuates corrective devices when breached. Works for any IoT domain — climate, agriculture, manufacturing, building management.',
    category: 'behavior-tree',
    tags: ['iot', 'sensor', 'threshold', 'actuator', 'monitoring', 'digital-twin'],
    nodes: [
      { id: 'root', type: 'sequence', label: 'Monitor Cycle', position: { x: 400, y: 50 }, data: {} },
      { id: 'read_sensors', type: 'action', label: 'Read All Sensors', position: { x: 200, y: 150 }, data: { actionCode: 'const readings = zone.sensors.map(s => ({ id: s.id, value: sensor(s.id).value, target: s.target, range: s.range })); blackboard.set("readings", readings);' } },
      { id: 'check_thresholds', type: 'selector', label: 'Check Thresholds', position: { x: 400, y: 150 }, data: {} },
      { id: 'all_ok', type: 'condition', label: 'All In Range?', position: { x: 300, y: 250 }, data: { conditionCode: 'return blackboard.get("readings").every(r => r.value >= r.range[0] && r.value <= r.range[1])' } },
      { id: 'actuate_corrections', type: 'action', label: 'Actuate Corrections', position: { x: 500, y: 250 }, data: { actionCode: 'const breached = blackboard.get("readings").filter(r => r.value < r.range[0] || r.value > r.range[1]); for (const b of breached) { const actuator = zone.getActuatorFor(b.id); if (actuator) actuate(actuator.id, { target: b.target }); } log("threshold", "corrected", breached.length);' } },
      { id: 'snapshot', type: 'action', label: 'Log Telemetry', position: { x: 600, y: 150 }, data: { actionCode: 'captureSnapshot("monitoring"); attestResult();' } },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'read_sensors' },
      { id: 'e2', source: 'root', target: 'check_thresholds' },
      { id: 'e3', source: 'root', target: 'snapshot' },
      { id: 'e4', source: 'check_thresholds', target: 'all_ok' },
      { id: 'e5', source: 'check_thresholds', target: 'actuate_corrections' },
    ],
  },
  {
    id: 'scheduled-process',
    name: 'Scheduled Process Executor',
    description: 'Runs a configurable process on schedule or when conditions are met. Checks preconditions, executes steps in sequence, logs compliance data with attestation. Works for any scheduled operation — irrigation, dosing, maintenance, inspection.',
    category: 'behavior-tree',
    tags: ['iot', 'schedule', 'process', 'compliance', 'automation', 'digital-twin'],
    nodes: [
      { id: 'root', type: 'sequence', label: 'Process Cycle', position: { x: 400, y: 50 }, data: {} },
      { id: 'precondition_sel', type: 'selector', label: 'Check Preconditions', position: { x: 200, y: 150 }, data: {} },
      { id: 'preconditions_met', type: 'condition', label: 'Preconditions OK?', position: { x: 100, y: 250 }, data: { conditionCode: 'return process.preconditions.every(p => evaluate(p))' } },
      { id: 'skip', type: 'action', label: 'Skip — Not Ready', position: { x: 300, y: 250 }, data: { actionCode: 'log("process", "skipped_preconditions");' } },
      { id: 'execute_steps', type: 'sequence', label: 'Execute Steps', position: { x: 400, y: 150 }, data: {} },
      { id: 'step_1', type: 'action', label: 'Step 1', position: { x: 350, y: 250 }, data: { actionCode: 'await executeStep(process.steps[0]);' } },
      { id: 'step_2', type: 'action', label: 'Step 2', position: { x: 500, y: 250 }, data: { actionCode: 'await executeStep(process.steps[1]);' } },
      { id: 'log_completion', type: 'action', label: 'Log & Attest', position: { x: 600, y: 150 }, data: { actionCode: 'logCompliance(process.name, { steps: process.steps.length, timestamp: Date.now() }); attestResult();' } },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'precondition_sel' },
      { id: 'e2', source: 'root', target: 'execute_steps' },
      { id: 'e3', source: 'root', target: 'log_completion' },
      { id: 'e4', source: 'precondition_sel', target: 'preconditions_met' },
      { id: 'e5', source: 'precondition_sel', target: 'skip' },
      { id: 'e6', source: 'execute_steps', target: 'step_1' },
      { id: 'e7', source: 'execute_steps', target: 'step_2' },
    ],
  },
];

/**
 * Get a behavior tree template by ID
 */
export function getBehaviorTreeTemplate(id: string): BehaviorTreeTemplate | undefined {
  return BEHAVIOR_TREE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Search behavior tree templates by name, description, or tags
 */
export function searchBehaviorTreeTemplates(query: string): BehaviorTreeTemplate[] {
  const lowerQuery = query.toLowerCase();
  return BEHAVIOR_TREE_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}
