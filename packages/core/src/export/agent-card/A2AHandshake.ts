/**
 * A2A Agent Card Handshake at HoloGate Portal Threshold
 *
 * Implements the A2A (Agent-to-Agent) Protocol handshake that occurs when an
 * entity approaches a HoloGate portal. The handshake determines whether the
 * connecting party is an A2A-capable agent (semantic lane) or a human/browser
 * (rendered/WebXR byte lane) based on Agent Card presence and validity.
 *
 * Per the AUTONOMIZE research (2026-05-21, TODO #5):
 *   "At the threshold, emit/consume A2A Agent Cards via existing
 *    compile_to_a2a_agent_card. Governance: Linux Foundation A2A v1.2.
 *    Interop, not fork."
 *
 * Flow:
 *   1. Connecting party presents (optional) A2A Agent Card
 *   2. Portal validates the card against A2A spec required fields
 *   3. Portal resolves its own Agent Card to return
 *   4. Representation negotiated: card valid -> semantic lane; no card -> rendered
 *   5. Spatial scopes derived from the card's advertised skills
 *   6. Handshake result fed to portal_presence:request_entry
 *
 * Pure module: no IO/MCP dependencies, fully unit-testable.
 *
 * @module export/agent-card/A2AHandshake
 * @version 1.0.0
 * @see https://a2a-protocol.org/latest/specification/
 */

import type { A2AAgentCard } from '../../compiler/A2AAgentCardCompiler';

// =============================================================================
// TYPES
// =============================================================================

/** Spatial scope levels — matches PortalPresenceTrait */
export type SpatialScope = 'read-only' | 'mutate-zone' | 'drive-avatar';

/** Representation mode — matches PortalPresenceTrait */
export type PortalRepresentation = 'semantic' | 'rendered' | 'dual';

/** Skill tags that map to elevated spatial scopes */
const SCOPE_SKILL_TAG_MAP: Record<string, SpatialScope> = {
  // drive-avatar: embodied actions, avatar control
  'drive-avatar': 'drive-avatar',
  autonomous: 'drive-avatar',
  agent: 'drive-avatar',
  ai: 'drive-avatar',
  'state-machine': 'drive-avatar',
  behavioral: 'drive-avatar',

  // mutate-zone: state mutation within zones
  'mutate-zone': 'mutate-zone',
  interactive: 'mutate-zone',
  stateful: 'mutate-zone',
  networked: 'mutate-zone',
  'event-handling': 'mutate-zone',
  actions: 'mutate-zone',
  sensor: 'mutate-zone',

  // read-only: observation only
  spatial: 'read-only',
  '3d': 'read-only',
  coordination: 'read-only',
  template: 'read-only',
  object: 'read-only',
  parsing: 'read-only',
  validation: 'read-only',
};

/**
 * Result of A2A Agent Card validation.
 */
export interface CardValidationResult {
  /** Whether the card passed A2A spec validation */
  valid: boolean;
  /** Validation errors (empty when valid) */
  errors: string[];
  /** Warnings (non-blocking issues) */
  warnings: string[];
}

/**
 * Result of deriving spatial scopes from an Agent Card's skills.
 */
export interface ScopeDerivationResult {
  /** Derived spatial scopes */
  scopes: SpatialScope[];
  /** Maximum scope level the card's skills justify */
  maxScope: SpatialScope;
  /** Skill tags that contributed to scope derivation */
  contributingTags: string[];
}

/**
 * Complete handshake result at the portal threshold.
 */
export interface A2AHandshakeResult {
  /** Whether the handshake succeeded */
  success: boolean;
  /** Connecting party's Agent Card (null if not presented or invalid) */
  incomingCard: A2AAgentCard | null;
  /** Portal's own Agent Card (for return to connecting party) */
  portalCard: A2AAgentCard | null;
  /** Negotiated representation mode */
  representation: PortalRepresentation;
  /** Derived spatial scopes for the entrant */
  scopes: SpatialScope[];
  /** Whether an A2A Agent Card was present and valid */
  agentCardPresent: boolean;
  /** Handshake failure reason (when success=false) */
  failureReason?: string;
  /** Validation details */
  validation: CardValidationResult;
  /** Scope derivation details */
  scopeDerivation: ScopeDerivationResult;
  /** Timestamp of the handshake */
  timestamp: number;
}

