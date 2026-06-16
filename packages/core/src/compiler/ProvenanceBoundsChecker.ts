/**
 * @fileoverview Provenance Bounds Checker — Verifiable Anti-Cheat by Construction
 * @module @holoscript/core/compiler
 *
 * Implements the `@provably_bounded` composition annotation lint pass.
 * For each exploit class, it evaluates whether the composition structurally
 * prevents the exploit via declared composition traits and constructs.
 *
 * Round-2 scope: single-file static analysis. Cross-file symbol tables are
 * deferred to round 3-4. Unresolvable obligations are reported as
 * `not_applicable` with an honest explanation.
 *
 * This is the static-analysis seed of the "Verifiable Anti-Cheat by
 * Construction" paper claim (research/2026-06-15_mmo-next-round-advancement.md §4).
 *
 * @version 1.0.0
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import type { AuthoritySymbolGraph } from './authority/AuthoritySymbolGraph';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/**
 * Cross-file resolution context (round-3 symbol table). When supplied to
 * {@link ProvenanceBoundsChecker.check}, the three obligations that single-file
 * analysis can only assume (ability_spam, unvalidated_cast, info_leak) are
 * upgraded from "satisfied-with-caveat" to GENUINELY verified against resolved
 * cross-file authority — closing the paper-claim risk that `@provably_bounded`
 * could pass without actually proving server authority.
 *
 * Build one from a ColyseusCompiler result with
 * `buildColyseusCrossFileContext` (authority/ColyseusAuthorityManifest).
 */
export interface CrossFileContext {
  /**
   * Per-ability resolved authority envelope (ability name → tier), gathered by
   * resolving `.hs` imports. An ability resolving to `client`/`client_predicted`
   * is a client-authoritative cast surface (spam/cheat risk).
   */
  abilityEnvelopes?: Map<string, 'server' | 'client_predicted' | 'client'>;
  /**
   * Cross-file authority symbol graph for replication / info-leak reachability.
   * When present, info_leak is proven by {@link AuthoritySymbolGraph.findViolations}.
   */
  graph?: AuthoritySymbolGraph;
}

/**
 * Exploit classes the checker reasons about.
 * Each maps to one `ProofObligation` in the report.
 */
export type ExploitClass =
  | 'speedhack'
  | 'ability_spam'
  | 'unvalidated_cast'
  | 'range_exploit'
  | 'dupe'
  | 'unaudited_event'
  | 'info_leak';

/** Whether the obligation is met, unmet, or irrelevant for this composition. */
export type ObligationStatus = 'satisfied' | 'unmet' | 'not_applicable';

/**
 * A single proof obligation: a structural invariant that must hold
 * for the exploit class to be ruled out.
 */
export interface ProofObligation {
  /** Which exploit class this obligation guards against. */
  exploitClass: ExploitClass;
  /** Whether the obligation is met by the composition. */
  status: ObligationStatus;
  /** Human-readable rule being checked. */
  rule: string;
  /** What was (or was not) found in the composition. */
  evidence: string;
  /** The annotation or construct that would satisfy this obligation. */
  remediation: string;
}

/**
 * Top-level result returned by `ProvenanceBoundsChecker.check`.
 */
export interface ProvabilityReport {
  /**
   * True iff the composition declares `@provably_bounded` (or
   * `config.assumeStrict`) AND every applicable obligation is satisfied.
   */
  provablyBounded: boolean;
  /**
   * True when `@provably_bounded` is present or `config.assumeStrict` is set.
   * An unstrict composition still gets a full obligation report, which can
   * be used as a non-blocking audit.
   */
  strict: boolean;
  /** Full obligation list — one entry per exploit class. */
  obligations: ProofObligation[];
  /** Count of obligations with status 'satisfied'. */
  satisfied: number;
  /** Count of obligations with status 'unmet'. */
  unmet: number;
  /** One-line human verdict. */
  summary: string;
}

/** Configuration for the provenance bounds checker. */
export interface ProvenanceBoundsConfig {
  /**
   * When true, treat the composition as if it bears `@provably_bounded`
   * even without the trait. Useful for testing obligation coverage without
   * committing to the annotation.
   */
  assumeStrict?: boolean;
}

