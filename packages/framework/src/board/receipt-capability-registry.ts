/**
 * Receipt Capability Registry
 *
 * Maps capability keywords to receipt types and their associated validators,
 * enabling agents to query the receipt surface by capability rather than by
 * file name. This is the routing backbone for the `holo_query_receipts` MCP tool.
 *
 * Every receipt module that registers with the board index gets a canonical
 * entry here. Capabilities are the verbs/nouns an agent would naturally ask
 * about: "hardware", "browser", "account-export", "readiness", etc.
 *
 * Created: task_1779157196014_yx3r ([idea-run-13] Add receipt capability router MCP tool)
 */

// ── Capability entries ──

export interface ReceiptCapabilityEntry {
  /** Canonical capability keyword (e.g. 'hardware', 'browser', 'account-export'). */
  capability: string;
  /** Human-readable description of what this capability covers. */
  description: string;
  /** The receipt type interface name (e.g. 'HardwareReceipt', 'BrowserAbsorptionReceipt'). */
  receiptType: string;
  /** The module file that defines this receipt type (relative to board/). */
  module: string;
  /** The export name of the primary receipt interface. */
  exportName: string;
  /** The export name of the primary validate function. */
  validateFn: string;
  /** The export name of the primary clone function (if any). */
  cloneFn?: string;
  /** The export name of the isSupported type guard (if any). */
  isSupportedFn?: string;
  /** Sub-capability subjects that narrow the query (e.g. 'nir' under 'hardware'). */
  subjects?: string[];
  /** Tags for broader discovery (e.g. 'holoshell', 'hololand', 'safety'). */
  tags?: string[];
}

// ── Registry ──

