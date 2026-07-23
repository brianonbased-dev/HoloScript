/**
 * Static type evidence for the executable `.holo` behavior subset.
 *
 * This pass consumes the canonical HoloComposition AST. It does not inspect
 * source text and it does not claim knowledge about host-provided methods or
 * values. Known-invalid constructs are rejected; constructs that depend on an
 * undeclared host contract are deferred with a stable diagnostic.
 *
 * `UaalBehaviorCompiler` deliberately remains backward compatible: this
 * validator supplies fail-closed semantic-closure evidence, but does not stop
 * bytecode emission. Admission gates should require a complete closure receipt.
 */

import type { SemanticClosureStageResult } from '@holoscript/meaning';
import type {
  HoloAction,
  HoloComposition,
  HoloEventHandler,
  HoloExpression,
  HoloParameter,
  HoloStatement,
  HoloValue,
} from '../parser/HoloCompositionTypes';

type KnownBehaviorType = 'number' | 'string' | 'boolean' | 'null' | 'array' | 'object';
type BehaviorType = KnownBehaviorType | 'unknown';
type TypeEvidence = Omit<SemanticClosureStageResult, 'status'> & {
  status: 'passed' | 'deferred' | 'rejected';
};

interface ExpressionEvidence {
  type: BehaviorType;
  evidence: TypeEvidence;
}

interface ValidationContext {
  actions: ReadonlyMap<string, HoloAction>;
  state: ReadonlyMap<string, BehaviorType>;
}

type LocalScope = Map<string, BehaviorType>;

const PASSED: TypeEvidence = { status: 'passed' };

function deferred(diagnosticCode: string, reason: string): TypeEvidence {
  return { status: 'deferred', diagnosticCode, reason };
}

function rejected(diagnosticCode: string, reason: string): TypeEvidence {
  return { status: 'rejected', diagnosticCode, reason };
}

function combineEvidence(evidence: readonly TypeEvidence[]): TypeEvidence {
  return (
    evidence.find((item) => item.status === 'rejected') ??
    evidence.find((item) => item.status === 'deferred') ??
    PASSED
  );
}

function valueType(value: HoloValue): BehaviorType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'unknown';
  }
}

function annotationType(parameter: HoloParameter): BehaviorType {
  if (!parameter.paramType) {
    return parameter.defaultValue === undefined ? 'unknown' : valueType(parameter.defaultValue);
  }
  const annotation = parameter.paramType.toLowerCase().replace(/\s+/g, '');
  if (annotation.endsWith('[]') || annotation.startsWith('array<')) return 'array';
  if (
    [
      'number',
      'int',
      'integer',
      'float',
      'double',
      'i8',
      'i16',
      'i32',
      'i64',
      'u8',
      'u16',
      'u32',
      'u64',
      'f32',
      'f64',
    ].includes(annotation)
  ) {
    return 'number';
  }
  if (annotation === 'string' || annotation === 'str') return 'string';
  if (annotation === 'boolean' || annotation === 'bool') return 'boolean';
  if (annotation === 'object' || annotation === 'record') return 'object';
  if (annotation === 'null') return 'null';
  return 'unknown';
}

