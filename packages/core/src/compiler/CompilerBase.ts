/**
 * Base Compiler Interface with Agent Identity Integration
 *
 * Provides common RBAC validation logic for all HoloScript compilers.
 * Supports dual-mode access control: legacy JWT RBAC tokens AND UCAN
 * capability tokens via the P3 Migration Bridge.
 *
 * All compilers MUST extend this base or implement ICompiler interface.
 *
 * @version 2.0.0
 */

import { getRBAC, ResourceType, type AccessDecision } from '@holoscript/platform';
import { WorkflowStep } from '@holoscript/platform';
import type { CulturalProfileMetadata } from './identity';
import type { CulturalCompatibilityResult } from './CulturalCompatibilityChecker';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import type {
  GLTFExportResult,
  ARCompilationResult,
  AndroidXRCompileResult,
  VRRCompilationResult,
  IOSCompileResult,
} from './CompilerTypes';
import { CapabilityRBAC, getCapabilityRBAC } from '@holoscript/platform';
import type { CapabilityToken } from '@holoscript/platform';
import {
  type CompilerName,
  type ANSCapabilityPathValue,
  COMPILER_ANS_MAP,
  isValidCompilerName,
} from './identity';
import {
  type SpatialZoneEnforcer,
  type SpatialAccessDecision,
  SpatialPermission,
  getSpatialZoneEnforcer,
} from './identity';
import {
  CompilerDocumentationGenerator,
  type TripleOutputResult,
  type DocumentationGeneratorOptions,
} from './CompilerDocumentationGenerator';
import type { JsonLdSceneGraph } from './SemanticSceneGraph';

// ---------------------------------------------------------------------------
// Dual-mode token types (P3 Migration Bridge)
// ---------------------------------------------------------------------------

/**
 * Credential wrapper for UCAN capability tokens.
 *
 * Bundles the token with the issuer's Ed25519 public key, which is
 * required for signature verification.
 */
export interface CapabilityTokenCredential {
  /** UCAN capability token object */
  capabilityToken: CapabilityToken;

  /** Ed25519 public key of the token issuer (PEM-encoded) */
  issuerPublicKey: string;
}

/**
 * Union type for compiler access tokens.
 *
 * - `string`: Legacy JWT RBAC token (routed to AgentRBAC)
 * - `CapabilityTokenCredential`: UCAN capability token (routed to CapabilityRBAC)
 *
 * This enables the P3 Migration Bridge: callers can present either token type
 * and CompilerBase will route to the appropriate verification system.
 */
export type CompilerToken = string | CapabilityTokenCredential;

/**
 * Type guard to check if a token is a UCAN CapabilityTokenCredential.
 *
 * UCAN credential objects have `capabilityToken` and `issuerPublicKey` fields.
 * JWT tokens are plain strings.
 */
export function isCapabilityTokenCredential(
  token: CompilerToken | undefined | null
): token is CapabilityTokenCredential {
  if (!token || typeof token === 'string') return false;
  return (
    typeof token === 'object' &&
    'capabilityToken' in token &&
    'issuerPublicKey' in token &&
    token.capabilityToken != null &&
    typeof token.issuerPublicKey === 'string'
  );
}

// ---------------------------------------------------------------------------
// Compiler class name to ANS CompilerName mapping
// ---------------------------------------------------------------------------

/**
 * Maps compiler class names (e.g. 'UnityCompiler') to their ANS compiler
 * name (e.g. 'unity'). Used by the default `getRequiredCapability()` to
 * derive the ANS namespace from the class's `compilerName` property.
 */
