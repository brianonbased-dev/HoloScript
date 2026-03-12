/**
 * HoloScript Per-Package Permission Manifest
 *
 * Defines write-access boundaries for each of the 38+ HoloScript packages.
 * Every package is classified by sensitivity tier and assigned a permission
 * scope that restricts which agent roles can read or write within it.
 *
 * Sensitivity tiers:
 *   CRITICAL  - Core compiler, identity, security (write: ORCHESTRATOR only)
 *   HIGH      - Runtime, FS, sandbox, partner-sdk (write: CODE_GENERATOR + ORCHESTRATOR)
 *   STANDARD  - Tooling, linters, formatters (write: AST_OPTIMIZER + above)
 *   LOW       - Docs, examples, benchmarks, tests (write: all authenticated agents)
 *
 * @version 1.0.0
 */

import { AgentRole, AgentPermission } from './AgentIdentity';

/**
 * Sensitivity tier for a package
 */
export enum PackageTier {
  /** Core infrastructure - only orchestrator can write */
  CRITICAL = 'critical',
  /** Security-sensitive - code generators and above */
  HIGH = 'high',
  /** Standard tooling - optimizers and above */
  STANDARD = 'standard',
  /** Low sensitivity - all authenticated agents */
  LOW = 'low',
}

/**
 * Per-package permission entry
 */
export interface PackagePermission {
  /** Package name (e.g., 'core', 'security-sandbox') */
  name: string;
  /** NPM scope name (e.g., '@holoscript/core') */
  scopeName: string;
  /** Relative path from repository root */
  path: string;
  /** Sensitivity tier */
  tier: PackageTier;
  /** Roles allowed to WRITE to this package */
  writeRoles: AgentRole[];
  /** Roles allowed to READ from this package */
  readRoles: AgentRole[];
  /** Whether filesystem writes are expected (e.g., build output) */
  allowsFsWrites: boolean;
  /** Whether the package accesses external network */
  accessesNetwork: boolean;
  /** Whether the package handles secrets/credentials */
  handlesSecrets: boolean;
  /** Additional notes for audit */
  notes?: string;
}

/**
 * Write-role sets per tier (additive from CRITICAL -> LOW)
 */
const TIER_WRITE_ROLES: Record<PackageTier, AgentRole[]> = {
  [PackageTier.CRITICAL]: [AgentRole.ORCHESTRATOR],
  [PackageTier.HIGH]: [AgentRole.ORCHESTRATOR, AgentRole.CODE_GENERATOR],
  [PackageTier.STANDARD]: [
    AgentRole.ORCHESTRATOR,
    AgentRole.CODE_GENERATOR,
    AgentRole.AST_OPTIMIZER,
  ],
  [PackageTier.LOW]: [
    AgentRole.ORCHESTRATOR,
    AgentRole.CODE_GENERATOR,
    AgentRole.AST_OPTIMIZER,
    AgentRole.SYNTAX_ANALYZER,
    AgentRole.EXPORTER,
  ],
};

/**
 * All roles can read all packages (principle of least surprise for compilers)
 */
const ALL_READ_ROLES: AgentRole[] = Object.values(AgentRole);

/**
 * Complete permission manifest for all HoloScript packages
 */
