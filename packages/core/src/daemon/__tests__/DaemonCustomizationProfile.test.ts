import { describe, it, expect } from 'vitest';
import {
  assertCustomizationSeparation,
  DaemonCustomizationSeparationError,
  validateCustomizationProfile,
  makeDefaultStyleProfile,
  makeDefaultPermissionConfig,
  makeDefaultCustomizationProfile,
  customizationProfileToDaemon,
  daemonToCustomizationProfile,
  mergeStyleUpdates,
  mergePermissionUpdates,
  makePresetProfile,
  DAEMON_VISUAL_THEMES,
  DAEMON_CARE_PROFILES,
  type DaemonCustomizationProfile,
  type DaemonStyleProfile,
  type DaemonPermissionConfig,
  type DaemonRitual,
  type DaemonFavoriteWorkflow,
} from '../DaemonCustomizationProfile';
import { assertDaemonFieldSeparation } from '../ConversationDaemon';

function baseValidProfile(): DaemonCustomizationProfile {
  return makeDefaultCustomizationProfile('p1', 'owner1', 'Lumi', 'care-v1');
}

// ─── Factory defaults ───────────────────────────────────────────────────────

describe('makeDefaultStyleProfile', () => {
  it('creates a style profile with sensible defaults', () => {
    const style = makeDefaultStyleProfile();
    expect(style.displayName).toBe('Lumi');
    expect(style.appearance.characterClass).toBe('companion');
    expect(style.appearance.scale).toBe('small');
    expect(style.voice.enabled).toBe(false);
    expect(style.tone.formality).toBe('balanced');
    expect(style.tone.patience).toBe('patient');
    expect(style.rituals).toHaveLength(0);
    expect(style.favoriteWorkflows).toHaveLength(0);
    expect(style.visualTheme).toBe('default');
  });

  it('accepts a custom displayName', () => {
    const style = makeDefaultStyleProfile('Atlas');
    expect(style.displayName).toBe('Atlas');
  });

  it('accepts a custom careProfile', () => {
    const style = makeDefaultStyleProfile('Kai', 'attentive');
    expect(style.careProfile).toBe('attentive');
  });
});

describe('makeDefaultPermissionConfig', () => {
  it('creates safe permission defaults', () => {
    const perms = makeDefaultPermissionConfig('owner1', 'd1');
    expect(perms.ownerPolicy).toBe('private');
    expect(perms.permissions.readOnly).toBe(true);
    expect(perms.permissions.autonomousMutations).toBe(false);
    expect(perms.permissions.breakGlassAllowed).toBe(false);
    expect(perms.memory.ownerScoped).toBe(true);
    expect(perms.dispatch.receiptRequired).toBe(true);
    expect(perms.dispatch.maxAutonomousActionsPerSession).toBe(0);
  });

  it('sets brittneyChannel channelId from ownerId:daemonId', () => {
    const perms = makeDefaultPermissionConfig('owner1', 'd1');
    expect(perms.brittneyChannel.channelId).toBe('owner1:d1');
    expect(perms.brittneyChannel.enabled).toBe(true);
  });
});

describe('makeDefaultCustomizationProfile', () => {
  it('creates a profile that passes all validation', () => {
    const profile = baseValidProfile();
    const errors = validateCustomizationProfile(profile);
    expect(errors).toHaveLength(0);
  });

  it('has version 1 on creation', () => {
    const profile = baseValidProfile();
    expect(profile.version).toBe(1);
  });

  it('style and permissions are independent objects', () => {
    const profile = baseValidProfile();
    expect(profile.style).toBeDefined();
    expect(profile.permissions).toBeDefined();
    expect(profile.style === profile.permissions).toBe(false);
  });
});

// ─── Separation invariants (D.053) ──────────────────────────────────────────

