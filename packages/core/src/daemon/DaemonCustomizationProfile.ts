/**
 * DaemonCustomizationProfile — the user-facing configuration surface.
 *
 * D.053 ruling: "The UI/capability language says shape your local daemon,
 * never customize Brittney, and stores permissions separately from style."
 *
 * This type is what the user sees and edits. It composes into a full
 * ConversationDaemon via `customizationProfileToDaemon`, but the two
 * concerns — style and permissions — are structurally separated throughout
 * the customization surface.
 *
 * Invariant enforced by validators:
 *   1. Style and permissions are never merged into a single flat object.
 *   2. The product language never references Brittney; the user shapes
 *      their daemon, not the field.
 *   3. Permission escalation requires explicit custody scope.
 *   4. Memory boundaries are permission-tiered, not style-tiered.
 *
 * @see ConversationDaemon — the full contract type
 * @see D.053 — direction: ConversationDaemon and Brittney field
 */

import type {
  ConversationDaemon,
  DaemonAppearanceProfile,
  DaemonVoiceProfile,
  DaemonToneProfile,
  DaemonPermissionProfile,
  DaemonMemoryPolicy,
  DaemonDispatchPolicy,
  DaemonReceiptSink,
  DaemonBrittneyRehydrationChannel,
  DaemonContextSourceKind,
  DaemonOwnerPolicy,
} from './ConversationDaemon';

// ─── Rituals & Workflows ──────────────────────────────────────────────────

/**
 * A named ritual the daemon can perform on schedule or trigger.
 *
 * Rituals are personal — they belong to the daemon's style layer, not
 * the permission layer. Examples: "morning briefing", "end-of-day review",
 * "focus mode".
 */
export interface DaemonRitual {
  /** Human-readable ritual name. */
  name: string;
  /** Cron expression or trigger keyword. */
  trigger: string;
  /** Brief description of what the ritual does. */
  description: string;
  /** Whether the ritual is currently active. */
  enabled: boolean;
}

/**
 * A bookmarked workflow the daemon can invoke or suggest.
 *
 * Favorite workflows are style — the user's preferred patterns. Permission
 * to execute them comes from the permission layer, not from the bookmark.
 */
export interface DaemonFavoriteWorkflow {
  /** Human-readable workflow name. */
  name: string;
  /** Workflow identifier (references a HoloScript workflow or skill). */
  workflowId: string;
  /** Brief description of what the workflow does. */
  description: string;
}

// ─── Style Profile ────────────────────────────────────────────────────────

/**
 * The style layer of a daemon customization — everything the user
 * personally shapes: name, look, voice, tone, care, rituals, and
 * favorite workflows.
 *
 * This is NEVER merged with permissions. Style is personal expression;
 * permissions are safety boundaries. They are stored and validated
 * independently.
 */
export interface DaemonStyleProfile {
  /** The name the user gives their daemon. "Lumi", "Atlas", "Kai", etc. */
  displayName: string;

  /** Visual appearance — character class, color palette, animation set. */
  appearance: DaemonAppearanceProfile;

  /** Voice configuration — enabled, voice ID, speed, tone. */
  voice: DaemonVoiceProfile;

  /** Tone preferences — formality, verbosity, humor, patience. */
  tone: DaemonToneProfile;

  /**
   * Care profile identifier. References a care model definition (e.g.,
   * "care-v1", "attentive", "minimal"). Care is style because it
   * expresses how the daemon relates to the user, not what it can do.
   */
  careProfile: string;

  /** Named rituals the daemon performs. Style — personal patterns. */
  rituals: DaemonRitual[];

  /** Bookmarked workflows. Style — personal preferences. */
  favoriteWorkflows: DaemonFavoriteWorkflow[];

  /**
   * Visual theme identifier. References a theme pack or preset.
   * e.g., "default", "minimal-dark", "nature", "retro-terminal"
   */
  visualTheme: string;

  /**
   * Free-form personalization notes the user has written about
   * their daemon. Style — self-expression, not permission.
   */
  personalNotes?: string;
}

// ─── Permission Configuration ──────────────────────────────────────────────

/**
 * The permission layer of a daemon customization — safety boundaries
 * that govern what the daemon can do, what it remembers, and how
 * it escalates.
 *
 * Stored separately from style. The user can adjust permissions, but
 * the system enforces invariants (e.g., break-glass requires custody
 * scope, autonomous mutations require receipts).
 */