function expressionType(
  expression: HoloExpression,
  scope: ReadonlyMap<string, BehaviorType>,
  context: ValidationContext
): ExpressionEvidence {
  switch (expression.type) {
    case 'Literal':
      return { type: valueType(expression.value), evidence: PASSED };
    case 'Identifier': {
      const type = scope.get(expression.name);
      return type === undefined
        ? {
            type: 'unknown',
            evidence: deferred(
              'HS-HOLO-TYPE-SYMBOL-001',
              `symbol ${expression.name} has no declared behavior type`
            ),
          }
        : { type, evidence: PASSED };
    }
    case 'MemberExpression': {
      if (
        !expression.computed &&
        expression.object.type === 'Identifier' &&
        expression.object.name === 'state'
      ) {
        const type = context.state.get(expression.property);
        return type === undefined
          ? {
              type: 'unknown',
              evidence: rejected(
                'HS-HOLO-TYPE-STATE-001',
                `state property state.${expression.property} is not declared`
              ),
            }
          : { type, evidence: PASSED };
      }
      const object = expressionType(expression.object, scope, context);
      return {
        type: 'unknown',
        evidence:
          object.evidence.status === 'rejected'
            ? object.evidence
            : deferred(
                'HS-HOLO-TYPE-MEMBER-001',
                `member ${expression.property} has no declared behavior type`
              ),
      };
    }
    case 'CallExpression':
      return validateActionCall(expression.callee, expression.arguments, scope, context);
    case 'BinaryExpression': {
      const left = expressionType(expression.left, scope, context);
      const right = expressionType(expression.right, scope, context);
      const childEvidence = combineEvidence([left.evidence, right.evidence]);
      if (childEvidence.status === 'rejected') {
        return { type: 'unknown', evidence: childEvidence };
      }
      if (left.type === 'unknown' || right.type === 'unknown') {
        return {
          type: 'unknown',
          evidence:
            childEvidence.status === 'deferred'
              ? childEvidence
              : deferred(
                  'HS-HOLO-TYPE-EXPRESSION-001',
                  `operator ${expression.operator} has an underdetermined operand type`
                ),
        };
      }

      if (['-', '*', '/', '%', '<', '>', '<=', '>='].includes(expression.operator)) {
        if (left.type !== 'number' || right.type !== 'number') {
          return {
            type: 'unknown',
            evidence: rejected(
              'HS-HOLO-TYPE-EXPRESSION-002',
              `operator ${expression.operator} requires number operands, received ${left.type} and ${right.type}`
            ),
          };
        }
        return {
          type: ['<', '>', '<=', '>='].includes(expression.operator) ? 'boolean' : 'number',
          evidence: PASSED,
        };
      }
      if (expression.operator === '+') {
        if (
          (left.type === 'number' && right.type === 'number') ||
          (left.type === 'string' && right.type === 'string')
        ) {
          return { type: left.type, evidence: PASSED };
        }
        return {
          type: 'unknown',
          evidence: rejected(
            'HS-HOLO-TYPE-EXPRESSION-002',
            `operator + requires two numbers or two strings, received ${left.type} and ${right.type}`
          ),
        };
      }
      if (['&&', '||'].includes(expression.operator)) {
        if (left.type !== 'boolean' || right.type !== 'boolean') {
          return {
            type: 'unknown',
            evidence: rejected(
              'HS-HOLO-TYPE-EXPRESSION-002',
              `operator ${expression.operator} requires boolean operands, received ${left.type} and ${right.type}`
            ),
          };
        }
        return { type: 'boolean', evidence: PASSED };
      }
      if (['==', '!=', '===', '!=='].includes(expression.operator)) {
        return { type: 'boolean', evidence: PASSED };
      }
      return {
        type: 'unknown',
        evidence: deferred(
          'HS-HOLO-TYPE-EXPRESSION-003',
          `operator ${expression.operator} has no behavior type rule`
        ),
      };
    }
    case 'UnaryExpression': {
      const argument = expressionType(expression.argument, scope, context);
      if (argument.evidence.status !== 'passed')
        return { type: 'unknown', evidence: argument.evidence };
      const expected = expression.operator === '!' ? 'boolean' : 'number';
      if (argument.type !== expected) {
        return {
          type: 'unknown',
          evidence: rejected(
            'HS-HOLO-TYPE-EXPRESSION-002',
            `operator ${expression.operator} requires a ${expected} operand, received ${argument.type}`
          ),
        };
      }
      return { type: expected, evidence: PASSED };
    }
    case 'ArrayExpression': {
      const children = expression.elements.map((element) =>
        expressionType(element, scope, context)
      );
      return { type: 'array', evidence: combineEvidence(children.map((child) => child.evidence)) };
    }
    case 'ObjectExpression': {
      const children = expression.properties.map((property) =>
        expressionType(property.value, scope, context)
      );
      return { type: 'object', evidence: combineEvidence(children.map((child) => child.evidence)) };
    }
    case 'ConditionalExpression': {
      const condition = validateBooleanCondition(expression.test, scope, context);
      const consequent = expressionType(expression.consequent, scope, context);
      const alternate = expressionType(expression.alternate, scope, context);
      const evidence = combineEvidence([condition, consequent.evidence, alternate.evidence]);
      return {
        type:
          consequent.type !== 'unknown' && consequent.type === alternate.type
            ? consequent.type
            : 'unknown',
        evidence:
          evidence.status === 'passed' && consequent.type !== alternate.type
            ? deferred(
                'HS-HOLO-TYPE-CONDITIONAL-001',
                `conditional branches have different types ${consequent.type} and ${alternate.type}`
              )
            : evidence,
      };
    }
    case 'UpdateExpression': {
      const argument = expressionType(expression.argument, scope, context);
      if (argument.evidence.status !== 'passed')
        return { type: 'unknown', evidence: argument.evidence };
      return argument.type === 'number'
        ? { type: 'number', evidence: PASSED }
        : {
            type: 'unknown',
            evidence: rejected(
              'HS-HOLO-TYPE-UPDATE-001',
              `operator ${expression.operator} requires a number operand, received ${argument.type}`
            ),
          };
    }
    case 'BindExpression': {
      if (expression.source.startsWith('state.')) {
        const type = context.state.get(expression.source.slice('state.'.length));
        return type === undefined
          ? {
              type: 'unknown',
              evidence: rejected(
                'HS-HOLO-TYPE-STATE-001',
                `state property ${expression.source} is not declared`
              ),
            }
          : { type, evidence: PASSED };
      }
      return {
        type: 'unknown',
        evidence: deferred(
          'HS-HOLO-TYPE-BIND-001',
          `binding ${expression.source} has no declared behavior type`
        ),
      };
    }
  }
}

