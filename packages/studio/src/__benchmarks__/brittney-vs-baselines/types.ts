export type DifficultyTier = 'trivial-scene' | 'multi-object-scene' | 'agentic-multi-step';

export type ConfigName =
  | 'brittney-prod'
  | 'cursor-baseline'
  | 'claude-code-baseline'
  | 'vanilla-baseline';

export interface RubricCriterion {
  id: string;
  description: string;
  required: boolean;
}

export interface Task {
  id: string;
  tier: DifficultyTier;
  prompt: string;
  evaluation_rubric: RubricCriterion[];
  expected_artifacts: string[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ConfigRunResult {
  output_text: string;
  tool_rounds: number;
  usage: TokenUsage;
  model_id: string;
  scene_mutations: SceneMutation[];
  cael_chain_fnv1a?: string;
  error?: string;
}

export interface SceneMutation {
  tool_name: string;
  input: Record<string, unknown>;
  sim_contract_passed: boolean | null;
}

export interface RubricVerdict {
  task_id: string;
  config: ConfigName;
  trial: number;
  criterion_id: string;
  passed: boolean;
  rationale: string;
}

export interface RunOutcome {
  task_id: string;
  tier: DifficultyTier;
  config: ConfigName;
  trial: number;
  creation_completion: boolean;
  sim_contract_pass_rate: number;
  tool_rounds_to_completion: number | null;
  token_cost_usd: number;
  wall_clock_seconds: number;
  per_criterion: RubricVerdict[];
  error?: string;
}

export interface BenchmarkRun {
  run_id: string;
  started_at: string;
  finished_at: string;
  configs: ConfigName[];
  tasks: string[];
  trials_per_cell: number;
  outcomes: RunOutcome[];
  budget_usd_max: number;
  budget_usd_used: number;
}

export interface ConfigRunner {
  name: ConfigName;
  run(task: Task, signal: AbortSignal): Promise<ConfigRunResult>;
}