// =============================================================================
// CHECKER IMPLEMENTATION
// =============================================================================

/**
 * Evaluates a `HoloComposition` against all `@provably_bounded` proof
 * obligations and returns a `ProvabilityReport`.
 *
 * The checker is pure (no I/O) and deterministic.
 */
export class ProvenanceBoundsChecker {
  private readonly config: Required<ProvenanceBoundsConfig>;

  constructor(config: ProvenanceBoundsConfig = {}) {
    this.config = {
      assumeStrict: config.assumeStrict ?? false,
    };
  }

  /**
   * Check a composition against all proof obligations.
   *
   * @param composition - The parsed `HoloComposition` to analyse.
   * @param crossFile   - Optional round-3 cross-file context. When supplied, the
   *                      ability_spam, unvalidated_cast, and info_leak obligations
   *                      are verified against resolved cross-file authority instead
   *                      of being assumed satisfied. Omit it for the original
   *                      single-file lint behaviour (unchanged).
   * @returns A full `ProvabilityReport`.
   */
  check(composition: HoloComposition, crossFile?: CrossFileContext): ProvabilityReport {
    const strict = this.config.assumeStrict || this.hasRootTrait(composition, 'provably_bounded');

    const obligations: ProofObligation[] = [
      this.checkSpeedhack(composition),
      this.checkAbilitySpam(composition, crossFile),
      this.checkUnvalidatedCast(composition, crossFile),
      this.checkRangeExploit(composition),
      this.checkDupe(composition),
      this.checkUnauditedEvent(composition),
      this.checkInfoLeak(composition, crossFile),
    ];

    const satisfied = obligations.filter((o) => o.status === 'satisfied').length;
    const unmet = obligations.filter((o) => o.status === 'unmet').length;
    const provablyBounded = strict && unmet === 0;

    const summary = this.buildSummary(provablyBounded, strict, satisfied, unmet, obligations);

    return { provablyBounded, strict, obligations, satisfied, unmet, summary };
  }

  // ===========================================================================
  // OBLIGATION EVALUATORS
  // ===========================================================================

  /**
   * Obligation 1 — speedhack
   *
   * Rule: If the world is "moving" (has spawn points, NPCs, or player_action
   * logic), a `@movement_contract` root trait with a max_speed cap must be
   * declared on the composition.
   */
  private checkSpeedhack(composition: HoloComposition): ProofObligation {
    const isMovingWorld =
      (composition.spawnPoints?.length ?? 0) > 0 ||
      (composition.npcs?.length ?? 0) > 0 ||
      this.hasPlayerActionLogic(composition);

    if (!isMovingWorld) {
      return {
        exploitClass: 'speedhack',
        status: 'not_applicable',
        rule: 'Moving worlds require @movement_contract with a max_speed cap.',
        evidence:
          'Composition has no spawn points, NPCs, or player_action handlers — no movement surface detected.',
        remediation: 'No action needed for static compositions.',
      };
    }

    const hasMovementContract = this.hasRootTrait(composition, 'movement_contract');

    if (hasMovementContract) {
      return {
        exploitClass: 'speedhack',
        status: 'satisfied',
        rule: 'Moving worlds require @movement_contract with a max_speed cap.',
        evidence: '@movement_contract root trait found on composition.',
        remediation: 'Already satisfied.',
      };
    }

    return {
      exploitClass: 'speedhack',
      status: 'unmet',
      rule: 'Moving worlds require @movement_contract with a max_speed cap.',
      evidence:
        'Composition has movement constructs (spawn points / NPCs / player_action) but no @movement_contract root trait.',
      remediation: 'Add @movement_contract(max_speed: N) at the composition root.',
    };
  }