function validateActionCall(
  callee: HoloExpression,
  args: HoloExpression[],
  scope: ReadonlyMap<string, BehaviorType>,
  context: ValidationContext
): ExpressionEvidence {
  if (callee.type !== 'Identifier') {
    const calleeEvidence = expressionType(callee, scope, context).evidence;
    return {
      type: 'unknown',
      evidence:
        calleeEvidence.status === 'rejected'
          ? calleeEvidence
          : deferred(
              'HS-HOLO-TYPE-EXTERNAL-CALL-001',
              'computed or member call has no declared action signature'
            ),
    };
  }

  const action = context.actions.get(callee.name);
  if (!action) {
    return {
      type: 'unknown',
      evidence: rejected('HS-HOLO-TYPE-CALL-001', `action ${callee.name} is not declared`),
    };
  }

  const minimumArity = action.parameters.filter(
    (parameter) => parameter.defaultValue === undefined
  ).length;
  if (args.length < minimumArity || args.length > action.parameters.length) {
    const expected =
      minimumArity === action.parameters.length
        ? `${action.parameters.length}`
        : `${minimumArity}..${action.parameters.length}`;
    return {
      type: 'unknown',
      evidence: rejected(
        'HS-HOLO-TYPE-CALL-002',
        `action ${callee.name} expects ${expected} arguments, received ${args.length}`
      ),
    };
  }

  const argumentEvidence = args.map((argument, index) => {
    const inferred = expressionType(argument, scope, context);
    const expected = annotationType(action.parameters[index]);
    if (inferred.evidence.status !== 'passed') return inferred.evidence;
    if (expected !== 'unknown' && inferred.type !== expected) {
      return rejected(
        'HS-HOLO-TYPE-CALL-003',
        `argument ${index + 1} of action ${callee.name} expects ${expected}, received ${inferred.type}`
      );
    }
    return PASSED;
  });
  return { type: 'unknown', evidence: combineEvidence(argumentEvidence) };
}

function validateBooleanCondition(
  condition: HoloExpression,
  scope: ReadonlyMap<string, BehaviorType>,
  context: ValidationContext
): TypeEvidence {
  const inferred = expressionType(condition, scope, context);
  if (inferred.evidence.status !== 'passed') return inferred.evidence;
  if (inferred.type === 'boolean') return PASSED;
  if (inferred.type === 'unknown') {
    return deferred('HS-HOLO-TYPE-CONDITION-001', 'condition type is not declared as boolean');
  }
  return rejected(
    'HS-HOLO-TYPE-CONDITION-002',
    `condition requires boolean, received ${inferred.type}`
  );
}