export interface DaemonPermissionConfig {
  /** Owner policy: private, shared_household, or workspace. */
  ownerPolicy: DaemonOwnerPolicy;

  /** Permission envelope and mutation boundaries. */
  permissions: DaemonPermissionProfile;

  /** Memory retention and scope. */
  memory: DaemonMemoryPolicy;

  /** Dispatch confidence and autonomy settings. */
  dispatch: DaemonDispatchPolicy;

  /** Where receipts are stored. */
  receiptSink: DaemonReceiptSink;

  /** Context sources the daemon can draw from. */
  contextSources: DaemonContextSourceKind[];

  /** Brittney rehydration channel — how the daemon feeds the field. */
  brittneyChannel: DaemonBrittneyRehydrationChannel;
}

// ─── Customization Profile (the composed surface) ─────────────────────────

/**
 * The user-facing customization profile — the single surface for
 * "shape your local daemon."
 *
 * Style and permissions are structurally separated (D.053 invariant).
 * The product language references this profile, never Brittney.
 * The factory `customizationProfileToDaemon` composes both layers
 * into a full ConversationDaemon.
 */
export interface DaemonCustomizationProfile {
  /** Unique identifier for this profile. */
  profileId: string;

  /** The owner of this profile — the user who shapes the daemon. */
  ownerId: string;

  /** Style layer — personal expression, appearance, rituals. */
  style: DaemonStyleProfile;

  /** Permission layer — safety boundaries, memory, dispatch. */
  permissions: DaemonPermissionConfig;

  /** ISO-8601 timestamp of profile creation. */
  createdAt: string;

  /** ISO-8601 timestamp of last modification. */
  updatedAt?: string;

  /**
   * Version counter for optimistic concurrency. Incremented on
   * every successful write. Style and permissions share one version
   * so the UI can detect concurrent edits across layers.
   */
  version: number;
}

// ─── Separation Error ──────────────────────────────────────────────────────

export class DaemonCustomizationSeparationError extends Error {
  constructor(message: string) {
    super(`[DaemonCustomization] ${message}`);
    this.name = 'DaemonCustomizationSeparationError';
  }
}

// ─── Validators ────────────────────────────────────────────────────────────

/**
 * Validates the D.053 separation invariant: style and permissions
 * are structurally separate, and no style field leaks into the
 * permission layer (or vice versa).
 *
 * This is the customization-layer validator. For the daemon-level
 * invariant, use `assertDaemonFieldSeparation` from ConversationDaemon.
 */
export function assertCustomizationSeparation(
  profile: DaemonCustomizationProfile
): void {
  // Invariant 1: displayName must not reference Brittney
  const forbiddenNames = ['brittney', 'britney', 'britt', 'field', 'substrate'];
  const lowerName = profile.style.displayName.toLowerCase();
  for (const forbidden of forbiddenNames) {
    if (lowerName.includes(forbidden)) {
      throw new DaemonCustomizationSeparationError(
        `displayName "${profile.style.displayName}" references "${forbidden}" — ` +
        `the user shapes their local daemon, not the field. D.053.`
      );
    }
  }

  // Invariant 2: care profile must not be a permission identifier
  const permissionLikePrefixes = ['perm:', 'cap:', 'secret:', 'auth:', 'role:'];
  for (const prefix of permissionLikePrefixes) {
    if (profile.style.careProfile.startsWith(prefix)) {
      throw new DaemonCustomizationSeparationError(
        `careProfile "${profile.style.careProfile}" starts with "${prefix}" — ` +
        `care is style, not permission. Use a care model name, not a capability URI.`
      );
    }
  }

  // Invariant 3: break-glass requires custody scope (mirrors ConversationDaemon invariant)
  if (profile.permissions.permissions.breakGlassAllowed) {
    if (profile.permissions.permissions.custodyScope.length === 0) {
      throw new DaemonCustomizationSeparationError(
        'break-glass requires an explicit custodyScope — ' +
        'a daemon must not hold global field authority'
      );
    }
  }

  // Invariant 4: autonomous mutations require receipts (mirrors ConversationDaemon invariant)
  if (profile.permissions.permissions.autonomousMutations) {
    if (!profile.permissions.dispatch.receiptRequired) {
      throw new DaemonCustomizationSeparationError(
        'autonomous mutations require receiptRequired:true — ' +
        'HoloShell cannot prove field actions without receipts'
      );
    }
  }

  // Invariant 5: memory is owner-scoped (daemons do not share memory with the field)
  if (!profile.permissions.memory.ownerScoped) {
    throw new DaemonCustomizationSeparationError(
      'memory.ownerScoped must be true — daemons do not share memory with the field'
    );
  }

  // Invariant 6: brittneyChannel channelId must not be empty
  if (!profile.permissions.brittneyChannel.channelId) {
    throw new DaemonCustomizationSeparationError(
      'brittneyChannel.channelId is required — field routing cannot be anonymous'
    );
  }

  // Invariant 7: rituals must not contain permission-like triggers
  for (const ritual of profile.style.rituals) {
    for (const prefix of permissionLikePrefixes) {
      if (ritual.trigger.startsWith(prefix)) {
        throw new DaemonCustomizationSeparationError(
          `ritual "${ritual.name}" trigger "${ritual.trigger}" starts with "${prefix}" — ` +
          `rituals are personal patterns, not capability grants.`
        );
      }
    }
  }

  // Invariant 8: favoriteWorkflows must not contain permission URIs as workflow IDs
  for (const wf of profile.style.favoriteWorkflows) {
    for (const prefix of permissionLikePrefixes) {
      if (wf.workflowId.startsWith(prefix)) {
        throw new DaemonCustomizationSeparationError(
          `workflow "${wf.name}" id "${wf.workflowId}" starts with "${prefix}" — ` +
          `workflows are personal bookmarks, not capability grants.`
        );
      }
    }
  }
}

