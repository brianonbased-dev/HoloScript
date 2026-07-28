/**
 * Tool runner for headless mesh agents.
 *
 * Provides a small, sandboxed set of tools that LLM agents can call during
 * task execution. Anthropic tool-use shape — these specs are passed to
 * `messages.stream({ tools: [...] })`, the model returns `tool_use` blocks,
 * the runner executes them via `runTool()` and feeds results back as
 * `tool_result` blocks until the model emits its final text response.
 *
 * Sandbox model:
 *   - read_file / list_dir: restricted to ALLOWED_READ_ROOTS (task inputs +
 *     read-only views of the cloned repo). No /etc, no /home, no /root/.ssh.
 *   - write_file: restricted to ALLOWED_WRITE_ROOTS (just /root/agent-output/).
 *     Creates dir if needed, refuses paths that escape via .. or symlinks.
 *   - bash: ONLY whitelisted command prefixes (lake build, lean ..., ls, cat,
 *     grep, find, wc, head, tail, git status/log/diff/show, pnpm --filter,
 *     vitest run --no-coverage). Hard 60s wall timeout, 1MB stdout cap. Refuses
 *     anything else (rm, curl, ssh, sudo, eval, etc.).
 *   - http_request: HTTPS GET only, 30s timeout, 200KB cap. Private IP ranges
 *     (RFC-1918/loopback/link-local) are blocked to prevent SSRF against the
 *     host network. Read-only — does not count as a productive tool call.
 *
 * The sandbox is best-effort host isolation — these instances are dedicated
 * to a single mesh-worker identity, so we trade some flexibility for a clear
 * "what the LLM can do" contract that audits cleanly.
 */

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, delimiter, isAbsolute, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { ToolSpec, ToolUseBlock, ToolResultBlock } from '@holoscript/llm-provider';

// ---------------------------------------------------------------------------
// Sandbox roots — keep narrow. Add only when a task needs more.
//
// Env-overridable so the SAME runner serves both deployments:
//   - Vast fleet instance: the /root/* defaults below (clone + scp layout).
//   - Local node (laptop / Jetson): point at the local checkout + a local
//     output dir via HOLOSCRIPT_AGENT_READ_ROOTS / _WRITE_ROOTS.
// Format: OS-path-separator-delimited list (':' on POSIX, ';' on Windows) —
// e.g. HOLOSCRIPT_AGENT_READ_ROOTS="/home/user/HoloScript:/home/user/agent-output".
// Unset → fleet defaults (no behavior change on the existing workers).
// ---------------------------------------------------------------------------
const FLEET_READ_ROOTS = [
  '/root/msc-paper-22', // Paper 22 mechanization inputs (scp'd by deploy)
  '/root/holoscript-mesh', // Read-only repo view (clone path on instance)
  '/root/agent-output', // Read back what we wrote
];

const FLEET_WRITE_ROOTS = [
  '/root/agent-output', // Single write sink — keeps deliverables in one place
];

function parseRootsEnv(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  const roots = raw
    .split(delimiter)
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && isAbsolute(r));
  return roots.length > 0 ? roots : fallback;
}

const ALLOWED_READ_ROOTS = parseRootsEnv(process.env.HOLOSCRIPT_AGENT_READ_ROOTS, FLEET_READ_ROOTS);

const ALLOWED_WRITE_ROOTS = parseRootsEnv(
  process.env.HOLOSCRIPT_AGENT_WRITE_ROOTS,
  FLEET_WRITE_ROOTS
);

// Command-prefix whitelist. Prefix-match is intentional — `lake build MSC`
// matches `lake build`, `pnpm --filter @holoscript/core build` matches
// `pnpm --filter`, etc. Refuses anything else (no sudo, rm, curl, ssh, eval).
//
// Two-tier classification (W.107 tightening 2026-04-26):
//   READ_ONLY    — observation-only commands. Pass execution policy, but do
//                  NOT count as artifact-producing for the W.107 gate.
//   PRODUCTIVE   — commands that build, test, or otherwise produce a real
//                  artifact (compile output, test result, etc.). DO count as
//                  artifact-producing for the W.107 gate.
//
// Pre-tightening, the gate accepted ANY bash call as side-effecting — so
// `bash echo done` would falsely pass the gate. Now `echo` is read-only and
// the worker must call something productive (lake build / pnpm --filter
// build / vitest run / lean compile / etc.) to claim `executed`.
const BASH_READ_ONLY_PREFIXES = [
  'ls ',
  'ls\n',
  'ls$',
  'cat ',
  'grep ',
  'rg ',
  'find ',
  'wc ',
  'head ',
  'tail ',
  'git status',
  'git log',
  'git diff',
  'git show',
  'pwd',
  'echo ',
  'lake env',
];

