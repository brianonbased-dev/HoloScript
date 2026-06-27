import type { ExportTarget } from '../CircuitBreaker';

type AssertNever<T extends never> = T;
type _AgentInferenceIsRegisteredTarget = AssertNever<Exclude<'agent-inference', ExportTarget>>;
type _OmnigentAgentYamlIsRegisteredTarget = AssertNever<Exclude<'omnigent-agent-yaml', ExportTarget>>;
type _DaimonSeedIsRegisteredTarget = AssertNever<Exclude<'daimon-seed', ExportTarget>>;
// @ts-expect-error An unregistered target must trip the same never constraint used by sovereign-targets.ts.
type _UnregisteredTargetTripsNeverGate = AssertNever<Exclude<'__unregistered_agent_probe__', ExportTarget>>;
