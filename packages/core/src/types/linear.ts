/**
 * @fileoverview Linear Resource Type System
 * @module @holoscript/core/types/linear
 *
 * Move-inspired linear types for VR resource safety.
 * Resources with linear types are tracked through ownership,
 * preventing copy/drop unless explicitly allowed.
 *
 * Two abilities (inspired by Move):
 * - Copy: Can be freely duplicated
 * - Drop: Can go out of scope silently
 *
 * Non-resource values implicitly have both abilities.
 * Resources default to neither (fully linear).
 *
 * @version 1.0.0
 */

// =============================================================================
// RESOURCE ABILITIES
// =============================================================================

/** Resource abilities — what a resource type is allowed to do */
export type ResourceAbility = 'copy' | 'drop';

// =============================================================================
// OWNERSHIP STATES
// =============================================================================

/** Ownership tracking states for a resource instance */
export type OwnershipState = 'owned' | 'borrowed' | 'moved' | 'consumed';

// =============================================================================
// RESOURCE TYPE DEFINITION
// =============================================================================

/** Defines a linear resource type */
export interface ResourceType {
  /** Name of the resource type */
  name: string;
  /** Abilities this resource has (empty = fully linear) */
  abilities: Set<ResourceAbility>;
  /** Functions that consume (destroy) instances of this resource */
  consumingOps: string[];
  /** Functions that produce (create) instances of this resource */
  producingOps: string[];
}

// =============================================================================
// LINEAR VIOLATIONS
// =============================================================================

/** Kinds of linear type violations */
export type LinearViolationKind =
  | 'use-after-move'
  | 'use-after-consume'
  | 'double-move'
  | 'resource-leak'
  | 'illegal-copy'
  | 'illegal-drop';

/** A linear type violation found during compile-time checking */
export interface LinearViolation {
  /** What kind of violation */
  kind: LinearViolationKind;
  /** Name of the resource instance (variable name) */
  resourceName: string;
  /** Type of the resource */
  resourceType: string;
  /** Source location */
  location: { line?: number; column?: number; functionName?: string };
  /** Human-readable message */
  message: string;
  /** Severity */
  severity: 'error' | 'warning';
  /** Suggested fix */
  suggestion?: string;
}

// =============================================================================
// CHECK RESULT
// =============================================================================

/** Result of linear type checking */
export interface LinearCheckResult {
  /** Whether the module passes linear type checking */
  passed: boolean;
  /** All violations found */
  violations: LinearViolation[];
  /** Final ownership state of all tracked resources */
  trackedResources: Map<string, OwnershipState>;
}
