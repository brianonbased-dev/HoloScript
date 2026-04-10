/**
 * Triple-Gate Security Pattern for HoloScript MCP Server
 *
 * Gate 1: Client → LLM Prompt Validation
 *   Validates that incoming requests don't contain injection patterns,
 *   are well-formed, and meet size/rate limits before reaching tool dispatch.
 *
 * Gate 2: LLM → MCP Tool Authorization (per-tool scopes)
 *   See tool-scopes.ts — checks OAuth 2.1 scopes against tool requirements.
 *
 * Gate 3: MCP → Downstream API (StdlibPolicy enforcement)
 *   Enforces StdlibPolicy restrictions on tools that interact with
 *   the filesystem, network, shell, or GPU resources.
 */

import type { TokenIntrospection } from './oauth21';
import type { ToolRiskLevel } from './tool-scopes';
import { getToolRiskLevel, authorizeToolCall } from './tool-scopes';

/**
 * StdlibPolicy interface (mirrored from @holoscript/core to avoid
 * circular dependency in the security module — identical shape).
 */
export interface StdlibPolicy {
  allowedPaths: string[];
  maxFileBytes: number;
  allowShell: boolean;
  allowedShellCommands: string[];
  maxShellOutputBytes: number;
  shellTimeoutMs: number;
  allowNetwork: boolean;
  allowedHosts: string[];
  rootDir: string;
  allowMediaDecode?: boolean;
  allowDepthInference?: boolean;
  allowGpuCompute?: boolean;
  maxGifFrames?: number;
  maxVideoDurationSec?: number;
  maxMediaResolution?: number;
}

// ── Gate 1: Prompt Validation ────────────────────────────────────────────────

export interface Gate1Config {
  /** Maximum request body size in bytes. Default: 1MB */
  maxBodySize: number;
  /** Maximum tool argument string length. Default: 100KB */
  maxArgStringLength: number;
  /** Maximum number of nested objects in arguments. Default: 10 */
  maxArgDepth: number;
  /** Block requests with suspicious injection patterns. Default: true */
  blockInjectionPatterns: boolean;
  /** Rate limit: max requests per minute per client. Default: 120 */
  rateLimitPerMinute: number;
}

export const DEFAULT_GATE1_CONFIG: Gate1Config = {
  maxBodySize: 1 * 1024 * 1024,
  maxArgStringLength: 100 * 1024,
  maxArgDepth: 10,
  blockInjectionPatterns: true,
  rateLimitPerMinute: 120,
};

// Injection patterns that should never appear in tool arguments
const INJECTION_PATTERNS = [
  // Shell injection
  /;\s*(rm|del|format|mkfs|dd)\s/i,
  /\|\|\s*(rm|del|format)\s/i,
  /&&\s*(rm|del|format)\s/i,
  /`[^`]*\b(rm|del|format)\b[^`]*`/i,
  /\$\([^)]*\b(rm|del|format)\b[^)]*\)/i,

  // Path traversal (../../ etc or deeper)
  /\.\.[/\\].*\.\.[/\\]/,
  /%2e%2e[/\\%]/i,

  // Prototype pollution
  /__proto__/,
  /constructor\s*\.\s*prototype/,

  // Server-side template injection
  /\{\{.*\}\}/,
  /\$\{.*process\./,

  // MCP protocol injection (attempt to inject JSON-RPC commands)
  /"jsonrpc"\s*:\s*"2\.0".*"method"\s*:/,
];

/** Rate limiter: sliding window per client */
const rateLimitWindows = new Map<string, number[]>();

export interface Gate1Result {
  passed: boolean;
  reason?: string;
  /** Sanitized arguments (with dangerous patterns removed) */
  sanitizedArgs?: Record<string, unknown>;
}

/**
 * Gate 1: Validate incoming request before tool dispatch.
 *
 * Checks:
 * 1. Request body size
 * 2. Argument string lengths
 * 3. Argument nesting depth
 * 4. Injection pattern detection
 * 5. Rate limiting per client
 */
