/**
 * Stdlib Action Handlers for HoloScript Runtime
 *
 * General-purpose I/O action handlers (fs, process, network) that ANY
 * .hsplus composition can use via BehaviorTree without custom TypeScript.
 *
 * Extracted from daemon-actions.ts (G.ARCH.003) to generalize the 6
 * host I/O operations. Policy-gated, sandboxed, with the `into:` convention
 * for blackboard key prefixes.
 *
 * @see daemon-actions.ts — daemon-specific handlers that delegate here
 * @see holoscript-runner.ts — auto-registers stdlib on `holoscript run`
 */

import path from 'path';
import type { ActionHandler } from '@holoscript/engine/runtime/profiles/HeadlessRuntime';
import type { HostCapabilities } from '../traits/TraitTypes';

// ── Policy Interface ──────────────────────────────────────────────────────────

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
  /** Allow GIF/video frame decoding and media processing. Default: false */
  allowMediaDecode?: boolean;
  /** Allow ML model inference (depth estimation, segmentation). Default: false */
  allowDepthInference?: boolean;
  /** Allow WebGPU compute shader access. Default: false */
  allowGpuCompute?: boolean;
  /** Max GIF frames to process. Default: 500 */
  maxGifFrames?: number;
  /** Max video duration in seconds. Default: 300 */
  maxVideoDurationSec?: number;
  /** Max image/depth resolution (width or height). Default: 4096 */
  maxMediaResolution?: number;
}

export interface StdlibOptions {
  policy: StdlibPolicy;
  hostCapabilities?: HostCapabilities;
  debug?: boolean;
}

export const DEFAULT_STDLIB_POLICY: StdlibPolicy = {
  allowedPaths: ['compositions', 'data', 'src', 'packages'],
  maxFileBytes: 2 * 1024 * 1024,
  allowShell: false,
  allowedShellCommands: [],
  maxShellOutputBytes: 100 * 1024,
  shellTimeoutMs: 60_000,
  allowNetwork: false,
  allowedHosts: [],
  rootDir: '.',
  allowMediaDecode: false,
  allowDepthInference: false,
  allowGpuCompute: false,
  maxGifFrames: 500,
  maxVideoDurationSec: 300,
  maxMediaResolution: 4096,
};

// ── Shared Utilities ──────────────────────────────────────────────────────────

export function resolveRepoRelativePath(
  targetPath: string,
  rootDir: string
): { ok: true; rel: string; abs: string } | { ok: false; error: string } {
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!normalized) return { ok: false, error: 'Path is required' };
  const abs = path.resolve(rootDir, normalized);
  const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Path escapes repository root' };
  }
  return { ok: true, rel, abs };
}

