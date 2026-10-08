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
 *
 * Since outcome kinds became language (board task_1791419247017_jri7), a
 * program declares them in each action header —
 * `action rent(count) accepted(rented) refused(over_limit) { ... }` — and the
 * checker in parser/ActionOutcomes.ts proves the program keeps them. The card is
 * then derived from source (interfaceCardSpecFromSource) instead of written by
 * hand; only the list of state fields others can see comes from the host.
 */
import { parseHolo } from '../../parser/HoloCompositionParser';
import { forEachStatement, listActionAnswers } from '../../parser/ActionOutcomes';
import type {
  HoloAction,
  HoloOutcomeKind,
  HoloStatement,
} from '../../parser/HoloCompositionTypes';

/** accepted: answer `allowed: true`, may change state and emit. refused: `allowed: false`, changes nothing. */
export type OutcomeKind = HoloOutcomeKind;

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
 * Kept for programs that do not declare their outcomes (slice-2/3 rebuilds were
 * written before declarations existed); a declaring program is compared with
 * its declarations instead.
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

// ── Deriving the card from source ─────────────────────────────────────────

function actionsOf(source: string): { title: string; actions: HoloAction[] } {
  const parsed = parseHolo(source, { tolerant: true });
  if (!parsed.success || !parsed.ast) {
    throw new Error(
      `interface card: the program does not parse: ${parsed.errors.map((e) => e.message).join('; ')}`
    );
  }
  return { title: parsed.ast.name, actions: parsed.ast.logic?.actions ?? [] };
}

/** Adds each item once, keeping first-seen order. */
function addOnce(list: string[], items: readonly string[]): void {
  for (const item of items) if (!list.includes(item)) list.push(item);
}

interface EmitSeen {
  event: string;
  fields: string[];
}

/**
 * Walk one action's paths: every announcement on a path is tied to the
 * outcome(s) that path answers with. Announcements on a path that ends without
 * a known outcome are tied to none.
 */
function announcementsByOutcome(body: readonly HoloStatement[]): {
  byOutcome: Map<string, EmitSeen[]>;
  untied: EmitSeen[];
} {
  const byOutcome = new Map<string, EmitSeen[]>();
  const untied: EmitSeen[] = [];
  const emitOf = (statement: HoloStatement): EmitSeen | null =>
    statement.type === 'EmitStatement'
      ? {
          event: statement.event,
          fields:
            statement.data?.type === 'ObjectExpression'
              ? statement.data.properties.map((p) => p.key)
              : [],
        }
      : null;
  const walk = (
    statements: readonly HoloStatement[],
    pending: EmitSeen[]
  ): { pending: EmitSeen[]; ends: boolean } => {
    let current = pending;
    for (const statement of statements) {
      const emitted = emitOf(statement);
      if (emitted) {
        current = [...current, emitted];
        continue;
      }
      if (statement.type === 'ReturnStatement') {
        const [answer] = listActionAnswers([statement]);
        if (answer?.outcomes) {
          for (const name of answer.outcomes) {
            byOutcome.set(name, [...(byOutcome.get(name) ?? []), ...current]);
          }
        } else {
          untied.push(...current);
        }
        return { pending: [], ends: true };
      }
      if (statement.type === 'IfStatement') {
        const a = walk(statement.consequent, current);
        const b = statement.alternate
          ? walk(statement.alternate, current)
          : { pending: current, ends: false };
        if (a.ends && b.ends) return { pending: [], ends: true };
        const merged: EmitSeen[] = [];
        for (const e of [...(a.ends ? [] : a.pending), ...(b.ends ? [] : b.pending)]) {
          if (!merged.includes(e)) merged.push(e);
        }
        current = merged;
        continue;
      }
      // Loops and other blocks: their announcements stay on the path.
      const nested: EmitSeen[] = [];
      forEachStatement([statement], (inner) => {
        const e = emitOf(inner);
        if (e) nested.push(e);
      });
      if (nested.length > 0) current = [...current, ...nested];
    }
    return { pending: current, ends: false };
  };
  untied.push(...walk(body, []).pending);
  return { byOutcome, untied };
}

/**
 * The names-only interface card, derived from a program that declares its
 * outcomes:
 *
 * - title: the composition name;
 * - actions: every action with declared outcomes, in source order, outcomes in
 *   the order declared, plus any extra answer fields an outcome's answers carry;
 * - observations: every other action, with the fields of the object it answers;
 * - events: action by action, in the order of the outcomes that announce them
 *   (an event announced on the way to "rented" sits where "rented" sits), each
 *   event once with every field it carries. An announcement on a path with no
 *   known outcome comes after that action's outcomes.
 *
 * Which state fields others can see is a host fact (the experiment's
 * observation policy), so it is passed in.
 */