export const PACKAGE_PERMISSION_MANIFEST: PackagePermission[] = [
  // =====================================================================
  // CRITICAL TIER - Core infrastructure, identity, security
  // =====================================================================
  {
    name: 'core',
    scopeName: '@holoscript/core',
    path: 'packages/core',
    tier: PackageTier.CRITICAL,
    writeRoles: TIER_WRITE_ROLES[PackageTier.CRITICAL],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Parser, AST, 2000+ traits, 30+ compilers, identity framework',
  },
  {
    name: 'security-sandbox',
    scopeName: '@holoscript/security-sandbox',
    path: 'packages/security-sandbox',
    tier: PackageTier.CRITICAL,
    writeRoles: TIER_WRITE_ROLES[PackageTier.CRITICAL],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'VM-based execution sandbox. Write access MUST be restricted.',
  },
  {
    name: 'compiler-wasm',
    scopeName: '@holoscript/compiler-wasm',
    path: 'packages/compiler-wasm',
    tier: PackageTier.CRITICAL,
    writeRoles: TIER_WRITE_ROLES[PackageTier.CRITICAL],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'WASM compiler binary output. Malicious writes = supply chain attack.',
  },

  // =====================================================================
  // HIGH TIER - Runtime, FS, Partner SDK, MCP, Registry
  // =====================================================================
  {
    name: 'runtime',
    scopeName: '@holoscript/runtime',
    path: 'packages/runtime',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: false,
    notes: 'Scene execution runtime. Network for multiplayer sync.',
  },
  {
    name: 'fs',
    scopeName: '@holoscript/fs',
    path: 'packages/fs',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'File system module. NO path boundary enforcement currently.',
  },
  {
    name: 'mcp-server',
    scopeName: '@holoscript/mcp-server',
    path: 'packages/mcp-server',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: true,
    notes: '34 AI tools. Handles browser automation via Playwright.',
  },
  {
    name: 'partner-sdk',
    scopeName: '@holoscript/partner-sdk',
    path: 'packages/partner-sdk',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: true,
    notes: 'Webhooks, analytics, partner APIs. Has WEAK hash function.',
  },
  {
    name: 'registry',
    scopeName: '@holoscript/registry',
    path: 'packages/registry',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: true,
    handlesSecrets: false,
    notes: 'Package registry with certification checker.',
  },
  {
    name: 'graphql-api',
    scopeName: '@holoscript/graphql-api',
    path: 'packages/graphql-api',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: true,
    notes: 'GraphQL API server with auth endpoints.',
  },
  {
    name: 'collab-server',
    scopeName: '@holoscript/collab-server',
    path: 'packages/collab-server',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: false,
    notes: 'Real-time collaboration server (WebSocket).',
  },
  {
    name: 'llm-provider',
    scopeName: '@holoscript/llm-provider',
    path: 'packages/llm-provider',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: true,
    notes: 'OpenAI/Anthropic/Gemini unified SDK. Handles API keys.',
  },
  {
    name: 'adapter-postgres',
    scopeName: '@holoscript/adapter-postgres',
    path: 'packages/adapter-postgres',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: true,
    notes: 'Database adapter. Handles connection strings.',
  },
  {
    name: 'marketplace-api',
    scopeName: '@holoscript/marketplace-api',
    path: 'packages/marketplace-api',
    tier: PackageTier.HIGH,
    writeRoles: TIER_WRITE_ROLES[PackageTier.HIGH],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: true,
    notes: 'Marketplace backend API.',
  },

  // =====================================================================
  // STANDARD TIER - Tooling, IDE extensions, SDK
  // =====================================================================
  {
    name: 'cli',
    scopeName: '@holoscript/cli',
    path: 'packages/cli',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'CLI tool: holo build / compile / validate.',
  },
  {
    name: 'lsp',
    scopeName: '@holoscript/lsp',
    path: 'packages/lsp',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Language Server Protocol implementation.',
  },
  {
    name: 'formatter',
    scopeName: '@holoscript/formatter',
    path: 'packages/formatter',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Code formatter with file write capability.',
  },
  {
    name: 'linter',
    scopeName: '@holoscript/linter',
    path: 'packages/linter',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Linting rules engine.',
  },
  {
    name: 'ai-validator',
    scopeName: '@holoscript/ai-validator',
    path: 'packages/ai-validator',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Hallucination detection (Levenshtein distance).',
  },
  {
    name: 'vscode-extension',
    scopeName: '@holoscript/vscode-extension',
    path: 'packages/vscode-extension',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'VS Code extension with agent API integration.',
  },
  {
    name: 'neovim',
    scopeName: '@holoscript/neovim',
    path: 'packages/neovim',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Neovim plugin.',
  },
  {
    name: 'intellij',
    scopeName: '@holoscript/intellij',
    path: 'packages/intellij',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'IntelliJ IDEA plugin.',
  },
  {
    name: 'react-agent-sdk',
    scopeName: '@holoscript/react-agent-sdk',
    path: 'packages/react-agent-sdk',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'React SDK for agent integration.',
  },
  {
    name: 'unity-sdk',
    scopeName: '@holoscript/unity-sdk',
    path: 'packages/unity-sdk',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Unity C# SDK.',
  },
  {
    name: 'studio-plugin-sdk',
    scopeName: '@holoscript/studio-plugin-sdk',
    path: 'packages/studio-plugin-sdk',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Studio plugin development SDK.',
  },
  {
    name: 'std',
    scopeName: '@holoscript/std',
    path: 'packages/std',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Standard library.',
  },
  {
    name: 'spatial-engine',
    scopeName: '@holoscript/spatial-engine',
    path: 'packages/spatial-engine',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Spatial computing engine.',
  },
  {
    name: 'spatial-engine-wasm',
    scopeName: '@holoscript/spatial-engine-wasm',
    path: 'packages/spatial-engine-wasm',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'WASM build of spatial engine.',
  },
  {
    name: 'holoscript',
    scopeName: 'holoscript',
    path: 'packages/holoscript',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Main holoscript NPM package.',
  },
  {
    name: 'holoscript-cdn',
    scopeName: '@holoscript/holoscript-cdn',
    path: 'packages/holoscript-cdn',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: false,
    notes: 'CDN distribution package.',
  },
  {
    name: 'holoscript-component',
    scopeName: '@holoscript/holoscript-component',
    path: 'packages/holoscript-component',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Web component wrapper.',
  },
  {
    name: 'components',
    scopeName: '@holoscript/components',
    path: 'packages/components',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Shared UI components.',
  },
  {
    name: 'python-bindings',
    scopeName: 'holoscript-python',
    path: 'packages/python-bindings',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Python bindings + robotics module.',
  },
  {
    name: 'tree-sitter-holoscript',
    scopeName: '@holoscript/tree-sitter-holoscript',
    path: 'packages/tree-sitter-holoscript',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Tree-sitter grammar and parser.',
  },
  {
    name: 'shader-preview-wgpu',
    scopeName: '@holoscript/shader-preview-wgpu',
    path: 'packages/shader-preview-wgpu',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'WebGPU shader preview.',
  },
  {
    name: 'tauri-app',
    scopeName: '@holoscript/tauri-app',
    path: 'packages/tauri-app',
    tier: PackageTier.STANDARD,
    writeRoles: TIER_WRITE_ROLES[PackageTier.STANDARD],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Tauri desktop application.',
  },

  // =====================================================================
  // LOW TIER - Docs, examples, benchmarks, tests, visual
  // =====================================================================
  {
    name: 'benchmark',
    scopeName: '@holoscript/benchmark',
    path: 'packages/benchmark',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Performance benchmarks.',
  },
  {
    name: 'comparative-benchmarks',
    scopeName: '@holoscript/comparative-benchmarks',
    path: 'packages/comparative-benchmarks',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Cross-platform benchmarks.',
  },
  {
    name: 'test',
    scopeName: '@holoscript/test',
    path: 'packages/test',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Visual test runner and diff viewer.',
  },
  {
    name: 'visual',
    scopeName: '@holoscript/visual',
    path: 'packages/visual',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Visual regression testing.',
  },
  {
    name: 'preview-component',
    scopeName: '@holoscript/preview-component',
    path: 'packages/preview-component',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: '3D preview component.',
  },
  {
    name: 'visualizer-client',
    scopeName: '@holoscript/visualizer-client',
    path: 'packages/visualizer-client',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'AST/scene visualizer client.',
  },
  {
    name: 'playground',
    scopeName: '@holoscript/playground',
    path: 'packages/playground',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Online code playground.',
  },
  {
    name: 'studio',
    scopeName: '@holoscript/studio',
    path: 'packages/studio',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: true,
    handlesSecrets: false,
    notes: 'Studio application (Next.js).',
  },
  {
    name: 'marketplace-web',
    scopeName: '@holoscript/marketplace-web',
    path: 'packages/marketplace-web',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: false,
    accessesNetwork: true,
    handlesSecrets: false,
    notes: 'Marketplace web frontend.',
  },
  {
    name: 'video-tutorials',
    scopeName: '@holoscript/video-tutorials',
    path: 'packages/video-tutorials',
    tier: PackageTier.LOW,
    writeRoles: TIER_WRITE_ROLES[PackageTier.LOW],
    readRoles: ALL_READ_ROLES,
    allowsFsWrites: true,
    accessesNetwork: false,
    handlesSecrets: false,
    notes: 'Video tutorial content and narration scripts.',
  },
];

