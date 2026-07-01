export type DescribeItTarget =
  | 'spatial-app'
  | 'iot-device'
  | 'digital-twin'
  | 'agent-team'
  | 'robotics-scene';

export interface DescribeItExamplePrompt {
  id: DescribeItTarget;
  label: string;
  prompt: string;
}

export interface DescribeItPlan {
  prompt: string;
  promptHash: string;
  target: DescribeItTarget;
  targetLabel: string;
  bullets: string[];
  planText: string;
  planHash: string;
  generatedFilePath: string;
  previewPath: string;
  receiptId: string;
}

export interface DescribeItGeneratedFile {
  path: string;
  kind: '.holo';
  contents: string;
  hash: string;
}

export interface DescribeItSmokeResult {
  status: 'pass' | 'fail';
  target: 'WebXR/WebGPU preview';
  checks: {
    generatedHolo: boolean;
    parserSmoke: boolean;
    previewAvailable: boolean;
    receiptComplete: boolean;
  };
  errors: string[];
  warnings: string[];
}

export interface DescribeItReceipt {
  receiptId: string;
  createdAt: string;
  promptHash: string;
  planHash: string;
  generatedFiles: Array<{
    path: string;
    kind: '.holo';
    hash: string;
  }>;
  target: 'WebXR/WebGPU preview';
  previewPath: string;
  smokeResult: DescribeItSmokeResult;
  custody: {
    holokey: string;
    umbrellaRoute: string[];
    triadReceipt: {
      prompt: string;
      plan: string;
      generatedArtifact: string;
    };
  };
}

export interface DescribeItValidationSummary {
  valid: boolean;
  errors?: readonly string[];
  warnings?: readonly string[];
}

const TARGET_LABELS: Record<DescribeItTarget, string> = {
  'spatial-app': 'Spatial app',
  'iot-device': 'IoT device',
  'digital-twin': 'Digital twin',
  'agent-team': 'Agent team',
  'robotics-scene': 'Robotics scene',
};

export const DESCRIBE_IT_EXAMPLES: DescribeItExamplePrompt[] = [
  {
    id: 'spatial-app',
    label: TARGET_LABELS['spatial-app'],
    prompt: 'A spatial field-service app with a floating work order board and asset inspector.',
  },
  {
    id: 'iot-device',
    label: TARGET_LABELS['iot-device'],
    prompt: 'An IoT greenhouse sensor device showing temperature, humidity, and valve state.',
  },
  {
    id: 'digital-twin',
    label: TARGET_LABELS['digital-twin'],
    prompt: 'A warehouse digital twin with live zones, robots, and inventory heat maps.',
  },
  {
    id: 'agent-team',
    label: TARGET_LABELS['agent-team'],
    prompt: 'A small agent team coordinating research, build, review, and deployment lanes.',
  },
  {
    id: 'robotics-scene',
    label: TARGET_LABELS['robotics-scene'],
    prompt: 'A robotics cell with a six-axis arm, safety gate, conveyor, and ROS2 telemetry.',
  },
];

const FALLBACK_PROMPT = DESCRIBE_IT_EXAMPLES[0]?.prompt ?? 'A spatial app preview.';

export function isDescribeItTarget(value: unknown): value is DescribeItTarget {
  return typeof value === 'string' && value in TARGET_LABELS;
}

export function buildDescribeItPlan(input: {
  prompt: string;
  target?: DescribeItTarget;
  planText?: string;
}): DescribeItPlan {
  const prompt = normalizePrompt(input.prompt);
  const target = input.target ?? inferDescribeItTarget(prompt);
  const promptHash = stableHash(prompt);
  const defaultBullets = [
    `Create a ${TARGET_LABELS[target].toLowerCase()} from the prompt.`,
    'Generate native .holo source for the viewport preview.',
    'Bind a WebXR/WebGPU preview target before publish or export.',
    'Run parser smoke and preview availability checks.',
    'Record prompt, plan, generated file, target, smoke, and preview receipt fields.',
  ];
  const bullets = input.planText ? normalizePlanBullets(input.planText) : defaultBullets;
  const planText = bullets.map((line) => `- ${line}`).join('\n');
  const planHash = stableHash(planText);
  const receiptId = `describe-it-${shortHash(promptHash)}-${shortHash(planHash)}`;

  return {
    prompt,
    promptHash,
    target,
    targetLabel: TARGET_LABELS[target],
    bullets,
    planText,
    planHash,
    generatedFilePath: `studio/generated/${receiptId}.holo`,
    previewPath: `/api/preview?sceneId=${receiptId}`,
    receiptId,
  };
}

export function buildDescribeItPreview(plan: DescribeItPlan): DescribeItGeneratedFile {
  const contents = [
    `composition "DescribeItPreview" {`,
    `  source_prompt: ${holoString(plan.prompt)}`,
    `  prompt_hash: ${holoString(plan.promptHash)}`,
    `  plan_hash: ${holoString(plan.planHash)}`,
    `  target: ${holoString(plan.target)}`,
    `  scene "FirstRun" {`,
    `    object "PromptAnchor" {`,
    `      position: [0, 1.4, -2]`,
    `      @glowing { intensity: 0.55 }`,
    `    }`,
    `    object "PlanReview" {`,
    `      position: [-1.2, 1.1, -1.6]`,
    `      @state_sync { channel: "describe-it-plan" }`,
    `    }`,
    buildTargetObject(plan),
    `    object "SmokeReceipt" {`,
    `      position: [1.2, 1.1, -1.6]`,
    `      @state_sync { channel: "describe-it-smoke" }`,
    `    }`,
    `  }`,
    `}`,
  ].join('\n');

  return {
    path: plan.generatedFilePath,
    kind: '.holo',
    contents,
    hash: stableHash(contents),
  };
}