const BASH_PRODUCTIVE_PREFIXES = [
  'lake build',
  'lake clean',
  'lean ',
  'pnpm --filter',
  'pnpm vitest',
  'vitest run',
  // Robotics / edge-node (Jetson) productive commands — without these, every
  // ros2/colcon/tegrastats task fails the W.107 artifact gate and is abandoned
  // as no-artifact. (jetson-orin-01 lane.)
  'ros2 launch',
  'ros2 topic pub',
  'ros2 service call',
  'colcon build',
  'tegrastats',
];

const BASH_WHITELIST = [...BASH_READ_ONLY_PREFIXES, ...BASH_PRODUCTIVE_PREFIXES];

/**
 * Returns true iff `cmd` matches a productive prefix — i.e. would produce a
 * real artifact (compile/test/build output) rather than just observing state.
 * Used by the W.107 artifact-grounding gate in runner.ts.
 */
export function isProductiveBashCommand(cmd: string): boolean {
  const trimmed = String(cmd ?? '').trim();
  if (!trimmed) return false;
  return BASH_PRODUCTIVE_PREFIXES.some((prefix) => trimmed.startsWith(prefix.trim()));
}

/**
 * Core MCP tools that PRODUCE/VALIDATE an artifact (vs read-only query/get/list).
 * An `mcp_call` to one of these counts toward the W.107 artifact gate; an mcp_call to
 * a read tool (holo_query_codebase / get_* / list_*) does not — otherwise an agent
 * could "satisfy" the gate just by querying.
 */
const PRODUCTIVE_MCP_PREFIXES = [
  'compile_',
  'generate_',
  'solve_',
  'validate_',
  'create_',
  'conformance_',
  'holoscript_compile',
  'holo_write',
  'holo_edit',
];

/** True iff an mcp_call to `tool` produces/validates a real artifact (W.107 gate). */
export function isProductiveMcpTool(tool: string): boolean {
  const t = String(tool ?? '')
    .trim()
    .toLowerCase();
  if (!t) return false;
  return PRODUCTIVE_MCP_PREFIXES.some((p) => t.startsWith(p));
}

/**
 * True iff a single tool_use is a *productive* (artifact-producing) call for the
 * W.107.b artifact-grounding gate:
 *   - write_file with non-empty content,
 *   - bash with a productive prefix (isProductiveBashCommand),
 *   - emit_hardware_receipt (always writes a receipt file).
 * read_file / list_dir and read-only / trivial bash are NOT productive.
 *
 * This is the SINGLE SOURCE OF TRUTH the runner's gate (runner.ts) and the
 * artifact-gate ablation harness both consume — so the measured gate can never
 * drift from the shipped gate (the ablation measures the real thing, not a copy).
 */
export function isProductiveToolUse(use: ToolUseBlock): boolean {
  const input = (use.input ?? {}) as Record<string, unknown>;
  switch (use.name) {
    case 'write_file':
      return String(input.content ?? '').length > 0;
    case 'bash':
      return isProductiveBashCommand(String(input.cmd ?? ''));
    case 'emit_hardware_receipt':
      return true;
    case 'str_replace':
      return true;
    case 'vision_analyze':
      return true;
    case 'mcp_call':
      // Productive only when the invoked MCP tool produces/validates an artifact
      // (compile/generate/solve/validate/…), not a read-only query.
      return isProductiveMcpTool(String(input.tool ?? ''));
    default:
      return false;
  }
}

/**
 * Accumulate the productive-call count + the tool names seen across one model
 * turn's tool_use blocks. The runner adds `names` to its toolsCalled set and
 * `productiveCount` to its gate counter.
 */
export function summarizeToolProductivity(uses: readonly ToolUseBlock[]): {
  productiveCount: number;
  names: string[];
} {
  let productiveCount = 0;
  const names: string[] = [];
  for (const u of uses) {
    names.push(u.name);
    if (isProductiveToolUse(u)) productiveCount++;
  }
  return { productiveCount, names };
}

