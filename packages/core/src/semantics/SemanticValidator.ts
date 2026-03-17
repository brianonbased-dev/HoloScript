import type { ASTProgram, PrimitiveTypeName } from '../types/AdvancedTypeSystem';
import { AdvancedTypeChecker, HoloScriptType } from '../types/AdvancedTypeSystem';
import type { HSPlusNode } from '../types/HoloScriptPlus';

/** Extended node that may have runtime-added traits */
type SemanticNode = HSPlusNode & {
  traits?: { has(value: string): boolean };
};

/** Loose method node from AST children */
interface MethodLikeNode {
  type?: string;
  name?: string;
  params?: Array<{ type?: string; typeAnnotation?: string }>;
  returnType?: string;
}

/** Method config from semantic definition */
interface MethodConfigEntry {
  params?: string[];
  returnType?: string;
}

export interface SemanticDefinition {
  name: string;
  category?: string;
  type?: string;
  requiredProperties: Map<string, HoloScriptType>;
  requiredTraits: string[];
  requiredMethods: Map<string, { params: HoloScriptType[]; returnType: HoloScriptType }>;
}

export interface SemanticValidationError {
  nodeId: string;
  message: string;
  severity: 'error' | 'warning';
  line: number;
  column: number;
}

export class SemanticValidator {
  private definitions: Map<string, SemanticDefinition> = new Map();
  private errors: SemanticValidationError[] = [];
  private typeChecker: AdvancedTypeChecker;

  constructor() {
    this.typeChecker = new AdvancedTypeChecker();
  }

  /**
   * Validate an AST program for semantic correctness
   */
  public validate(ast: ASTProgram): SemanticValidationError[] {
    this.definitions.clear();
    this.errors = [];

    // 1. Collect all @semantic definitions
    this.extractDefinitions(ast.root as HSPlusNode);

    // 2. Validate all nodes with @semantic_ref
    this.validateNodes(ast.root as HSPlusNode);

    return this.errors;
  }