export function buildDescribeItSmokeResult(input: {
  generated: DescribeItGeneratedFile;
  validation: DescribeItValidationSummary;
  previewAvailable?: boolean;
  receiptComplete?: boolean;
}): DescribeItSmokeResult {
  const previewAvailable = input.previewAvailable ?? true;
  const receiptComplete = input.receiptComplete ?? true;
  const generatedHolo =
    input.generated.kind === '.holo' &&
    input.generated.path.endsWith('.holo') &&
    input.generated.contents.trim().length > 0;
  const parserSmoke = input.validation.valid;
  const checks = {
    generatedHolo,
    parserSmoke,
    previewAvailable,
    receiptComplete,
  };
  const errors = [
    ...(input.validation.errors ?? []),
    ...(!generatedHolo ? ['generated .holo artifact is missing'] : []),
    ...(!previewAvailable ? ['preview path unavailable'] : []),
    ...(!receiptComplete ? ['receipt is incomplete'] : []),
  ];

  return {
    status: Object.values(checks).every(Boolean) ? 'pass' : 'fail',
    target: 'WebXR/WebGPU preview',
    checks,
    errors,
    warnings: [...(input.validation.warnings ?? [])],
  };
}

export function buildDescribeItReceipt(input: {
  plan: DescribeItPlan;
  generated: DescribeItGeneratedFile;
  smokeResult: DescribeItSmokeResult;
  createdAt?: string;
}): DescribeItReceipt {
  return {
    receiptId: input.plan.receiptId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    promptHash: input.plan.promptHash,
    planHash: input.plan.planHash,
    generatedFiles: [
      {
        path: input.generated.path,
        kind: input.generated.kind,
        hash: input.generated.hash,
      },
    ],
    target: 'WebXR/WebGPU preview',
    previewPath: input.plan.previewPath,
    smokeResult: input.smokeResult,
    custody: {
      holokey: 'studio-describe-it-first-run-holokey',
      umbrellaRoute: ['prompt', 'plan-review', 'holo-preview', 'smoke-test', 'receipt'],
      triadReceipt: {
        prompt: input.plan.promptHash,
        plan: input.plan.planHash,
        generatedArtifact: input.generated.hash,
      },
    },
  };
}

export function validateDescribeItReceipt(receipt: DescribeItReceipt): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!receipt.promptHash) errors.push('promptHash missing');
  if (!receipt.planHash) errors.push('planHash missing');
  if (receipt.generatedFiles.length === 0) errors.push('generatedFiles missing');
  if (!receipt.target) errors.push('target missing');
  if (!receipt.previewPath) errors.push('previewPath missing');
  if (!receipt.smokeResult.status) errors.push('smokeResult missing');
  if (!receipt.custody.holokey) errors.push('HoloKey custody missing');
  if (receipt.custody.umbrellaRoute.length === 0) errors.push('UmbrellaRoute missing');
  if (!receipt.custody.triadReceipt.generatedArtifact) errors.push('triad receipt missing');
  return { valid: errors.length === 0, errors };
}

function inferDescribeItTarget(prompt: string): DescribeItTarget {
  const lower = prompt.toLowerCase();
  if (/\b(robot|ros2|arm|conveyor|gazebo|isaac|urdf)\b/.test(lower)) return 'robotics-scene';
  if (/\b(agent|team|crew|review|deploy|research)\b/.test(lower)) return 'agent-team';
  if (/\b(twin|factory|warehouse|building|plant|asset)\b/.test(lower)) return 'digital-twin';
  if (/\b(iot|sensor|device|telemetry|mqtt|valve|greenhouse)\b/.test(lower)) return 'iot-device';
  return 'spatial-app';
}

function buildTargetObject(plan: DescribeItPlan): string {
  const common = [
    `    object "GeneratedTarget" {`,
    `      position: [0, 1.05, -1.25]`,
    `      prompt_summary: ${holoString(summarizePrompt(plan.prompt))}`,
  ];
  const byTarget: Record<DescribeItTarget, string[]> = {
    'spatial-app': [`      @state_sync { channel: "spatial-app" }`, `      @grabbable`],
    'iot-device': [
      `      telemetry_channel: "iot/device/first-run"`,
      `      @state_sync { channel: "iot-telemetry" }`,
    ],
    'digital-twin': [
      `      twin_id: "first-run-twin"`,
      `      @state_sync { channel: "digital-twin" }`,
    ],
    'agent-team': [
      `      agent_team: ["research", "build", "review", "ship"]`,
      `      @state_sync { channel: "agent-team" }`,
    ],
    'robotics-scene': [
      `      ros2_topic: "/describe_it/preview"`,
      `      @pathfinding { mode: "preview" }`,
    ],
  };
  return [...common, ...byTarget[plan.target], `    }`].join('\n');
}

function normalizePrompt(prompt: string): string {
  const trimmed = prompt.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_PROMPT;
}

function normalizePlanBullets(planText: string): string[] {
  const bullets = planText
    .split('\n')
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean);
  return bullets.length > 0 ? bullets : buildDescribeItPlan({ prompt: FALLBACK_PROMPT }).bullets;
}

function summarizePrompt(prompt: string): string {
  return prompt.length <= 96 ? prompt : `${prompt.slice(0, 93)}...`;
}

function holoString(value: string): string {
  return JSON.stringify(value);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function shortHash(hash: string): string {
  return hash.replace(/[^a-f0-9]/g, '').slice(-8);
}
