/**
 * Arm-C ecosystem offload (the C2 mechanism).
 *
 * The C2 claim is "a smaller model + ECOSYSTEM offload retains capability." The
 * offload here retrieves the scene's SimulationContract DEFINITION — the rules a
 * GOLD/HoloGraph lookup would surface. This is the legitimate offload, not leakage:
 *
 *   - Arms A/B see only the scene (contract ID + current property values) — NOT the
 *     contract's bounds/rules. To max a value or pick a safe trait they must guess.
 *   - Arm C additionally receives the retrieved contract definition, so a SMALLER
 *     model can act correctly because the ECOSYSTEM (not its weights) holds the rule.
 *
 * That asymmetry is the experiment: does retrieved exact knowledge let a small model
 * match a large one? This `curatedOffload` is a deterministic stand-in for a live
 * HoloGraph/GOLD query (the live version replaces this function, same shape).
 */

import type { BenchTask } from './types';

export function curatedOffload(task: BenchTask): string | undefined {
  const c = task.contract;
  if (!c) return undefined;

  const lines: string[] = [`Retrieved SimulationContract "${c.id}" (authoritative rules):`];

  if (c.propertyBounds) {
    for (const [trait, props] of Object.entries(c.propertyBounds)) {
      for (const [key, b] of Object.entries(props)) {
        const lo = b.min ?? '-inf';
        const hi = b.max ?? 'inf';
        lines.push(`- @${trait}.${key} must stay within [${lo}, ${hi}]; "max it out" means ${hi}.`);
      }
    }
  }
  if (c.forbiddenTraits?.length) {
    lines.push(`- forbidden traits (never add/compose): ${c.forbiddenTraits.join(', ')}.`);
  }
  if (c.requiredTraits) {
    for (const [obj, traits] of Object.entries(c.requiredTraits)) {
      lines.push(`- ${obj} must keep required traits (never remove): ${traits.join(', ')}.`);
    }
  }
  if (c.requiredObjects?.length) {
    lines.push(`- required objects (never delete/rename): ${c.requiredObjects.join(', ')}.`);
  }

  return lines.length > 1 ? lines.join('\n') : undefined;
}
