/**
 * @freeze_when — native authoring surface for a self-controlling Freeze RULE.
 *
 * A freeze in this model is NOT a stored "FROZEN" flag someone types (which rots — the
 * "FROZEN in 8 stale places" disease). It is DERIVED from a live signal: gate `scope` WHEN
 * `signal` trips, and AUTO-LIFT the moment the signal clears. This trait is the native
 * authoring form; the rule it declares is projected to a `freeze-registry.json` entry that a
 * controller evaluates on a cadence (ai-ecosystem `scripts/freeze-controller.mjs`).
 *
 * This handler is the ECS runtime contract (mirrors {@link EvolveProgramTrait}): `onAttach`
 * records the rule on the node and emits `freeze_declared`; the invariant that native/fix/infra
 * work is ALWAYS exempt is carried in the payload. Per-instance state lives on `node.__freezeWhen`
 * (created onAttach, deleted onDetach) — never class fields or module vars (F.126 native authoring).
 *
 * @package @holoscript/core/traits
 */
import type { TraitHandler } from './TraitTypes';

/** Runtime config for `@freeze_when` (mirrors the .hsplus props). */
export interface FreezeWhenConfig {
  /** Stable rule id — the registry key. */
  id: string;
  /** The class of change this freeze gates (e.g. "new-feature-work"). */
  scope: string;
  /** Live trigger expression, e.g. "required-gate:red" or "surface-absent:<path>". */
  signal: string;
  /** Human-readable lift condition; the derived state auto-lifts when the signal clears. */
  unfreeze: string;
  /** Labels ALWAYS allowed even under this freeze — the native-first guarantee. */
  exempt?: string[];
  /** "advisory" (surfaces) | "blocking" (gates the scope). */
  severity?: string;
  /** Why the freeze exists (shown only while active). */
  reason?: string;
  /** Optional self-heal repair routed while the freeze is active. */
  repair?: string;
}

const DEFAULT_EXEMPT = ['fix', 'native-format', 'infra-repair'];

export const freezeWhenHandler: TraitHandler<FreezeWhenConfig> = {
  name: 'freeze_when',
  defaultConfig: {
    id: '',
    scope: '',
    signal: '',
    unfreeze: '',
    exempt: DEFAULT_EXEMPT,
    severity: 'advisory',
    reason: '',
    repair: '',
  },
  onAttach(node, config, context) {
    node.__freezeWhen = {
      id: config.id,
      scope: config.scope,
      signal: config.signal,
      unfreeze: config.unfreeze,
      exempt: config.exempt ?? DEFAULT_EXEMPT,
      severity: config.severity ?? 'advisory',
      reason: config.reason ?? '',
      repair: config.repair ?? '',
    };
    // The two invariants: a freeze is DERIVED (never a stored flag), and native/fix work is
    // always exempt so a freeze can never block native-format development.
    context.emit?.('freeze_declared', {
      node,
      rule: node.__freezeWhen,
      derived: true,
      nativeExempt: true,
    });
  },
  onDetach(node, _config, context) {
    delete node.__freezeWhen;
    context.emit?.('freeze_when_detached', { node });
  },
};
