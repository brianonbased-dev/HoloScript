/**
 * Back-translation proof — interface card (slice 3).
 *
 * The interface card gives agent B the exact NAMES a behaviour uses (state
 * fields, actions, outcomes, answer fields, events) and no logic. Slice 2
 * showed one name-level fact was missing: whether an outcome is ACCEPTED (the
 * action may change state) or REFUSED (the action changes nothing). That is a
 * host contract fact, not a rule — the deterministic runner already forbids a
 * refused action from changing state — so it belongs on the card, next to the
 * outcome name, rather than in the plain-language checklist.
 */

/** accepted: answer `allowed: true`, may change state and emit. refused: `allowed: false`, changes nothing. */
export type OutcomeKind = 'accepted' | 'refused';

export interface InterfaceOutcome {
  name: string;
  kind: OutcomeKind;
}

export interface InterfaceAction {
  name: string;
  params: string[];
  outcomes: InterfaceOutcome[];
  /** Extra answer fields carried by one outcome's answer (e.g. `sold` also has `change`). */
  extraAnswerFields?: Array<{ outcome: string; fields: string[] }>;
}

export interface InterfaceObservation {
  name: string;
  params: string[];
  answerFields: string[];
}

export interface InterfaceEvent {
  name: string;
  fields: string[];
}

export interface InterfaceCardSpec {
  title: string;
  publicState: string[];
  actions: InterfaceAction[];
  observations: InterfaceObservation[];
  events: InterfaceEvent[];
}

/** The fixed explanation of outcome kinds printed on every slice-3 card. */
export const OUTCOME_KIND_LEGEND = [
  'Each outcome is marked with its kind:',
  '- accepted: the answer has allowed = true. The action may change state and announce events.',
  '- refused: the answer has allowed = false. The action changes nothing and announces nothing.',
].join('\n');

/** Render the names-only card agent B sees, with each outcome's kind. */
export function renderInterfaceCard(spec: InterfaceCardSpec): string {
  const lines: string[] = [];
  lines.push(`Behaviour name: "${spec.title}"`);
  lines.push('');
  lines.push(`State fields others can see: ${spec.publicState.join(', ')}`);
  lines.push('');
  lines.push(
    'Actions (each answers with allowed and outcome; outcome is one of the names listed):'
  );
  lines.push(OUTCOME_KIND_LEGEND);
  lines.push('');
  for (const action of spec.actions) {
    const outcomes = action.outcomes.map((o) => `${o.name} (${o.kind})`).join(', ');
    const extras = (action.extraAnswerFields ?? [])
      .map(
        (e) =>
          `; a ${e.outcome} answer also has the field${e.fields.length === 1 ? '' : 's'}: ${e.fields.join(', ')}`
      )
      .join('');
    lines.push(`- ${action.name}(${action.params.join(', ')}) — outcomes: ${outcomes}${extras}`);
  }
  lines.push('');
  lines.push('Observations (answer only):');
  for (const obs of spec.observations) {
    lines.push(`- ${obs.name}(${obs.params.join(', ')}) — answer fields: ${obs.answerFields.join(', ')}`);
  }
  lines.push('');
  lines.push('Events (event name: payload fields):');
  for (const event of spec.events) lines.push(`- ${event.name}: ${event.fields.join(', ')}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Outcome kinds a program actually returns, read from its text: every object
 * literal `{ allowed: true|false, outcome: "name" ... }`. A name returned with
 * both kinds maps to both (a contract violation the caller should flag).
 * Used to prove a card's marked kinds match the correct program — the host
 * can derive this fact; the author does not have to state it.
 */
export function outcomeKindsFromSource(source: string): Map<string, Set<OutcomeKind>> {
  const kinds = new Map<string, Set<OutcomeKind>>();
  const pattern = /allowed\s*:\s*(true|false)\s*,\s*outcome\s*:\s*"([^"]+)"/g;
  for (const match of source.matchAll(pattern)) {
    const kind: OutcomeKind = match[1] === 'true' ? 'accepted' : 'refused';
    const set = kinds.get(match[2]) ?? new Set<OutcomeKind>();
    set.add(kind);
    kinds.set(match[2], set);
  }
  return kinds;
}

/** Differences between a card's marked kinds and the program's; empty when they agree. */
export function interfaceCardKindMismatches(spec: InterfaceCardSpec, source: string): string[] {
  const fromSource = outcomeKindsFromSource(source);
  const problems: string[] = [];
  const onCard = new Set<string>();
  for (const action of spec.actions) {
    for (const outcome of action.outcomes) {
      onCard.add(outcome.name);
      const actual = fromSource.get(outcome.name);
      if (!actual) {
        problems.push(`${action.name}: outcome ${outcome.name} is on the card but never returned`);
      } else if (actual.size !== 1 || !actual.has(outcome.kind)) {
        problems.push(
          `${action.name}: outcome ${outcome.name} is marked ${outcome.kind} but the program returns it as ${[...actual].sort().join(' and ')}`
        );
      }
    }
  }
  for (const name of fromSource.keys()) {
    if (!onCard.has(name)) problems.push(`outcome ${name} is returned but not on the card`);
  }
  return problems;
}