function assignmentEvidence(
  statement: Extract<HoloStatement, { type: 'Assignment' }>,
  scope: LocalScope,
  context: ValidationContext
): TypeEvidence {
  let targetType: BehaviorType;
  let targetKind: 'state' | 'local';

  if (statement.target.startsWith('state.')) {
    targetType = context.state.get(statement.target.slice('state.'.length)) ?? 'unknown';
    targetKind = 'state';
    if (targetType === 'unknown') {
      return rejected(
        'HS-HOLO-TYPE-STATE-001',
        `state property ${statement.target} is not declared`
      );
    }
  } else if (!statement.target.includes('.')) {
    targetType = scope.get(statement.target) ?? 'unknown';
    targetKind = 'local';
    if (targetType === 'unknown' && !scope.has(statement.target)) {
      return rejected(
        'HS-HOLO-TYPE-TARGET-001',
        `assignment target ${statement.target} is not declared`
      );
    }
  } else {
    return deferred(
      'HS-HOLO-TYPE-EXTERNAL-TARGET-001',
      `assignment target ${statement.target} has no declared behavior type`
    );
  }

  const value = expressionType(statement.value, scope, context);
  if (value.evidence.status !== 'passed') return value.evidence;
  if (targetType === 'unknown' || value.type === 'unknown') {
    return deferred(
      'HS-HOLO-TYPE-ASSIGN-002',
      `assignment to ${statement.target} has an underdetermined type`
    );
  }

  if (statement.operator === '=') {
    if (targetType !== value.type) {
      return rejected(
        'HS-HOLO-TYPE-ASSIGN-001',
        `cannot assign ${value.type} to ${targetType} ${targetKind} property ${statement.target}`
      );
    }
    return PASSED;
  }

  if (targetType !== 'number' || value.type !== 'number') {
    return rejected(
      'HS-HOLO-TYPE-COMPOUND-001',
      `operator ${statement.operator} requires number target and value, received ${targetType} and ${value.type}`
    );
  }
  return PASSED;
}

function validateStatements(
  statements: HoloStatement[],
  path: string,
  initialScope: LocalScope,
  context: ValidationContext,
  evidenceByConstruct: Map<string, TypeEvidence>
): TypeEvidence[] {
  const scope = new Map(initialScope);
  const allEvidence: TypeEvidence[] = [];

  statements.forEach((statement, index) => {
    const constructId = `${path}:${index}`;
    let evidence: TypeEvidence;

    switch (statement.type) {
      case 'Assignment':
        evidence = assignmentEvidence(statement, scope, context);
        break;
      case 'VariableDeclaration': {
        if (!statement.value) {
          scope.set(statement.name, 'unknown');
          evidence = PASSED;
          break;
        }
        const value = expressionType(statement.value, scope, context);
        scope.set(statement.name, value.type);
        evidence = value.evidence;
        break;
      }
      case 'MethodCall': {
        if (!statement.object && context.actions.has(statement.method)) {
          evidence = validateActionCall(
            { type: 'Identifier', name: statement.method },
            statement.arguments,
            scope,
            context
          ).evidence;
        } else {
          const argumentsEvidence = combineEvidence(
            statement.arguments.map((argument) => expressionType(argument, scope, context).evidence)
          );
          evidence =
            argumentsEvidence.status === 'rejected'
              ? argumentsEvidence
              : deferred(
                  'HS-HOLO-TYPE-EXTERNAL-CALL-001',
                  `${statement.object ? `method ${statement.object}.${statement.method}` : `global method ${statement.method}`} has no declared action signature`
                );
        }
        break;
      }
      case 'ExpressionStatement':
        evidence = expressionType(statement.expression, scope, context).evidence;
        break;
      case 'EmitStatement':
        if (!statement.event.trim()) {
          evidence = rejected('HS-HOLO-TYPE-EMIT-001', 'emit event name must not be empty');
        } else {
          evidence = statement.data
            ? expressionType(statement.data, scope, context).evidence
            : PASSED;
        }
        break;
      case 'AwaitStatement':
        evidence = expressionType(statement.expression, scope, context).evidence;
        break;
      case 'ReturnStatement':
        evidence = statement.value
          ? expressionType(statement.value, scope, context).evidence
          : PASSED;
        break;
      case 'IfStatement': {
        const conditionEvidence = validateBooleanCondition(statement.condition, scope, context);
        const consequent = validateStatements(
          statement.consequent,
          `${constructId}/consequent`,
          scope,
          context,
          evidenceByConstruct
        );
        const alternate = statement.alternate
          ? validateStatements(
              statement.alternate,
              `${constructId}/alternate`,
              scope,
              context,
              evidenceByConstruct
            )
          : [];
        allEvidence.push(...consequent, ...alternate);
        evidence = combineEvidence([conditionEvidence, ...consequent, ...alternate]);
        break;
      }
      case 'WhileStatement': {
        const conditionEvidence = validateBooleanCondition(statement.condition, scope, context);
        const bodyEvidence = validateStatements(
          statement.body,
          `${constructId}/body`,
          scope,
          context,
          evidenceByConstruct
        );
        allEvidence.push(...bodyEvidence);
        evidence = combineEvidence([conditionEvidence, ...bodyEvidence]);
        break;
      }
      case 'ForStatement': {
        const iterable = expressionType(statement.iterable, scope, context);
        const iterableEvidence =
          iterable.evidence.status !== 'passed'
            ? iterable.evidence
            : iterable.type === 'array'
              ? PASSED
              : rejected(
                  'HS-HOLO-TYPE-ITERABLE-001',
                  `for iterable requires array, received ${iterable.type}`
                );
        const loopScope = new Map(scope);
        loopScope.set(statement.variable, 'unknown');
        const bodyEvidence = validateStatements(
          statement.body,
          `${constructId}/body`,
          loopScope,
          context,
          evidenceByConstruct
        );
        allEvidence.push(...bodyEvidence);
        evidence = combineEvidence([iterableEvidence, ...bodyEvidence]);
        break;
      }
      case 'ClassicForStatement': {
        const loopScope = new Map(scope);
        const initEvidence: TypeEvidence[] = [];
        if (statement.init) {
          initEvidence.push(
            ...validateStatements(
              [statement.init],
              `${constructId}/init`,
              loopScope,
              context,
              evidenceByConstruct
            )
          );
          allEvidence.push(...initEvidence);
          if (statement.init.type === 'VariableDeclaration') {
            loopScope.set(
              statement.init.name,
              statement.init.value
                ? expressionType(statement.init.value, loopScope, context).type
                : 'unknown'
            );
          }
        }
        const testEvidence = statement.test
          ? validateBooleanCondition(statement.test, loopScope, context)
          : PASSED;
        const bodyEvidence = validateStatements(
          statement.body,
          `${constructId}/body`,
          loopScope,
          context,
          evidenceByConstruct
        );
        allEvidence.push(...bodyEvidence);
        const updateEvidence: TypeEvidence[] = [];
        if (statement.update) {
          updateEvidence.push(
            ...validateStatements(
              [statement.update],
              `${constructId}/update`,
              loopScope,
              context,
              evidenceByConstruct
            )
          );
          allEvidence.push(...updateEvidence);
        }
        evidence = combineEvidence([
          ...initEvidence,
          testEvidence,
          ...bodyEvidence,
          ...updateEvidence,
        ]);
        break;
      }
      case 'OnErrorStatement': {
        const bodyEvidence = validateStatements(
          statement.body,
          `${constructId}/body`,
          scope,
          context,
          evidenceByConstruct
        );
        allEvidence.push(...bodyEvidence);
        evidence = combineEvidence(bodyEvidence);
        break;
      }
      case 'AnimateStatement':
        evidence = deferred(
          'HS-HOLO-TYPE-ANIMATE-001',
          `animation target ${statement.target} has no declared behavior type`
        );
        break;
    }

    evidenceByConstruct.set(constructId, evidence);
    allEvidence.push(evidence);
  });

  return allEvidence;
}