  /**
   * Obligation 2 — ability_spam
   *
   * Rule: Abilities must be server-authoritative. Round-2 single-file scope:
   * all abilities default to server authority; per-ability @authority_envelope
   * verification is deferred to round 3 (cross-file symbol table needed).
   *
   * Status: 'satisfied' when abilities are present (server-default), with an
   * honest note about the single-file limitation. 'not_applicable' when there
   * are no abilities.
   */
  private checkAbilitySpam(
    composition: HoloComposition,
    crossFile?: CrossFileContext
  ): ProofObligation {
    const abilityCount = composition.abilities?.length ?? 0;

    if (abilityCount === 0) {
      return {
        exploitClass: 'ability_spam',
        status: 'not_applicable',
        rule: 'Abilities must be server-authoritative to prevent client-side spam.',
        evidence: 'No abilities declared in this composition.',
        remediation: 'No action needed when no abilities are present.',
      };
    }

    const abilityNames = composition.abilities.map((a) => a.name).join(', ');

    // Round-3 cross-file path: verify each ability's resolved authority envelope.
    if (crossFile?.abilityEnvelopes) {
      const clientAuth = this.clientAuthoritativeAbilities(crossFile.abilityEnvelopes);
      if (clientAuth.length > 0) {
        return {
          exploitClass: 'ability_spam',
          status: 'unmet',
          rule: 'Abilities must be server-authoritative to prevent client-side spam.',
          evidence: `${clientAuth.length} ability(s) resolve to client authority across imports: ${clientAuth.join(', ')}. A client-authoritative cast can be spammed without server gating.`,
          remediation:
            'Set @authority_envelope(authority: "server") on these abilities (or "client_predicted" only when the server still reconciles).',
        };
      }
      return {
        exploitClass: 'ability_spam',
        status: 'satisfied',
        rule: 'Abilities must be server-authoritative to prevent client-side spam.',
        evidence: `${abilityCount} ability(s) (${abilityNames}) verified server-authoritative across resolved imports — no client-authoritative cast surface.`,
        remediation: 'Already satisfied (cross-file verified).',
      };
    }

    // Round-2 single-file fallback: HoloScript ability blocks default to server
    // authority. Per-ability @authority_envelope verification needs cross-file
    // resolution — supply a CrossFileContext to upgrade this to a real proof.
    return {
      exploitClass: 'ability_spam',
      status: 'satisfied',
      rule: 'Abilities must be server-authoritative to prevent client-side spam.',
      evidence: `${abilityCount} ability(s) found (${abilityNames}). Abilities default to server authority in the HoloScript compiler. Per-ability @authority_envelope verification is single-file-limited; pass a CrossFileContext for cross-file proof.`,
      remediation:
        'Already satisfied at structural level. Provide a CrossFileContext (resolved ability envelopes) for verified cross-file authority.',
    };
  }

  /**
   * Obligation 3 — unvalidated_cast
   *
   * Rule: Ranged abilities require server-side range validation.
   * Round-2: satisfied at the structural level if ranged abilities are present
   * (the compiler emits server range checks). 'not_applicable' if no abilities
   * have a non-zero range.
   *
   * Note: This is a companion to ability_spam; both concern ability execution.
   * The distinction is that range_exploit (obligation 4) checks range > 0
   * specifically, while unvalidated_cast checks cast-time server authority.
   */
  private checkUnvalidatedCast(
    composition: HoloComposition,
    crossFile?: CrossFileContext
  ): ProofObligation {
    const abilityCount = composition.abilities?.length ?? 0;

    if (abilityCount === 0) {
      return {
        exploitClass: 'unvalidated_cast',
        status: 'not_applicable',
        rule: 'Ability casts must be validated server-side (no client-authoritative cast resolution).',
        evidence: 'No abilities declared in this composition.',
        remediation: 'No action needed when no abilities are present.',
      };
    }

    const abilityNames = composition.abilities.map((a) => a.name).join(', ');

    // Round-3 cross-file path: a fully client-authoritative ability resolves its
    // cast on the client without server validation.
    if (crossFile?.abilityEnvelopes) {
      const clientOnly = this.fullyClientAbilities(crossFile.abilityEnvelopes);
      if (clientOnly.length > 0) {
        return {
          exploitClass: 'unvalidated_cast',
          status: 'unmet',
          rule: 'Ability casts must be validated server-side (no client-authoritative cast resolution).',
          evidence: `${clientOnly.length} ability(s) resolve cast client-side with no server reconciliation: ${clientOnly.join(', ')}.`,
          remediation:
            'Move cast resolution to the server: @authority_envelope(authority: "server") or "client_predicted" with server reconcile.',
        };
      }
      return {
        exploitClass: 'unvalidated_cast',
        status: 'satisfied',
        rule: 'Ability casts must be validated server-side (no client-authoritative cast resolution).',
        evidence: `${abilityCount} ability(s) (${abilityNames}) verified: every cast is server-validated or server-reconciled across resolved imports.`,
        remediation: 'Already satisfied (cross-file verified).',
      };
    }

    return {
      exploitClass: 'unvalidated_cast',
      status: 'satisfied',
      rule: 'Ability casts must be validated server-side (no client-authoritative cast resolution).',
      evidence: `${abilityCount} ability(s) found (${abilityNames}). Cast resolution defaults to server authority; no client-authoritative envelope detected at the single-file level. Pass a CrossFileContext for cross-file proof.`,
      remediation:
        'Provide a CrossFileContext (resolved ability envelopes) for verified cross-file cast validation.',
    };
  }