/**
 * Lookup table: package name -> permission entry
 */
export const PACKAGE_PERMISSIONS_BY_NAME: Map<string, PackagePermission> = new Map(
  PACKAGE_PERMISSION_MANIFEST.map((p) => [p.name, p])
);

/**
 * Lookup table: package path -> permission entry
 */
export const PACKAGE_PERMISSIONS_BY_PATH: Map<string, PackagePermission> = new Map(
  PACKAGE_PERMISSION_MANIFEST.map((p) => [p.path, p])
);

/**
 * Get all packages in a specific tier
 */
export function getPackagesByTier(tier: PackageTier): PackagePermission[] {
  return PACKAGE_PERMISSION_MANIFEST.filter((p) => p.tier === tier);
}

/**
 * Get all packages an agent role can write to
 */
export function getWritablePackages(role: AgentRole): PackagePermission[] {
  return PACKAGE_PERMISSION_MANIFEST.filter((p) => p.writeRoles.includes(role));
}

/**
 * Get all packages that handle secrets
 */
export function getSecretHandlingPackages(): PackagePermission[] {
  return PACKAGE_PERMISSION_MANIFEST.filter((p) => p.handlesSecrets);
}

/**
 * Get all packages that access external network
 */
export function getNetworkAccessPackages(): PackagePermission[] {
  return PACKAGE_PERMISSION_MANIFEST.filter((p) => p.accessesNetwork);
}

/**
 * Manifest summary statistics
 */
export function getManifestSummary(): {
  total: number;
  byTier: Record<PackageTier, number>;
  withFsWrites: number;
  withNetwork: number;
  withSecrets: number;
} {
  const summary = {
    total: PACKAGE_PERMISSION_MANIFEST.length,
    byTier: {} as Record<PackageTier, number>,
    withFsWrites: 0,
    withNetwork: 0,
    withSecrets: 0,
  };

  for (const tier of Object.values(PackageTier)) {
    summary.byTier[tier] = 0;
  }

  for (const pkg of PACKAGE_PERMISSION_MANIFEST) {
    summary.byTier[pkg.tier]++;
    if (pkg.allowsFsWrites) summary.withFsWrites++;
    if (pkg.accessesNetwork) summary.withNetwork++;
    if (pkg.handlesSecrets) summary.withSecrets++;
  }

  return summary;
}