export function gate1ValidateRequest(
  toolName: string,
  args: Record<string, unknown>,
  clientId: string,
  config: Gate1Config = DEFAULT_GATE1_CONFIG
): Gate1Result {
  // Rate limiting
  const now = Date.now();
  const windowStart = now - 60_000;
  const clientKey = clientId || 'anonymous';
  let timestamps = rateLimitWindows.get(clientKey) || [];
  timestamps = timestamps.filter((t) => t > windowStart);
  timestamps.push(now);
  rateLimitWindows.set(clientKey, timestamps);

  if (timestamps.length > config.rateLimitPerMinute) {
    return {
      passed: false,
      reason: `Rate limit exceeded: ${timestamps.length}/${config.rateLimitPerMinute} requests per minute`,
    };
  }

  // Check argument size
  const argsJson = JSON.stringify(args);
  if (argsJson.length > config.maxBodySize) {
    return {
      passed: false,
      reason: `Request body exceeds maximum size (${argsJson.length} > ${config.maxBodySize} bytes)`,
    };
  }

  // Check individual string argument lengths
  const longStrings = findLongStrings(args, config.maxArgStringLength);
  if (longStrings.length > 0) {
    return {
      passed: false,
      reason: `Argument string(s) exceed maximum length: ${longStrings.map((s) => `${s.path} (${s.length})`).join(', ')}`,
    };
  }

  // Check nesting depth
  const depth = measureDepth(args);
  if (depth > config.maxArgDepth) {
    return {
      passed: false,
      reason: `Argument nesting depth exceeds maximum (${depth} > ${config.maxArgDepth})`,
    };
  }

  // Injection pattern detection
  if (config.blockInjectionPatterns) {
    const injections = detectInjectionPatterns(args);
    if (injections.length > 0) {
      return {
        passed: false,
        reason: `Suspicious patterns detected in arguments: ${injections.join('; ')}`,
      };
    }
  }

  return { passed: true, sanitizedArgs: args };
}

function findLongStrings(
  obj: unknown,
  maxLen: number,
  path = ''
): Array<{ path: string; length: number }> {
  const results: Array<{ path: string; length: number }> = [];
  if (typeof obj === 'string' && obj.length > maxLen) {
    results.push({ path: path || 'root', length: obj.length });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      results.push(...findLongStrings(item, maxLen, `${path}[${i}]`));
    });
  } else if (obj && typeof obj === 'object') {
    for (const [key, val] of Object.entries(obj)) {
      results.push(...findLongStrings(val, maxLen, path ? `${path}.${key}` : key));
    }
  }
  return results;
}

function measureDepth(obj: unknown, current = 0): number {
  if (!obj || typeof obj !== 'object') return current;
  if (Array.isArray(obj)) {
    return Math.max(current + 1, ...obj.map((item) => measureDepth(item, current + 1)));
  }
  const values = Object.values(obj);
  if (values.length === 0) return current + 1;
  return Math.max(current + 1, ...values.map((val) => measureDepth(val, current + 1)));
}

function detectInjectionPatterns(obj: unknown, path = ''): string[] {
  const findings: string[] = [];
  if (typeof obj === 'string') {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(obj)) {
        findings.push(`Injection pattern in ${path || 'value'}: ${pattern.source}`);
        break; // One finding per value is enough
      }
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      findings.push(...detectInjectionPatterns(item, `${path}[${i}]`));
    });
  } else if (obj && typeof obj === 'object') {
    // Check for prototype pollution keys
    for (const key of Object.keys(obj)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        findings.push(`Prototype pollution attempt via key: ${key}`);
      }
      findings.push(
        ...detectInjectionPatterns(
          (obj as Record<string, unknown>)[key],
          path ? `${path}.${key}` : key
        )
      );
    }
  }
  return findings;
}

// Rate limit cleanup
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, timestamps] of rateLimitWindows) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      rateLimitWindows.delete(key);
    } else {
      rateLimitWindows.set(key, filtered);
    }
  }
}, 60_000);

// ── Gate 3: StdlibPolicy Enforcement ─────────────────────────────────────────

export interface Gate3Config {
  /** Default policy for tools that access downstream resources */
  defaultPolicy: StdlibPolicy;
  /** Override policies per client ID */
  clientPolicies: Map<string, Partial<StdlibPolicy>>;
  /** Tools that require Gate 3 enforcement (filesystem, network, shell, GPU) */
  enforcedTools: Set<string>;
}