const COMPILER_CLASS_TO_ANS_NAME: Readonly<Record<string, CompilerName>> = {
  UnityCompiler: 'unity',
  UnrealCompiler: 'unreal',
  GodotCompiler: 'godot',
  VRChatCompiler: 'vrchat',
  OpenXRCompiler: 'openxr',
  OpenXRSpatialEntitiesCompiler: 'openxr-spatial-entities',
  VisionOSCompiler: 'visionos',
  ARCompiler: 'ar',
  AndroidXRCompiler: 'android-xr',
  AIGlassesCompiler: 'ai-glasses',
  AndroidCompiler: 'android',
  IOSCompiler: 'ios',
  BabylonCompiler: 'babylon',
  WebGPUCompiler: 'webgpu',
  R3FCompiler: 'r3f',
  PlayCanvasCompiler: 'playcanvas',
  WASMCompiler: 'wasm',
  TSLCompiler: 'tsl',
  URDFCompiler: 'urdf',
  SDFCompiler: 'sdf',
  USDPhysicsCompiler: 'usd',
  GLTFPipeline: 'gltf',
  DTDLCompiler: 'dtdl',
  NFTMarketplaceCompiler: 'nft-marketplace',
  SCMCompiler: 'scm',
  VRRCompiler: 'vrr',
  A2AAgentCardCompiler: 'a2a-agent-card',
  MultiLayerCompiler: 'multi-layer',
  IncrementalCompiler: 'incremental',
  StateCompiler: 'state',
  TraitCompositionCompiler: 'trait-composition',
  DomainBlockCompilerMixin: 'domain-block',
  NIRCompiler: 'nir',
  URDFToUSDZConverter: 'urdf',
  QuiltCompiler: 'quilt',
  MVHEVCCompiler: 'mv-hevc',
  NodeServiceCompiler: 'node-service',
  AgentInferenceCompiler: 'agent-inference',
};

/**
 * Base compiler options (extended by specific compilers)
 */
export interface BaseCompilerOptions {
  /**
   * Generate triple-output documentation (llms.txt, .well-known/mcp, markdown)
   * @default false
   */
  generateDocs?: boolean;

  /**
   * Documentation generator options (only used if generateDocs is true)
   */
  docsOptions?: DocumentationGeneratorOptions;
}

/**
 * Compilation result with optional documentation outputs
 */
export interface CompilationResult {
  /** Primary compilation output (code, GLTF, etc.) */
  output:
    | string
    | Record<string, string>
    | GLTFExportResult
    | ARCompilationResult
    | VRRCompilationResult
    | AndroidXRCompileResult
    | IOSCompileResult;

  /** Optional documentation bundle (if generateDocs enabled) */
  documentation?: TripleOutputResult;
}

/**
 * Compiler interface with agent identity enforcement
 */
export interface ICompiler {
  /**
   * Compile HoloComposition AST to target platform code
   *
   * @param composition - HoloScript AST
   * @param agentToken - JWT token proving agent identity
   * @param outputPath - Optional output file path for scope validation
   * @param sceneGraph - Optional pre-computed SSG for capability inference and optimization hints
   * @returns Compiled code (string or multi-file object)
   * @throws UnauthorizedCompilerAccessError if token invalid or lacks permissions
   */
  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string,
    sceneGraph?: JsonLdSceneGraph
  ):
    | string
    | Record<string, string>
    | GLTFExportResult
    | ARCompilationResult
    | VRRCompilationResult
    | AndroidXRCompileResult
    | IOSCompileResult
    | any;
}

/**
 * Error thrown when agent lacks required permissions
 */
export class UnauthorizedCompilerAccessError extends Error {
  constructor(
    public readonly decision: AccessDecision,
    public readonly operation: string,
    public readonly compilerName: string
  ) {
    super(
      `[${compilerName}] Unauthorized ${operation}: ${decision.reason || 'Access denied'}\n` +
        `Required Permission: ${decision.requiredPermission || 'unknown'}`
    );
    this.name = 'UnauthorizedCompilerAccessError';
  }
}

/**
 * Base compiler class with RBAC enforcement
 *
 * All compilers SHOULD extend this class to inherit:
 * - AST access validation
 * - Code generation validation
 * - Output path scope validation
 * - Clear error messages
 *
 * Example:
 * ```typescript
 * export class UnityCompiler extends CompilerBase {
 *   compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
 *     // Validate AST access
 *     this.validateASTAccess(agentToken);
 *
 *     // Validate code generation permission
 *     this.validateCodeGeneration(agentToken);
 *
 *     // Validate output path (if provided)
 *     if (outputPath) {
 *       this.validateOutputPath(agentToken, outputPath);
 *     }
 *
 *     // Perform compilation...
 *     return csharpCode;
 *   }
 * }
 * ```
 */
/**
 * Supported compilation targets for string sanitization.
 *
 * SECURITY: Every target that generates code must have an entry here.
 * Using the wrong target (e.g. 'TypeScript' for Kotlin output) is a
 * Cross-Agent Compilation Injection vulnerability (CWE-94).
 */