function parameterScope(parameters: HoloParameter[]): LocalScope {
  return new Map(parameters.map((parameter) => [parameter.name, annotationType(parameter)]));
}

/**
 * Produce one typed-stage result for every construct identifier emitted by
 * `UaalBehaviorCompiler`'s semantic-closure traversal.
 */
export function validateHoloBehaviorTypes(
  composition: HoloComposition,
  actions: HoloAction[] = [...(composition.actions ?? []), ...(composition.logic?.actions ?? [])],
  handlers: HoloEventHandler[] = [
    ...(composition.eventHandlers ?? []),
    ...(composition.logic?.handlers ?? []),
  ]
): ReadonlyMap<string, TypeEvidence> {
  const evidenceByConstruct = new Map<string, TypeEvidence>();
  const context: ValidationContext = {
    actions: new Map(actions.map((action) => [action.name, action])),
    state: new Map(
      (composition.state?.properties ?? []).map((property) => [
        property.key,
        valueType(property.value),
      ])
    ),
  };

  for (const action of actions) {
    const childEvidence = validateStatements(
      action.body,
      `action:${action.name}/body`,
      parameterScope(action.parameters),
      context,
      evidenceByConstruct
    );
    evidenceByConstruct.set(`action:${action.name}`, combineEvidence(childEvidence));
  }

  for (const handler of handlers) {
    const constructId = `event:${handler.event}`;
    const childEvidence = validateStatements(
      handler.body,
      `${constructId}/body`,
      parameterScope(handler.parameters),
      context,
      evidenceByConstruct
    );
    evidenceByConstruct.set(constructId, combineEvidence(childEvidence));
  }

  return evidenceByConstruct;
}