/** Tools that interact with downstream resources and need Gate 3 */
const DOWNSTREAM_TOOLS = new Set([
  // Browser control (external process)
  'browser_launch',
  'browser_execute',
  'browser_screenshot',

  // Codebase intelligence (filesystem)
  'holo_absorb_repo',
  'holo_detect_changes',

  // Render (spawns processes)
  'render_preview',

  // Self-improvement (daemon, filesystem, shell)
  'holo_self_diagnose',
  'holo_validate_quality',

  // Edit (filesystem write)
  'edit_holo',

  // GLTF (filesystem I/O)
  'import_gltf',
  'compile_to_gltf',

  // Absorb service (network, external API)
  'absorb_run_absorb',
  'absorb_run_improve',
  'absorb_render',
  'absorb_run_pipeline',

  // HoloTest (spawns test runner)
  'execute_holotest',

  // Training data (generates large output)
  'generate_hololand_training',

  // 3D generation (external API: Meshy/Tripo)
  'generate_3d_object',

  // Networking (external connections)
  'push_state_delta',
  'fetch_authoritative_state',
]);

/** Default StdlibPolicy for MCP tool downstream access */
const DEFAULT_MCP_POLICY: StdlibPolicy = {
  allowedPaths: ['compositions', 'data', 'src', 'packages', 'examples'],
  maxFileBytes: 5 * 1024 * 1024, // 5MB for MCP
  allowShell: false,
  allowedShellCommands: [],
  maxShellOutputBytes: 256 * 1024,
  shellTimeoutMs: 30_000,
  allowNetwork: true, // MCP server needs network for render/share/absorb
  allowedHosts: [
    'mcp.holoscript.net',
    'api.meshy.ai',
    'api.tripo3d.ai',
    'holoscript.net',
    'localhost',
  ],
  rootDir: '.',
  allowMediaDecode: false,
  allowDepthInference: false,
  allowGpuCompute: false,
  maxGifFrames: 200,
  maxVideoDurationSec: 60,
  maxMediaResolution: 2048,
};

export interface Gate3Result {
  passed: boolean;
  reason?: string;
  appliedPolicy?: StdlibPolicy;
  enforcedRestrictions?: string[];
}

/**
 * Gate 3: Enforce StdlibPolicy for downstream resource access.
 *
 * Only applies to tools that interact with external resources
 * (filesystem, network, shell, GPU, external APIs).
 * Pure computation tools (parse, validate, etc.) pass through.
 */
export function gate3EnforcePolicy(
  toolName: string,
  args: Record<string, unknown>,
  auth: TokenIntrospection,
  config?: Partial<Gate3Config>
): Gate3Result {
  // Skip enforcement for tools that don't access downstream resources
  const enforcedTools = config?.enforcedTools || DOWNSTREAM_TOOLS;
  if (!enforcedTools.has(toolName)) {
    return { passed: true };
  }

  const basePolicy = config?.defaultPolicy || DEFAULT_MCP_POLICY;
  const clientOverrides = config?.clientPolicies?.get(auth.clientId || '') || {};
  const policy: StdlibPolicy = { ...basePolicy, ...clientOverrides };

  const restrictions: string[] = [];

  // Check filesystem paths in arguments
  const pathArgs = extractPathArgs(args);
  for (const pathArg of pathArgs) {
    const normalized = pathArg.replace(/\\/g, '/').replace(/^\.\//, '');
    if (normalized.startsWith('..') || normalized.includes('/../')) {
      return {
        passed: false,
        reason: `Path traversal blocked: "${pathArg}"`,
        appliedPolicy: policy,
      };
    }

    const allowed = policy.allowedPaths.some(
      (root) => normalized === root || normalized.startsWith(`${root}/`)
    );
    if (!allowed && pathArgs.length > 0) {
      restrictions.push(
        `Path "${normalized}" restricted by policy (allowed: ${policy.allowedPaths.join(', ')})`
      );
    }
  }

  // Check network access
  const urlArgs = extractUrlArgs(args);
  if (urlArgs.length > 0 && !policy.allowNetwork) {
    return {
      passed: false,
      reason: 'Network access denied by StdlibPolicy',
      appliedPolicy: policy,
    };
  }

  for (const url of urlArgs) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (policy.allowedHosts.length > 0 && !policy.allowedHosts.includes(hostname)) {
        return {
          passed: false,
          reason: `Host "${hostname}" not in allowed hosts (${policy.allowedHosts.join(', ')})`,
          appliedPolicy: policy,
        };
      }
    } catch {
      // Invalid URL — let downstream handler deal with it
    }
  }

  // Check shell execution
  if (toolName === 'browser_execute' || toolName === 'execute_holotest') {
    if (!policy.allowShell) {
      restrictions.push('Shell execution restricted by policy');
    }
  }

  // Check GPU compute
  if (args.useGpu || args.gpuCompute) {
    if (!policy.allowGpuCompute) {
      return {
        passed: false,
        reason: 'GPU compute access denied by StdlibPolicy',
        appliedPolicy: policy,
      };
    }
  }

  // Check media processing limits
  if (args.duration && typeof args.duration === 'number') {
    if (args.duration > (policy.maxVideoDurationSec || 300) * 1000) {
      return {
        passed: false,
        reason: `Duration ${args.duration}ms exceeds policy limit (${(policy.maxVideoDurationSec || 300) * 1000}ms)`,
        appliedPolicy: policy,
      };
    }
  }

  // Risk-based additional checks
  const riskLevel = getToolRiskLevel(toolName);
  if (riskLevel === 'critical' && auth.agentId === 'open-dev-mode') {
    return {
      passed: false,
      reason: 'Critical-risk tools require authenticated access (not open-dev-mode)',
      appliedPolicy: policy,
    };
  }

  return {
    passed: true,
    appliedPolicy: policy,
    enforcedRestrictions: restrictions.length > 0 ? restrictions : undefined,
  };
}

