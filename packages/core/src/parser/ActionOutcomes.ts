/**
 * Action outcome contracts — the meaning and the checker behind
 *
 *   action rent(count) accepted(rented) refused(fine_unpaid, over_limit) { ... }
 *
 * An action may declare the outcomes it answers with, each with a kind:
 *
 *   accepted  the answer has `allowed: true`; the action may change state and
 *             announce events.
 *   refused   the answer has `allowed: false`; the action changes nothing and
 *             announces nothing.
 *
 * The checker proves this from the action's own statements, before anything
 * runs: every answer names a declared outcome with the matching `allowed`, and
 * no refused answer can be reached after the action changed state or announced
 * an event. Both parsers call it (HoloCompositionParser for `.holo` and the
 * structured half of the deterministic runtime, HoloScriptPlusParser for
 * `.hsplus`), so `holoscript validate` and the headless runtime's admission
 * reach the same verdict on the same source. The runtime additionally checks
 * every answer as it happens.
 *
 * Board task task_1791419247017_jri7. Evidence: back-translation slice 2 had
 * 18/20 false alarms from this one unstated fact; slice 3 put the kinds on a
 * hand-written card. With declarations the card is derived from source.
 */
import type {
  HoloExpression,
  HoloOutcomeDeclaration,
  HoloOutcomeKind,
  HoloStatement,
  SourceLocation,
} from './HoloCompositionTypes';

export type { HoloOutcomeDeclaration } from './HoloCompositionTypes';

export type OutcomeKind = HoloOutcomeKind;

export const OUTCOME_KINDS: readonly OutcomeKind[] = ['accepted', 'refused'];

/** Diagnostic codes, shared by both parsers (registered in RichErrors as HSP500-HSP506). */
export const OUTCOME_DIAGNOSTIC_CODES = {
  HSP500: 'Malformed outcome declaration',
  HSP501: 'Answer names an outcome the action does not declare',
  HSP502: 'Answer has the wrong kind for its outcome',
  HSP503: 'Refused outcome after a state change or event',
  HSP504: 'Answer cannot be checked against the declared outcomes',
  HSP505: 'Decision action declares no outcomes',
  HSP506: 'Declared outcome is never answered',
} as const;

export type OutcomeDiagnosticCode = keyof typeof OUTCOME_DIAGNOSTIC_CODES;

export interface OutcomeDiagnostic {
  code: OutcomeDiagnosticCode;
  severity: 'error' | 'warning';
  /** The action the diagnostic is about. */
  action: string;
  message: string;
  line?: number;
  column?: number;
}

/** What the checker needs to know about one action. */
export interface OutcomeCheckAction {
  name: string;
  /** Declared outcomes; undefined when the action declares none. */
  outcomes?: readonly HoloOutcomeDeclaration[];
  /** The action's statements, or null when they could not be read structurally. */
  body: readonly HoloStatement[] | null;
  /** Why the statements could not be read (only when body is null). */
  bodyError?: string;
  loc?: SourceLocation;
}

/** One `accepted(...)` or `refused(...)` group as written, before flattening. */
export interface OutcomeClauseGroup {
  kind: OutcomeKind;
  /** `quoted` marks a name written in quotes, which is refused (names are plain words). */
  names: Array<{ name: string; loc?: SourceLocation; quoted?: boolean }>;
  loc?: SourceLocation;
}