/**
 * Options for the A2A handshake.
 */
export interface A2AHandshakeOptions {
  /** Incoming Agent Card (null if not presented) */
  incomingCard: A2AAgentCard | null;
  /** Portal's own Agent Card (resolved from compile_to_a2a_agent_card) */
  portalCard: A2AAgentCard | null;
  /** Maximum scopes the portal can grant (from HoloDoor policy) */
  maxScopes: SpatialScope[];
  /** Default scopes for entrants without an Agent Card */
  defaultScopes: SpatialScope[];
  /** Default representation for entrants without negotiation */
  defaultRepresentation: PortalRepresentation;
  /** Whether the portal requires an Agent Card for semantic/dual representation */
  requireAgentCard: boolean;
}

// =============================================================================
// A2A SPEC VALIDATION
// =============================================================================

/**
 * Required top-level fields per A2A Protocol specification Section 4.4.1.
 * See: https://a2a-protocol.org/latest/specification/
 */
const A2A_REQUIRED_FIELDS: (keyof A2AAgentCard)[] = [
  'name',
  'description',
  'url',
  'version',
  'capabilities',
  'authentication',
  'defaultInputModes',
  'defaultOutputModes',
  'skills',
];

/**
 * Validate an A2A Agent Card against the A2A specification required fields.
 *
 * Checks:
 *   - All required top-level fields are present and non-empty
 *   - `skills` is a non-empty array of objects with `id`, `name`, `description`, `tags`
 *   - `capabilities` has the expected shape
 *   - `authentication.schemes` is a non-empty array
 *   - `defaultInputModes` and `defaultOutputModes` are non-empty arrays
 *   - `url` is a parseable URL string
 *
 * @param card - The A2A Agent Card to validate
 * @returns Validation result with errors and warnings
 */