function extractPathArgs(args: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const pathKeys = [
    'path',
    'file',
    'filePath',
    'outputPath',
    'holoscriptFile',
    'directory',
    'dir',
    'output_file',
  ];
  for (const key of pathKeys) {
    if (typeof args[key] === 'string') {
      paths.push(args[key] as string);
    }
  }
  return paths;
}

function extractUrlArgs(args: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const [, val] of Object.entries(args)) {
    if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
      urls.push(val);
    }
  }
  return urls;
}

// ── Unified Triple-Gate Check ────────────────────────────────────────────────

export interface TripleGateResult {
  passed: boolean;
  gate: 0 | 1 | 2 | 3;
  reason?: string;
  gate1?: Gate1Result;
  gate2?: {
    authorized: boolean;
    reason?: string;
    requiredScopes?: string[];
    grantedScopes?: string[];
    riskLevel?: ToolRiskLevel;
  };
  gate3?: Gate3Result;
  riskLevel?: ToolRiskLevel;
}

/**
 * Run all three gates in sequence. Returns on first failure.
 */
export function runTripleGate(
  toolName: string,
  args: Record<string, unknown>,
  auth: TokenIntrospection,
  gate1Config?: Gate1Config,
  gate3Config?: Partial<Gate3Config>
): TripleGateResult {
  // Must be authenticated
  if (!auth.active) {
    return {
      passed: false,
      gate: 0,
      reason: 'Authentication required',
    };
  }

  // Gate 1: Prompt validation
  const g1 = gate1ValidateRequest(toolName, args, auth.clientId || 'unknown', gate1Config);
  if (!g1.passed) {
    return {
      passed: false,
      gate: 1,
      reason: g1.reason,
      gate1: g1,
    };
  }

  // Gate 2: Tool authorization (scope check)
  const g2 = authorizeToolCall(toolName, auth.scopes || []);
  if (!g2.authorized) {
    return {
      passed: false,
      gate: 2,
      reason: g2.reason,
      gate2: g2,
      riskLevel: g2.riskLevel,
    };
  }

  // Gate 3: StdlibPolicy enforcement
  const g3 = gate3EnforcePolicy(toolName, args, auth, gate3Config);
  if (!g3.passed) {
    return {
      passed: false,
      gate: 3,
      reason: g3.reason,
      gate3: g3,
      riskLevel: g2.riskLevel,
    };
  }

  return {
    passed: true,
    gate: 3,
    gate1: g1,
    gate2: g2,
    gate3: g3,
    riskLevel: g2.riskLevel,
  };
}
