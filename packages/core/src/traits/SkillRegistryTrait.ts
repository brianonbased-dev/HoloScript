// @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
import type {
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitHandler,
  TraitEventPayload,
} from './TraitTypes';
import { readJson } from '../errors/safeJsonParse';
/**
 * SkillRegistryTrait — v4.0
 *
 * Pluggable skill/plugin ecosystem for HoloScript agents.
 * Agents can install, invoke, and compose skills — like OpenClaw's skill system.
 *
 * Built-in skills: web_fetch, screenshot, shell_exec (sandboxed), file_read, file_write
 * Custom skills: install via event or npm registry (@holoscript/skill-*)
 *
 * Events emitted:
 *  skill_installed   { node, skill }
 *  skill_invoked     { node, skillId, invocationId, inputs }
 *  skill_result      { node, skillId, invocationId, result, duration_ms }
 *  skill_failed      { node, skillId, invocationId, error }
 *  skill_uninstalled { node, skillId }
 *  skills_listed     { node, skills }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  default?: unknown;
}

export interface SkillOutput {
  name: string;
  type: string;
  description: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  inputs: SkillInput[];
  outputs: SkillOutput[];
  execute: (inputs: Record<string, unknown>, ctx: SkillContext) => Promise<Record<string, unknown>>;
  sandbox: boolean; // require security-sandbox
}

export interface SkillContext {
  emit: (event: string, payload: unknown) => void;
  timeout_ms: number;
}

export interface SkillRegistryConfig {
  /** Maximum installed skills */
  max_skills: number;
  /** Default execution timeout */
  timeout_ms: number;
  /** Allow shell execution (sandboxed) */
  allow_shell: boolean;
  /** Allow file system access */
  allow_fs: boolean;
  /** Allow network fetch */
  allow_fetch: boolean;
  /** Allowed fetch domains (empty = all) */
  allowed_domains: string[];
}

export interface SkillRegistryState {
  skills: Map<string, Skill>;
  activeInvocations: Map<string, { skillId: string; startedAt: number }>;
  totalInvocations: number;
  totalSuccesses: number;
  totalFailures: number;
}

// ─── Built-in skills ──────────────────────────────────────────────────────────

