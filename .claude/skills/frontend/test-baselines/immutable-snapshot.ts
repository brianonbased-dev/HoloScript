/**
 * Immutable Test Baseline Snapshot System
 *
 * Creates tamper-proof baseline snapshots for component test suites.
 * Each snapshot is integrity-verified using SHA-256 hashes.
 *
 * Features:
 * - Captures component render output, prop contracts, event signatures, and a11y tree
 * - Generates SHA-256 content hashes for integrity verification
 * - Detects unintentional regressions by comparing against locked baselines
 * - Supports structured diffing with human-readable change reports
 * - Version-stamped baselines with metadata for audit trails
 *
 * Usage in test suites:
 *   const manager = new BaselineManager('.test-baselines');
 *   const snapshot = createComponentSnapshot('Button', renderOutput, props, events, a11yTree);
 *   manager.lockBaseline('Button', snapshot);
 *   const diff = manager.verifyBaseline('Button', currentSnapshot);
 */

// ============================================================================
// Types
// ============================================================================

export interface ComponentSnapshot {
  /** Component identifier */
  componentName: string;
  /** Framework (react, vue, angular) */
  framework: string;
  /** Serialized render output (HTML string) */
  renderOutput: string;
  /** Props interface / contract */
  propContract: PropContract;
  /** Event signatures the component emits */
  eventSignatures: EventSignature[];
  /** Accessibility tree snapshot */
  accessibilityTree: AccessibilityNode;
  /** SHA-256 hash of the snapshot content */
  contentHash: string;
  /** Snapshot creation timestamp */
  createdAt: string;
  /** Snapshot version (increments on update) */
  version: number;
  /** Optional metadata */
  metadata: Record<string, string>;
}

export interface PropContract {
  /** Prop definitions */
  props: PropDefinition[];
  /** Total count */
  count: number;
}

export interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export interface EventSignature {
  name: string;
  payloadType: string;
  description?: string;
}

export interface AccessibilityNode {
  role: string;
  name?: string;
  children: AccessibilityNode[];
  properties?: Record<string, string>;
}

export interface BaselineDiff {
  /** Whether baselines match */
  matches: boolean;
  /** Component name */
  componentName: string;
  /** Human-readable change summary */
  summary: string;
  /** Detailed per-section diffs */
  sections: SectionDiff[];
  /** Locked baseline hash */
  lockedHash: string;
  /** Current snapshot hash */
  currentHash: string;
  /** Timestamp of comparison */
  comparedAt: string;
}

export interface SectionDiff {
  section: 'renderOutput' | 'propContract' | 'eventSignatures' | 'accessibilityTree';
  changed: boolean;
  details: string;
}

export interface LockedBaseline {
  /** The immutable snapshot */
  snapshot: ComponentSnapshot;
  /** When the baseline was locked */
  lockedAt: string;
  /** Who locked the baseline (optional) */
  lockedBy?: string;
  /** Lock reason / description */
  lockReason?: string;
  /** The lock is sealed (cannot be overwritten without explicit unlock) */
  sealed: boolean;
}

export interface BaselineManifest {
  /** Version of the manifest format */
  manifestVersion: number;
  /** When the manifest was last updated */
  updatedAt: string;
  /** Map of componentName -> LockedBaseline */
  baselines: Record<string, LockedBaseline>;
  /** Integrity hash of the entire manifest */
  manifestHash: string;
}

// ============================================================================
// Hashing
// ============================================================================

/**
 * Compute SHA-256 hash of a string.
 * Works in both browser (Web Crypto) and Node (crypto module) environments.
 */
export async function sha256(input: string): Promise<string> {
  // Node.js environment
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).process !== 'undefined') {
    try {
      const crypto = await import('crypto');
      return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
    } catch {
      // Fallback to Web Crypto if available
    }
  }

  // Browser / Web Crypto environment
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Last resort: simple deterministic hash (not cryptographically secure, but deterministic)
  throw new Error('No crypto implementation available for SHA-256');
}

/**
 * Synchronous SHA-256 using Node's crypto module.
 * For environments where async is not needed.
 */