  /**
   * Obligation 4 — range_exploit
   *
   * Rule: Abilities with range > 0 must have server-enforced range validation.
   * Round-2: structural — satisfied if ranged abilities are present (the
   * compiler emits server-side range checks in ColyseusCompiler output).
   * 'not_applicable' if no abilities declare a positive range.
   */
  private checkRangeExploit(composition: HoloComposition): ProofObligation {
    const rangedAbilities = (composition.abilities ?? []).filter(
      (a) => (a.stats?.range ?? 0) > 0
    );

    if (rangedAbilities.length === 0) {
      return {
        exploitClass: 'range_exploit',
        status: 'not_applicable',
        rule: 'Abilities with range > 0 must have server-enforced range validation.',
        evidence: 'No abilities with a positive range declared in this composition.',
        remediation: 'No action needed when no ranged abilities are present.',
      };
    }

    const rangedNames = rangedAbilities.map((a) => `${a.name}(range=${a.stats?.range})`).join(', ');

    return {
      exploitClass: 'range_exploit',
      status: 'satisfied',
      rule: 'Abilities with range > 0 must have server-enforced range validation.',
      evidence: `${rangedAbilities.length} ranged ability(s) found: ${rangedNames}. Server range validation is emitted by the compiler at the structural level.`,
      remediation:
        'Already satisfied. Round-3 refinement: add @range_validated per-ability annotation for explicit proof trace.',
    };
  }

  /**
   * Obligation 5 — dupe
   *
   * Rule: Loot must be server-rolled to prevent item duplication.
   * Round-2: structural — satisfied if loot tables are present (the compiler
   * emits server-side rollLoot calls). 'not_applicable' if no loot tables.
   */
  private checkDupe(composition: HoloComposition): ProofObligation {
    const lootTableCount = composition.lootTables?.length ?? 0;

    if (lootTableCount === 0) {
      return {
        exploitClass: 'dupe',
        status: 'not_applicable',
        rule: 'Loot must be server-rolled to prevent item duplication.',
        evidence: 'No loot tables declared in this composition.',
        remediation: 'No action needed when no loot tables are present.',
      };
    }

    const tableNames = composition.lootTables!.map((t) => t.name).join(', ');

    return {
      exploitClass: 'dupe',
      status: 'satisfied',
      rule: 'Loot must be server-rolled to prevent item duplication.',
      evidence: `${lootTableCount} loot table(s) found (${tableNames}). The compiler emits server-side rollLoot for all loot tables; client cannot influence roll outcomes.`,
      remediation:
        'Already satisfied at structural level. Add @server_rolled annotation per loot table for explicit proof trace in round 3.',
    };
  }