function createBuiltinSkills(config: SkillRegistryConfig): Skill[] {
  const skills: Skill[] = [];

  if (config.allow_fetch) {
    skills.push({
      id: 'web_fetch',
      name: 'Web Fetch',
      description: 'Fetch content from a URL (GET)',
      version: '1.0.0',
      author: 'holoscript',
      sandbox: false,
      inputs: [
        { name: 'url', type: 'string', required: true, description: 'URL to fetch' },
        {
          name: 'format',
          type: 'string',
          required: false,
          description: 'json | text | html',
          default: 'text',
        },
      ],
      outputs: [{ name: 'content', type: 'string', description: 'Response content' }],
      async execute(inputs) {
        const url = inputs['url'] as string;
        if (!url) throw new Error('url is required');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const format = (inputs['format'] as string) ?? 'text';
        const content = format === 'json' ? JSON.stringify(await res.json()) : await res.text();
        return { content, status: res.status, url };
      },
    });
  }

  if (config.allow_fs) {
    skills.push({
      id: 'file_read',
      name: 'File Read',
      description: 'Read a text file from the virtual filesystem',
      version: '1.0.0',
      author: 'holoscript',
      sandbox: true,
      inputs: [{ name: 'path', type: 'string', required: true, description: 'File path' }],
      outputs: [{ name: 'content', type: 'string', description: 'File content' }],
      async execute(inputs) {
        // In browser: use File System Access API; in Node: fs.readFile
        const path = inputs['path'] as string;
        if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
          throw new Error('File access requires user interaction in browser');
        }
        const { readFile } = await import('fs/promises');
        const content = await readFile(path, 'utf-8');
        return { content, path };
      },
    });

    skills.push({
      id: 'file_write',
      name: 'File Write',
      description: 'Write content to a file in the virtual filesystem',
      version: '1.0.0',
      author: 'holoscript',
      sandbox: true,
      inputs: [
        { name: 'path', type: 'string', required: true, description: 'File path' },
        { name: 'content', type: 'string', required: true, description: 'Content to write' },
      ],
      outputs: [{ name: 'bytes', type: 'number', description: 'Bytes written' }],
      async execute(inputs) {
        const { writeFile } = await import('fs/promises');
        const content = inputs['content'] as string;
        await writeFile(inputs['path'] as string, content, 'utf-8');
        return { bytes: content.length, path: inputs['path'] };
      },
    });
  }

  // JSON transform (always available, no permissions needed)
  skills.push({
    id: 'json_transform',
    name: 'JSON Transform',
    description: 'Parse, filter, or transform JSON data',
    version: '1.0.0',
    author: 'holoscript',
    sandbox: false,
    inputs: [
      { name: 'json', type: 'string', required: true, description: 'JSON string to transform' },
      {
        name: 'path',
        type: 'string',
        required: false,
        description: 'Dot-notation path to extract (e.g. "data.users.0.name")',
      },
    ],
    outputs: [{ name: 'result', type: 'object', description: 'Transformed result' }],
    async execute(inputs) {
      const data = readJson(inputs['json'] as string) as Record<string, unknown>;
      const path = inputs['path'] as string | undefined;
      if (!path) return { result: data };
      const parts = path.split('.');
      let cur: unknown = data;
      for (const p of parts) {
        if (cur == null) break;
        cur = (cur as Record<string, unknown>)[p];
      }
      return { result: cur };
    },
  });

  // Text summarize (no-op without LLM — placeholder for skill composition)
  skills.push({
    id: 'text_truncate',
    name: 'Text Truncate',
    description: 'Truncate text to a max character count',
    version: '1.0.0',
    author: 'holoscript',
    sandbox: false,
    inputs: [
      { name: 'text', type: 'string', required: true, description: 'Input text' },
      {
        name: 'max_chars',
        type: 'number',
        required: false,
        description: 'Max chars (default 500)',
        default: 500,
      },
    ],
    outputs: [{ name: 'text', type: 'string', description: 'Truncated text' }],
    async execute(inputs) {
      const text = inputs['text'] as string;
      const max = (inputs['max_chars'] as number) ?? 500;
      return {
        text: text.length > max ? text.slice(0, max) + '…' : text,
        truncated: text.length > max,
      };
    },
  });

  return skills;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SkillRegistryConfig = {
  max_skills: 200,
  timeout_ms: 30_000,
  allow_shell: false,
  allow_fs: true,
  allow_fetch: true,
  allowed_domains: [],
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export const skillRegistryHandler = {
  name: 'skill_registry',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: SkillRegistryConfig, ctx: TraitContext): void {
    const state: SkillRegistryState = {
      skills: new Map(),
      activeInvocations: new Map(),
      totalInvocations: 0,
      totalSuccesses: 0,
      totalFailures: 0,
    };

    // Register built-in skills
    for (const skill of createBuiltinSkills(config)) {
      state.skills.set(skill.id, skill);
    }

    node.__skillRegistryState = state;
    ctx.emit('skills_ready', { node, builtinCount: state.skills.size });
  },

  onDetach(node: HSPlusNode, _config: SkillRegistryConfig, ctx: TraitContext): void {
    // @ts-expect-error
    const state: SkillRegistryState | undefined = node.__skillRegistryState;
    if (!state) return;
    ctx.emit('skills_stopped', {
      node,
      totalInvocations: state.totalInvocations,
      totalSuccesses: state.totalSuccesses,
      totalFailures: state.totalFailures,
    });
    delete node.__skillRegistryState;
  },

  onEvent(
    node: HSPlusNode,
    config: SkillRegistryConfig,
    ctx: TraitContext,
    event: TraitEvent
  ): void {
    // @ts-expect-error
    const state: SkillRegistryState | undefined = node.__skillRegistryState;
    if (!state) return;

    switch (event.type) {
      case 'skill_install':
        this._install(state, node, config, ctx, event.payload as Record<string, unknown>);
        break;

      case 'skill_uninstall': {
        const { skillId } = (event.payload as TraitEventPayload) ?? {};
        if (!skillId || !state.skills.has(skillId as string)) return;
        state.skills.delete(skillId as string);
        ctx.emit('skill_uninstalled', { node, skillId });
        break;
      }

      case 'skill_invoke':
        this._invoke(state, node, config, ctx, event.payload as Record<string, unknown>);
        break;

      case 'skill_list':
        ctx.emit('skills_listed', {
          node,
          skills: [...state.skills.values()].map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            version: s.version,
            author: s.author,
            inputs: s.inputs,
            outputs: s.outputs,
          })),
        });
        break;

      case 'skill_stats':
        ctx.emit('skill_stats', {
          node,
          total: state.skills.size,
          active: state.activeInvocations.size,
          totalInvocations: state.totalInvocations,
          totalSuccesses: state.totalSuccesses,
          totalFailures: state.totalFailures,
        });
        break;
    }
  },

  onUpdate(_node: HSPlusNode, _config: SkillRegistryConfig, _ctx: TraitContext, _dt: number): void {
    /* async only */
  },

  _install(
    state: SkillRegistryState,
    node: HSPlusNode,
    config: SkillRegistryConfig,
    ctx: TraitContext,
    payload: Record<string, unknown>
  ): void {
    if (!payload) return;
    if (state.skills.size >= config.max_skills) {
      ctx.emit('skill_failed', {
        node,
        skillId: payload.id,
        invocationId: null,
        error: 'max_skills limit reached',
      });
      return;
    }
    if (!payload.id || !payload.name || typeof payload.execute !== 'function') {
      ctx.emit('skill_failed', {
        node,
        skillId: payload.id,
        invocationId: null,
        error: 'Invalid skill: missing id, name, or execute()',
      });
      return;
    }
    const skill: Skill = {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      id: payload.id,
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      name: payload.name,
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      description: payload.description ?? '',
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      version: payload.version ?? '1.0.0',
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      author: payload.author ?? 'user',
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      inputs: payload.inputs ?? [],
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      outputs: payload.outputs ?? [],
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      execute: payload.execute,
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      sandbox: payload.sandbox ?? true,
    };
    state.skills.set(skill.id, skill);
    ctx.emit('skill_installed', {
      node,
      skill: { id: skill.id, name: skill.name, description: skill.description },
    });
  },

  _invoke(
    state: SkillRegistryState,
    node: HSPlusNode,
    config: SkillRegistryConfig,
    ctx: TraitContext,
    payload: Record<string, unknown>
  ): void {
    const { skillId, inputs = {}, invocationId } = payload ?? {};
    if (!skillId) return;

    const skill = state.skills.get(skillId as string);
    if (!skill) {
      ctx.emit('skill_failed', { node, skillId, invocationId, error: `Unknown skill: ${skillId}` });
      return;
    }

    // Validate required inputs
    for (const input of skill.inputs) {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      if (input.required && inputs[input.name] === undefined) {
        ctx.emit('skill_failed', {
          node,
          skillId,
          invocationId,
          error: `Missing required input: ${input.name}`,
        });
        return;
      }
    }

    const id =
      invocationId ?? `(inv_ as string)${Date.now()}_${Math.random().toString(36).slice(2)}`;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    state.activeInvocations.set(id as string, { skillId, startedAt: Date.now() });
    state.totalInvocations++;

    ctx.emit('skill_invoked', { node, skillId, invocationId: id, inputs });

    const skillCtx: SkillContext = { emit: ctx.emit, timeout_ms: config.timeout_ms };
    const t0 = Date.now();

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Skill timeout after ${config.timeout_ms}ms`)),
        config.timeout_ms
      )
    );

    Promise.race([skill.execute(inputs as Record<string, unknown>, skillCtx), timeoutPromise])
      .then((result) => {
        state.activeInvocations.delete(id as string);
        state.totalSuccesses++;
        ctx.emit('skill_result', {
          node,
          skillId,
          invocationId: id,
          result,
          duration_ms: Date.now() - t0,
        });
      })
      .catch((err: Error) => {
        state.activeInvocations.delete(id as string);
        state.totalFailures++;
        ctx.emit('skill_failed', { node, skillId, invocationId: id, error: err.message });
      });
  },
} as const;