export function sha256Sync(input: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

// ============================================================================
// Snapshot Creation
// ============================================================================

/**
 * Create a component snapshot with computed content hash.
 */
export async function createComponentSnapshot(
  componentName: string,
  framework: string,
  renderOutput: string,
  propContract: PropContract,
  eventSignatures: EventSignature[],
  accessibilityTree: AccessibilityNode,
  metadata: Record<string, string> = {},
): Promise<ComponentSnapshot> {
  const contentPayload = JSON.stringify({
    componentName,
    framework,
    renderOutput,
    propContract,
    eventSignatures,
    accessibilityTree,
  });

  const contentHash = await sha256(contentPayload);

  return {
    componentName,
    framework,
    renderOutput,
    propContract,
    eventSignatures,
    accessibilityTree,
    contentHash,
    createdAt: new Date().toISOString(),
    version: 1,
    metadata,
  };
}

/**
 * Synchronous version for simpler usage in test environments.
 */
export function createComponentSnapshotSync(
  componentName: string,
  framework: string,
  renderOutput: string,
  propContract: PropContract,
  eventSignatures: EventSignature[],
  accessibilityTree: AccessibilityNode,
  metadata: Record<string, string> = {},
): ComponentSnapshot {
  const contentPayload = JSON.stringify({
    componentName,
    framework,
    renderOutput,
    propContract,
    eventSignatures,
    accessibilityTree,
  });

  const contentHash = sha256Sync(contentPayload);

  return {
    componentName,
    framework,
    renderOutput,
    propContract,
    eventSignatures,
    accessibilityTree,
    contentHash,
    createdAt: new Date().toISOString(),
    version: 1,
    metadata,
  };
}

// ============================================================================
// Baseline Manager (in-memory, serializable to disk)
// ============================================================================

export class BaselineManager {
  private manifest: BaselineManifest;
  private baseDir: string;

  constructor(baseDir: string = '.test-baselines') {
    this.baseDir = baseDir;
    this.manifest = {
      manifestVersion: 1,
      updatedAt: new Date().toISOString(),
      baselines: {},
      manifestHash: '',
    };
  }

  /**
   * Lock a baseline snapshot. If the component already has a sealed baseline,
   * this will throw unless `force` is true.
   */
  async lockBaseline(
    componentName: string,
    snapshot: ComponentSnapshot,
    options: { lockedBy?: string; lockReason?: string; sealed?: boolean; force?: boolean } = {},
  ): Promise<void> {
    const existing = this.manifest.baselines[componentName];

    if (existing && existing.sealed && !options.force) {
      throw new Error(
        `Baseline for "${componentName}" is sealed. Use force=true to override, or unlock first.`,
      );
    }

    // If updating existing, increment version
    if (existing) {
      snapshot = {
        ...snapshot,
        version: existing.snapshot.version + 1,
      };
    }

    this.manifest.baselines[componentName] = {
      snapshot,
      lockedAt: new Date().toISOString(),
      lockedBy: options.lockedBy,
      lockReason: options.lockReason,
      sealed: options.sealed ?? true,
    };

    await this.updateManifestHash();
  }

  /**
   * Unlock a sealed baseline (allows updates).
   */
  unlockBaseline(componentName: string): void {
    const baseline = this.manifest.baselines[componentName];
    if (!baseline) {
      throw new Error(`No baseline found for "${componentName}"`);
    }
    baseline.sealed = false;
  }

  /**
   * Verify a current snapshot against the locked baseline.
   * Returns a diff result describing whether the baselines match and what changed.
   */
  verifyBaseline(componentName: string, currentSnapshot: ComponentSnapshot): BaselineDiff {
    const locked = this.manifest.baselines[componentName];

    if (!locked) {
      return {
        matches: false,
        componentName,
        summary: `No locked baseline found for "${componentName}". Run lockBaseline() first.`,
        sections: [],
        lockedHash: '',
        currentHash: currentSnapshot.contentHash,
        comparedAt: new Date().toISOString(),
      };
    }

    const lockedSnap = locked.snapshot;
    const sections: SectionDiff[] = [];

    // Compare render output
    const renderChanged = lockedSnap.renderOutput !== currentSnapshot.renderOutput;
    sections.push({
      section: 'renderOutput',
      changed: renderChanged,
      details: renderChanged
        ? `Render output changed.\n  Locked length: ${lockedSnap.renderOutput.length}\n  Current length: ${currentSnapshot.renderOutput.length}`
        : 'Render output unchanged.',
    });

    // Compare prop contract
    const propsChanged =
      JSON.stringify(lockedSnap.propContract) !== JSON.stringify(currentSnapshot.propContract);
    sections.push({
      section: 'propContract',
      changed: propsChanged,
      details: propsChanged
        ? this.diffPropContracts(lockedSnap.propContract, currentSnapshot.propContract)
        : 'Prop contract unchanged.',
    });

    // Compare event signatures
    const eventsChanged =
      JSON.stringify(lockedSnap.eventSignatures) !==
      JSON.stringify(currentSnapshot.eventSignatures);
    sections.push({
      section: 'eventSignatures',
      changed: eventsChanged,
      details: eventsChanged
        ? this.diffEventSignatures(lockedSnap.eventSignatures, currentSnapshot.eventSignatures)
        : 'Event signatures unchanged.',
    });

    // Compare accessibility tree
    const a11yChanged =
      JSON.stringify(lockedSnap.accessibilityTree) !==
      JSON.stringify(currentSnapshot.accessibilityTree);
    sections.push({
      section: 'accessibilityTree',
      changed: a11yChanged,
      details: a11yChanged
        ? 'Accessibility tree structure changed. Manual review recommended.'
        : 'Accessibility tree unchanged.',
    });

    const hashMatches = lockedSnap.contentHash === currentSnapshot.contentHash;
    const changedSections = sections.filter((s) => s.changed);
    const summary = hashMatches
      ? 'Baseline verification PASSED. Component matches locked baseline.'
      : `Baseline verification FAILED. ${changedSections.length} section(s) changed: ${changedSections.map((s) => s.section).join(', ')}`;

    return {
      matches: hashMatches,
      componentName,
      summary,
      sections,
      lockedHash: lockedSnap.contentHash,
      currentHash: currentSnapshot.contentHash,
      comparedAt: new Date().toISOString(),
    };
  }

  /**
   * Get all locked baselines.
   */
  getBaselines(): Record<string, LockedBaseline> {
    return { ...this.manifest.baselines };
  }

  /**
   * Get a specific locked baseline.
   */
  getBaseline(componentName: string): LockedBaseline | undefined {
    return this.manifest.baselines[componentName];
  }

  /**
   * Remove a baseline.
   */
  async removeBaseline(componentName: string, force = false): Promise<void> {
    const baseline = this.manifest.baselines[componentName];
    if (!baseline) return;
    if (baseline.sealed && !force) {
      throw new Error(`Cannot remove sealed baseline "${componentName}". Use force=true.`);
    }
    delete this.manifest.baselines[componentName];
    await this.updateManifestHash();
  }

  /**
   * Verify manifest integrity.
   */
  async verifyManifestIntegrity(): Promise<boolean> {
    const expected = await this.computeManifestHash();
    return this.manifest.manifestHash === expected;
  }

  /**
   * Export manifest as JSON string (for persisting to disk).
   */
  exportManifest(): string {
    return JSON.stringify(this.manifest, null, 2);
  }

  /**
   * Import manifest from JSON string (for loading from disk).
   */
  async importManifest(json: string): Promise<void> {
    const parsed = JSON.parse(json) as BaselineManifest;
    this.manifest = parsed;

    // Verify integrity
    const expectedHash = await this.computeManifestHash();
    if (parsed.manifestHash !== expectedHash) {
      throw new Error(
        'Manifest integrity check FAILED. The baseline file may have been tampered with.',
      );
    }
  }

  /**
   * Format a verification diff as a human-readable report.
   */
  formatDiffReport(diff: BaselineDiff): string {
    const lines: string[] = [];
    lines.push('============================================================');
    lines.push(`  BASELINE VERIFICATION: ${diff.componentName}`);
    lines.push('============================================================');
    lines.push('');
    lines.push(`Status:       ${diff.matches ? 'PASSED' : 'FAILED'}`);
    lines.push(`Locked Hash:  ${diff.lockedHash || 'N/A'}`);
    lines.push(`Current Hash: ${diff.currentHash}`);
    lines.push(`Compared At:  ${diff.comparedAt}`);
    lines.push('');
    lines.push(`Summary: ${diff.summary}`);
    lines.push('');

    if (diff.sections.length > 0) {
      lines.push('------------------------------------------------------------');
      lines.push('  Section Details');
      lines.push('------------------------------------------------------------');
      for (const section of diff.sections) {
        const icon = section.changed ? '[CHANGED]' : '[OK]     ';
        lines.push(`  ${icon} ${section.section}`);
        if (section.changed) {
          lines.push(`           ${section.details.replace(/\n/g, '\n           ')}`);
        }
        lines.push('');
      }
    }

    lines.push('============================================================');
    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private diffPropContracts(locked: PropContract, current: PropContract): string {
    const lockedNames = new Set(locked.props.map((p) => p.name));
    const currentNames = new Set(current.props.map((p) => p.name));
    const added = [...currentNames].filter((n) => !lockedNames.has(n));
    const removed = [...lockedNames].filter((n) => !currentNames.has(n));
    const changed: string[] = [];

    for (const prop of current.props) {
      const lockedProp = locked.props.find((p) => p.name === prop.name);
      if (lockedProp && JSON.stringify(lockedProp) !== JSON.stringify(prop)) {
        changed.push(prop.name);
      }
    }

    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added props: ${added.join(', ')}`);
    if (removed.length > 0) parts.push(`Removed props: ${removed.join(', ')}`);
    if (changed.length > 0) parts.push(`Modified props: ${changed.join(', ')}`);
    return parts.join('\n  ') || 'No details available.';
  }

  private diffEventSignatures(locked: EventSignature[], current: EventSignature[]): string {
    const lockedNames = new Set(locked.map((e) => e.name));
    const currentNames = new Set(current.map((e) => e.name));
    const added = [...currentNames].filter((n) => !lockedNames.has(n));
    const removed = [...lockedNames].filter((n) => !currentNames.has(n));

    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added events: ${added.join(', ')}`);
    if (removed.length > 0) parts.push(`Removed events: ${removed.join(', ')}`);
    return parts.join('\n  ') || 'Event payload types changed.';
  }

  private async computeManifestHash(): Promise<string> {
    const payload = JSON.stringify({
      manifestVersion: this.manifest.manifestVersion,
      baselines: this.manifest.baselines,
    });
    return sha256(payload);
  }

  private async updateManifestHash(): Promise<void> {
    this.manifest.updatedAt = new Date().toISOString();
    this.manifest.manifestHash = await this.computeManifestHash();
  }
}