export const RECEIPT_CAPABILITY_REGISTRY: ReceiptCapabilityEntry[] = [
  // ── HoloLand Receipts ──
  {
    capability: 'hardware',
    description:
      'Hardware compilation and execution receipts — GPU, WASM, Qualcomm NIR, cross-hardware targets.',
    receiptType: 'HardwareReceipt',
    module: 'hololand-receipts',
    exportName: 'HardwareReceipt',
    validateFn: 'validateHardwareReceipt',
    cloneFn: 'cloneHardwareReceipt',
    isSupportedFn: 'isSupportedHardwareReceiptKind',
    subjects: [
      'gpu',
      'wasm',
      'nir',
      'cross-compilation',
      'cuda',
      'webgpu',
      'metal',
      'vulkan',
      'd3d12',
      'opencl',
    ],
    tags: ['hololand', 'compilation', 'simulation'],
  },
  {
    capability: 'agent-action',
    description: 'Autonomous agent action receipts — prove what an agent did, when, and why.',
    receiptType: 'AgentActionReceipt',
    module: 'hololand-receipts',
    exportName: 'AgentActionReceipt',
    validateFn: 'validateAgentActionReceipt',
    cloneFn: 'cloneAgentActionReceipt',
    isSupportedFn: 'isSupportedAgentActionKind',
    subjects: ['claim', 'complete', 'delegate', 'review', 'escalate', 'handoff'],
    tags: ['hololand', 'agent', 'autonomous'],
  },
  {
    capability: 'qualcomm-nir',
    description: 'Qualcomm Neural Inference Runtime model export receipts.',
    receiptType: 'QualcommNIRModelExportReceipt',
    module: 'hololand-receipts',
    exportName: 'QualcommNIRModelExportReceipt',
    validateFn: 'validateQualcommNIRModelExportReceipt',
    cloneFn: 'cloneQualcommNIRModelExportReceipt',
    isSupportedFn: 'isSupportedQualcommNIRRuntimeTarget',
    subjects: ['snapdragon', 'htp', 'nir', 'model-export'],
    tags: ['hololand', 'compilation', 'mobile'],
  },
  {
    capability: 'cross-hardware',
    description:
      'Cross-hardware compilation receipts — prove a source was compiled to multiple targets.',
    receiptType: 'CrossHardwareCompilationReceipt',
    module: 'hololand-receipts',
    exportName: 'CrossHardwareCompilationReceipt',
    validateFn: 'validateCrossHardwareCompilationReceipt',
    cloneFn: 'cloneCrossHardwareCompilationReceipt',
    isSupportedFn: 'isSupportedHardwareCompilationTarget',
    subjects: ['multi-target', 'compilation'],
    tags: ['hololand', 'compilation'],
  },
  {
    capability: 'validation',
    description: 'Generic validation receipts — prove a check was run with a pass/fail result.',
    receiptType: 'ValidationReceipt',
    module: 'hololand-receipts',
    exportName: 'ValidationReceipt',
    validateFn: 'validateValidationReceipt',
    cloneFn: 'cloneValidationReceipt',
    isSupportedFn: 'isSupportedValidationStatus',
    subjects: ['pass', 'fail', 'check'],
    tags: ['hololand', 'verification'],
  },
  {
    capability: 'package-provenance',
    description:
      'Package provenance receipts — trust tier, admission, and supply chain verification.',
    receiptType: 'PackageProvenanceReceipt',
    module: 'hololand-receipts',
    exportName: 'PackageProvenanceReceipt',
    validateFn: 'validatePackageProvenanceReceipt',
    cloneFn: 'clonePackageProvenanceReceipt',
    isSupportedFn: 'isSupportedTrustTier',
    subjects: ['supply-chain', 'trust', 'admission'],
    tags: ['hololand', 'security', 'supply-chain'],
  },

  // ── HoloShell Receipts ──
  {
    capability: 'browser',
    description:
      'Browser absorption receipts — prove browser automation actions with policy envelopes.',
    receiptType: 'BrowserAbsorptionReceipt',
    module: 'holoshell-browser-receipts',
    exportName: 'BrowserAbsorptionReceipt',
    validateFn: 'validateBrowserAbsorptionReceipt',
    cloneFn: 'cloneBrowserAbsorptionReceipt',
    isSupportedFn: 'isSupportedBrowserActionKind',
    subjects: ['navigate', 'click', 'type', 'scroll', 'screenshot', 'playwright', 'chrome'],
    tags: ['holoshell', 'browser', 'automation'],
  },
  {
    capability: 'account-export',
    description:
      'Account export receipts — prove data portability with provider, archive, and approval chains.',
    receiptType: 'HoloShellAccountExportReceiptPack',
    module: 'holoshell-account-export-receipts',
    exportName: 'HoloShellAccountExportReceiptPack',
    validateFn: 'validateHoloShellAccountExportReceiptPack',
    cloneFn: 'cloneHoloShellAccountExportReceiptPack',
    isSupportedFn: 'isSupportedAccountExportProvider',
    subjects: ['provider', 'archive', 'download', 'quarantine', 'approval', 'rollback'],
    tags: ['holoshell', 'data-portability', 'privacy'],
  },
  {
    capability: 'provider-export-repair',
    description:
      'Provider export repair receipts — preserve failed exports, partial archives, retry plans, and replay lessons.',
    receiptType: 'HoloShellProviderExportRepairReceiptPack',
    module: 'holoshell-provider-export-repair-receipts',
    exportName: 'HoloShellProviderExportRepairReceiptPack',
    validateFn: 'validateHoloShellProviderExportRepairReceiptPack',
    cloneFn: 'cloneHoloShellProviderExportRepairReceiptPack',
    isSupportedFn: 'isSupportedProviderExportRepairAction',
    subjects: ['provider-failure', 'partial-archive', 'retry', 'quarantine', 'replay', 'repair'],
    tags: ['holoshell', 'account-export', 'repair', 'privacy'],
  },
  {
    capability: 'brittney-action',
    description:
      'Brittney field action receipts — prove autonomous agent actions with repair paths.',
    receiptType: 'HoloShellBrittneyActionReceiptPack',
    module: 'holoshell-brittney-action-receipts',
    exportName: 'HoloShellBrittneyActionReceiptPack',
    validateFn: 'validateHoloShellBrittneyActionReceiptPack',
    cloneFn: 'cloneHoloShellBrittneyActionReceiptPack',
    isSupportedFn: 'isSupportedBrittneyFieldActionKind',
    subjects: [
      'tool_call',
      'claim_task',
      'complete_task',
      'send_message',
      'knowledge_sync',
      'file_write',
      'session_handoff',
    ],
    tags: ['holoshell', 'agent', 'autonomous', 'safety'],
  },
  {
    capability: 'cli',
    description:
      'CLI absorption receipts — prove local CLI command execution and policy enforcement.',
    receiptType: 'LocalCliAbsorptionReceipt',
    module: 'holoshell-cli-receipts',
    exportName: 'LocalCliAbsorptionReceipt',
    validateFn: 'validateLocalCliAbsorptionReceipt',
    cloneFn: 'cloneLocalCliAbsorptionReceipt',
    isSupportedFn: 'isSupportedCliActionKind',
    subjects: ['command', 'shell', 'local', 'terminal'],
    tags: ['holoshell', 'cli', 'absorption'],
  },
  {
    capability: 'readiness',
    description:
      'Source-native readiness receipts — prove a machine is ready to build HoloLand worlds.',
    receiptType: 'HoloShellReadinessReceipt',
    module: 'holoshell-readiness-receipt',
    exportName: 'HoloShellReadinessReceipt',
    validateFn: 'validateHoloShellReadinessReceipt',
    cloneFn: 'cloneHoloShellReadinessReceipt',
    isSupportedFn: 'isSupportedReadinessOutcome',
    subjects: ['git', 'build', 'validation', 'device-lab', 'graph', 'task-filing'],
    tags: ['holoshell', 'readiness', 'verification'],
  },
  {
    capability: 'local-codebase',
    description:
      'Local codebase snapshot receipts — prove sourceFiles bundles came from safe local filesystem state.',
    receiptType: 'HoloShellLocalCodebaseSnapshotReceipt',
    module: 'holoshell-local-codebase-snapshot-receipt',
    exportName: 'HoloShellLocalCodebaseSnapshotReceipt',
    validateFn: 'validateHoloShellLocalCodebaseSnapshotReceipt',
    cloneFn: 'cloneHoloShellLocalCodebaseSnapshotReceipt',
    isSupportedFn: 'isSupportedLocalCodebaseSnapshotStatus',
    subjects: ['sourceFiles', 'graph', 'absorb', 'local-files', 'redaction', 'replay'],
    tags: ['holoshell', 'codebase', 'absorb', 'readiness'],
  },
  {
    capability: 'workfile-custody',
    description:
      'Work-file custody receipts — prove file parsing, preview, export, and safety handling.',
    receiptType: 'HoloShellWorkFileCustodyReceipt',
    module: 'holoshell-workfile-custody-receipt',
    exportName: 'HoloShellWorkFileCustodyReceipt',
    validateFn: 'validateHoloShellWorkFileCustodyReceipt',
    cloneFn: 'cloneHoloShellWorkFileCustodyReceipt',
    isSupportedFn: 'isSupportedWorkFileCustodyOutcome',
    subjects: ['parse', 'preview', 'export', 'custody', 'file'],
    tags: ['holoshell', 'file', 'safety'],
  },
  {
    capability: 'asset-shard',
    description:
      'Asset shard receipts — prove asset import, conversion, preview, and rollback chains.',
    receiptType: 'AssetShardWorkflowReceipt',
    module: 'holoshell-asset-shard-receipts',
    exportName: 'AssetShardWorkflowReceipt',
    validateFn: 'validateAssetShardWorkflowReceipt',
    cloneFn: 'cloneAssetShardWorkflowReceipt',
    isSupportedFn: 'isSupportedAssetShardKind',
    subjects: ['import', 'conversion', 'preview', 'rollback', 'witness', '3d-asset'],
    tags: ['holoshell', 'asset', '3d'],
  },
  {
    capability: 'photo-backup',
    description:
      'Family photo backup custody receipts — prove duplicate detection, privacy redaction, restore proof, and delete blocking.',
    receiptType: 'PhotoBackupCustodyReceipt',
    module: 'holoshell-photo-backup-receipts',
    exportName: 'PhotoBackupCustodyReceipt',
    validateFn: 'validatePhotoBackupCustodyReceipt',
    cloneFn: 'clonePhotoBackupCustodyReceipt',
    isSupportedFn: 'isSupportedPhotoBackupMediaKind',
    subjects: ['photos', 'backup', 'restore', 'duplicate', 'privacy', 'encryption', 'cloud', 'delete-blocker'],
    tags: ['holoshell', 'photos', 'backup', 'privacy', 'safety'],
  },
  {
    capability: 'device-safety',
    description:
      'Device safety envelope receipts — prove device identity, consent, and safe action execution.',
    receiptType: 'HoloShellDeviceSafetyReceiptPack',
    module: 'holoshell-device-safety-receipts',
    exportName: 'HoloShellDeviceSafetyReceiptPack',
    validateFn: 'validateHoloShellDeviceSafetyReceiptPack',
    cloneFn: 'cloneHoloShellDeviceSafetyReceiptPack',
    isSupportedFn: 'isSupportedDeviceCategory',
    subjects: [
      'headset',
      'phone',
      'webcam',
      'gpu',
      'robot',
      'printer',
      'wallet',
      'consent',
      'identity',
    ],
    tags: ['holoshell', 'device', 'safety', 'consent'],
  },
  {
    capability: 'target-device-proof',
    description:
      'Target-device proof receipts — separate local compile/browser readiness from headset/device frame evidence.',
    receiptType: 'HoloShellTargetDeviceProofReceipt',
    module: 'holoshell-target-device-proof-receipts',
    exportName: 'HoloShellTargetDeviceProofReceipt',
    validateFn: 'validateHoloShellTargetDeviceProofReceipt',
    cloneFn: 'cloneHoloShellTargetDeviceProofReceipt',
    isSupportedFn: 'isSupportedTargetDeviceKind',
    subjects: [
      'webxr',
      'openxr',
      'headset',
      'frame-capture',
      'device-presence',
      'adb',
      'browser-acceleration',
    ],
    tags: ['holoshell', 'device', 'proof', 'format-stress', 'hololand'],
  },
  {
    capability: 'downloads-shelf',
    description:
      'Downloads shelf receipts — prove download inventory, quarantine, and deletion decisions.',
    receiptType: 'HoloShellDownloadsShelfReceiptPack',
    module: 'holoshell-downloads-shelf-receipts',
    exportName: 'HoloShellDownloadsShelfReceiptPack',
    validateFn: 'validateHoloShellDownloadsShelfReceiptPack',
    cloneFn: 'cloneHoloShellDownloadsShelfReceiptPack',
    isSupportedFn: 'isSupportedDownloadSource',
    subjects: ['inventory', 'quarantine', 'executable', 'duplicate', 'preview', 'delete'],
    tags: ['holoshell', 'download', 'safety'],
  },
  {
    capability: 'package-mutation',
    description:
      'Package install/update custody receipts — prove package identity, approval, rollback limits, and blocked ambient execution.',
    receiptType: 'HoloShellPackageMutationReceipt',
    module: 'holoshell-package-mutation-receipt',
    exportName: 'HoloShellPackageMutationReceipt',
    validateFn: 'validateHoloShellPackageMutationReceipt',
    cloneFn: 'cloneHoloShellPackageMutationReceipt',
    isSupportedFn: 'isSupportedPackageMutationKind',
    subjects: [
      'install',
      'update',
      'upgrade',
      'uninstall',
      'package-manager',
      'rollback',
      'admin',
      'winget',
      'pnpm',
    ],
    tags: ['holoshell', 'package', 'install', 'safety', 'break-glass'],
  },
  {
    capability: 'managed-service-restart',
    description:
      'Managed local service restart receipts — prove PID custody, approval, redacted service status, and after-action verification.',
    receiptType: 'HoloShellManagedServiceRestartReceiptPack',
    module: 'holoshell-managed-service-restart-receipts',
    exportName: 'HoloShellManagedServiceRestartReceiptPack',
    validateFn: 'validateHoloShellManagedServiceRestartReceiptPack',
    cloneFn: 'cloneHoloShellManagedServiceRestartReceiptPack',
    isSupportedFn: 'isSupportedManagedServiceAction',
    subjects: [
      'service',
      'restart',
      'start',
      'stop',
      'pid',
      'approval',
      'after-action',
      'control-daemon',
      'network-sentinel',
    ],
    tags: ['holoshell', 'service', 'process', 'restart', 'safety', 'hololand'],
  },
  {
    capability: 'permission-gate',
    description:
      'Provider, app, connector, and device permission gate receipts — prove minimum scope, grant verification, revocation, and redacted credential handling.',
    receiptType: 'HoloShellPermissionGateReceiptPack',
    module: 'holoshell-permission-gate-receipts',
    exportName: 'HoloShellPermissionGateReceiptPack',
    validateFn: 'validateHoloShellPermissionGateReceiptPack',
    cloneFn: 'cloneHoloShellPermissionGateReceiptPack',
    isSupportedFn: 'isSupportedPermissionSubjectKind',
    subjects: [
      'oauth',
      'scope',
      'grant',
      'revoke',
      'connector',
      'provider-account',
      'os-permission',
      'device',
    ],
    tags: ['holoshell', 'permissions', 'oauth', 'safety', 'privacy', 'hololand'],
  },
  {
    capability: 'physical-actuation',
    description:
      'Physical actuation receipts — prove simulation, freshness, safe stop, rollback limits, and replay before hardware mutation.',
    receiptType: 'HoloShellPhysicalActuationReceiptPack',
    module: 'holoshell-physical-actuation-receipts',
    exportName: 'HoloShellPhysicalActuationReceiptPack',
    validateFn: 'validateHoloShellPhysicalActuationReceiptPack',
    cloneFn: 'cloneHoloShellPhysicalActuationReceiptPack',
    isSupportedFn: 'isSupportedPhysicalActuationAction',
    subjects: [
      'actuation',
      'robot',
      'headset',
      'haptic',
      'xr-session',
      'safe-stop',
      'freshness',
      'rollback',
      'simulation',
    ],
    tags: ['holoshell', 'device', 'safety', 'physical-world', 'hololand', 'twin-earth'],
  },
  {
    capability: 'build-custody',
    description:
      'Build custody receipts — prove who built what, from which source, under what hardware/MCP conditions, with what authority.',
    receiptType: 'HoloShellBuildCustodyReceipt',
    module: 'holoshell-build-custody-receipt',
    exportName: 'HoloShellBuildCustodyReceipt',
    validateFn: 'validateHoloShellBuildCustodyReceipt',
    cloneFn: 'cloneHoloShellBuildCustodyReceipt',
    isSupportedFn: undefined,
    subjects: ['build', 'custody', 'authority', 'mcp-health', 'hardware-context'],
    tags: ['holoshell', 'build', 'custody', 'hololand'],
  },
  {
    capability: 'world-build-ready',
    description:
      'World build ready tokens — prove all gates passed before a non-developer or agent is authorized to build and publish a HoloLand world.',
    receiptType: 'HoloShellWorldBuildReadyToken',
    module: 'holoshell-world-build-ready-token',
    exportName: 'HoloShellWorldBuildReadyToken',
    validateFn: 'validateHoloShellWorldBuildReadyToken',
    cloneFn: 'cloneHoloShellWorldBuildReadyToken',
    isSupportedFn: undefined,
    subjects: ['local-source', 'hardware-reality', 'build-custody', 'visual-witness', 'codebase-graph-trust'],
    tags: ['holoshell', 'build', 'ready', 'hololand', 'gates'],
  },

  // ── Structural Receipts ──
  {
    capability: 'artifact',
    description:
      'Generic artifact receipts — prove a file/output was produced with hash provenance.',
    receiptType: 'ArtifactReceipt',
    module: 'board-types',
    exportName: 'ArtifactReceipt',
    validateFn: 'validateArtifactReceipt',
    cloneFn: 'cloneArtifactReceipt',
    isSupportedFn: 'isSupportedArtifactReceiptType',
    subjects: [
      'docs',
      'screenshot',
      'benchmark',
      'render',
      'test-output',
      'code-patch',
      'hardware-compilation',
    ],
    tags: ['structural', 'provenance'],
  },
  {
    capability: 'environment',
    description: 'Task environment receipts — prove runtime environment fingerprint and profile.',
    receiptType: 'TaskEnvironmentReceipt',
    module: 'board-types',
    exportName: 'TaskEnvironmentReceipt',
    validateFn: 'validateTaskEnvironmentReceipt',
    cloneFn: 'cloneTaskEnvironmentReceipt',
    isSupportedFn: 'isSupportedTaskEnvironmentProfileKind',
    subjects: [
      'local',
      'worktree',
      'container',
      'hardware-native',
      'browser',
      'simulation',
      'gpu',
      'wasm',
    ],
    tags: ['structural', 'environment', 'fingerprint'],
  },
  {
    capability: 'steward-action',
    description:
      'Agent steward action receipts — prove world-issue triage, rollback, and proposal handling.',
    receiptType: 'StewardActionReceipt',
    module: 'agent-steward',
    exportName: 'StewardActionReceipt',
    validateFn: 'validateStewardActionReceipt',
    cloneFn: 'cloneStewardActionReceipt',
    isSupportedFn: 'isSupportedStewardActionReceiptStatus',
    subjects: ['triage', 'rollback', 'proposal', 'world-issue'],
    tags: ['agent', 'steward', 'governance'],
  },
  {
    capability: 'shard',
    description:
      'Frontier shard receipts — prove shard creation, skill rarity, and quest completion.',
    receiptType: 'ShardReceipt',
    module: 'frontier-shard',
    exportName: 'ShardReceipt',
    validateFn: 'validateShardReceipt',
    cloneFn: 'cloneShardReceipt',
    isSupportedFn: 'isSupportedShardReceiptStatus',
    subjects: ['skill', 'item', 'quest', 'zone', 'encounter', 'loot'],
    tags: ['frontier', 'shard', 'game'],
  },
  {
    capability: 'twin-earth',
    description:
      'Twin Earth substrate receipts — prove participation mode, identity, and actuation.',
    receiptType: 'TwinEarthReceipt',
    module: 'twin-earth-substrate',
    exportName: 'TwinEarthReceipt',
    validateFn: 'validateTwinEarthReceipt',
    cloneFn: 'cloneTwinEarthReceipt',
    isSupportedFn: 'isSupportedTwinEarthReceiptKind',
    subjects: ['participation', 'identity', 'actuation', 'mode-transition'],
    tags: ['twin-earth', 'substrate', 'governance'],
  },
  {
    capability: 'holoweb-network',
    description:
      'HoloWeb network reality receipts — prove node, location, underlay, and health evidence.',
    receiptType: 'HoloWebReceipt',
    module: 'holoweb-network-reality',
    exportName: 'HoloWebReceipt',
    validateFn: 'validateHoloWebNetworkRealitySnapshot',
    cloneFn: 'cloneHoloWebNetworkRealitySnapshot',
    isSupportedFn: 'isSupportedHoloWebReceiptType',
    subjects: ['node', 'location-proof', 'underlay', 'health', 'vpn', 'bandwidth'],
    tags: ['holoweb', 'network', 'reality'],
  },
  {
    capability: 'legacy-app',
    description:
      'HoloShell legacy app reality receipts — prove process, window, and lane evidence.',
    receiptType: 'HoloShellLegacyReceipt',
    module: 'holoshell-legacy-app-reality',
    exportName: 'HoloShellLegacyAppRealitySnapshot',
    validateFn: 'validateHoloShellLegacyAppRealitySnapshot',
    cloneFn: 'cloneHoloShellLegacyAppRealitySnapshot',
    isSupportedFn: 'isSupportedHoloShellLegacyReceiptAction',
    subjects: ['process', 'window', 'lane', 'custody'],
    tags: ['holoshell', 'legacy', 'reality'],
  },
  {
    capability: 'webhook',
    description: 'Board webhook receipts — prove webhook delivery, signing, and retry handling.',
    receiptType: 'BoardWebhookEnvelope',
    module: 'webhooks',
    exportName: 'BoardWebhookEnvelope',
    validateFn: 'validateBoardWebhookEnvelope',
    cloneFn: 'cloneBoardWebhookEnvelope',
    isSupportedFn: 'isSupportedBoardWebhookEventType',
    subjects: ['delivery', 'signing', 'retry'],
    tags: ['webhook', 'notification'],
  },
  {
    capability: 'startup-gate',
    description:
      'OS startup registration gate receipts — prove registration state, approval, verification, rollback, and redacted command handling for login-item, autostart, and startup-shortcut flows.',
    receiptType: 'HoloShellStartupGateReceiptPack',
    module: 'holoshell-startup-gate-receipt',
    exportName: 'HoloShellStartupGateReceiptPack',
    validateFn: 'validateHoloShellStartupGateReceiptPack',
    cloneFn: 'cloneHoloShellStartupGateReceiptPack',
    isSupportedFn: 'isSupportedStartupPlatform',
    subjects: [
      'windows-startup-folder',
      'macos-login-item',
      'linux-xdg-autostart',
      'windows-task-scheduler',
      'macos-launchd',
      'linux-systemd-user',
      'registration',
      'approval',
      'unregistration',
      'rollback',
    ],
    tags: ['holoshell', 'startup', 'autostart', 'login-item', 'safety', 'hololand'],
  },
];