  private extractDefinitions(node: HSPlusNode): void {
    if (node.directives) {
      const directives = (node.directives ?? []) as Array<{ type: string; name?: string; args?: unknown[]; config?: Record<string, unknown> }>;
      for (const directive of directives) {
        if (directive.name === 'semantic' && directive.args?.[0]) {
          const semanticName = directive.args[0] as string;
          const config = (directive.config || {}) as Record<string, unknown>;

          const definition: SemanticDefinition = {
            name: semanticName,
            category: config.category as string | undefined,
            type: config.type as string | undefined,
            requiredProperties: new Map(),
            requiredTraits: [],
            requiredMethods: new Map(),
          };

          if (config.properties) {
            for (const [prop, typeSpec] of Object.entries(config.properties as Record<string, unknown>)) {
              // If it's an empty object or not a string, we still want to require the property
              const typeStr = typeof typeSpec === 'string' ? typeSpec : 'any';
              const type = this.resolveType(typeStr);
              definition.requiredProperties.set(prop, type || { kind: 'primitive', name: 'void' });
            }
          }

          if (config.traits) {
            definition.requiredTraits = config.traits as string[];
          }

          if (config.methods) {
            for (const [methodName, methodConfig] of Object.entries(config.methods as Record<string, unknown>)) {
              const cfg = methodConfig as MethodConfigEntry;
              definition.requiredMethods.set(methodName, {
                params: (cfg.params || []).map((p: string) => this.resolveType(p)).filter((t): t is HoloScriptType => t !== undefined),
                returnType: this.resolveType(cfg.returnType || 'void') as HoloScriptType,
              });
            }
          }

          this.definitions.set(semanticName, definition);
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.extractDefinitions(child);
      }
    }
  }

  private validateNodes(node: HSPlusNode): void {
    if (node.directives) {
      const directives = (node.directives ?? []) as Array<{ type: string; name?: string; args?: unknown[]; config?: Record<string, unknown> }>;
      for (const directive of directives) {
        if (directive.name === 'semantic_ref' && directive.args?.[0]) {
          const refName = directive.args[0] as string;
          const definition = this.definitions.get(refName);

          if (!definition) {
            this.addError(node, `Referenced semantic "${refName}" is not defined.`, 'error');
            continue;
          }

          this.checkRequirements(node, definition);
        }
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.validateNodes(child);
      }
    }
  }

  private checkRequirements(node: HSPlusNode, definition: SemanticDefinition): void {
    // Check Category/Type if specified
    if (definition.category && node.properties?.category !== definition.category) {
      // this.addError(node, `Node does not match category "${definition.category}" required by semantic "${definition.name}".`, 'warning');
    }

    // Check required properties
    for (const [prop, expectedType] of definition.requiredProperties.entries()) {
      if (!node.properties || !(prop in node.properties)) {
        this.addError(
          node,
          `Object "${node.id}" is missing required property "${prop}" defined in semantic "${definition.name}".`,
          'error'
        );
      } else if (expectedType.kind !== 'primitive' || (expectedType.name as string) !== 'any') {
        const actualType = this.typeChecker.inferType(node.properties[prop]);
        const result = this.typeChecker.checkAssignment(actualType, expectedType);
        if (!result.valid) {
          this.addError(
            node,
            `Property "${prop}" in object "${node.id}" has invalid type. Expected ${this.formatType(expectedType)}, got ${this.formatType(actualType)}.`,
            'error'
          );
        }
      }
    }

    // Check required traits
    for (const trait of definition.requiredTraits) {
      if (!(node as SemanticNode).traits || !(node as SemanticNode).traits!.has(trait)) {
        this.addError(
          node,
          `Object "${node.id}" is missing required trait "@${trait}" defined in semantic "${definition.name}".`,
          'error'
        );
      }
    }

    // Check required methods (if node has children that define methods, or check properties if they are functions)
    // For HSPlus+ we usually look at node.children or directives for logic
    for (const [methodName, signature] of definition.requiredMethods.entries()) {
      const methodNode = this.findMethod(node, methodName);
      if (!methodNode) {
        this.addError(
          node,
          `Object "${node.id}" is missing required method "${methodName}" defined in semantic "${definition.name}".`,
          'error'
        );
      } else {
        // Convert signature to expected format
        const convertedSignature = {
          params: signature.params.map((p: HoloScriptType, i: number) => ({
            name: `param${i}`,
            type: typeof p === 'string' ? p : p.kind === 'primitive' ? (p.name as string) : 'any',
          })),
          returnType:
            typeof signature.returnType === 'string'
              ? signature.returnType
              : signature.returnType?.kind === 'primitive'
                ? (signature.returnType.name as string)
                : 'any',
        };
        // Deep method signature validation
        this.validateMethodSignature(
          node,
          methodNode,
          methodName,
          convertedSignature,
          definition.name
        );
      }
    }
  }

  private resolveType(typeStr: string): HoloScriptType | undefined {
    if (typeStr === 'any') return { kind: 'primitive', name: 'any' as PrimitiveTypeName };

    // Simple lookup in built-ins
    const builtIn = this.typeChecker.getType(typeStr);
    if (builtIn) return builtIn;

    if (['number', 'string', 'boolean', 'void'].includes(typeStr)) {
      return { kind: 'primitive', name: typeStr as PrimitiveTypeName };
    }

    return undefined;
  }

  private formatType(type: HoloScriptType): string {
    return (this.typeChecker as unknown as { formatType(t: HoloScriptType): string }).formatType(type);
  }

  private validateMethodSignature(
    node: HSPlusNode,
    methodNode: MethodLikeNode,
    methodName: string,
    expectedSignature: { params: Array<{ name: string; type: string }>; returnType: string },
    semanticName: string
  ): void {
    // Validate parameter count (only if method explicitly declares params)
    const methodParams = methodNode.params || [];
    const hasExplicitParams = Array.isArray(methodNode.params);

    if (hasExplicitParams && methodParams.length !== expectedSignature.params.length) {
      this.addError(
        node,
        `Method "${methodName}" in "${node.id}" has ${methodParams.length} parameters, but semantic "${semanticName}" requires ${expectedSignature.params.length}.`,
        'error'
      );
      return;
    }

    // Only validate parameter types if method has explicit type annotations
    if (hasExplicitParams) {
      for (let i = 0; i < expectedSignature.params.length; i++) {
        const expected = expectedSignature.params[i];
        const actual = methodParams[i];
        const actualType = actual?.type || actual?.typeAnnotation;

        // Skip validation if actual type is not specified
        if (!actualType) continue;

        const expectedType = this.resolveType(expected.type);
        const actualResolvedType = this.resolveType(actualType);

        if (expectedType && actualResolvedType && expected.type !== 'any' && actualType !== 'any') {
          const expectedKind =
            expectedType.kind === 'primitive' ? expectedType.name : expected.type;
          const actualKind =
            actualResolvedType.kind === 'primitive' ? actualResolvedType.name : actualType;
          if (expectedKind !== actualKind) {
            this.addError(
              node,
              `Parameter "${expected.name}" in method "${methodName}" should be type "${expected.type}", but found "${actualType}".`,
              'warning'
            );
          }
        }
      }
    }

    // Validate return type (only if method has explicit return type annotation)
    const methodReturnType = methodNode.returnType;
    if (methodReturnType && expectedSignature.returnType !== 'any' && methodReturnType !== 'any') {
      if (expectedSignature.returnType !== methodReturnType) {
        this.addError(
          node,
          `Method "${methodName}" should return "${expectedSignature.returnType}", but declares "${methodReturnType}".`,
          'warning'
        );
      }
    }
  }

  private findMethod(node: HSPlusNode, name: string): MethodLikeNode | undefined {
    // Check children for method nodes
    return node.children?.find((c) => {
      const m = c as unknown as MethodLikeNode;
      return m.type === 'method' && m.name === name;
    }) as MethodLikeNode | undefined;
  }

  private addError(node: HSPlusNode, message: string, severity: 'error' | 'warning'): void {
    this.errors.push({
      nodeId: node.id || 'anonymous',
      message,
      severity,
      line: node.loc?.start.line || 0,
      column: node.loc?.start.column || 0,
    });
  }
}

export function createSemanticValidator(): SemanticValidator {
  return new SemanticValidator();
}