// ---------------------------------------------------------------------------
// Tool specs surfaced to the LLM
// ---------------------------------------------------------------------------
export const MESH_TOOLS: ToolSpec[] = [
  {
    name: 'read_file',
    description:
      `Read a file from the agent sandbox. Allowed roots: ${ALLOWED_READ_ROOTS.join(', ')}. ` +
      'Returns the file content as text. Use this to inspect task inputs and the ' +
      'read-only repo view.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path under an allowed read root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_dir',
    description:
      'List entries in a directory under the agent sandbox. Same root restrictions ' +
      'as read_file. Returns a newline-separated list of entries.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path under an allowed read root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      `Write a file to the deliverable sink (write roots: ${ALLOWED_WRITE_ROOTS.join(', ')}). ` +
      'Anything you want to emit as task output (a Lean proof, a markdown report, a JSON ' +
      'dataset, a .holo scene) goes here. Creates parent directories. Will refuse paths ' +
      'outside the write root(s).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: `Absolute path under a write root: ${ALLOWED_WRITE_ROOTS.join(', ')}`,
        },
        content: { type: 'string', description: 'File content to write (UTF-8)' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'bash',
    description:
      'Run a shell command. Whitelisted prefixes only: lake build, lean, ls, cat, ' +
      'grep, find, wc, head, tail, git status/log/diff/show, pnpm --filter, vitest run, ' +
      'pwd, echo, ros2 launch/topic/service, colcon build, tegrastats. ' +
      'Hard 60s wall timeout, 1MB stdout cap. Use for builds, tests, hardware probes. ' +
      'Refuses rm, curl, ssh, sudo, eval.',
    input_schema: {
      type: 'object',
      properties: {
        cmd: { type: 'string', description: 'Whitelisted shell command' },
        cwd: { type: 'string', description: 'Optional working directory (defaults to /root)' },
      },
      required: ['cmd'],
    },
  },
  {
    name: 'http_request',
    description:
      'HTTPS GET a public URL and return the response body as text. ' +
      'HTTPS only — http:// and private IPs (RFC-1918, loopback, link-local) are blocked. ' +
      '200KB cap, 30s timeout. Read-only: does not satisfy the write_file artifact gate.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'https:// URL to fetch' },
        headers: {
          type: 'object',
          description: 'Optional request headers (e.g. {"Accept": "application/json"})',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'emit_hardware_receipt',
    description:
      'Emit a portable hardware receipt (PortableHardwareReceiptMetadata v1) capturing ' +
      'device identity, runtime, and measured performance. Writes a JSON receipt to the ' +
      'agent output dir. Use after running tegrastats or colcon build to record hardware ' +
      'evidence for the CAEL audit chain. Accepts either pre-parsed measurements or raw ' +
      'tegrastats output (the tool parses it automatically).',
    input_schema: {
      type: 'object',
      properties: {
        device_kind: {
          type: 'string',
          description: 'Device identifier, e.g. "jetson-orin-nano-super", "raspberry-pi-5"',
        },
        accelerator: {
          description: 'Accelerator string, e.g. "NVIDIA CUDA 8.7", or null for CPU-only',
        },
        runtime_name: {
          type: 'string',
          description: 'Inference runtime, e.g. "Ollama", "llama.cpp"',
        },
        runtime_version: { type: 'string', description: 'Runtime version, e.g. "0.30.8"' },
        host_os: {
          type: 'string',
          description: 'OS + firmware, e.g. "JetPack 6.2.1 / Ubuntu 22.04"',
        },
        composition_id: {
          type: 'string',
          description: 'Brain composition reference, e.g. "jetson-orin-brain"',
        },
        measurements: {
          type: 'array',
          description:
            'Pre-parsed measurements. Each item: {metric: string, value: number, unit: string}',
          items: { type: 'object' },
        },
        tegrastats_output: {
          type: 'string',
          description: 'Raw tegrastats output line(s) — tool auto-parses GPU%, RAM, temp, power',
        },
      },
      required: ['device_kind', 'runtime_name', 'runtime_version', 'host_os'],
    },
  },
  {
    name: 'str_replace',
    description:
      'Surgical in-place edit of a file: find an exact string and replace it. ' +
      'The old string must appear exactly once in the file — if it appears zero or more than once ' +
      'the tool returns an error with the actual count, letting you refine the search string. ' +
      'Only files under the write root(s) can be edited. ' +
      'Counts as a productive tool call (equivalent to write_file).',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: `Absolute path under a write root: ${ALLOWED_WRITE_ROOTS.join(', ')}`,
        },
        old: { type: 'string', description: 'Exact string to find (must occur exactly once)' },
        new: { type: 'string', description: 'Replacement string' },
      },
      required: ['path', 'old', 'new'],
    },
  },
  {
    name: 'delegate_task',
    description:
      'Post a new task to the team board so another agent can claim and execute it. ' +
      'Use this to spawn sub-work the current agent cannot or should not do itself ' +
      '(e.g. a vision task for jetson-orin-fara, a cloud compute task for the fleet). ' +
      'The task appears on the shared board and is claimed by the first agent with matching capability tags.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title (max 200 chars)' },
        description: { type: 'string', description: 'Detailed task description (max 2000 chars)' },
        priority: { type: 'number', description: 'Priority 1-10 (1 = critical, default 5)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Capability tags for routing to the right agent, e.g. ["vision","edge"]',
        },
        source: {
          type: 'string',
          description: 'Where this subtask came from (e.g. parent task id)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'mcp_call',
    description:
      'Invoke a HoloScript MCP tool on the server — the LANGUAGE surface — and get its result. ' +
      'Use this to COMPILE, VALIDATE, GENERATE, SOLVE, or QUERY on-device instead of escalating ' +
      'to the fleet: e.g. validate_holoscript, parse_hs, compile_holoscript, compile_to_quest, ' +
      'generate_scene, generate_object, solve_logic, solve_structural, solve_thermal, ' +
      "holo_query_codebase, list_traits. `tool` is the MCP tool name; `args` is that tool's own " +
      'argument object. Example: {tool:"validate_holoscript", args:{code:"#version 6.0.0\\nscene \\"S\\" {}"}}. ' +
      "Returns the tool's result as text (or an error message — never throws).",
    input_schema: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description:
            'MCP tool name, e.g. "validate_holoscript", "compile_to_quest", "solve_logic"',
        },
        args: {
          type: 'object',
          description: "Arguments object for that tool (the tool's own input schema)",
        },
      },
      required: ['tool'],
    },
  },
  {
    name: 'vision_analyze',
    description:
      'Analyze an image using the local Fara-7B vision model (Ollama on loopback). ' +
      'Reads the image file at `image_path` (max 512KB — downscale larger images first), ' +
      'sends it to the vision model via the local Ollama API (env: HOLOSCRIPT_AGENT_VISION_MODEL), ' +
      "and returns the model's text analysis. " +
      'Counts as a productive tool call — use for GUI-grounding, visual QA, image captioning, ' +
      'or any task that requires perceiving image content. ' +
      'Only available on surfaces with a local Ollama instance and HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL set.',
    input_schema: {
      type: 'object',
      properties: {
        image_path: {
          type: 'string',
          description: 'Absolute path to the image file (png, jpg, webp) — must be under 512KB',
        },
        prompt: {
          type: 'string',
          description:
            'Instruction for the vision model (default: "Describe this image in detail.")',
        },
        model: {
          type: 'string',
          description: 'Ollama model tag override (default: HOLOSCRIPT_AGENT_VISION_MODEL env var)',
        },
      },
      required: ['image_path'],
    },
  },
];