// ── Lookup functions ──

/** Find receipt capability entries matching a capability keyword and/or subject. */
export function queryReceiptCapabilities(
  capability?: string,
  subject?: string
): ReceiptCapabilityEntry[] {
  let results = RECEIPT_CAPABILITY_REGISTRY;

  if (capability) {
    const capLower = capability.toLowerCase();
    results = results.filter(
      (entry) =>
        entry.capability === capLower ||
        entry.capability.includes(capLower) ||
        (entry.tags ?? []).some((tag) => tag.includes(capLower)) ||
        entry.description.toLowerCase().includes(capLower)
    );
  }

  if (subject) {
    const subjLower = subject.toLowerCase();
    results = results.filter(
      (entry) => entry.subjects?.some((s) => s === subjLower || s.includes(subjLower)) ?? false
    );
  }

  return results;
}

/** Get a single capability entry by exact capability name. */
export function getReceiptCapability(capability: string): ReceiptCapabilityEntry | undefined {
  return RECEIPT_CAPABILITY_REGISTRY.find((entry) => entry.capability === capability);
}

/** List all registered capability keywords. */
export function listReceiptCapabilities(): string[] {
  return RECEIPT_CAPABILITY_REGISTRY.map((entry) => entry.capability);
}

/** List all registered subjects across all capabilities. */
export function listReceiptSubjects(): string[] {
  const subjects = new Set<string>();
  for (const entry of RECEIPT_CAPABILITY_REGISTRY) {
    for (const subject of entry.subjects ?? []) {
      subjects.add(subject);
    }
  }
  return Array.from(subjects).sort();
}

/** Count of registered capability entries. */
export function receiptCapabilityCount(): number {
  return RECEIPT_CAPABILITY_REGISTRY.length;
}
