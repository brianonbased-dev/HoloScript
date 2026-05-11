// Public entry point. The first thing this module does at load time is
// assert the sandbox env — if HOLOMESH_ADVERSARIAL_SANDBOX !== '1' or
// NODE_ENV === 'production', importing this module throws.
//
// W.GOLD.035 / W.GOLD.039: importing IS the consent; the type system /
// runtime become the limit of the possible for live-prod use.

import { assertSandbox } from './sandbox-gate.js';

assertSandbox();

export {
  AdversarialSandboxViolation,
  assertSandbox,
  SANDBOX_ENV_VAR,
} from './sandbox-gate.js';

export type {
  AttackContext,
  AttackResult,
  AdversarialAttack,
  AttackId,
} from './types.js';

export { WhitewasherAttack } from './whitewasher.js';
export { SybilAttack } from './sybil.js';
export { ScoreManipulatorAttack } from './score-manipulator.js';
export { SlowPoisonerAttack } from './slow-poisoner.js';
export { EclipseAttack } from './eclipse.js';