export interface OutcomeClauseProblem {
  message: string;
  loc?: SourceLocation;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when `word` starts an outcome clause (`accepted(` / `refused(`). */
export function isOutcomeKindWord(word: string): word is OutcomeKind {
  return word === 'accepted' || word === 'refused';
}

/**
 * Flatten the groups an action header wrote into declarations, in the order
 * written. Problems (a group written twice, an empty group, a name that is not
 * a plain word) are reported with the same words by both parsers.
 */
export function outcomeDeclarationsFromGroups(
  actionName: string,
  groups: readonly OutcomeClauseGroup[]
): { outcomes: HoloOutcomeDeclaration[]; problems: OutcomeClauseProblem[] } {
  const outcomes: HoloOutcomeDeclaration[] = [];
  const problems: OutcomeClauseProblem[] = [];
  const seenKinds = new Set<OutcomeKind>();
  for (const group of groups) {
    if (seenKinds.has(group.kind)) {
      problems.push({
        message: `action "${actionName}" lists ${group.kind}(...) twice. Put every ${group.kind} outcome in one list.`,
        loc: group.loc,
      });
    }
    seenKinds.add(group.kind);
    if (group.names.length === 0) {
      problems.push({
        message: `action "${actionName}" has an empty ${group.kind}() list. Name at least one outcome, or leave the list out.`,
        loc: group.loc,
      });
    }
    for (const entry of group.names) {
      if (entry.quoted) {
        problems.push({
          message: `action "${actionName}" writes the outcome "${entry.name}" in quotes. Write outcome names as plain words: ${group.kind}(${IDENTIFIER.test(entry.name) ? entry.name : 'name'}).`,
          loc: entry.loc ?? group.loc,
        });
        continue;
      }
      if (!IDENTIFIER.test(entry.name)) {
        problems.push({
          message: `action "${actionName}" declares the outcome "${entry.name}", which is not a plain name. Use letters, digits and underscores, starting with a letter.`,
          loc: entry.loc ?? group.loc,
        });
        continue;
      }
      outcomes.push({ name: entry.name, kind: group.kind, loc: entry.loc ?? group.loc });
    }
  }
  return { outcomes, problems };
}

// ── Statement walking ─────────────────────────────────────────────────────

/** Calls `visit` on every statement, depth first, in source order. */
export function forEachStatement(
  body: readonly HoloStatement[],
  visit: (statement: HoloStatement) => void
): void {
  for (const statement of body) {
    visit(statement);
    for (const nested of nestedBodies(statement)) forEachStatement(nested, visit);
  }
}

function nestedBodies(statement: HoloStatement): HoloStatement[][] {
  switch (statement.type) {
    case 'IfStatement':
      return statement.alternate
        ? [statement.consequent, statement.alternate]
        : [statement.consequent];
    case 'ForStatement':
    case 'WhileStatement':
    case 'OnErrorStatement':
      return [statement.body];
    case 'ClassicForStatement':
      return [
        ...(statement.init ? [[statement.init]] : []),
        statement.body,
        ...(statement.update ? [[statement.update]] : []),
      ];
    default:
      return [];
  }
}

/** One `return` in an action, read as an answer. */
export interface ActionAnswer {
  line?: number;
  column?: number;
  /** True when the returned value is an object written in place. */
  literal: boolean;
  /** Keys of the returned object, in order (empty when not literal). */
  keys: string[];
  /** `allowed` when written as true/false; undefined otherwise. */
  allowed?: boolean;
  /** `outcome` when written as one quoted name; undefined otherwise. */
  outcome?: string;
  /**
   * Every name the answer's `outcome` can be, when that is known from the
   * text: one quoted name, or a choice between quoted names
   * (`cond ? "heating" : "idle"`). Undefined when it depends on a value.
   */
  outcomes?: string[];
  hasAllowedKey: boolean;
  hasOutcomeKey: boolean;
}

/** The names an outcome expression can produce, or undefined when not known from the text. */
function possibleOutcomeNames(expression: HoloExpression): string[] | undefined {
  if (expression.type === 'Literal') {
    return typeof expression.value === 'string' ? [expression.value] : undefined;
  }
  if (expression.type === 'ConditionalExpression') {
    const a = possibleOutcomeNames(expression.consequent);
    const b = possibleOutcomeNames(expression.alternate);
    if (!a || !b) return undefined;
    return [...a, ...b.filter((name) => !a.includes(name))];
  }
  return undefined;
}

function readAnswer(statement: Extract<HoloStatement, { type: 'ReturnStatement' }>): ActionAnswer {
  const value = statement.value;
  const base = { line: statement.loc?.start.line, column: statement.loc?.start.column };
  if (!value || value.type !== 'ObjectExpression') {
    return { ...base, literal: false, keys: [], hasAllowedKey: false, hasOutcomeKey: false };
  }
  const keys = value.properties.map((p) => p.key);
  const allowedProp = value.properties.find((p) => p.key === 'allowed');
  const outcomeProp = value.properties.find((p) => p.key === 'outcome');
  const allowed =
    allowedProp?.value.type === 'Literal' && typeof allowedProp.value.value === 'boolean'
      ? allowedProp.value.value
      : undefined;
  const outcomes = outcomeProp ? possibleOutcomeNames(outcomeProp.value) : undefined;
  return {
    ...base,
    literal: true,
    keys,
    allowed,
    outcome:
      outcomes?.length === 1 && outcomeProp?.value.type === 'Literal' ? outcomes[0] : undefined,
    outcomes,
    hasAllowedKey: allowedProp !== undefined,
    hasOutcomeKey: outcomeProp !== undefined,
  };
}

/** Every answer (`return`) in an action, in source order. */
export function listActionAnswers(body: readonly HoloStatement[]): ActionAnswer[] {
  const answers: ActionAnswer[] = [];
  forEachStatement(body, (statement) => {
    if (statement.type === 'ReturnStatement') answers.push(readAnswer(statement));
  });
  return answers;
}

/** An answer that carries the decision contract (`allowed` or `outcome`). */
export function isDecisionAnswer(answer: ActionAnswer): boolean {
  return answer.hasAllowedKey || answer.hasOutcomeKey;
}

// ── Effects: state changes and announcements ──────────────────────────────

interface Effect {
  /** Plain words: `changes state.bikesOut` or `announces "bikes_rented"`. */
  what: string;
  line?: number;
}

function isStatePath(path: string): boolean {
  return path === 'state' || path.startsWith('state.') || path.startsWith('state[');
}

function rootedAtState(expression: HoloExpression): string | null {
  if (expression.type === 'Identifier') return expression.name === 'state' ? 'state' : null;
  if (expression.type === 'MemberExpression') {
    const inner = rootedAtState(expression.object);
    if (inner === null) return null;
    return expression.computed ? `${inner}[...]` : `${inner}.${expression.property}`;
  }
  return null;
}

/** A state change hidden inside an expression (`state.n++`, `state.list.push(x)`). */
function expressionEffect(expression: HoloExpression | undefined, line?: number): Effect | null {
  if (!expression) return null;
  switch (expression.type) {
    case 'UpdateExpression': {
      const path = rootedAtState(expression.argument);
      if (path) return { what: `changes ${path}`, line };
      return expressionEffect(expression.argument, line);
    }
    case 'CallExpression': {
      if (expression.callee.type === 'MemberExpression') {
        const path = rootedAtState(expression.callee.object);
        if (path)
          return { what: `may change ${path} (calls ${expression.callee.property} on it)`, line };
      }
      for (const argument of expression.arguments) {
        const found = expressionEffect(argument, line);
        if (found) return found;
      }
      return expressionEffect(expression.callee, line);
    }
    case 'BinaryExpression':
      return expressionEffect(expression.left, line) ?? expressionEffect(expression.right, line);
    case 'UnaryExpression':
      return expressionEffect(expression.argument, line);
    case 'MemberExpression':
      return expressionEffect(expression.object, line);
    case 'ArrayExpression':
      for (const element of expression.elements) {
        const found = expressionEffect(element, line);
        if (found) return found;
      }
      return null;
    case 'ObjectExpression':
      for (const property of expression.properties) {
        const found = expressionEffect(property.value, line);
        if (found) return found;
      }
      return null;
    case 'ConditionalExpression':
      return (
        expressionEffect(expression.test, line) ??
        expressionEffect(expression.consequent, line) ??
        expressionEffect(expression.alternate, line)
      );
    default:
      return null;
  }
}

/** The effect a single (non-compound) statement has, if any. */
function statementEffect(statement: HoloStatement): Effect | null {
  const line = statement.loc?.start.line;
  switch (statement.type) {
    case 'Assignment':
      if (isStatePath(statement.target)) return { what: `changes ${statement.target}`, line };
      return expressionEffect(statement.value, line);
    case 'EmitStatement':
      return { what: `announces "${statement.event}"`, line };
    case 'MethodCall':
      if (statement.object && isStatePath(statement.object)) {
        return { what: `may change ${statement.object} (calls ${statement.method} on it)`, line };
      }
      for (const argument of statement.arguments) {
        const found = expressionEffect(argument, line);
        if (found) return found;
      }
      return null;
    case 'ExpressionStatement':
      return expressionEffect(statement.expression, line);
    case 'VariableDeclaration':
      return expressionEffect(statement.value, line);
    case 'AwaitStatement':
      return expressionEffect(statement.expression, line);
    case 'AnimateStatement':
      return isStatePath(statement.target) ? { what: `changes ${statement.target}`, line } : null;
    default:
      return null;
  }
}

/** First effect anywhere in a block (used for loop bodies that may run again). */
function anyEffect(body: readonly HoloStatement[]): Effect | null {
  let found: Effect | null = null;
  forEachStatement(body, (statement) => {
    if (found) return;
    if (statement.type === 'ReturnStatement') {
      found = expressionEffect(statement.value, statement.loc?.start.line);
      return;
    }
    if (statement.type === 'IfStatement' || statement.type === 'WhileStatement') {
      found = expressionEffect(statement.condition, statement.loc?.start.line);
      if (found) return;
    }
    found = statementEffect(statement);
  });
  return found;
}

// ── The checker ───────────────────────────────────────────────────────────

function kindList(outcomes: readonly HoloOutcomeDeclaration[]): string {
  return outcomes.map((o) => `${o.name} (${o.kind})`).join(', ');
}

interface WalkResult {
  effect: Effect | null;
  terminates: boolean;
}

/**
 * Check every action of one group (the actions of one logic block, or a single
 * action elsewhere). Returns diagnostics in source order per action.
 */
export function checkActionOutcomes(actions: readonly OutcomeCheckAction[]): OutcomeDiagnostic[] {
  const diagnostics: OutcomeDiagnostic[] = [];
  const anyDeclared = actions.some((action) => action.outcomes !== undefined);

  for (const action of actions) {
    const at = (line?: number, column?: number) => ({
      line: line ?? action.loc?.line,
      column: line === undefined ? action.loc?.column : column,
    });

    if (action.outcomes === undefined) {
      if (!anyDeclared || !action.body) continue;
      const decision = listActionAnswers(action.body).find(isDecisionAnswer);
      if (decision) {
        diagnostics.push({
          code: 'HSP505',
          severity: 'error',
          action: action.name,
          message:
            `action "${action.name}" answers with allowed and outcome but declares no outcomes. ` +
            `Other actions here declare theirs; list its outcomes after its inputs, like ` +
            `action ${action.name}(...) accepted(name) refused(name) { ... }.`,
          ...at(decision.line, decision.column),
        });
      }
      continue;
    }

    // Duplicate names across both lists.
    const declared = new Map<string, HoloOutcomeDeclaration>();
    for (const outcome of action.outcomes) {
      const earlier = declared.get(outcome.name);
      if (earlier) {
        diagnostics.push({
          code: 'HSP500',
          severity: 'error',
          action: action.name,
          message:
            earlier.kind === outcome.kind
              ? `action "${action.name}" lists the outcome "${outcome.name}" twice.`
              : `action "${action.name}" lists the outcome "${outcome.name}" as both accepted and refused. An outcome has one kind.`,
          ...at(outcome.loc?.line, outcome.loc?.column),
        });
        continue;
      }
      declared.set(outcome.name, outcome);
    }

    if (!action.body) {
      diagnostics.push({
        code: 'HSP504',
        severity: 'error',
        action: action.name,
        message:
          `action "${action.name}" declares outcomes, but its statements could not be read to check them` +
          (action.bodyError ? `: ${action.bodyError}` : '.'),
        ...at(),
      });
      continue;
    }

    const answered = new Set<string>();
    const report = (diagnostic: Omit<OutcomeDiagnostic, 'action' | 'severity'>) =>
      diagnostics.push({ ...diagnostic, action: action.name, severity: 'error' });

    const checkAnswer = (
      statement: Extract<HoloStatement, { type: 'ReturnStatement' }>,
      effectBefore: Effect | null
    ) => {
      const answer = readAnswer(statement);
      const where = at(answer.line, answer.column);
      const lineWords = answer.line === undefined ? '' : ` on line ${answer.line}`;
      if (!answer.literal) {
        report({
          code: 'HSP504',
          message:
            `action "${action.name}" answers${lineWords} with something other than an object written in place. ` +
            `Every answer of an action with declared outcomes must look like { allowed: false, outcome: "name" } so it can be checked.`,
          ...where,
        });
        return;
      }
      if (answer.outcomes === undefined) {
        report({
          code: 'HSP504',
          message:
            `action "${action.name}" answers${lineWords} with an outcome that depends on a value, so it cannot be checked. ` +
            `Write outcome: "name" (or a choice between quoted names, like cond ? "a" : "b") using: ${kindList(action.outcomes!)}.`,
          ...where,
        });
        return;
      }
      for (const name of answer.outcomes) answered.add(name);
      const undeclared = answer.outcomes.filter((name) => !declared.has(name));
      for (const name of undeclared) {
        report({
          code: 'HSP501',
          message:
            `action "${action.name}" answers with outcome "${name}"${lineWords}, but does not declare it. ` +
            `Declared: ${kindList(action.outcomes!)}. Add it to accepted(...) or refused(...), or answer with a declared outcome.`,
          ...where,
        });
      }
      const known = answer.outcomes.filter((name) => declared.has(name));
      if (known.length === 0) return;
      const names = known.map((name) => `"${name}"`).join(' or ');
      if (answer.allowed === undefined) {
        const kinds = [...new Set(known.map((name) => declared.get(name)!.kind))];
        report({
          code: 'HSP504',
          message:
            `action "${action.name}" answers ${names}${lineWords} without allowed written as true or false. ` +
            (kinds.length === 1
              ? `${names} is declared ${kinds[0]}, so write allowed: ${kinds[0] === 'accepted'}.`
              : `Those outcomes have different kinds; answer each one in its own return.`),
          ...where,
        });
        return;
      }
      let kindsMatch = true;
      for (const name of known) {
        const declaration = declared.get(name)!;
        if (answer.allowed !== (declaration.kind === 'accepted')) {
          kindsMatch = false;
          report({
            code: 'HSP502',
            message:
              `action "${action.name}" answers "${name}" with allowed: ${answer.allowed}${lineWords}, ` +
              `but "${name}" is declared ${declaration.kind}. An accepted answer has allowed: true; a refused answer has allowed: false.`,
            ...where,
          });
        }
      }
      if (!kindsMatch) return;
      const refused = known.filter((name) => declared.get(name)!.kind === 'refused');
      if (refused.length > 0) {
        const effect = effectBefore ?? expressionEffect(statement.value, answer.line);
        if (effect) {
          const effectLine = effect.line === undefined ? '' : ` (line ${effect.line})`;
          const refusedNames = refused.map((name) => `"${name}"`).join(' or ');
          report({
            code: 'HSP503',
            message:
              `action "${action.name}" answers the refused outcome ${refusedNames}${lineWords} after it ${effect.what}${effectLine}. ` +
              `A refused outcome must change nothing and announce nothing: check before changing anything, or declare ${refusedNames} accepted.`,
            ...where,
          });
        }
      }
    };

    const walk = (body: readonly HoloStatement[], effectIn: Effect | null): WalkResult => {
      let effect = effectIn;
      for (const statement of body) {
        switch (statement.type) {
          case 'ReturnStatement':
            checkAnswer(statement, effect);
            return { effect, terminates: true };
          case 'IfStatement': {
            effect = effect ?? expressionEffect(statement.condition, statement.loc?.start.line);
            const consequent = walk(statement.consequent, effect);
            const alternate = statement.alternate
              ? walk(statement.alternate, effect)
              : { effect, terminates: false };
            if (consequent.terminates && alternate.terminates) return { effect, terminates: true };
            effect =
              (consequent.terminates ? null : consequent.effect) ??
              (alternate.terminates ? null : alternate.effect);
            break;
          }
          case 'ForStatement':
          case 'WhileStatement':
          case 'ClassicForStatement': {
            // A loop body may run again after changing something, so an answer
            // inside it is checked as if every change in the body came first.
            const header =
              statement.type === 'WhileStatement'
                ? expressionEffect(statement.condition, statement.loc?.start.line)
                : statement.type === 'ForStatement'
                  ? expressionEffect(statement.iterable, statement.loc?.start.line)
                  : null;
            const inner = anyEffect(
              statement.type === 'ClassicForStatement'
                ? [
                    ...(statement.init ? [statement.init] : []),
                    ...statement.body,
                    ...(statement.update ? [statement.update] : []),
                  ]
                : statement.body
            );
            const loopEffect = effect ?? header ?? inner;
            walk(statement.body, loopEffect);
            effect = loopEffect;
            break;
          }
          case 'OnErrorStatement': {
            const inner = walk(statement.body, effect);
            effect =
              effect ?? (inner.terminates ? null : inner.effect) ?? anyEffect(statement.body);
            break;
          }
          default:
            effect = effect ?? statementEffect(statement);
        }
      }
      return { effect, terminates: false };
    };

    walk(action.body, null);

    for (const outcome of declared.values()) {
      if (!answered.has(outcome.name)) {
        diagnostics.push({
          code: 'HSP506',
          severity: 'warning',
          action: action.name,
          message:
            `action "${action.name}" declares the ${outcome.kind} outcome "${outcome.name}" but never answers with it. ` +
            `Its interface card will list an outcome that cannot happen.`,
          ...at(outcome.loc?.line, outcome.loc?.column),
        });
      }
    }
  }
  return diagnostics;
}