export function validateA2AAgentCard(card: A2AAgentCard | null): CardValidationResult {
  if (!card) {
    return { valid: false, errors: ['No Agent Card provided'], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required top-level fields
  for (const field of A2A_REQUIRED_FIELDS) {
    const value = card[field];
    if (value === undefined || value === null || value === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate name
  if (card.name !== undefined && (typeof card.name !== 'string' || card.name.trim().length === 0)) {
    errors.push('Field "name" must be a non-empty string');
  }

  // Validate description
  if (
    card.description !== undefined &&
    (typeof card.description !== 'string' || card.description.trim().length === 0)
  ) {
    errors.push('Field "description" must be a non-empty string');
  }

  // Validate URL
  if (card.url !== undefined && typeof card.url === 'string' && card.url.length > 0) {
    try {
      new URL(card.url);
    } catch {
      errors.push(`Field "url" is not a valid URL: ${card.url}`);
    }
  }

  // Validate version (semver-like)
  if (card.version !== undefined && typeof card.version === 'string' && card.version.length > 0) {
    if (!/^\d+\.\d+\.\d+/.test(card.version)) {
      warnings.push(`Field "version" does not follow semver: ${card.version}`);
    }
  }

  // Validate capabilities
  if (card.capabilities !== undefined && card.capabilities !== null) {
    if (typeof card.capabilities !== 'object') {
      errors.push('Field "capabilities" must be an object');
    } else {
      if (typeof card.capabilities.streaming !== 'undefined' && typeof card.capabilities.streaming !== 'boolean') {
        warnings.push('Field "capabilities.streaming" should be boolean');
      }
      if (typeof card.capabilities.pushNotifications !== 'undefined' && typeof card.capabilities.pushNotifications !== 'boolean') {
        warnings.push('Field "capabilities.pushNotifications" should be boolean');
      }
      if (typeof card.capabilities.stateTransitionHistory !== 'undefined' && typeof card.capabilities.stateTransitionHistory !== 'boolean') {
        warnings.push('Field "capabilities.stateTransitionHistory" should be boolean');
      }
    }
  }

  // Validate authentication
  if (card.authentication !== undefined && card.authentication !== null) {
    if (typeof card.authentication !== 'object') {
      errors.push('Field "authentication" must be an object');
    } else if (!Array.isArray(card.authentication.schemes) || card.authentication.schemes.length === 0) {
      errors.push('Field "authentication.schemes" must be a non-empty array');
    }
  }

  // Validate defaultInputModes
  if (card.defaultInputModes !== undefined) {
    if (!Array.isArray(card.defaultInputModes) || card.defaultInputModes.length === 0) {
      errors.push('Field "defaultInputModes" must be a non-empty array');
    }
  }

  // Validate defaultOutputModes
  if (card.defaultOutputModes !== undefined) {
    if (!Array.isArray(card.defaultOutputModes) || card.defaultOutputModes.length === 0) {
      errors.push('Field "defaultOutputModes" must be a non-empty array');
    }
  }

  // Validate skills array
  if (card.skills !== undefined) {
    if (!Array.isArray(card.skills)) {
      errors.push('Field "skills" must be an array');
    } else if (card.skills.length === 0) {
      warnings.push('Field "skills" is empty — agent advertises no capabilities');
    } else {
      for (let i = 0; i < card.skills.length; i++) {
        const skill = card.skills[i];
        if (!skill.id || typeof skill.id !== 'string') {
          errors.push(`Skill at index ${i} missing required "id" field`);
        }
        if (!skill.name || typeof skill.name !== 'string') {
          errors.push(`Skill at index ${i} missing required "name" field`);
        }
        if (!skill.description || typeof skill.description !== 'string') {
          errors.push(`Skill at index ${i} missing required "description" field`);
        }
        if (!Array.isArray(skill.tags)) {
          warnings.push(`Skill at index ${i} missing "tags" array`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// SCOPE DERIVATION
// =============================================================================

const SCOPE_RANK: Record<SpatialScope, number> = {
  'read-only': 0,
  'mutate-zone': 1,
  'drive-avatar': 2,
};

/**
 * Derive spatial scopes from an A2A Agent Card's skill tags.
 *
 * Maps skill tags to spatial scope levels. The highest scope level across all
 * skills determines the entrant's maximum scope. The returned `scopes` array
 * includes all scope levels up to and including the maximum.
 *
 * @param card - The validated A2A Agent Card
 * @param maxScopes - Maximum scopes the portal can grant
 * @returns Scope derivation result
 */
export function deriveScopesFromCard(
  card: A2AAgentCard | null,
  maxScopes: SpatialScope[]
): ScopeDerivationResult {
  if (!card || !card.skills || card.skills.length === 0) {
    return {
      scopes: ['read-only'],
      maxScope: 'read-only',
      contributingTags: [],
    };
  }

  const contributingTags: string[] = [];
  let maxRank = SCOPE_RANK['read-only'];

  // Scan all skill tags for scope indicators
  for (const skill of card.skills) {
    if (!skill.tags) continue;
    for (const tag of skill.tags) {
      const mappedScope = SCOPE_SKILL_TAG_MAP[tag];
      if (mappedScope) {
        const rank = SCOPE_RANK[mappedScope];
        if (rank > maxRank) {
          maxRank = rank;
        }
        contributingTags.push(tag);
      }
    }
  }

  // Derive max scope from rank
  const maxScope = (Object.entries(SCOPE_RANK).find(([, r]) => r === maxRank)?.[0] ?? 'read-only') as SpatialScope;

  // Build scopes array (all levels up to max)
  const allScopes: SpatialScope[] = (['read-only', 'mutate-zone', 'drive-avatar'] as SpatialScope[])
    .filter((s) => SCOPE_RANK[s] <= maxRank);

  // Clamp to portal's maxScopes
  const maxAllowedRank = Math.max(...maxScopes.map((s) => SCOPE_RANK[s]), 0);
  const clampedScopes = allScopes.filter((s) => SCOPE_RANK[s] <= maxAllowedRank);

  // Always include at least read-only
  if (clampedScopes.length === 0) {
    clampedScopes.push('read-only');
  }

  return {
    scopes: clampedScopes,
    maxScope: clampedScopes[clampedScopes.length - 1] ?? 'read-only',
    contributingTags: [...new Set(contributingTags)],
  };
}

// =============================================================================
// REPRESENTATION NEGOTIATION
// =============================================================================

/**
 * Negotiate the representation mode based on Agent Card presence and validity.
 *
 * Rules:
 *   - Card present AND valid + requested semantic -> semantic
 *   - Card present AND valid + requested dual -> dual
 *   - Card present AND valid + requested rendered -> rendered (agent chose byte lane)
 *   - Card absent or invalid + requested semantic -> rendered (downgrade)
 *   - Card absent or invalid + requested rendered -> rendered
 *   - Portal requires card + no card -> reject (caller must handle)
 *
 * @param cardValid - Whether the incoming Agent Card is valid
 * @param requested - The representation the connecting party requested
 * @param requireAgentCard - Whether the portal requires an Agent Card for semantic/dual
 * @returns The negotiated representation mode
 */
export function negotiateRepresentation(
  cardValid: boolean,
  requested: PortalRepresentation,
  requireAgentCard: boolean
): PortalRepresentation {
  if (cardValid) {
    // Agent card is valid — honor the requested representation
    return requested;
  }

  // No valid agent card — downgrade semantic/dual to rendered
  if (requested === 'semantic' || requested === 'dual') {
    if (requireAgentCard) {
      // Portal requires card; caller must reject entry
      // Return the requested mode so caller can see the mismatch
      return requested;
    }
    // Downgrade to rendered (WebXR byte lane)
    return 'rendered';
  }

  return 'rendered';
}

// =============================================================================
// HANDSHAKE ORCHESTRATION
// =============================================================================

/**
 * Execute the A2A Agent Card handshake at the HoloGate portal threshold.
 *
 * This is the main entry point for the handshake protocol. It:
 *   1. Validates the incoming Agent Card (if provided)
 *   2. Derives spatial scopes from the card's skills
 *   3. Negotiates representation mode
 *   4. Produces a handshake result for the portal's request_entry event
 *
 * @param options - Handshake options including cards and policy
 * @returns Complete handshake result
 */
export function executeA2AHandshake(options: A2AHandshakeOptions): A2AHandshakeResult {
  const timestamp = Date.now();

  // Step 1: Validate incoming Agent Card
  const validation = validateA2AAgentCard(options.incomingCard);
  const agentCardPresent = options.incomingCard !== null && validation.valid;

  // Step 2: Derive scopes from the card (or default if no card)
  let scopeDerivation: ScopeDerivationResult;
  if (agentCardPresent) {
    scopeDerivation = deriveScopesFromCard(options.incomingCard, options.maxScopes);
  } else {
    scopeDerivation = {
      scopes: options.defaultScopes.length > 0 ? options.defaultScopes : ['read-only'],
      maxScope: options.defaultScopes.length > 0
        ? options.defaultScopes[options.defaultScopes.length - 1]
        : 'read-only',
      contributingTags: [],
    };
  }

  // Step 3: Negotiate representation
  const representation = negotiateRepresentation(
    agentCardPresent,
    options.defaultRepresentation,
    options.requireAgentCard,
  );

  // Step 4: Determine if handshake succeeds
  let success = true;
  let failureReason: string | undefined;

  // Reject if portal requires agent card but none is valid
  if (options.requireAgentCard && !agentCardPresent && representation !== 'rendered') {
    success = false;
    failureReason = 'agent_card_required';
  }

  // Reject if incoming card is invalid (but was presented — partial failure)
  if (options.incomingCard !== null && !validation.valid) {
    // Card was presented but invalid — allow rendered lane, warn semantic
    if (options.requireAgentCard) {
      success = false;
      failureReason = 'agent_card_invalid';
    }
    // Otherwise: card invalid but not required, downgrade to rendered
  }

  return {
    success,
    incomingCard: agentCardPresent ? options.incomingCard : null,
    portalCard: options.portalCard,
    representation: success ? representation : 'rendered',
    scopes: success ? scopeDerivation.scopes : ['read-only'],
    agentCardPresent,
    failureReason,
    validation,
    scopeDerivation,
    timestamp,
  };
}

/**
 * Convert a handshake result into the payload format expected by
 * PortalPresenceTrait's `portal_presence:request_entry` event.
 *
 * This bridges the A2A handshake protocol output into the trait runtime.
 *
 * @param handshake - The completed handshake result
 * @param entrantId - The connecting party's identifier
 * @param name - Display name for the entrant
 * @returns Payload for portal_presence:request_entry
 */
export function handshakeToRequestEntryPayload(
  handshake: A2AHandshakeResult,
  entrantId: string,
  name: string
): Record<string, unknown> {
  return {
    entrantId,
    name,
    agentCardPresent: handshake.agentCardPresent,
    representation: handshake.representation,
    scopes: handshake.scopes,
  };
}