export type EscapeTarget =
  | 'Solidity'
  | 'Swift'
  | 'Kotlin'
  | 'CSharp'
  | 'GDScript'
  | 'JSX'
  | 'TypeScript'
  | 'GLSL'
  | 'HLSL'
  | 'WGSL'
  | 'Python'
  | 'Lua'
  | 'USD'
  | 'XML'
  | 'JSON'
  | 'Rust';

function escapeCStyle(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\0');
}

function escapeGDScript(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '');
}

function escapeJSX(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function escapeXML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeShader(value: string): string {
  return value
    .replace(/\\/g, '')
    .replace(/\*/g, '')
    .replace(/\//g, '')
    .replace(/#/g, '')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

function escapePython(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\x00');
}

function escapeLua(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0');
}

function escapeUSD(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function escapeJSON(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/[\x00-\x1f]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

export function escapeStringValue(value: string, target: EscapeTarget): string {
  if (!value) return value;
  switch (target) {
    case 'Solidity':
    case 'CSharp':
    case 'Swift':
    case 'Kotlin':
    case 'TypeScript':
    case 'Rust':
      return escapeCStyle(value);
    case 'GDScript':
      return escapeGDScript(value);
    case 'JSX':
      return escapeJSX(value);
    case 'XML':
      return escapeXML(value);
    case 'GLSL':
    case 'HLSL':
    case 'WGSL':
      return escapeShader(value);
    case 'Python':
      return escapePython(value);
    case 'Lua':
      return escapeLua(value);
    case 'USD':
      return escapeUSD(value);
    case 'JSON':
      return escapeJSON(value);
    default:
      return value;
  }
}

export abstract class CompilerBase implements ICompiler {
  protected rbac = getRBAC();

  /**
   * Sanitizes a string value for injection into a specific compiler target language.
   * Mitigates Cross-Agent Compilation Injection attacks (e.g. CWE-94).
   *
   * @param value The raw string value from the AST
   * @param target The compilation target language
   * @returns The escaped/sanitized string safe for interpolation
   */
  protected escapeStringValue(value: string, target: EscapeTarget): string {
    return escapeStringValue(value, target);
  }

  /**
   * Lazy-initialized CapabilityRBAC adapter for UCAN token verification.
   * Only created when a UCAN capability token is first encountered.
   */
  private _capabilityRBAC: CapabilityRBAC | null = null;

  /**
   * Lazy-initialized SpatialZoneEnforcer for compile-time spatial zone checks.
   * Only created when spatial zone validation is first invoked.
   */
  private _spatialZoneEnforcer: SpatialZoneEnforcer | null = null;

  /**
   * Lazy-initialized documentation generator for triple-output compilation.
   * Only created when generateDocs option is enabled.
   */
  private _documentationGenerator: CompilerDocumentationGenerator | null = null;

  /**
   * Compiler name (for error messages)
   */
  protected abstract readonly compilerName: string;

  /**
   * Compile HoloComposition AST to target platform code
   * MUST be implemented by subclasses
   */
  abstract compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string,
    sceneGraph?: JsonLdSceneGraph
  ):
    | string
    | Record<string, string>
    | GLTFExportResult
    | ARCompilationResult
    | VRRCompilationResult
    | AndroidXRCompileResult
    | IOSCompileResult
    | any;

  // =========================================================================
  // P3 Migration Bridge: Dual-mode token support
  // =========================================================================

  /**
   * Get or create the CapabilityRBAC adapter instance.
   *
   * Lazily initialized to avoid overhead when only JWT tokens are used.
   */
  protected getCapabilityRBAC(): CapabilityRBAC {
    if (!this._capabilityRBAC) {
      this._capabilityRBAC = getCapabilityRBAC();
    }
    return this._capabilityRBAC;
  }

  /**
   * Get or create the SpatialZoneEnforcer instance.
   *
   * Lazily initialized to avoid overhead when spatial zones are not in use.
   */
  protected getSpatialZoneEnforcer(): SpatialZoneEnforcer {
    if (!this._spatialZoneEnforcer) {
      this._spatialZoneEnforcer = getSpatialZoneEnforcer();
    }
    return this._spatialZoneEnforcer;
  }

  /**
   * Get or create the CompilerDocumentationGenerator instance.
   *
   * Lazily initialized to avoid overhead when documentation generation is disabled.
   *
   * @param options - Documentation generator options
   */
  protected getDocumentationGenerator(
    options?: DocumentationGeneratorOptions
  ): CompilerDocumentationGenerator {
    if (!this._documentationGenerator) {
      this._documentationGenerator = new CompilerDocumentationGenerator(options);
    }
    return this._documentationGenerator;
  }

  /**
   * Generate triple-output documentation for a compilation result.
   *
   * This is a utility method that subclasses can call after successful compilation
   * to generate llms.txt, .well-known/mcp, and markdown documentation.
   *
   * @param composition - Parsed HoloScript composition AST
   * @param compiledCode - The compiled output code
   * @param options - Documentation generator options
   * @returns Triple-output documentation bundle
   *
   * @example
   * ```typescript
   * compile(composition: HoloComposition, agentToken: string, options?: MyCompilerOptions): CompilationResult {
   *   this.validateCompilerAccess(agentToken);
   *   const code = this.performCompilation(composition);
   *
   *   if (options?.generateDocs) {
   *     const docs = this.generateDocumentation(composition, code, options.docsOptions);
   *     return { output: code, documentation: docs };
   *   }
   *
   *   return { output: code };
   * }
   * ```
   */
  protected generateDocumentation(
    composition: HoloComposition,
    compiledCode: string | Record<string, string>,
    options?: DocumentationGeneratorOptions
  ): TripleOutputResult {
    const generator = this.getDocumentationGenerator(options);
    return generator.generate(composition, this.compilerName, compiledCode);
  }

  /**
   * Get the ANS capability namespace path for this compiler.
   *
   * Subclasses MAY override this to specify their exact ANS namespace.
   * The default implementation derives it from `compilerName` using the
   * `COMPILER_CLASS_TO_ANS_NAME` lookup table.
   *
   * @returns The ANS capability path (e.g., "/compile/web3d/r3f"), or
   *          `undefined` if the compiler has no registered ANS namespace.
   *
   * @example
   * ```typescript
   * // Default: derives from compilerName
   * class R3FCompiler extends CompilerBase {
   *   protected readonly compilerName = 'R3FCompiler';
   *   // getRequiredCapability() returns '/compile/web3d/r3f' automatically
   * }
   *
   * // Override: explicit namespace
   * class CustomCompiler extends CompilerBase {
   *   protected readonly compilerName = 'CustomCompiler';
   *   protected getRequiredCapability(): string | undefined {
   *     return '/compile/web3d/r3f';
   *   }
   * }
   * ```
   */
  protected getRequiredCapability(): ANSCapabilityPathValue | undefined {
    const ansName = COMPILER_CLASS_TO_ANS_NAME[this.compilerName];
    if (ansName && isValidCompilerName(ansName)) {
      return COMPILER_ANS_MAP[ansName];
    }
    // Warn when a compiler subclass is missing from the ANS map — UCAN capability
    // checks will be skipped silently for this compiler until it is registered.
    if (process.env['NODE_ENV'] !== 'test') {
      console.warn(
        `[CompilerBase] Compiler '${this.compilerName}' has no ANS namespace entry. ` +
          `Add it to COMPILER_CLASS_TO_ANS_NAME to enable UCAN capability enforcement.`
      );
    }
    return undefined;
  }

  // =========================================================================
  // Legacy JWT RBAC validation (unchanged from v1.0.0)
  // =========================================================================

  /**
   * Validate agent can read AST
   * Skips validation when no token is provided.
   * In production (`NODE_ENV=production`) a warning is emitted when no token is
   * supplied — callers should always authenticate compiler access in production.
   *
   * @param agentToken - Agent JWT token (optional)
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid
   */
  protected validateASTAccess(agentToken?: string): void {
    if (!agentToken) {
      if (process.env['NODE_ENV'] === 'production') {
        console.warn(
          `[${this.compilerName}] validateASTAccess called without a token in production. ` +
            'All compiler calls should be authenticated. Pass an agent token to enforce RBAC.'
        );
      }
      return;
    }

    const decision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });

    if (!decision.allowed) {
      throw new UnauthorizedCompilerAccessError(decision, 'AST access', this.compilerName);
    }
  }

  /**
   * Validate agent can generate code
   * Skips validation when no token is provided.
   * In production (`NODE_ENV=production`) a warning is emitted when no token is
   * supplied — callers should always authenticate compiler access in production.
   *
   * @param agentToken - Agent JWT token (optional)
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid
   */
  protected validateCodeGeneration(agentToken?: string): void {
    if (!agentToken) {
      if (process.env['NODE_ENV'] === 'production') {
        console.warn(
          `[${this.compilerName}] validateCodeGeneration called without a token in production. ` +
            'All compiler calls should be authenticated. Pass an agent token to enforce RBAC.'
        );
      }
      return;
    }

    const decision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.CODE,
      operation: 'write',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });

    if (!decision.allowed) {
      throw new UnauthorizedCompilerAccessError(decision, 'code generation', this.compilerName);
    }
  }

  /**
   * Validate agent can write to output path
   * Skips validation when no token is provided.
   * In production (`NODE_ENV=production`) a warning is emitted when no token is
   * supplied — callers should always authenticate compiler access in production.
   *
   * @param agentToken - Agent JWT token (optional)
   * @param outputPath - Target output file path
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid
   */
  protected validateOutputPath(agentToken?: string, outputPath?: string): void {
    if (!agentToken) {
      if (process.env['NODE_ENV'] === 'production') {
        console.warn(
          `[${this.compilerName}] validateOutputPath called without a token in production. ` +
            'All compiler calls should be authenticated. Pass an agent token to enforce RBAC.'
        );
      }
      return;
    }

    const decision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.OUTPUT,
      operation: 'write',
      resourcePath: outputPath,
      expectedWorkflowStep: WorkflowStep.SERIALIZE,
    });

    if (!decision.allowed) {
      throw new UnauthorizedCompilerAccessError(
        decision,
        `output write to '${outputPath}'`,
        this.compilerName
      );
    }
  }

  // =========================================================================
  // UCAN Capability Token validation (P3 Migration Bridge)
  // =========================================================================

  /**
   * Validate compiler access using a UCAN capability token.
   *
   * Checks that the capability token grants access to the required resources
   * (AST read, CODE write, and optionally OUTPUT write) using the
   * CapabilityRBAC adapter.
   *
   * @param credential - UCAN capability token credential
   * @param outputPath - Optional output path for scope validation
   * @throws UnauthorizedCompilerAccessError if any capability check fails
   */
  protected validateCapabilityAccess(
    credential: CapabilityTokenCredential,
    outputPath?: string
  ): void {
    const capRBAC = this.getCapabilityRBAC();

    // Check AST read access
    const astDecision = capRBAC.checkAccess({
      token: '',
      capabilityToken: credential.capabilityToken,
      issuerPublicKey: credential.issuerPublicKey,
      resourceType: ResourceType.AST,
      operation: 'read',
    });

    if (!astDecision.allowed) {
      throw new UnauthorizedCompilerAccessError(astDecision, 'AST access', this.compilerName);
    }

    // Check CODE write access
    const codeDecision = capRBAC.checkAccess({
      token: '',
      capabilityToken: credential.capabilityToken,
      issuerPublicKey: credential.issuerPublicKey,
      resourceType: ResourceType.CODE,
      operation: 'write',
    });

    if (!codeDecision.allowed) {
      throw new UnauthorizedCompilerAccessError(codeDecision, 'code generation', this.compilerName);
    }

    // Check OUTPUT write access (if outputPath provided)
    if (outputPath) {
      const outputDecision = capRBAC.checkAccess({
        token: '',
        capabilityToken: credential.capabilityToken,
        issuerPublicKey: credential.issuerPublicKey,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
        resourcePath: outputPath,
      });

      if (!outputDecision.allowed) {
        throw new UnauthorizedCompilerAccessError(
          outputDecision,
          `output write to '${outputPath}'`,
          this.compilerName
        );
      }
    }
  }

  // =========================================================================
  // Spatial Memory Zone validation
  // =========================================================================

  /**
   * Validate spatial zone access for the current compilation.
   *
   * This step runs **after** RBAC/UCAN token verification and enforces
   * compile-time spatial zone permissions when zones are registered.
   *
   * **Backward compatible**: When no zones are registered in the global
   * SpatialZoneEnforcer, this method is a no-op.
   *
   * **Non-blocking**: Zone enforcement failures are logged as warnings
   * but do NOT throw or block compilation. This allows gradual rollout
   * of spatial zone policies without breaking existing pipelines.
   *
   * @param agentToken - JWT token string (spatial zones use JWT verification)
   */
  protected validateSpatialZoneAccess(agentToken?: string): void {
    // Skip when no token provided (same pattern as other validators)
    if (!agentToken) return;

    const enforcer = this.getSpatialZoneEnforcer();
    const zoneIds = enforcer.getRegisteredZoneIds();

    // No zones registered: skip silently (backward compatible)
    if (zoneIds.length === 0) return;

    // Check SPATIAL_READ access in each registered zone.
    // This verifies the agent has at minimum read-level spatial access
    // during compilation. Specific operations (write, delete, admin)
    // are enforced by the runtime layer or by subclass overrides.
    for (const zoneId of zoneIds) {
      const decision: SpatialAccessDecision = enforcer.checkZoneAccess(
        agentToken,
        zoneId,
        SpatialPermission.SPATIAL_READ
      );

      if (!decision.allowed) {
        // Log warning but do NOT block compilation.
        // Zone enforcement is advisory during the rollout phase.
        console.warn(
          `[${this.compilerName}] Spatial zone access warning: ` +
            `agent ${decision.agentId ?? 'unknown'} denied SPATIAL_READ ` +
            `in zone "${zoneId}": ${decision.reason}`
        );
      }
    }
  }

  // =========================================================================
  // Dual-mode access validation (P3 Migration Bridge)
  // =========================================================================

  /**
   * Validate all compiler permissions in single call (dual-mode).
   *
   * **P3 Migration Bridge**: This method now accepts both JWT RBAC tokens
   * (string) and UCAN capability tokens (CapabilityTokenCredential).
   *
   * Token routing:
   * - `undefined` / `null` / empty string: Skip all validation (backwards compatibility)
   * - `string` (non-empty): Route to legacy JWT RBAC via AgentRBAC.checkAccess()
   * - `CapabilityTokenCredential`: Route to UCAN via CapabilityRBAC.checkAccess()
   *
   * Convenience method combining AST access + code generation + optional output validation.
   * Skips ALL validation when no token is provided (backwards compatibility / testing).
   *
   * @param agentToken - JWT token string OR UCAN CapabilityTokenCredential (optional)
   * @param outputPath - Optional output path
   * @throws UnauthorizedCompilerAccessError if any validation fails
   */
  protected validateCompilerAccess(agentToken?: CompilerToken, outputPath?: string): void {
    // Skip validation when no token provided (backwards compatibility)
    if (!agentToken) return;

    // P3 Migration Bridge: Route to UCAN capability verification
    if (isCapabilityTokenCredential(agentToken)) {
      this.validateCapabilityAccess(agentToken, outputPath);
      // Note: Spatial zone validation requires a JWT string token.
      // UCAN tokens do not carry the sub/agent_role claims that
      // SpatialZoneEnforcer needs, so spatial checks are skipped
      // for UCAN credentials.
      return;
    }

    // Legacy JWT RBAC path (unchanged behavior)
    this.validateASTAccess(agentToken);
    this.validateCodeGeneration(agentToken);
    if (outputPath) {
      this.validateOutputPath(agentToken, outputPath);
    }

    // Spatial zone enforcement (runs after RBAC token verification).
    // Non-blocking: logs warnings but does not throw.
    this.validateSpatialZoneAccess(agentToken);
  }

  // =========================================================================
  // Cultural compatibility validation
  // =========================================================================

  /**
   * Extract cultural profile from an agent token.
   *
   * @param agentToken - JWT token string (capability tokens do not carry cultural profiles)
   * @returns The cultural profile if present, or null
   */
  protected extractCulturalProfile(agentToken?: string): CulturalProfileMetadata | null {
    if (!agentToken) return null;
    return this.rbac.extractCulturalProfile(agentToken);
  }

  /**
   * Validate cultural compatibility across multiple agent tokens.
   *
   * Subclasses can call this during multi-agent compilation to ensure
   * all participating agents have compatible cultural profiles before
   * proceeding with code generation.
   *
   * @param agentTokens - Map of agent name to JWT token
   * @param normSets    - Optional map of agent name to norm_set arrays
   * @returns Cultural compatibility result, or null if fewer than 2 agents
   *          have cultural profiles
   */
  protected validateCulturalCompatibility(
    agentTokens: Map<string, string>,
    normSets?: Map<string, string[]>
  ): CulturalCompatibilityResult | null {
    return this.rbac.validateCulturalCompatibility(agentTokens, normSets);
  }
}

/**
 * Utility: Create a test token for development/testing
 *
 * WARNING: Only use in non-production environments!
 *
 * @returns Valid code generator token for testing
 */
export function createTestCompilerToken(): string {
  // Return empty string to bypass RBAC validation in tests
  // The validateCompilerAccess methods skip when agentToken is falsy
  return '';
}