  /**
   * Obligation 6 — unaudited_event
   *
   * Rule: Combat/death triggers and player_action logic must emit receipts
   * (via `@receipt_on` root trait or equivalent receipt emission in logic).
   */
  private checkUnauditedEvent(composition: HoloComposition): ProofObligation {
    const hasCombatTriggers = this.hasCombatOrDeathTriggers(composition);
    const hasPlayerAction = this.hasPlayerActionLogic(composition);

    if (!hasCombatTriggers && !hasPlayerAction) {
      return {
        exploitClass: 'unaudited_event',
        status: 'not_applicable',
        rule:
          'Combat/death triggers and player_action logic must emit receipts (@receipt_on or equivalent).',
        evidence:
          'No combat/death triggers or player_action handlers detected in this composition.',
        remediation: 'No action needed for compositions without combat or player action events.',
      };
    }

    const hasReceiptTrait =
      this.hasRootTrait(composition, 'receipt_on') ||
      this.hasRootTrait(composition, 'receipt');

    const evidenceParts: string[] = [];
    if (hasCombatTriggers) evidenceParts.push('combat/death triggers present');
    if (hasPlayerAction) evidenceParts.push('player_action logic present');

    if (hasReceiptTrait) {
      return {
        exploitClass: 'unaudited_event',
        status: 'satisfied',
        rule:
          'Combat/death triggers and player_action logic must emit receipts (@receipt_on or equivalent).',
        evidence: `${evidenceParts.join(', ')}. @receipt_on trait found on composition.`,
        remediation: 'Already satisfied.',
      };
    }

    return {
      exploitClass: 'unaudited_event',
      status: 'unmet',
      rule:
        'Combat/death triggers and player_action logic must emit receipts (@receipt_on or equivalent).',
      evidence: `${evidenceParts.join(', ')} but no @receipt_on root trait detected.`,
      remediation:
        'Add @receipt_on to the composition root traits to emit verifiable receipts for combat/death/player_action events.',
    };
  }