/**
 * Validates the structural shape of a customization profile.
 * Returns an array of validation errors (empty if valid).
 */
export function validateCustomizationProfile(
  profile: DaemonCustomizationProfile
): string[] {
  const errors: string[] = [];

  if (!profile.profileId) errors.push('profileId is required.');
  if (!profile.ownerId) errors.push('ownerId is required.');
  if (!profile.style.displayName) errors.push('style.displayName is required.');
  if (profile.version < 0) errors.push('version must be non-negative.');

  // Style layer validations
  if (!profile.style.appearance) {
    errors.push('style.appearance is required.');
  }
  if (!profile.style.voice) {
    errors.push('style.voice is required.');
  }
  if (!profile.style.tone) {
    errors.push('style.tone is required.');
  }
  if (!profile.style.careProfile) {
    errors.push('style.careProfile is required.');
  }
  if (!profile.style.visualTheme) {
    errors.push('style.visualTheme is required.');
  }

  // Permission layer validations
  if (!profile.permissions.ownerPolicy) {
    errors.push('permissions.ownerPolicy is required.');
  }
  if (!profile.permissions.permissions) {
    errors.push('permissions.permissions is required.');
  }
  if (!profile.permissions.memory) {
    errors.push('permissions.memory is required.');
  }
  if (!profile.permissions.dispatch) {
    errors.push('permissions.dispatch is required.');
  }
  if (!profile.permissions.receiptSink) {
    errors.push('permissions.receiptSink is required.');
  }
  if (!profile.permissions.brittneyChannel) {
    errors.push('permissions.brittneyChannel is required.');
  }

  // Run separation invariant checks
  try {
    assertCustomizationSeparation(profile);
  } catch (e) {
    if (e instanceof DaemonCustomizationSeparationError) {
      errors.push(e.message);
    }
  }

  return errors;
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Built-in visual themes for daemon appearance.
 */
export const DAEMON_VISUAL_THEMES = [
  'default',
  'minimal-dark',
  'nature',
  'retro-terminal',
  'ocean-depths',
  'warm-sunset',
  'paper-and-ink',
] as const;
export type DaemonVisualTheme = (typeof DAEMON_VISUAL_THEMES)[number];

/**
 * Built-in care profile identifiers.
 */
export const DAEMON_CARE_PROFILES = [
  'care-v1',
  'attentive',
  'minimal',
  'companion',
  'professional',
] as const;
export type DaemonCareProfile = (typeof DAEMON_CARE_PROFILES)[number];

/**
 * Creates a default style profile with sensible defaults.
 * The user personalizes from here — name, appearance, tone, rituals.
 */
export function makeDefaultStyleProfile(
  displayName: string = 'Lumi',
  careProfile: DaemonCareProfile = 'care-v1'
): DaemonStyleProfile {
  return {
    displayName,
    appearance: {
      characterClass: 'companion',
      scale: 'small',
    },
    voice: {
      enabled: false,
    },
    tone: {
      formality: 'balanced',
      verbosity: 'balanced',
      humor: 'light',
      patience: 'patient',
    },
    careProfile,
    rituals: [],
    favoriteWorkflows: [],
    visualTheme: 'default',
  };
}

/**
 * Creates a default permission configuration with safe defaults.
 * Starts read-only, no autonomous mutations, local memory, receipts on.
 */
export function makeDefaultPermissionConfig(
  ownerId: string,
  daemonId: string
): DaemonPermissionConfig {
  return {
    ownerPolicy: 'private',
    permissions: {
      readOnly: true,
      proposeMutations: true,
      autonomousMutations: false,
      breakGlassAllowed: false,
      custodyScope: [],
      permissionEnvelope: 'read_only',
    },
    memory: {
      retention: 'persisted_local',
      absorbIntegration: true,
      ownerScoped: true,
    },
    dispatch: {
      defaultConfidence: 'confirm_before',
      trustedPatterns: [],
      receiptRequired: true,
      maxAutonomousActionsPerSession: 0,
    },
    receiptSink: {
      local: true,
      holoshell: true,
      absorb: true,
      holomesh: false,
    },
    contextSources: [
      'operator_brief',
      'holoscript_surface_map',
      'recent_receipts',
    ],
    brittneyChannel: {
      enabled: true,
      channelId: `${ownerId}:${daemonId}`,
      deltaCompression: true,
      minimumDeltaSignificance: 0.2,
    },
  };
}

/**
 * Creates a full customization profile with safe defaults.
 * The user personalizes the style layer; permissions start conservative.
 */
export function makeDefaultCustomizationProfile(
  profileId: string,
  ownerId: string,
  displayName: string = 'Lumi',
  careProfile: DaemonCareProfile = 'care-v1'
): DaemonCustomizationProfile {
  return {
    profileId,
    ownerId,
    style: makeDefaultStyleProfile(displayName, careProfile),
    permissions: makeDefaultPermissionConfig(ownerId, profileId),
    createdAt: new Date().toISOString(),
    version: 1,
  };
}

// ─── Composition ────────────────────────────────────────────────────────────

/**
 * Composes a customization profile into a full ConversationDaemon.
 *
 * This is the bridge between the user-facing customization surface
 * and the internal daemon contract. Style and permissions are composed
 * but remain structurally separate — the daemon's sub-objects map
 * directly to the customization layers.
 *
 * D.053 invariant: the resulting daemon passes `assertDaemonFieldSeparation`.
 */
export function customizationProfileToDaemon(
  profile: DaemonCustomizationProfile
): ConversationDaemon {
  // Validate the profile before composing
  const errors = validateCustomizationProfile(profile);
  if (errors.length > 0) {
    throw new DaemonCustomizationSeparationError(
      `Cannot compose invalid profile: ${errors.join('; ')}`
    );
  }

  return {
    daemonId: profile.profileId,
    ownerId: profile.ownerId,
    ownerPolicy: profile.permissions.ownerPolicy,
    displayName: profile.style.displayName,
    appearanceProfile: profile.style.appearance,
    voiceProfile: profile.style.voice,
    careProfile: profile.style.careProfile,
    toneProfile: profile.style.tone,
    permissionProfile: profile.permissions.permissions,
    memoryPolicy: profile.permissions.memory,
    contextSources: profile.permissions.contextSources,
    dispatchPolicy: profile.permissions.dispatch,
    receiptSink: profile.permissions.receiptSink,
    brittneyRehydrationChannel: profile.permissions.brittneyChannel,
    createdAt: profile.createdAt,
  };
}

/**
 * Decomposes a ConversationDaemon back into a customization profile.
 *
 * Useful for editing an existing daemon through the customization UI.
 * Style and permissions are re-separated into their respective layers.
 */
export function daemonToCustomizationProfile(
  daemon: ConversationDaemon
): DaemonCustomizationProfile {
  return {
    profileId: daemon.daemonId,
    ownerId: daemon.ownerId,
    style: {
      displayName: daemon.displayName,
      appearance: daemon.appearanceProfile,
      voice: daemon.voiceProfile,
      tone: daemon.toneProfile,
      careProfile: daemon.careProfile,
      rituals: [],
      favoriteWorkflows: [],
      visualTheme: 'default',
    },
    permissions: {
      ownerPolicy: daemon.ownerPolicy,
      permissions: daemon.permissionProfile,
      memory: daemon.memoryPolicy,
      dispatch: daemon.dispatchPolicy,
      receiptSink: daemon.receiptSink,
      contextSources: daemon.contextSources,
      brittneyChannel: daemon.brittneyRehydrationChannel,
    },
    createdAt: daemon.createdAt,
    version: 1,
  };
}

/**
 * Merges style updates into an existing profile.
 * Only style fields are modified — permissions are untouched.
 */
export function mergeStyleUpdates(
  profile: DaemonCustomizationProfile,
  styleUpdates: Partial<DaemonStyleProfile>
): DaemonCustomizationProfile {
  return {
    ...profile,
    style: { ...profile.style, ...styleUpdates },
    version: profile.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Merges permission updates into an existing profile.
 * Only permission fields are modified — style is untouched.
 */
export function mergePermissionUpdates(
  profile: DaemonCustomizationProfile,
  permissionUpdates: Partial<DaemonPermissionConfig>
): DaemonCustomizationProfile {
  const updated: DaemonCustomizationProfile = {
    ...profile,
    permissions: { ...profile.permissions, ...permissionUpdates },
    version: profile.version + 1,
    updatedAt: new Date().toISOString(),
  };

  // Re-validate separation invariants after permission changes
  assertCustomizationSeparation(updated);

  return updated;
}

/**
 * Convenience: creates a preset profile for common daemon personas.
 *
 * Presets provide starting points — the user personalizes from here.
 * Language always says "shape your daemon," never "customize Brittney."
 */
export function makePresetProfile(
  preset: 'companion' | 'professional' | 'creative' | 'minimal' | 'guardian',
  profileId: string,
  ownerId: string
): DaemonCustomizationProfile {
  const base = makeDefaultCustomizationProfile(profileId, ownerId);

  switch (preset) {
    case 'companion':
      base.style = {
        ...base.style,
        displayName: 'Lumi',
        appearance: { characterClass: 'companion', scale: 'small' },
        tone: { formality: 'casual', verbosity: 'balanced', humor: 'light', patience: 'patient' },
        careProfile: 'care-v1',
        visualTheme: 'default',
      };
      break;

    case 'professional':
      base.style = {
        ...base.style,
        displayName: 'Atlas',
        appearance: { characterClass: 'professional', scale: 'medium' },
        tone: { formality: 'formal', verbosity: 'terse', humor: 'none', patience: 'quick' },
        careProfile: 'professional',
        visualTheme: 'minimal-dark',
      };
      break;

    case 'creative':
      base.style = {
        ...base.style,
        displayName: 'Kai',
        appearance: { characterClass: 'creative', scale: 'medium' },
        tone: { formality: 'casual', verbosity: 'detailed', humor: 'moderate', patience: 'patient' },
        careProfile: 'attentive',
        visualTheme: 'warm-sunset',
      };
      break;

    case 'minimal':
      base.style = {
        ...base.style,
        displayName: 'Echo',
        appearance: { characterClass: 'minimal', scale: 'tiny' },
        tone: { formality: 'balanced', verbosity: 'terse', humor: 'none', patience: 'quick' },
        careProfile: 'minimal',
        visualTheme: 'paper-and-ink',
      };
      break;

    case 'guardian':
      base.style = {
        ...base.style,
        displayName: 'Aegis',
        appearance: { characterClass: 'guardian', scale: 'large' },
        tone: { formality: 'formal', verbosity: 'balanced', humor: 'none', patience: 'patient' },
        careProfile: 'attentive',
        visualTheme: 'ocean-depths',
      };
      // Guardian preset also escalates permissions slightly
      base.permissions = {
        ...base.permissions,
        permissions: {
          readOnly: true,
          proposeMutations: true,
          autonomousMutations: false,
          breakGlassAllowed: true,
          custodyScope: ['holoshell:guardian:emergency'],
          permissionEnvelope: 'guarded_execute',
        },
      };
      break;
  }

  return base;
}