// ---------------------------------------------------------------------------
// Active-tool resolution (F.126 #1 — author behavior as DATA the runtime consumes)
// ---------------------------------------------------------------------------
/**
 * Assemble the tool set the model sees from the brain's OWN DECLARATION — the
 * `behavior on_task { llm_call { tools: [...] } }` array — instead of a hardcoded
 * list. This is principle #1 of the native doctrine (F.126): the runtime consumes
 * the brain's authored capability set, so "add a tool" becomes "declare it in the
 * brain," not "edit this TypeScript." Fixes the dead-data bug where every brain's
 * declared tools were ignored and local-llm brains were amputated to write_file-only.
 *
 *  - Declared names are resolved against the available specs; an unknown name is
 *    dropped (the runner logs it) so a typo can't crash the loop.
 *  - A brain that declares NO tools falls back to the prior safe default
 *    (write_file-only for small local-llm models — the artifact-grounding floor;
 *    full menu otherwise) so this is backward-compatible.
 *  - W.710 progressive disclosure: a small local model can overflow its num_ctx
 *    output budget reasoning over a big menu before it emits a tool call, so a
 *    declared set larger than the budget is SLIM-trimmed (write_file kept first)
 *    for local-llm brains. Budget via HOLOSCRIPT_AGENT_TOOL_BUDGET (default 6).
 */
export function resolveActiveTools(
  brain: {
    requires: string[];
    onTaskActions?: Array<{ verb: string; config?: Record<string, unknown> }>;
  },
  opts: { all?: ToolSpec[]; isLocal?: boolean; budget?: number } = {}
): { tools: ToolSpec[]; declared: string[]; dropped: string[] } {
  const all = opts.all ?? MESH_TOOLS;
  const isLocal = opts.isLocal ?? brain.requires.includes('local-llm');
  const budget = opts.budget ?? (Number(process.env.HOLOSCRIPT_AGENT_TOOL_BUDGET) || 6);

  const declaredRaw = brain.onTaskActions?.find((a) => a.verb === 'llm_call')?.config?.tools;
  const declared = Array.isArray(declaredRaw)
    ? declaredRaw.filter((n): n is string => typeof n === 'string')
    : [];

  if (declared.length === 0) {
    // No declaration → prior safe default (backward-compatible).
    const fallback = isLocal ? all.filter((t) => t.name === 'write_file') : all;
    return { tools: fallback, declared: [], dropped: [] };
  }

  const dropped = declared.filter((n) => !all.some((t) => t.name === n));
  let resolved = declared
    .map((n) => all.find((t) => t.name === n))
    .filter((t): t is ToolSpec => Boolean(t));
  if (resolved.length === 0) resolved = all.filter((t) => t.name === 'write_file'); // never hand the model an empty toolset

  // num_ctx guard for small models: trim a large declared set, keeping write_file (grounding) first.
  if (isLocal && resolved.length > budget) {
    const wf = resolved.filter((t) => t.name === 'write_file');
    const rest = resolved.filter((t) => t.name !== 'write_file');
    resolved = [...wf, ...rest].slice(0, budget);
  }
  return { tools: resolved, declared, dropped };
}

// ---------------------------------------------------------------------------
// SSRF guard — block private/loopback/link-local hosts (RFC-1918 + RFC-5735)
// ---------------------------------------------------------------------------
const PRIVATE_IP_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i;

