/**
 * Tests for Immutable Test Baseline Snapshot System
 *
 * Validates snapshot creation, locking, verification, integrity checking,
 * and diff reporting for component baselines.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createComponentSnapshotSync,
  BaselineManager,
  sha256Sync,
  type ComponentSnapshot,
  type PropContract,
  type EventSignature,
  type AccessibilityNode,
} from '../immutable-snapshot';

// ============================================================================
// Test Fixtures
// ============================================================================

function makeProps(overrides: Partial<PropContract> = {}): PropContract {
  return {
    count: 2,
    props: [
      { name: 'label', type: 'string', required: true },
      { name: 'disabled', type: 'boolean', required: false, defaultValue: 'false' },
    ],
    ...overrides,
  };
}

function makeEvents(overrides: EventSignature[] = []): EventSignature[] {
  return overrides.length > 0
    ? overrides
    : [
        { name: 'click', payloadType: 'MouseEvent' },
        { name: 'change', payloadType: 'string' },
      ];
}

function makeA11yTree(overrides: Partial<AccessibilityNode> = {}): AccessibilityNode {
  return {
    role: 'button',
    name: 'Submit',
    children: [],
    properties: { 'aria-label': 'Submit form' },
    ...overrides,
  };
}

function makeSnapshot(
  overrides: Partial<{
    componentName: string;
    framework: string;
    renderOutput: string;
    propContract: PropContract;
    events: EventSignature[];
    a11y: AccessibilityNode;
  }> = {},
): ComponentSnapshot {
  return createComponentSnapshotSync(
    overrides.componentName ?? 'Button',
    overrides.framework ?? 'react',
    overrides.renderOutput ?? '<button class="btn">Submit</button>',
    overrides.propContract ?? makeProps(),
    overrides.events ?? makeEvents(),
    overrides.a11y ?? makeA11yTree(),
  );
}

// ============================================================================
// SHA-256 Hashing
// ============================================================================

describe('SHA-256 Hashing', () => {
  it('produces consistent hashes for same input', () => {
    const hash1 = sha256Sync('hello world');
    const hash2 = sha256Sync('hello world');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different input', () => {
    const hash1 = sha256Sync('hello');
    const hash2 = sha256Sync('world');
    expect(hash1).not.toBe(hash2);
  });

  it('produces 64-character hex string', () => {
    const hash = sha256Sync('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ============================================================================
// Snapshot Creation
// ============================================================================

describe('Snapshot Creation', () => {
  it('creates a snapshot with all fields', () => {
    const snapshot = makeSnapshot();
    expect(snapshot.componentName).toBe('Button');
    expect(snapshot.framework).toBe('react');
    expect(snapshot.renderOutput).toBe('<button class="btn">Submit</button>');
    expect(snapshot.propContract.count).toBe(2);
    expect(snapshot.eventSignatures).toHaveLength(2);
    expect(snapshot.accessibilityTree.role).toBe('button');
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.version).toBe(1);
    expect(snapshot.createdAt).toBeDefined();
  });

  it('generates different hashes for different render output', () => {
    const snap1 = makeSnapshot({ renderOutput: '<div>A</div>' });
    const snap2 = makeSnapshot({ renderOutput: '<div>B</div>' });
    expect(snap1.contentHash).not.toBe(snap2.contentHash);
  });

  it('generates different hashes for different props', () => {
    const snap1 = makeSnapshot();
    const snap2 = makeSnapshot({
      propContract: makeProps({
        count: 3,
        props: [
          ...makeProps().props,
          { name: 'variant', type: 'string', required: false },
        ],
      }),
    });
    expect(snap1.contentHash).not.toBe(snap2.contentHash);
  });

  it('includes metadata', () => {
    const snapshot = createComponentSnapshotSync(
      'Card',
      'vue',
      '<div class="card"></div>',
      makeProps(),
      makeEvents(),
      makeA11yTree(),
      { author: 'test', jiraTicket: 'FE-123' },
    );
    expect(snapshot.metadata.author).toBe('test');
    expect(snapshot.metadata.jiraTicket).toBe('FE-123');
  });
});

// ============================================================================
// Baseline Manager - Locking
// ============================================================================

describe('BaselineManager - Locking', () => {
  let manager: BaselineManager;

  beforeEach(() => {
    manager = new BaselineManager('.test-baselines');
  });

  it('locks a baseline', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);
    const baseline = manager.getBaseline('Button');
    expect(baseline).toBeDefined();
    expect(baseline!.sealed).toBe(true);
    expect(baseline!.snapshot.contentHash).toBe(snapshot.contentHash);
  });

  it('prevents overwriting a sealed baseline without force', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const updated = makeSnapshot({ renderOutput: '<button>Updated</button>' });
    await expect(manager.lockBaseline('Button', updated)).rejects.toThrow('sealed');
  });

  it('allows overwriting a sealed baseline with force', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const updated = makeSnapshot({ renderOutput: '<button>Updated</button>' });
    await manager.lockBaseline('Button', updated, { force: true });

    const baseline = manager.getBaseline('Button');
    expect(baseline!.snapshot.renderOutput).toBe('<button>Updated</button>');
    expect(baseline!.snapshot.version).toBe(2);
  });

  it('increments version on update', async () => {
    const snap1 = makeSnapshot();
    await manager.lockBaseline('Button', snap1, { sealed: false });
    expect(manager.getBaseline('Button')!.snapshot.version).toBe(1);

    const snap2 = makeSnapshot({ renderOutput: '<button>v2</button>' });
    await manager.lockBaseline('Button', snap2);
    expect(manager.getBaseline('Button')!.snapshot.version).toBe(2);
  });

  it('stores lock metadata', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot, {
      lockedBy: 'ci-pipeline',
      lockReason: 'Release v2.0 baseline',
    });
    const baseline = manager.getBaseline('Button');
    expect(baseline!.lockedBy).toBe('ci-pipeline');
    expect(baseline!.lockReason).toBe('Release v2.0 baseline');
  });
});

// ============================================================================
// Baseline Manager - Unlocking
// ============================================================================

describe('BaselineManager - Unlocking', () => {
  let manager: BaselineManager;

  beforeEach(() => {
    manager = new BaselineManager('.test-baselines');
  });

  it('unlocks a sealed baseline', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);
    expect(manager.getBaseline('Button')!.sealed).toBe(true);

    manager.unlockBaseline('Button');
    expect(manager.getBaseline('Button')!.sealed).toBe(false);
  });

  it('throws when unlocking non-existent baseline', () => {
    expect(() => manager.unlockBaseline('NonExistent')).toThrow('No baseline found');
  });

  it('allows update after unlock', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);
    manager.unlockBaseline('Button');

    const updated = makeSnapshot({ renderOutput: '<button>New</button>' });
    await manager.lockBaseline('Button', updated);
    expect(manager.getBaseline('Button')!.snapshot.renderOutput).toBe('<button>New</button>');
  });
});

// ============================================================================
// Baseline Manager - Verification
// ============================================================================

describe('BaselineManager - Verification', () => {
  let manager: BaselineManager;

  beforeEach(() => {
    manager = new BaselineManager('.test-baselines');
  });

  it('verifies matching baseline', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot();
    const diff = manager.verifyBaseline('Button', current);
    expect(diff.matches).toBe(true);
    expect(diff.summary).toContain('PASSED');
    expect(diff.sections.every((s) => !s.changed)).toBe(true);
  });

  it('detects render output change', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot({ renderOutput: '<button class="btn-new">Submit</button>' });
    const diff = manager.verifyBaseline('Button', current);
    expect(diff.matches).toBe(false);
    expect(diff.summary).toContain('FAILED');
    const renderSection = diff.sections.find((s) => s.section === 'renderOutput');
    expect(renderSection!.changed).toBe(true);
  });

  it('detects prop contract change', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot({
      propContract: makeProps({
        count: 3,
        props: [
          ...makeProps().props,
          { name: 'size', type: "'sm' | 'md' | 'lg'", required: false },
        ],
      }),
    });
    const diff = manager.verifyBaseline('Button', current);
    expect(diff.matches).toBe(false);
    const propSection = diff.sections.find((s) => s.section === 'propContract');
    expect(propSection!.changed).toBe(true);
    expect(propSection!.details).toContain('Added props: size');
  });

  it('detects event signature change', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot({
      events: [
        { name: 'click', payloadType: 'MouseEvent' },
        // 'change' removed, 'focus' added
        { name: 'focus', payloadType: 'FocusEvent' },
      ],
    });
    const diff = manager.verifyBaseline('Button', current);
    expect(diff.matches).toBe(false);
    const eventSection = diff.sections.find((s) => s.section === 'eventSignatures');
    expect(eventSection!.changed).toBe(true);
    expect(eventSection!.details).toContain('Added events: focus');
    expect(eventSection!.details).toContain('Removed events: change');
  });

  it('detects accessibility tree change', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot({
      a11y: makeA11yTree({ role: 'link', name: 'Navigate' }),
    });
    const diff = manager.verifyBaseline('Button', current);
    expect(diff.matches).toBe(false);
    const a11ySection = diff.sections.find((s) => s.section === 'accessibilityTree');
    expect(a11ySection!.changed).toBe(true);
  });

  it('returns informative diff for missing baseline', () => {
    const current = makeSnapshot();
    const diff = manager.verifyBaseline('NonExistent', current);
    expect(diff.matches).toBe(false);
    expect(diff.summary).toContain('No locked baseline found');
    expect(diff.lockedHash).toBe('');
  });
});

// ============================================================================
// Baseline Manager - Removal
// ============================================================================

describe('BaselineManager - Removal', () => {
  let manager: BaselineManager;

  beforeEach(() => {
    manager = new BaselineManager('.test-baselines');
  });

  it('removes an unsealed baseline', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot, { sealed: false });
    await manager.removeBaseline('Button');
    expect(manager.getBaseline('Button')).toBeUndefined();
  });

  it('prevents removal of sealed baseline without force', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);
    await expect(manager.removeBaseline('Button')).rejects.toThrow('sealed');
  });

  it('force-removes a sealed baseline', async () => {
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);
    await manager.removeBaseline('Button', true);
    expect(manager.getBaseline('Button')).toBeUndefined();
  });
});

// ============================================================================
// Manifest Export/Import
// ============================================================================

describe('Manifest Serialization', () => {
  it('exports and imports manifest with integrity', async () => {
    const manager = new BaselineManager('.test-baselines');
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const json = manager.exportManifest();
    expect(json).toContain('"Button"');

    const newManager = new BaselineManager('.test-baselines');
    await newManager.importManifest(json);

    const baseline = newManager.getBaseline('Button');
    expect(baseline).toBeDefined();
    expect(baseline!.snapshot.contentHash).toBe(snapshot.contentHash);
  });

  it('detects tampered manifest on import', async () => {
    const manager = new BaselineManager('.test-baselines');
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const json = manager.exportManifest();
    // Tamper with the JSON
    const tampered = json.replace('"Submit"', '"Hacked"');

    const newManager = new BaselineManager('.test-baselines');
    await expect(newManager.importManifest(tampered)).rejects.toThrow('tampered');
  });

  it('verifies manifest integrity', async () => {
    const manager = new BaselineManager('.test-baselines');
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const isValid = await manager.verifyManifestIntegrity();
    expect(isValid).toBe(true);
  });
});

// ============================================================================
// Diff Report Formatting
// ============================================================================

describe('Diff Report Formatting', () => {
  it('formats a passing diff report', async () => {
    const manager = new BaselineManager('.test-baselines');
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot();
    const diff = manager.verifyBaseline('Button', current);
    const report = manager.formatDiffReport(diff);

    expect(report).toContain('BASELINE VERIFICATION: Button');
    expect(report).toContain('PASSED');
    expect(report).toContain('[OK]');
  });

  it('formats a failing diff report', async () => {
    const manager = new BaselineManager('.test-baselines');
    const snapshot = makeSnapshot();
    await manager.lockBaseline('Button', snapshot);

    const current = makeSnapshot({ renderOutput: '<div>Changed</div>' });
    const diff = manager.verifyBaseline('Button', current);
    const report = manager.formatDiffReport(diff);

    expect(report).toContain('BASELINE VERIFICATION: Button');
    expect(report).toContain('FAILED');
    expect(report).toContain('[CHANGED]');
    expect(report).toContain('renderOutput');
  });
});

// ============================================================================
// Multiple Baselines
// ============================================================================

describe('Multiple Baselines', () => {
  it('manages multiple component baselines independently', async () => {
    const manager = new BaselineManager('.test-baselines');

    const buttonSnap = makeSnapshot({ componentName: 'Button' });
    const cardSnap = makeSnapshot({ componentName: 'Card', renderOutput: '<div class="card"></div>' });
    const modalSnap = makeSnapshot({ componentName: 'Modal', renderOutput: '<dialog></dialog>' });

    await manager.lockBaseline('Button', buttonSnap);
    await manager.lockBaseline('Card', cardSnap);
    await manager.lockBaseline('Modal', modalSnap);

    const baselines = manager.getBaselines();
    expect(Object.keys(baselines)).toHaveLength(3);
    expect(baselines['Button']).toBeDefined();
    expect(baselines['Card']).toBeDefined();
    expect(baselines['Modal']).toBeDefined();

    // Verify each independently
    const buttonDiff = manager.verifyBaseline('Button', makeSnapshot({ componentName: 'Button' }));
    expect(buttonDiff.matches).toBe(true);

    const cardDiff = manager.verifyBaseline('Card', makeSnapshot({ componentName: 'Card', renderOutput: '<div class="card-changed"></div>' }));
    expect(cardDiff.matches).toBe(false);
  });
});