export function interfaceCardSpecFromSource(
  source: string,
  options: { publicState: readonly string[] }
): InterfaceCardSpec {
  const { title, actions } = actionsOf(source);
  const spec: InterfaceCardSpec = {
    title,
    publicState: [...options.publicState],
    actions: [],
    observations: [],
    events: [],
  };
  const events = new Map<string, string[]>();
  const announce = (seen: readonly EmitSeen[]) => {
    for (const e of seen) {
      const fields = events.get(e.event) ?? [];
      addOnce(fields, e.fields);
      events.set(e.event, fields);
    }
  };

  for (const action of actions) {
    const params = action.parameters.map((p) => p.name);
    const answers = listActionAnswers(action.body);
    const { byOutcome, untied } = announcementsByOutcome(action.body);
    if (action.outcomes) {
      const entry: InterfaceAction = {
        name: action.name,
        params,
        outcomes: action.outcomes.map(({ name, kind }) => ({ name, kind })),
      };
      const extras: Array<{ outcome: string; fields: string[] }> = [];
      for (const outcome of action.outcomes) {
        const fields: string[] = [];
        for (const answer of answers) {
          if (answer.outcomes?.includes(outcome.name)) {
            addOnce(fields, answer.keys.filter((k) => k !== 'allowed' && k !== 'outcome'));
          }
        }
        if (fields.length > 0) extras.push({ outcome: outcome.name, fields });
        announce(byOutcome.get(outcome.name) ?? []);
      }
      if (extras.length > 0) entry.extraAnswerFields = extras;
      spec.actions.push(entry);
    } else {
      const answerFields: string[] = [];
      for (const answer of answers) addOnce(answerFields, answer.keys);
      spec.observations.push({ name: action.name, params, answerFields });
      for (const seen of byOutcome.values()) announce(seen);
    }
    announce(untied);
  }
  spec.events = [...events].map(([name, fields]) => ({ name, fields }));
  return spec;
}

/** Declared outcomes per action, read from source; undefined entries declare none. */
export function declaredOutcomesFromSource(
  source: string
): Map<string, InterfaceOutcome[] | undefined> {
  const { actions } = actionsOf(source);
  return new Map(
    actions.map((action) => [
      action.name,
      action.outcomes?.map(({ name, kind }) => ({ name, kind })),
    ])
  );
}

/**
 * Differences between a card's marked kinds and the program's; empty when they
 * agree. When the program declares its outcomes, the card is compared with the
 * declarations action by action (the checker has already proved the program
 * keeps them). A program that declares none (an older program, or a rebuild
 * written without declarations) is read from its answers instead.
 */
export function interfaceCardKindMismatches(spec: InterfaceCardSpec, source: string): string[] {
  let declared: Map<string, InterfaceOutcome[] | undefined> | null = null;
  try {
    declared = declaredOutcomesFromSource(source);
  } catch {
    declared = null;
  }
  if (declared && [...declared.values()].some((o) => o !== undefined)) {
    const problems: string[] = [];
    for (const action of spec.actions) {
      const outcomes = declared.get(action.name);
      if (!outcomes) {
        problems.push(`${action.name}: the program declares no outcomes for this action`);
        continue;
      }
      for (const outcome of action.outcomes) {
        const match = outcomes.find((o) => o.name === outcome.name);
        if (!match) {
          problems.push(`${action.name}: outcome ${outcome.name} is on the card but not declared`);
        } else if (match.kind !== outcome.kind) {
          problems.push(
            `${action.name}: outcome ${outcome.name} is marked ${outcome.kind} but the program declares it ${match.kind}`
          );
        }
      }
      for (const outcome of outcomes) {
        if (!action.outcomes.some((o) => o.name === outcome.name)) {
          problems.push(`${action.name}: outcome ${outcome.name} is declared but not on the card`);
        }
      }
    }
    for (const [name, outcomes] of declared) {
      if (outcomes && !spec.actions.some((a) => a.name === name)) {
        problems.push(`${name}: the program declares outcomes for this action but the card does not list it`);
      }
    }
    return problems;
  }
  return legacyKindMismatches(spec, source);
}

function legacyKindMismatches(spec: InterfaceCardSpec, source: string): string[] {
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