export function isPathAllowed(relPath: string, allowedRoots: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

export function parseHostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function truncateText(value: unknown, max: number): string {
  const str = typeof value === 'string' ? value : String(value ?? '');
  if (!Number.isFinite(max) || max <= 0 || str.length <= max) return str;
  return `${str.slice(0, max)}\n...[truncated ${str.length - max} chars]`;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// ── Into: Convention ──────────────────────────────────────────────────────────

function resolveInto(params: Record<string, unknown>, defaultPrefix: string): string {
  return typeof params.into === 'string' && params.into.trim().length > 0
    ? params.into.trim()
    : defaultPrefix;
}

// ── Action Factory ────────────────────────────────────────────────────────────

export function createStdlibActions(options: StdlibOptions): Record<string, ActionHandler> {
  const { policy, hostCapabilities: caps, debug } = options;
  const log = debug ? (msg: string) => console.log(`  [stdlib] ${msg}`) : () => {};

  return {
    // ── File System ──────────────────────────────────────────────────────

    fs_read: async (params, bb) => {
      const prefix = resolveInto(params, 'fs_read');
      const filePath = typeof params.path === 'string' ? params.path : '';

      const resolved = resolveRepoRelativePath(filePath, policy.rootDir);
      if (!resolved.ok) {
        bb[`${prefix}_error`] = resolved.error;
        return false;
      }
      if (!isPathAllowed(resolved.rel, policy.allowedPaths)) {
        bb[`${prefix}_error`] = `path "${resolved.rel}" is outside allowed roots`;
        return false;
      }

      if (!caps?.fileSystem) {
        bb[`${prefix}_error`] = 'fileSystem capability not available';
        return false;
      }

      const exists = caps.fileSystem.exists
        ? await Promise.resolve(caps.fileSystem.exists(resolved.rel))
        : true;
      if (!exists) {
        bb[`${prefix}_error`] = `file not found: ${resolved.rel}`;
        bb[`${prefix}_exists`] = false;
        return false;
      }

      const content = await Promise.resolve(caps.fileSystem.readFile(resolved.rel));
      if (Buffer.byteLength(content, 'utf-8') > policy.maxFileBytes) {
        bb[`${prefix}_error`] = `file exceeds max size (${policy.maxFileBytes} bytes)`;
        return false;
      }

      bb[`${prefix}_content`] = content;
      bb[`${prefix}_exists`] = true;
      log(`fs_read: ${resolved.rel} (${Buffer.byteLength(content, 'utf-8')} bytes)`);
      return true;
    },

    fs_write: async (params, bb) => {
      const prefix = resolveInto(params, 'fs_write');
      const filePath = typeof params.path === 'string' ? params.path : '';
      const content = typeof params.content === 'string' ? params.content : null;
      const append = params.append === true;

      if (content === null) {
        bb[`${prefix}_error`] = 'content is required';
        return false;
      }
      if (Buffer.byteLength(content, 'utf-8') > policy.maxFileBytes) {
        bb[`${prefix}_error`] = `content exceeds max size (${policy.maxFileBytes} bytes)`;
        return false;
      }

      const resolved = resolveRepoRelativePath(filePath, policy.rootDir);
      if (!resolved.ok) {
        bb[`${prefix}_error`] = resolved.error;
        return false;
      }
      if (!isPathAllowed(resolved.rel, policy.allowedPaths)) {
        bb[`${prefix}_error`] = `path "${resolved.rel}" is outside allowed roots`;
        return false;
      }

      if (!caps?.fileSystem) {
        bb[`${prefix}_error`] = 'fileSystem capability not available';
        return false;
      }

      let finalContent = content;
      if (append && caps.fileSystem.exists) {
        const exists = await Promise.resolve(caps.fileSystem.exists(resolved.rel));
        if (exists) {
          const current = await Promise.resolve(caps.fileSystem.readFile(resolved.rel));
          finalContent = `${current}${content}`;
        }
      }

      await Promise.resolve(caps.fileSystem.writeFile(resolved.rel, finalContent));
      bb[`${prefix}_path`] = resolved.rel;
      bb[`${prefix}_bytes`] = Buffer.byteLength(content, 'utf-8');
      log(`fs_write: ${resolved.rel} (${bb[`${prefix}_bytes`]} bytes, append=${append})`);
      return true;
    },

    fs_exists: async (params, bb) => {
      const prefix = resolveInto(params, 'fs_exists');
      const filePath = typeof params.path === 'string' ? params.path : '';

      const resolved = resolveRepoRelativePath(filePath, policy.rootDir);
      if (!resolved.ok) {
        bb[`${prefix}_error`] = resolved.error;
        return false;
      }

      if (!caps?.fileSystem?.exists) {
        bb[`${prefix}_error`] = 'fileSystem.exists capability not available';
        return false;
      }

      const exists = await Promise.resolve(caps.fileSystem.exists(resolved.rel));
      bb[`${prefix}_exists`] = exists;
      log(`fs_exists: ${resolved.rel} → ${exists}`);
      return true;
    },

    fs_delete: async (params, bb) => {
      const prefix = resolveInto(params, 'fs_delete');
      const filePath = typeof params.path === 'string' ? params.path : '';

      const resolved = resolveRepoRelativePath(filePath, policy.rootDir);
      if (!resolved.ok) {
        bb[`${prefix}_error`] = resolved.error;
        return false;
      }
      if (!isPathAllowed(resolved.rel, policy.allowedPaths)) {
        bb[`${prefix}_error`] = `path "${resolved.rel}" is outside allowed roots`;
        return false;
      }

      if (!caps?.fileSystem?.deleteFile) {
        bb[`${prefix}_error`] = 'fileSystem.deleteFile capability not available';
        return false;
      }

      await Promise.resolve(caps.fileSystem.deleteFile(resolved.rel));
      log(`fs_delete: ${resolved.rel}`);
      return true;
    },

    // ── Process Execution ─────────────────────────────────────────────────

    process_exec: async (params, bb) => {
      const prefix = resolveInto(params, 'process_exec');

      if (!policy.allowShell) {
        bb[`${prefix}_error`] = `${prefix} is disabled by policy`;
        return false;
      }

      const command = typeof params.cmd === 'string' ? params.cmd.trim() : '';
      const args = toStringArray(params.args);
      if (!command) {
        bb[`${prefix}_error`] = 'cmd is required';
        return false;
      }

      if (policy.allowedShellCommands.length > 0) {
        const executable = command.split(/\s+/)[0].toLowerCase();
        const allowed = policy.allowedShellCommands.some((c) => c.toLowerCase() === executable);
        if (!allowed) {
          bb[`${prefix}_error`] = `command "${executable}" is not allowlisted`;
          return false;
        }
      }

      if (!caps?.process?.exec) {
        bb[`${prefix}_error`] = 'process.exec capability not available';
        return false;
      }

      const timeoutMs =
        typeof params.timeout === 'number' && Number.isFinite(params.timeout)
          ? Math.max(1_000, Math.min(policy.shellTimeoutMs, Math.floor(params.timeout)))
          : policy.shellTimeoutMs;

      const cwd = typeof params.cwd === 'string' ? params.cwd : policy.rootDir;
      const result = await Promise.resolve(caps.process.exec(command, args, { cwd, timeoutMs }));
      bb[`${prefix}_code`] = result.code ?? -1;
      bb[`${prefix}_stdout`] = truncateText(result.stdout, policy.maxShellOutputBytes);
      bb[`${prefix}_stderr`] = truncateText(result.stderr, policy.maxShellOutputBytes);
      log(`process_exec: ${command} ${args.join(' ')} → code ${result.code}`);
      return result.code === 0;
    },

    // ── Network ───────────────────────────────────────────────────────────


    // ── Media Decode ──────────────────────────────────────────────────────

    media_decode: async (params, bb) => {
      const prefix = resolveInto(params, 'media_decode');

      if (!policy.allowMediaDecode) {
        bb[`${prefix}_error`] = 'media_decode is disabled by policy (allowMediaDecode=false)';
        return false;
      }

      if (!caps?.media?.decodeFrames) {
        bb[`${prefix}_error`] = 'media.decodeFrames capability not available';
        return false;
      }

      const source = params.source;
      if (typeof source !== 'string' && !(source instanceof ArrayBuffer)) {
        bb[`${prefix}_error`] = 'source (URL string or ArrayBuffer) is required';
        return false;
      }

      const maxFrames =
        typeof params.maxFrames === 'number'
          ? Math.min(params.maxFrames, policy.maxGifFrames ?? 500)
          : (policy.maxGifFrames ?? 500);
      const mediaType =
        params.type === 'video' ? ('video' as const) : ('gif' as const);

      try {
        const frames = await caps.media.decodeFrames(source as string | ArrayBuffer, {
          maxFrames,
          type: mediaType,
        });
        bb[`${prefix}_frames`] = frames;
        bb[`${prefix}_count`] = frames.length;
        log(`media_decode: decoded ${frames.length} frames (type=${mediaType})`);
        return true;
      } catch (error) {
        bb[`${prefix}_error`] = (error as Error).message;
        return false;
      }
    },

    // ── Depth Inference ───────────────────────────────────────────────────

    depth_inference: async (params, bb) => {
      const prefix = resolveInto(params, 'depth_inference');

      if (!policy.allowDepthInference) {
        bb[`${prefix}_error`] = 'depth_inference is disabled by policy (allowDepthInference=false)';
        return false;
      }

      if (!caps?.depthInference?.estimateDepth) {
        bb[`${prefix}_error`] = 'depthInference.estimateDepth capability not available';
        return false;
      }

      const source = params.source;
      if (typeof source !== 'string' && !(source instanceof ArrayBuffer)) {
        bb[`${prefix}_error`] = 'source (image URL string or ArrayBuffer) is required';
        return false;
      }

      const maxRes = policy.maxMediaResolution ?? 4096;
      const width =
        typeof params.width === 'number' ? Math.min(params.width, maxRes) : undefined;
      const height =
        typeof params.height === 'number' ? Math.min(params.height, maxRes) : undefined;
      const modelId =
        typeof params.modelId === 'string' ? params.modelId : undefined;

      try {
        const depthMap = await caps.depthInference.estimateDepth(source as string | ArrayBuffer, {
          width,
          height,
          modelId,
        });
        bb[`${prefix}_data`] = depthMap.data;
        bb[`${prefix}_width`] = depthMap.width;
        bb[`${prefix}_height`] = depthMap.height;
        bb[`${prefix}_backend`] = depthMap.backend;
        bb[`${prefix}_inferenceMs`] = depthMap.inferenceMs;
        log(`depth_inference: ${depthMap.width}×${depthMap.height} via ${depthMap.backend} (${depthMap.inferenceMs}ms)`);
        return true;
      } catch (error) {
        bb[`${prefix}_error`] = (error as Error).message;
        return false;
      }
    },

    // ── GPU Compute ───────────────────────────────────────────────────────

    gpu_compute: async (params, bb) => {
      const prefix = resolveInto(params, 'gpu_compute');

      if (!policy.allowGpuCompute) {
        bb[`${prefix}_error`] = 'gpu_compute is disabled by policy (allowGpuCompute=false)';
        return false;
      }

      if (!caps?.gpuCompute?.dispatch) {
        bb[`${prefix}_error`] = 'gpuCompute.dispatch capability not available';
        return false;
      }

      const shader = typeof params.shader === 'string' ? params.shader.trim() : '';
      if (!shader) {
        bb[`${prefix}_error`] = 'shader (WGSL source) is required';
        return false;
      }

      const inputs: Record<string, ArrayBuffer> = {};
      if (typeof params.inputs === 'object' && params.inputs !== null) {
        for (const [k, v] of Object.entries(params.inputs as Record<string, unknown>)) {
          if (v instanceof ArrayBuffer) inputs[k] = v;
        }
      }

      const rawWg = params.workgroups;
      const workgroups: [number, number?, number?] = Array.isArray(rawWg)
        ? ([rawWg[0], rawWg[1], rawWg[2]] as [number, number?, number?])
        : [1];

      try {
        const result = await caps.gpuCompute.dispatch(shader, inputs, workgroups);
        bb[`${prefix}_outputs`] = result.outputs;
        bb[`${prefix}_dispatchMs`] = result.dispatchMs;
        log(`gpu_compute: dispatch completed in ${result.dispatchMs}ms`);
        return true;
      } catch (error) {
        bb[`${prefix}_error`] = (error as Error).message;
        return false;
      }
    },

    net_fetch: async (params, bb) => {
      const prefix = resolveInto(params, 'net_fetch');
      const url = typeof params.url === 'string' ? params.url.trim() : '';

      if (!url) {
        bb[`${prefix}_error`] = 'url is required';
        return false;
      }

      if (!policy.allowNetwork) {
        bb[`${prefix}_error`] = 'network access is disabled by policy';
        return false;
      }

      const hostName = parseHostFromUrl(url);
      if (!hostName) {
        bb[`${prefix}_error`] = 'invalid url';
        return false;
      }

      if (policy.allowedHosts.length > 0) {
        const allowed =
          policy.allowedHosts.includes(hostName) ||
          policy.allowedHosts.some((h) => hostName.endsWith(`.${h}`));
        if (!allowed) {
          bb[`${prefix}_error`] = `host "${hostName}" is not allowlisted`;
          return false;
        }
      }

      if (caps?.network?.fetch) {
        try {
          const response = await Promise.resolve(
            caps.network.fetch(url, {
              method: typeof params.method === 'string' ? params.method : 'GET',
              headers:
                typeof params.headers === 'object' && params.headers
                  ? (params.headers as Record<string, string>)
                  : undefined,
              body: typeof params.body === 'string' ? params.body : undefined,
            })
          );
          bb[`${prefix}_status`] = response.status;
          bb[`${prefix}_body`] = truncateText(response.text ?? '', policy.maxShellOutputBytes);
          bb[`${prefix}_ok`] = response.ok;
          log(`net_fetch: ${url} → ${response.status}`);
          return response.ok;
        } catch (error) {
          bb[`${prefix}_error`] = (error as Error).message;
          return false;
        }
      }

      // Fallback to globalThis.fetch
      try {
        const response = await (globalThis.fetch as typeof fetch)(url, {
          method: typeof params.method === 'string' ? params.method : 'GET',
          headers:
            typeof params.headers === 'object' && params.headers
              ? (params.headers as Record<string, string>)
              : undefined,
        });
        const text = await response.text();
        bb[`${prefix}_status`] = response.status;
        bb[`${prefix}_body`] = truncateText(text, policy.maxShellOutputBytes);
        bb[`${prefix}_ok`] = response.ok;
        log(`net_fetch: ${url} → ${response.status}`);
        return response.ok;
      } catch (error) {
        bb[`${prefix}_error`] = (error as Error).message;
        return false;
      }
    },
  };
}

// ── Registration Helper ───────────────────────────────────────────────────────

export function registerStdlib(
  runtime: { registerAction: (name: string, handler: ActionHandler) => void },
  options: StdlibOptions
): void {
  const actions = createStdlibActions(options);
  for (const [name, handler] of Object.entries(actions)) {
    runtime.registerAction(name, handler);
  }
}