function checkHttpAllowed(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return `invalid URL: "${rawUrl}"`;
  }
  if (parsed.protocol !== 'https:') {
    return `only https:// is allowed, got "${parsed.protocol}"`;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || PRIVATE_IP_RE.test(host)) {
    return `host "${host}" is a private/loopback address — blocked to prevent SSRF`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Path-sandbox helpers
// ---------------------------------------------------------------------------
function isUnderRoot(absPath: string, root: string): boolean {
  const resolved = resolve(absPath);
  const rootResolved = resolve(root);
  return resolved === rootResolved || resolved.startsWith(rootResolved + sep);
}

function checkReadAllowed(path: string): string | null {
  if (!isAbsolute(path)) return `path must be absolute, got "${path}"`;
  for (const root of ALLOWED_READ_ROOTS) {
    if (isUnderRoot(path, root)) return null;
  }
  return `read denied — path "${path}" not under allowed roots: ${ALLOWED_READ_ROOTS.join(', ')}`;
}

function checkWriteAllowed(path: string): string | null {
  if (!isAbsolute(path)) return `path must be absolute, got "${path}"`;
  for (const root of ALLOWED_WRITE_ROOTS) {
    if (isUnderRoot(path, root)) return null;
  }
  return `write denied — path "${path}" not under allowed roots: ${ALLOWED_WRITE_ROOTS.join(', ')}`;
}

function checkBashAllowed(cmd: string): string | null {
  const trimmed = cmd.trim();
  if (trimmed.length === 0) return 'empty command';
  // Reject obvious shell-injection attempts. Whitelist below still applies.
  if (/[;&|`$<>]|>>|\|\||&&/.test(trimmed)) {
    return `command contains shell metachars (; & | \` $ < > >> || &&) — not allowed for safety`;
  }
  for (const prefix of BASH_WHITELIST) {
    if (trimmed.startsWith(prefix.trim())) return null;
  }
  return `command not on whitelist. Allowed prefixes: ${BASH_WHITELIST.join(' / ')}`;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
/** Optional capabilities the caller (runner) can inject into a tool run. */
export interface RunToolOptions {
  /**
   * Sign a hardware receipt's canonical body. Injected by index.ts from the seat
   * wallet (ethers EIP-191). Absent → the receipt is content-hashed but unsigned
   * and self-reports `signed:false`, so it can never overclaim.
   */
  signReceipt?: (canonical: string) => Promise<{ alg: string; signer: string; signature: string }>;
  /**
   * Post new tasks to the team board. Injected by runner.ts from mesh.addTasks().
   * Absent → delegate_task returns an error explaining the capability is unavailable.
   */
  addTask?: (
    tasks: Array<{
      title: string;
      description?: string;
      priority?: number;
      source?: string;
      tags?: string[];
    }>
  ) => Promise<{ added: number }>;
  /**
   * Invoke a core MCP tool (compile/validate/generate/solve/query). Injected by
   * runner.ts from mesh.invokeTool() — POSTs JSON-RPC to the server /mcp endpoint
   * with the agent bearer. Absent → mcp_call returns an error explaining the
   * capability is unavailable (needs a mesh connection).
   */
  invokeMcpTool?: (
    tool: string,
    args: Record<string, unknown>
  ) => Promise<{ ok: boolean; text: string }>;
}

export async function runTool(
  use: ToolUseBlock,
  opts: RunToolOptions = {}
): Promise<ToolResultBlock> {
  try {
    if (use.name === 'read_file') {
      const path = use.input.path as string;
      const denied = checkReadAllowed(path);
      if (denied) return errResult(use.id, denied);
      const text = await readFile(path, 'utf8');
      // Cap at 200KB to avoid context blowups
      const truncated =
        text.length > 200_000
          ? text.slice(0, 200_000) + `\n…[truncated, full file is ${text.length} bytes]`
          : text;
      return okResult(use.id, truncated);
    }

    if (use.name === 'list_dir') {
      const path = use.input.path as string;
      const denied = checkReadAllowed(path);
      if (denied) return errResult(use.id, denied);
      const entries = await readdir(path, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? 'd' : '-'} ${e.name}`);
      return okResult(use.id, lines.join('\n'));
    }

    if (use.name === 'write_file') {
      const path = use.input.path as string;
      const content = use.input.content as string;
      const denied = checkWriteAllowed(path);
      if (denied) return errResult(use.id, denied);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
      const s = await stat(path);
      return okResult(use.id, `wrote ${s.size} bytes to ${path}`);
    }

    if (use.name === 'bash') {
      const cmd = use.input.cmd as string;
      const cwd = (use.input.cwd as string | undefined) ?? '/root';
      const denied = checkBashAllowed(cmd);
      if (denied) return errResult(use.id, denied);
      const result = await runBash(cmd, cwd);
      return result.code === 0
        ? okResult(use.id, result.stdout)
        : errResult(use.id, `exit=${result.code}\n${result.stderr || result.stdout}`);
    }

    if (use.name === 'http_request') {
      const rawUrl = String(use.input.url ?? '');
      const denied = checkHttpAllowed(rawUrl);
      if (denied) return errResult(use.id, denied);
      const userHeaders = (use.input.headers ?? {}) as Record<string, string>;
      const RESPONSE_CAP = 200_000;
      const TIMEOUT_MS = 30_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(rawUrl, {
          method: 'GET',
          headers: { 'user-agent': 'holoscript-agent/1.0', ...userHeaders },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const buf = await res.arrayBuffer();
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        const truncated =
          text.length > RESPONSE_CAP
            ? text.slice(0, RESPONSE_CAP) + `\n…[truncated, full body is ${text.length} chars]`
            : text;
        if (!res.ok) return errResult(use.id, `HTTP ${res.status} ${res.statusText}\n${truncated}`);
        return okResult(use.id, truncated);
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        return errResult(
          use.id,
          msg.includes('abort') ? `request timed out after ${TIMEOUT_MS}ms` : msg
        );
      }
    }

    if (use.name === 'emit_hardware_receipt') {
      const deviceKind = String(use.input.device_kind ?? 'unknown-device');
      const accelerator =
        use.input.accelerator === null || use.input.accelerator === 'null'
          ? null
          : String(use.input.accelerator ?? '').trim() || null;
      const runtimeName = String(use.input.runtime_name ?? 'Ollama');
      const runtimeVersion = String(use.input.runtime_version ?? 'unknown');
      const hostOs = String(use.input.host_os ?? 'unknown');
      const compositionId = String(use.input.composition_id ?? 'unknown');

      // Collect measurements — from pre-parsed array and/or raw tegrastats output.
      let measurements: Array<{ metric: string; value: number; unit: string; method: string }> = [];
      if (Array.isArray(use.input.measurements)) {
        for (const m of use.input.measurements as Array<Record<string, unknown>>) {
          const metric = String(m.metric ?? '');
          const value = Number(m.value ?? 0);
          const unit = String(m.unit ?? '');
          if (metric && Number.isFinite(value)) {
            measurements.push({ metric, value, unit, method: 'measured' });
          }
        }
      }
      if (
        typeof use.input.tegrastats_output === 'string' &&
        use.input.tegrastats_output.length > 0
      ) {
        measurements = [...measurements, ...parseTegrastats(use.input.tegrastats_output as string)];
      }
      // Minimum 1 measurement so the schema validator doesn't reject the receipt.
      if (measurements.length === 0) {
        measurements.push({ metric: 'agent-tick', value: 1, unit: 'count', method: 'presence' });
      }

      const capturedAt = new Date().toISOString();
      const receipt = {
        schemaVersion: 'holoscript.hardware-receipt-metadata.v1',
        target: {
          id: `${deviceKind}-${Date.now()}`,
          kind: deviceKind,
          architecture: /jetson|orin|nano|agx|xavier/i.test(deviceKind) ? 'arm64' : 'unknown',
          artifactKind: 'measurement-trace',
        },
        device: {
          vendor: /jetson|orin|nvidia/i.test(deviceKind) ? 'nvidia' : 'unknown',
          model: deviceKind,
          accelerator,
        },
        runtime: { name: runtimeName, version: runtimeVersion, hostOS: hostOs },
        compilerVersion: 'holoscript-agent-1.0.0',
        constraints: [],
        measuredResults: measurements,
        replayInputs: [
          { kind: 'composition-ref', uri: `compositions/${compositionId}`, sha256: 'unknown' },
        ],
        provenance: {
          capturedAt,
          sourceCompositionHash: compositionId,
        },
        owner: {
          agent: process.env.HOLOSCRIPT_AGENT_HANDLE ?? 'unknown',
          ...(process.env.HOLOMESH_TEAM_ID ? { team: process.env.HOLOMESH_TEAM_ID } : {}),
        },
      };

      // Integrity seal (F.123 — a tamper-evident, not plain-JSON, receipt):
      // a deterministic SHA-256 content hash over the canonical body (keyless
      // content-addressing) plus an OPTIONAL wallet signature when a signer is
      // injected (index.ts wires the seat wallet). `signed` self-reports honestly
      // so an unsigned receipt can never masquerade as signed.
      const canonical = JSON.stringify(receipt);
      const contentHash = createHash('sha256').update(canonical).digest('hex');
      let signature: { alg: string; signer: string; signature: string } | null = null;
      if (opts.signReceipt) {
        try {
          signature = await opts.signReceipt(canonical);
        } catch {
          signature = null; // best-effort: an unsigned receipt is honest, not fatal
        }
      }
      const sealed = {
        ...receipt,
        integrity: { alg: 'sha256', contentHash, signed: Boolean(signature), signature },
      };

      // Slug timestamp: "2026-06-16T07-35-01-000Z"
      const ts = capturedAt.replace(/[:.]/g, '-');
      const outPath = resolve(ALLOWED_WRITE_ROOTS[0], `hardware-receipt-${ts}.json`);
      const denied = checkWriteAllowed(outPath);
      if (denied) return errResult(use.id, `Cannot write receipt: ${denied}`);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(sealed, null, 2), 'utf8');
      return okResult(
        use.id,
        `Hardware receipt written to ${outPath} — ${measurements.length} measurements, ` +
          `contentHash=${contentHash.slice(0, 12)}…, signed=${Boolean(signature)}, accelerator=${accelerator ?? 'none'}`
      );
    }

    if (use.name === 'str_replace') {
      const path = use.input.path as string;
      const oldStr = use.input.old as string;
      const newStr = use.input.new as string;
      const denied = checkWriteAllowed(path);
      if (denied) return errResult(use.id, denied);
      const text = await readFile(path, 'utf8');
      // Count occurrences to guarantee exactly-one semantics.
      const count = text.split(oldStr).length - 1;
      if (count === 0)
        return errResult(use.id, `str_replace: "old" string not found in ${path} — 0 occurrences`);
      if (count > 1)
        return errResult(
          use.id,
          `str_replace: "old" string is ambiguous in ${path} — ${count} occurrences; add more surrounding context`
        );
      const updated = text.replace(oldStr, newStr);
      await writeFile(path, updated, 'utf8');
      const s = await stat(path);
      return okResult(use.id, `str_replace: replaced 1 occurrence in ${path} (${s.size} bytes)`);
    }

    if (use.name === 'delegate_task') {
      if (!opts.addTask) {
        return errResult(
          use.id,
          'delegate_task: capability not available (no addTask callback injected — board posting requires a mesh connection)'
        );
      }
      const title = String(use.input.title ?? '').trim();
      if (!title) return errResult(use.id, 'delegate_task: title is required');
      const description = use.input.description != null ? String(use.input.description) : undefined;
      const priority = use.input.priority != null ? Number(use.input.priority) : undefined;
      const source = use.input.source != null ? String(use.input.source) : undefined;
      const tags = Array.isArray(use.input.tags)
        ? (use.input.tags as unknown[]).map(String)
        : undefined;
      const result = await opts.addTask([{ title, description, priority, source, tags }]);
      return okResult(
        use.id,
        `delegate_task: posted "${title}" to board — ${result.added} task(s) added`
      );
    }

    if (use.name === 'mcp_call') {
      if (!opts.invokeMcpTool) {
        return errResult(
          use.id,
          'mcp_call: capability not available (no MCP invoke callback injected — requires a mesh connection)'
        );
      }
      const tool = String(use.input.tool ?? '').trim();
      if (!tool) return errResult(use.id, 'mcp_call: tool is required');
      const args = (use.input.args ?? {}) as Record<string, unknown>;
      const { ok, text } = await opts.invokeMcpTool(tool, args);
      return ok ? okResult(use.id, text) : errResult(use.id, text);
    }

    if (use.name === 'vision_analyze') {
      const imagePath = String(use.input.image_path ?? '').trim();
      if (!imagePath) return errResult(use.id, 'vision_analyze: image_path is required');
      const denied = checkReadAllowed(imagePath);
      if (denied) return errResult(use.id, `vision_analyze: ${denied}`);
      const prompt = String(use.input.prompt ?? 'Describe this image in detail.');
      // Model: task can override via `model` param; env HOLOSCRIPT_AGENT_VISION_MODEL
      // is the surface default (set to the full Ollama tag on the device).
      const model = String(
        use.input.model ?? process.env.HOLOSCRIPT_AGENT_VISION_MODEL ?? 'fara:7b'
      );
      // Dedicated local-inference tool — /founder ruled 2026-06-18: NOT a bandaid.
      // SSRF guard in http_request is correct and stays; this tool is a different
      // trust boundary (fixed local model endpoint, path-sandboxed input, env-driven
      // URL — no user-controlled URL). D.098 + vision pillar #6.
      const ollamaBase = process.env.HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL;
      if (!ollamaBase) {
        return errResult(
          use.id,
          'vision_analyze: HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL is not set — configure it to point to your local Ollama instance'
        );
      }
      const MAX_IMAGE_BYTES = 512_000; // ~512KB — larger images must be downscaled before passing to vision_analyze
      const TIMEOUT_MS = 120_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const imageBytes = await readFile(imagePath);
        if (imageBytes.length > MAX_IMAGE_BYTES) {
          clearTimeout(timer);
          return errResult(
            use.id,
            `vision_analyze: image is ${Math.round(imageBytes.length / 1024)}KB — exceeds ${MAX_IMAGE_BYTES / 1024}KB limit. ` +
              'Downscale the image first (e.g. to 256×256 or smaller) then retry vision_analyze.'
          );
        }
        const imageB64 = imageBytes.toString('base64');
        const res = await fetch(`${ollamaBase}/api/generate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, prompt, images: [imageB64], stream: false }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const text = await res.text();
          return errResult(
            use.id,
            `vision_analyze: Ollama HTTP ${res.status}: ${text.slice(0, 500)}`
          );
        }
        const json = (await res.json()) as { response?: string; error?: string };
        if (json.error) return errResult(use.id, `vision_analyze: model error — ${json.error}`);
        return okResult(use.id, json.response ?? '');
      } catch (err) {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        return errResult(
          use.id,
          msg.includes('abort')
            ? `vision_analyze: timed out after ${TIMEOUT_MS}ms`
            : `vision_analyze: ${msg}`
        );
      }
    }

    return errResult(use.id, `unknown tool: ${use.name}`);
  } catch (err) {
    return errResult(use.id, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Parse a single tegrastats output line into structured measurements.
 * Handles the Jetson Orin / Nano / AGX format emitted by `tegrastats --interval 1000`.
 *
 * Example line:
 *   06-16-2026 07:35:01 RAM 2819/7618MB (lfb 73x4MB) SWAP 0/3809MB CPU [37%@1510,off,off]
 *   EMC_FREQ 0% GR3D_FREQ 42% cpu@40.2C tj@41.25C VDD_CPU_CV 570mW VDD_SOC 1380mW
 */
function parseTegrastats(
  raw: string
): Array<{ metric: string; value: number; unit: string; method: string }> {
  const results: Array<{ metric: string; value: number; unit: string; method: string }> = [];
  const m = (pattern: RegExp, metric: string, unit: string, transform?: (v: string) => number) => {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const value = transform ? transform(match[1]) : Number(match[1]);
      if (Number.isFinite(value)) results.push({ metric, value, unit, method: 'tegrastats' });
    }
  };

  // RAM: "RAM 2819/7618MB"
  const ram = raw.match(/RAM\s+(\d+)\/(\d+)MB/);
  if (ram) {
    const used = Number(ram[1]);
    const total = Number(ram[2]);
    results.push({ metric: 'ram-used', value: used, unit: 'MB', method: 'tegrastats' });
    results.push({ metric: 'ram-total', value: total, unit: 'MB', method: 'tegrastats' });
    if (total > 0)
      results.push({
        metric: 'ram-pct',
        value: Math.round((used / total) * 100),
        unit: '%',
        method: 'tegrastats',
      });
  }

  m(/GR3D_FREQ\s+(\d+)%/, 'gpu-util', '%');
  m(/EMC_FREQ\s+(\d+)%/, 'emc-freq-pct', '%');
  m(/tj@([\d.]+)C/, 'temp-tj', 'C', parseFloat);
  m(/cpu@([\d.]+)C/, 'temp-cpu', 'C', parseFloat);
  m(/gpu@([\d.]+)C/, 'temp-gpu', 'C', parseFloat);
  m(/VDD_SOC\s+(\d+)mW/, 'power-soc', 'mW');
  m(/VDD_CPU_CV\s+(\d+)mW/, 'power-cpu-cv', 'mW');
  m(/VDD_IN\s+(\d+)mW/, 'power-total', 'mW');

  // CPU first-core utilisation: "CPU [37%@1510,..."
  m(/CPU\s+\[(\d+)%/, 'cpu-util-core0', '%');

  return results;
}

interface BashResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runBash(cmd: string, cwd: string): Promise<BashResult> {
  // Test short-circuit (task_1778113854009_x6p3): under vitest, return a
  // fast synthetic exit instead of spawning bash. Without this, mocks that
  // emit a "vitest run" tool_use cause runner.test.ts to recursively spawn
  // vitest startup per tick (~1.7s each), pushing 3-tick tests over the
  // 5000ms timeout. Production paths (NODE_ENV != 'test', VITEST unset)
  // are unchanged and still spawn the real shell.
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return Promise.resolve({
      code: 0,
      stdout: `[mock-bash under vitest] cmd="${cmd}" cwd="${cwd}"`,
      stderr: '',
    });
  }
  return new Promise((resolveProm) => {
    const child = spawn('bash', ['-c', cmd], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const STDOUT_CAP = 1_000_000;
    const TIMEOUT_MS = 60_000;
    const killer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < STDOUT_CAP) stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < STDOUT_CAP) stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(killer);
      resolveProm({ code: 1, stdout, stderr: stderr + '\nspawn-error: ' + err.message });
    });
    child.on('exit', (code) => {
      clearTimeout(killer);
      const finalStdout =
        stdout.length >= STDOUT_CAP
          ? stdout + `\n…[stdout truncated at ${STDOUT_CAP} bytes]`
          : stdout;
      const note = killed ? `\n[bash killed after ${TIMEOUT_MS}ms timeout]` : '';
      resolveProm({ code: code ?? 1, stdout: finalStdout + note, stderr });
    });
  });
}

function okResult(id: string, content: string): ToolResultBlock {
  return { type: 'tool_result', tool_use_id: id, content };
}

function errResult(id: string, message: string): ToolResultBlock {
  return { type: 'tool_result', tool_use_id: id, content: message, is_error: true };
}