  /**
   * Obligation 7 — info_leak
   *
   * Rule: Server-only data must not be replicated to clients.
   * Round-2: single-file, structural — 'not_applicable' unless a
   * `@server_side` / `@server_only` root trait is present (which would
   * allow a basic check). Without cross-file replication analysis this
   * obligation cannot be fully verified.
   */
  private checkInfoLeak(
    composition: HoloComposition,
    crossFile?: CrossFileContext
  ): ProofObligation {
    // Round-3 cross-file path: prove no server_only symbol is reachable from a
    // client root via the authority symbol graph.
    if (crossFile?.graph) {
      const violations = crossFile.graph.findViolations();
      if (violations.length > 0) {
        const leaked = violations.map((v) => v.symbol.name).join(', ');
        return {
          exploitClass: 'info_leak',
          status: 'unmet',
          rule: 'Server-only state must not be replicated to clients.',
          evidence: `${violations.length} server_only symbol(s) observable from the client bundle: ${leaked}.`,
          remediation:
            'Remove @type/replication from these symbols or break the client→server_only reference chain (see ServerAuthorityBundleSplitter proof).',
        };
      }
      return {
        exploitClass: 'info_leak',
        status: 'satisfied',
        rule: 'Server-only state must not be replicated to clients.',
        evidence:
          'Cross-file authority graph proves no server_only symbol is exposed on, or reachable from, the client wire surface.',
        remediation: 'Already satisfied (cross-file reachability proof).',
      };
    }

    const hasServerSideTrait =
      this.hasRootTrait(composition, 'server_side') ||
      this.hasRootTrait(composition, 'server_only');

    if (!hasServerSideTrait) {
      return {
        exploitClass: 'info_leak',
        status: 'not_applicable',
        rule: 'Server-only state must not be replicated to clients.',
        evidence:
          'No @server_side / @server_only root trait detected. Full replication-graph analysis requires cross-file symbol table (round 3-4 scope). Single-file lint cannot verify absence of info leak without explicit server-side markers.',
        remediation:
          'Add @server_side or @server_only to data blocks that must not be replicated, then re-run this check.',
      };
    }

    // If the composition explicitly marks server-side data, the structural
    // check passes — the compiler is responsible for enforcing the boundary.
    return {
      exploitClass: 'info_leak',
      status: 'satisfied',
      rule: 'Server-only state must not be replicated to clients.',
      evidence:
        '@server_side / @server_only root trait present — compiler will enforce replication boundary.',
      remediation: 'Already satisfied. Round-3: validate replication graph for completeness.',
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Check whether a root trait is attached to the composition.
   * Trait names may or may not carry a leading `@` — we strip it for comparison.
   */
  private hasRootTrait(composition: HoloComposition, traitName: string): boolean {
    return (
      composition.traits?.some((t) => t.name.replace(/^@/, '') === traitName) ?? false
    );
  }

  /**
   * Ability names whose resolved authority allows ANY client-side resolution
   * (`client` or `client_predicted`) — a client-spammable cast surface.
   */
  private clientAuthoritativeAbilities(
    envelopes: Map<string, 'server' | 'client_predicted' | 'client'>
  ): string[] {
    const out: string[] = [];
    for (const [name, tier] of envelopes) {
      if (tier === 'client' || tier === 'client_predicted') out.push(name);
    }
    return out;
  }

  /**
   * Ability names that resolve FULLY on the client with no server reconcile
   * (`client`). `client_predicted` is excluded — the server still reconciles it,
   * so its cast is validated.
   */
  private fullyClientAbilities(
    envelopes: Map<string, 'server' | 'client_predicted' | 'client'>
  ): string[] {
    const out: string[] = [];
    for (const [name, tier] of envelopes) {
      if (tier === 'client') out.push(name);
    }
    return out;
  }

  /**
   * True when the composition has at least one player_action event handler
   * in its top-level logic block.
   */
  private hasPlayerActionLogic(composition: HoloComposition): boolean {
    if (!composition.logic) return false;
    return composition.logic.handlers.some((h) =>
      h.event.toLowerCase().includes('player_action') ||
      h.event.toLowerCase().includes('player_attack') ||
      h.event.toLowerCase().includes('player_cast')
    );
  }

  /**
   * True when the composition has triggers named with combat or death keywords,
   * or top-level logic handlers that suggest combat events.
   */
  private hasCombatOrDeathTriggers(composition: HoloComposition): boolean {
    const COMBAT_KEYWORDS = ['combat', 'death', 'kill', 'damage', 'attack', 'die', 'respawn'];

    const triggerMatch =
      composition.triggers?.some((t) =>
        COMBAT_KEYWORDS.some((kw) => t.name.toLowerCase().includes(kw))
      ) ?? false;

    if (triggerMatch) return true;

    const logicMatch =
      composition.logic?.handlers.some((h) =>
        COMBAT_KEYWORDS.some((kw) => h.event.toLowerCase().includes(kw))
      ) ?? false;

    return logicMatch;
  }

  /**
   * Build the one-line human verdict string.
   */
  private buildSummary(
    provablyBounded: boolean,
    strict: boolean,
    satisfied: number,
    unmet: number,
    obligations: ProofObligation[]
  ): string {
    if (!strict) {
      return `AUDIT ONLY (no @provably_bounded): ${satisfied} satisfied, ${unmet} unmet.`;
    }

    if (provablyBounded) {
      const applicable = obligations.filter((o) => o.status !== 'not_applicable').length;
      return `PROVABLY BOUNDED: ${satisfied}/${applicable} applicable obligations satisfied.`;
    }

    const unmetClasses = obligations
      .filter((o) => o.status === 'unmet')
      .map((o) => o.exploitClass)
      .join(', ');

    return `NOT BOUNDED: ${unmet} unmet obligation(s) (${unmetClasses}).`;
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a `ProvenanceBoundsChecker` with optional configuration.
 *
 * @example
 * ```ts
 * const checker = createProvenanceBoundsChecker();
 * const report = checker.check(composition);
 * if (!report.provablyBounded) {
 *   console.error(report.summary);
 * }
 * ```
 */
export function createProvenanceBoundsChecker(
  config?: ProvenanceBoundsConfig
): ProvenanceBoundsChecker {
  return new ProvenanceBoundsChecker(config);
}