describe('assertCustomizationSeparation', () => {
  it('passes for a default profile', () => {
    const profile = baseValidProfile();
    expect(() => assertCustomizationSeparation(profile)).not.toThrow();
  });

  it('rejects displayName containing "Brittney"', () => {
    const profile = baseValidProfile();
    profile.style.displayName = 'Brittney';
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
    expect(() => assertCustomizationSeparation(profile)).toThrow('references "brittney"');
  });

  it('rejects displayName containing "field"', () => {
    const profile = baseValidProfile();
    profile.style.displayName = 'MyField';
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('rejects displayName containing "substrate"', () => {
    const profile = baseValidProfile();
    profile.style.displayName = 'SubstrateBot';
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('allows "Atlas" as a displayName', () => {
    const profile = baseValidProfile();
    profile.style.displayName = 'Atlas';
    expect(() => assertCustomizationSeparation(profile)).not.toThrow();
  });

  it('rejects careProfile with permission-like prefix', () => {
    const profile = baseValidProfile();
    profile.style.careProfile = 'cap://daemon/read';
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('rejects break-glass without custody scope', () => {
    const profile = baseValidProfile();
    profile.permissions.permissions.breakGlassAllowed = true;
    profile.permissions.permissions.custodyScope = [];
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('allows break-glass with custody scope', () => {
    const profile = baseValidProfile();
    profile.permissions.permissions.breakGlassAllowed = true;
    profile.permissions.permissions.custodyScope = ['holoshell:room:home'];
    expect(() => assertCustomizationSeparation(profile)).not.toThrow();
  });

  it('rejects autonomous mutations without receipts', () => {
    const profile = baseValidProfile();
    profile.permissions.permissions.autonomousMutations = true;
    profile.permissions.permissions.readOnly = false;
    profile.permissions.dispatch.receiptRequired = false;
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('allows autonomous mutations with receipts', () => {
    const profile = baseValidProfile();
    profile.permissions.permissions.autonomousMutations = true;
    profile.permissions.permissions.readOnly = false;
    profile.permissions.dispatch.receiptRequired = true;
    expect(() => assertCustomizationSeparation(profile)).not.toThrow();
  });

  it('rejects memory.ownerScoped=false', () => {
    const profile = baseValidProfile();
    // Type assertion to test the invariant — ownerScoped is typed as `true`
    (profile.permissions.memory as Record<string, unknown>).ownerScoped = false;
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('rejects empty brittneyChannel channelId', () => {
    const profile = baseValidProfile();
    profile.permissions.brittneyChannel.channelId = '';
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('rejects ritual with permission-like trigger', () => {
    const profile = baseValidProfile();
    const ritual: DaemonRitual = {
      name: 'secret-ritual',
      trigger: 'cap://daemon/execute',
      description: 'Should not be allowed',
      enabled: true,
    };
    profile.style.rituals = [ritual];
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('rejects workflow with permission-like ID', () => {
    const profile = baseValidProfile();
    const wf: DaemonFavoriteWorkflow = {
      name: 'bad-workflow',
      workflowId: 'auth://admin/sudo',
      description: 'Should not be allowed',
    };
    profile.style.favoriteWorkflows = [wf];
    expect(() => assertCustomizationSeparation(profile)).toThrow(DaemonCustomizationSeparationError);
  });

  it('allows ritual with cron-style trigger', () => {
    const profile = baseValidProfile();
    const ritual: DaemonRitual = {
      name: 'morning-briefing',
      trigger: '0 8 * * *',
      description: 'Daily morning briefing',
      enabled: true,
    };
    profile.style.rituals = [ritual];
    expect(() => assertCustomizationSeparation(profile)).not.toThrow();
  });
});

// ─── Structural validation ──────────────────────────────────────────────────

describe('validateCustomizationProfile', () => {
  it('returns empty array for valid profile', () => {
    const profile = baseValidProfile();
    expect(validateCustomizationProfile(profile)).toHaveLength(0);
  });

  it('catches missing profileId', () => {
    const profile = baseValidProfile();
    profile.profileId = '';
    expect(validateCustomizationProfile(profile)).toContain('profileId is required.');
  });

  it('catches missing ownerId', () => {
    const profile = baseValidProfile();
    profile.ownerId = '';
    expect(validateCustomizationProfile(profile)).toContain('ownerId is required.');
  });

  it('catches missing displayName', () => {
    const profile = baseValidProfile();
    profile.style.displayName = '';
    expect(validateCustomizationProfile(profile)).toContain('style.displayName is required.');
  });

  it('catches negative version', () => {
    const profile = baseValidProfile();
    profile.version = -1;
    expect(validateCustomizationProfile(profile)).toContain('version must be non-negative.');
  });

  it('includes separation errors in validation results', () => {
    const profile = baseValidProfile();
    profile.style.displayName = 'Brittney';
    const errors = validateCustomizationProfile(profile);
    expect(errors.some(e => e.includes('references "brittney"'))).toBe(true);
  });
});

// ─── Composition ────────────────────────────────────────────────────────────

describe('customizationProfileToDaemon', () => {
  it('produces a ConversationDaemon that passes field separation', () => {
    const profile = baseValidProfile();
    const daemon = customizationProfileToDaemon(profile);
    expect(daemon.daemonId).toBe('p1');
    expect(daemon.ownerId).toBe('owner1');
    expect(daemon.displayName).toBe('Lumi');
    expect(daemon.careProfile).toBe('care-v1');
    expect(daemon.permissionProfile.readOnly).toBe(true);
    expect(daemon.memoryPolicy.ownerScoped).toBe(true);
    expect(daemon.brittneyRehydrationChannel.channelId).toBe('owner1:p1');
    // Must pass the daemon-level separation invariant too
    expect(() => assertDaemonFieldSeparation(daemon)).not.toThrow();
  });

  it('maps style layer to daemon appearance/voice/tone', () => {
    const profile = baseValidProfile();
    profile.style.appearance = { characterClass: 'guardian', scale: 'large', colorPalette: ['#1a1a2e', '#16213e'] };
    profile.style.voice = { enabled: true, voiceId: 'v-echo-1', speed: 1.1, tone: 'warm' };
    profile.style.tone = { formality: 'formal', verbosity: 'terse', humor: 'none', patience: 'quick' };

    const daemon = customizationProfileToDaemon(profile);
    expect(daemon.appearanceProfile.characterClass).toBe('guardian');
    expect(daemon.appearanceProfile.colorPalette).toEqual(['#1a1a2e', '#16213e']);
    expect(daemon.voiceProfile.enabled).toBe(true);
    expect(daemon.voiceProfile.voiceId).toBe('v-echo-1');
    expect(daemon.toneProfile.formality).toBe('formal');
  });

  it('maps permission layer to daemon permissions/dispatch/memory', () => {
    const profile = baseValidProfile();
    profile.permissions.permissions.readOnly = false;
    profile.permissions.permissions.proposeMutations = true;
    profile.permissions.permissions.autonomousMutations = true;
    profile.permissions.permissions.breakGlassAllowed = true;
    profile.permissions.permissions.custodyScope = ['holoshell:room:42'];
    profile.permissions.permissions.permissionEnvelope = 'guarded_execute';
    profile.permissions.dispatch.maxAutonomousActionsPerSession = 5;

    const daemon = customizationProfileToDaemon(profile);
    expect(daemon.permissionProfile.autonomousMutations).toBe(true);
    expect(daemon.permissionProfile.custodyScope).toEqual(['holoshell:room:42']);
    expect(daemon.dispatchPolicy.maxAutonomousActionsPerSession).toBe(5);
  });

  it('throws on invalid profile', () => {
    const profile = baseValidProfile();
    profile.style.displayName = 'Brittney';
    expect(() => customizationProfileToDaemon(profile)).toThrow(DaemonCustomizationSeparationError);
  });
});

describe('daemonToCustomizationProfile', () => {
  it('round-trips: daemon -> profile -> daemon preserves fields', () => {
    const original = makeDefaultCustomizationProfile('p1', 'owner1', 'Atlas', 'professional');
    const daemon = customizationProfileToDaemon(original);
    const roundTripped = daemonToCustomizationProfile(daemon);

    expect(roundTripped.profileId).toBe(daemon.daemonId);
    expect(roundTripped.ownerId).toBe(daemon.ownerId);
    expect(roundTripped.style.displayName).toBe(daemon.displayName);
    expect(roundTripped.style.appearance).toEqual(daemon.appearanceProfile);
    expect(roundTripped.style.voice).toEqual(daemon.voiceProfile);
    expect(roundTripped.style.tone).toEqual(daemon.toneProfile);
    expect(roundTripped.style.careProfile).toBe(daemon.careProfile);
    expect(roundTripped.permissions.permissions).toEqual(daemon.permissionProfile);
    expect(roundTripped.permissions.memory).toEqual(daemon.memoryPolicy);
    expect(roundTripped.permissions.dispatch).toEqual(daemon.dispatchPolicy);
  });

  it('round-tripped profile validates correctly', () => {
    const original = makeDefaultCustomizationProfile('p1', 'owner1');
    const daemon = customizationProfileToDaemon(original);
    const roundTripped = daemonToCustomizationProfile(daemon);
    const errors = validateCustomizationProfile(roundTripped);
    expect(errors).toHaveLength(0);
  });
});

// ─── Merge functions ────────────────────────────────────────────────────────

describe('mergeStyleUpdates', () => {
  it('updates style fields without touching permissions', () => {
    const profile = baseValidProfile();
    const originalPerms = { ...profile.permissions };

    const updated = mergeStyleUpdates(profile, {
      displayName: 'Kai',
      visualTheme: 'warm-sunset',
    });

    expect(updated.style.displayName).toBe('Kai');
    expect(updated.style.visualTheme).toBe('warm-sunset');
    expect(updated.permissions).toEqual(originalPerms);
    expect(updated.version).toBe(profile.version + 1);
    expect(updated.updatedAt).toBeTruthy();
  });

  it('preserves unmodified style fields', () => {
    const profile = baseValidProfile();
    const originalAppearance = { ...profile.style.appearance };

    const updated = mergeStyleUpdates(profile, { displayName: 'Echo' });

    expect(updated.style.appearance).toEqual(originalAppearance);
    expect(updated.style.tone).toEqual(profile.style.tone);
  });
});

describe('mergePermissionUpdates', () => {
  it('updates permission fields without touching style', () => {
    const profile = baseValidProfile();
    const originalStyle = { ...profile.style };

    const updated = mergePermissionUpdates(profile, {
      permissions: {
        readOnly: false,
        proposeMutations: true,
        autonomousMutations: true,
        breakGlassAllowed: true,
        custodyScope: ['holoshell:room:42'],
        permissionEnvelope: 'guarded_execute' as const,
      },
    });

    expect(updated.permissions.permissions.autonomousMutations).toBe(true);
    expect(updated.permissions.permissions.custodyScope).toEqual(['holoshell:room:42']);
    expect(updated.style).toEqual(originalStyle);
    expect(updated.version).toBe(profile.version + 1);
  });

  it('validates separation invariants after permission merge', () => {
    const profile = baseValidProfile();

    // Attempting break-glass without custody scope should throw
    expect(() =>
      mergePermissionUpdates(profile, {
        permissions: {
          readOnly: true,
          proposeMutations: true,
          autonomousMutations: false,
          breakGlassAllowed: true,
          custodyScope: [],
          permissionEnvelope: 'break_glass' as const,
        },
      })
    ).toThrow(DaemonCustomizationSeparationError);
  });
});

// ─── Presets ────────────────────────────────────────────────────────────────

describe('makePresetProfile', () => {
  it('creates companion preset', () => {
    const profile = makePresetProfile('companion', 'p1', 'owner1');
    expect(profile.style.displayName).toBe('Lumi');
    expect(profile.style.appearance.characterClass).toBe('companion');
    expect(profile.style.tone.formality).toBe('casual');
    expect(profile.style.careProfile).toBe('care-v1');
  });

  it('creates professional preset', () => {
    const profile = makePresetProfile('professional', 'p2', 'owner1');
    expect(profile.style.displayName).toBe('Atlas');
    expect(profile.style.tone.formality).toBe('formal');
    expect(profile.style.tone.humor).toBe('none');
    expect(profile.style.visualTheme).toBe('minimal-dark');
  });

  it('creates creative preset', () => {
    const profile = makePresetProfile('creative', 'p3', 'owner1');
    expect(profile.style.displayName).toBe('Kai');
    expect(profile.style.tone.verbosity).toBe('detailed');
    expect(profile.style.visualTheme).toBe('warm-sunset');
  });

  it('creates minimal preset', () => {
    const profile = makePresetProfile('minimal', 'p4', 'owner1');
    expect(profile.style.displayName).toBe('Echo');
    expect(profile.style.appearance.scale).toBe('tiny');
    expect(profile.style.tone.verbosity).toBe('terse');
    expect(profile.style.visualTheme).toBe('paper-and-ink');
  });

  it('creates guardian preset with elevated permissions', () => {
    const profile = makePresetProfile('guardian', 'p5', 'owner1');
    expect(profile.style.displayName).toBe('Aegis');
    expect(profile.style.appearance.scale).toBe('large');
    expect(profile.permissions.permissions.breakGlassAllowed).toBe(true);
    expect(profile.permissions.permissions.custodyScope).toContain('holoshell:guardian:emergency');
    expect(profile.permissions.permissions.permissionEnvelope).toBe('guarded_execute');
  });

  it('all presets validate correctly', () => {
    const presets: Array<'companion' | 'professional' | 'creative' | 'minimal' | 'guardian'> =
      ['companion', 'professional', 'creative', 'minimal', 'guardian'];

    for (const preset of presets) {
      const profile = makePresetProfile(preset, `test-${preset}`, 'owner1');
      const errors = validateCustomizationProfile(profile);
      expect(errors).toHaveLength(0);
    }
  });

  it('all presets compose into valid daemons', () => {
    const presets: Array<'companion' | 'professional' | 'creative' | 'minimal' | 'guardian'> =
      ['companion', 'professional', 'creative', 'minimal', 'guardian'];

    for (const preset of presets) {
      const profile = makePresetProfile(preset, `test-${preset}`, 'owner1');
      const daemon = customizationProfileToDaemon(profile);
      expect(() => assertDaemonFieldSeparation(daemon)).not.toThrow();
    }
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe('DAEMON_VISUAL_THEMES', () => {
  it('contains default theme', () => {
    expect(DAEMON_VISUAL_THEMES).toContain('default');
  });

  it('contains preset-specific themes', () => {
    expect(DAEMON_VISUAL_THEMES).toContain('minimal-dark');
    expect(DAEMON_VISUAL_THEMES).toContain('warm-sunset');
    expect(DAEMON_VISUAL_THEMES).toContain('ocean-depths');
    expect(DAEMON_VISUAL_THEMES).toContain('paper-and-ink');
  });
});

describe('DAEMON_CARE_PROFILES', () => {
  it('contains care-v1', () => {
    expect(DAEMON_CARE_PROFILES).toContain('care-v1');
  });

  it('contains professional', () => {
    expect(DAEMON_CARE_PROFILES).toContain('professional');
  });
});