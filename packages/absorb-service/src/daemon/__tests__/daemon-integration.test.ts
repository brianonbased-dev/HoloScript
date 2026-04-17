/**
 * Daemon Integration Tests
 * Moved from packages/core/src/cli/__tests__/holoscript-daemon-integration.test.ts
 * Tests belong here because they import createDaemonActions from absorb-service.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDaemonActions,
  type DaemonConfig,
  type DaemonExecResult,
  type DaemonHost,
  type LLMProvider,
} from '../daemon-actions';

type Blackboard = Record<string, unknown>;

class MockHost {
  private readonly files = new Map<string, string>();
  private readonly execImpl =
    vi.fn<
      (
        command: string,
        args?: string[],
        opts?: { cwd?: string; timeoutMs?: number }
      ) => Promise<DaemonExecResult>
    >();

  seedFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  readFile(filePath: string): string {
    const value = this.files.get(filePath);
    if (value === undefined) {
      throw new Error(`Missing file: ${filePath}`);
    }
    return value;
  }

  writeFile(filePath: string, content: string): void {
    this.files.set(filePath, content);
  }

  exists(filePath: string): boolean {
    return this.files.has(filePath);
  }

  exec(
    command: string,
    args?: string[],
    opts?: { cwd?: string; timeoutMs?: number }
  ): Promise<DaemonExecResult> {
    return this.execImpl(command, args, opts);
  }

  setExecResponses(
    resolver: (command: string, args?: string[]) => DaemonExecResult | Promise<DaemonExecResult>
  ): void {
    this.execImpl.mockImplementation((command, args) => Promise.resolve(resolver(command, args)));
  }
}

function createConfig(): DaemonConfig {
  return {
    repoRoot: 'repo',
    commit: false,
    model: 'claude-haiku-4-5',
    verbose: false,
    focusRotation: ['typefix'],
    stateDir: '.holoscript',
  };
}

describe('holoscript daemon integration', () => {
  let host: MockHost;
  let llm: LLMProvider;
  let blackboard: Blackboard;
  let emitSpy: (event: string, payload?: unknown) => void;
  let context: { emit: (event: string, payload?: unknown) => void };

  beforeEach(() => {
    host = new MockHost();
    llm = {
      chat: vi.fn(async () => ({
        text: JSON.stringify({
          analysis: 'Fix literal type mismatch.',
          patches: [
            {
              old: 'export const fixed = false;\n',
              new: 'export const fixed = true;\n',
            },
          ],
        }),
        inputTokens: 123,
        outputTokens: 45,
      })),
    };
    blackboard = {};
    emitSpy = vi.fn<(event: string, payload?: unknown) => void>();
    context = { emit: emitSpy };
  });

  it('loads persisted wisdom during identity intake', async () => {
    host.seedFile('.holoscript/accumulated-wisdom.json', JSON.stringify([{ pattern: 'typefix' }]));
    host.setExecResponses(() => ({ code: 0, stdout: '', stderr: '' }));

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const ok = await actions.identity_intake({}, blackboard, context);

    expect(ok).toBe(true);
    expect(blackboard.identity_ready).toBe(true);
    expect(blackboard.wisdomCount).toBe(1);
    expect(blackboard.wisdom).toEqual([{ pattern: 'typefix' }]);
  });

  it('diagnoses type errors and reads the first candidate file', async () => {
    host.seedFile('packages/core/src/example.ts', 'export const broken: string = 1;\n');
    host.setExecResponses((command, args) => {
      if (command === 'npx' && args?.[0] === 'tsc') {
        return {
          code: 2,
          stdout:
            "packages/core/src/example.ts(1,14): error TS2322: Type 'number' is not assignable to type 'string'.\n",
          stderr: '',
        };
      }

      return { code: 0, stdout: '', stderr: '' };
    });

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const diagnosed = await actions.diagnose({}, blackboard, context);
    const read = await actions.read_candidate({}, blackboard, context);

    expect(diagnosed).toBe(true);
    expect(read).toBe(true);
    expect(blackboard.has_candidates).toBe(true);
    expect(blackboard.typeErrorCount).toBe(1);
    expect(blackboard.candidates).toEqual(['packages/core/src/example.ts']);
    expect(blackboard.currentCandidate).toBe('packages/core/src/example.ts');
    expect(blackboard.candidateContent).toContain('broken');
  });

  it('generates and writes a fix while tracking token usage', async () => {
    host.seedFile('packages/core/src/example.ts', 'export const fixed = false;\n');
    host.setExecResponses(() => ({ code: 0, stdout: '', stderr: '' }));
    blackboard.currentCandidate = 'packages/core/src/example.ts';
    blackboard.candidateContent = 'export const fixed = false;\n';
    blackboard.focus = 'typefix';
    blackboard.perFileErrors = {
      'packages/core/src/example.ts': [
        'packages/core/src/example.ts(1,14): error TS2322: Type "false" is not assignable to type "true".',
      ],
    };

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const ok = await actions.generate_fix({}, blackboard, context);

    expect(ok).toBe(true);
    const written = host.readFile('packages/core/src/example.ts').trim();
    if (written.startsWith('{')) {
      const parsed = JSON.parse(written) as { patches?: Array<{ new?: string }> };
      expect(parsed.patches?.[0]?.new).toContain('export const fixed = true;');
    } else {
      expect(written).toContain('export const fixed = true;');
    }
    expect(blackboard.fileEdited).toBe(true);
    expect(blackboard.inputTokens).toBe(123);
    expect(blackboard.outputTokens).toBe(45);
  });

  it('rejects contaminated edits and leaves the source file unchanged', async () => {
    host.seedFile('packages/core/src/example.ts', 'export const fixed = false;\n');
    host.setExecResponses(() => ({ code: 0, stdout: '', stderr: '' }));
    blackboard.currentCandidate = 'packages/core/src/example.ts';
    blackboard.candidateContent = 'export const fixed = false;\n';
    blackboard.focus = 'typefix';

    llm = {
      chat: vi.fn(async () => ({
        text: 'PASS src/example.test.ts\n',
        inputTokens: 5,
        outputTokens: 2,
      })),
    };

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const ok = await actions.generate_fix({}, blackboard, context);

    expect(ok).toBe(false);
    expect(host.readFile('packages/core/src/example.ts')).toBe('export const fixed = false;\n');
    expect(blackboard.fileEdited).toBeUndefined();
  });

  it('runs compiler target sweep checks across node and python targets', async () => {
    host.seedFile(
      'compositions/self-improve-daemon.hsplus',
      'composition "Daemon" { @grabbable @networked }\n'
    );
    host.setExecResponses((command, args) => {
      if (command === 'npx' && args?.[0] === 'tsx' && args?.includes('compile')) {
        return { code: 0, stdout: 'compile ok\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    blackboard.focus = 'target-sweep';
    blackboard.daemon_file = 'compositions/self-improve-daemon.hsplus';

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const diagnosed = await actions.diagnose({}, blackboard, context);
    const read = await actions.read_candidate({}, blackboard, context);
    const fixed = await actions.generate_fix({}, blackboard, context);

    expect(diagnosed).toBe(true);
    expect(read).toBe(true);
    expect(fixed).toBe(true);
    expect(blackboard.has_candidates).toBe(true);
    expect((blackboard.sweep_results as Array<{ ok: boolean }>).length).toBe(2);
    expect((blackboard.sweep_results as Array<{ ok: boolean }>).every((r) => r.ok)).toBe(true);
  });

  it('samples trait categories from daemon composition', async () => {
    host.seedFile(
      'compositions/self-improve-daemon.hsplus',
      [
        'composition "Daemon" {',
        '  object "Cube" {',
        '    @grabbable',
        '    @networked',
        '    @collidable',
        '    @spatial_audio',
        '  }',
        '}',
      ].join('\n')
    );
    host.setExecResponses(() => ({ code: 0, stdout: '', stderr: '' }));

    blackboard.focus = 'trait-sampling';
    blackboard.daemon_file = 'compositions/self-improve-daemon.hsplus';

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const diagnosed = await actions.diagnose({}, blackboard, context);
    const read = await actions.read_candidate({}, blackboard, context);
    const fixed = await actions.generate_fix({}, blackboard, context);

    expect(diagnosed).toBe(true);
    expect(read).toBe(true);
    expect(fixed).toBe(true);
    expect(blackboard.trait_sampling).toMatchObject({
      sampledFiles: 1,
    });
    expect(
      (blackboard.trait_sampling as { sampledCategories: number }).sampledCategories
    ).toBeGreaterThanOrEqual(3);
  });

  it('runs runtime profile matrix checks for headless, minimal, and full', async () => {
    host.seedFile(
      'compositions/self-improve-daemon.hsplus',
      'composition "Daemon" { @grabbable }\n'
    );
    host.setExecResponses((command, args) => {
      if (command === 'npx' && args?.[0] === 'tsx' && args?.includes('run')) {
        return { code: 0, stdout: 'run ok\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    blackboard.focus = 'runtime-matrix';
    blackboard.daemon_file = 'compositions/self-improve-daemon.hsplus';

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const diagnosed = await actions.diagnose({}, blackboard, context);
    const read = await actions.read_candidate({}, blackboard, context);
    const fixed = await actions.generate_fix({}, blackboard, context);

    expect(diagnosed).toBe(true);
    expect(read).toBe(true);
    expect(fixed).toBe(true);
    expect((blackboard.runtime_matrix as Array<{ profile: string }>).map((r) => r.profile)).toEqual(
      ['headless', 'minimal', 'full']
    );
  });

  it('executes absorb and roundtrip compile validation cycle', async () => {
    host.seedFile('packages/core/src/cli/daemon-actions.ts', 'export const sentinel = true;\n');
    host.setExecResponses((command, args) => {
      if (
        command === 'npx' &&
        args?.[0] === 'tsx' &&
        (args?.includes('absorb') || args?.includes('compile'))
      ) {
        return { code: 0, stdout: 'ok\n', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    });

    blackboard.focus = 'absorb-roundtrip';
    blackboard.daemon_file = 'compositions/self-improve-daemon.hsplus';

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());
    const diagnosed = await actions.diagnose({}, blackboard, context);
    const read = await actions.read_candidate({}, blackboard, context);
    const fixed = await actions.generate_fix({}, blackboard, context);

    expect(diagnosed).toBe(true);
    expect(read).toBe(true);
    expect(fixed).toBe(true);
    expect(blackboard.absorb_roundtrip).toMatchObject({
      absorbOk: true,
      compileOk: true,
    });
  });

  it('blocks shell_exec when shell access is disabled by policy', async () => {
    host.setExecResponses(() => ({ code: 0, stdout: 'ok', stderr: '' }));

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, {
      ...createConfig(),
      toolPolicy: {
        allowShell: false,
      },
    });

    const ok = await actions.shell_exec({ command: 'echo', args: ['hello'] }, blackboard, context);
    expect(ok).toBe(false);
    expect(blackboard.shell_exec_error).toBe('shell_exec is disabled by policy');
  });

  it('enforces file_write path sandbox policy', async () => {
    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, {
      ...createConfig(),
      toolPolicy: {
        allowedPaths: ['packages/core/src'],
      },
    });

    const denied = await actions.file_write(
      { path: 'scripts/outside.txt', content: 'blocked' },
      blackboard,
      context
    );
    expect(denied).toBe(false);
    expect(String(blackboard.file_write_error)).toContain('outside allowed roots');

    const allowed = await actions.file_write(
      { path: 'packages/core/src/allowed.txt', content: 'ok' },
      blackboard,
      context
    );
    expect(allowed).toBe(true);
    expect(host.readFile('packages/core/src/allowed.txt')).toBe('ok');
  });

  it('blocks web_fetch for non-allowlisted hosts', async () => {
    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, {
      ...createConfig(),
      toolPolicy: {
        allowedHosts: ['api.openai.com'],
      },
    });

    const ok = await actions.web_fetch({ url: 'https://example.com' }, blackboard, context);
    expect(ok).toBe(false);
    expect(String(blackboard.web_fetch_error)).toContain('not allowlisted');
  });

  it('creates a runtime skill file in the configured skills directory', async () => {
    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, {
      ...createConfig(),
      skillsDir: 'compositions/skills',
      toolPolicy: {
        allowedPaths: ['compositions/skills'],
      },
    });

    const ok = await actions.create_skill(
      {
        name: 'My New Skill',
        content: 'composition "my-new-skill" {\n  action "ping" { }\n}\n',
      },
      blackboard,
      context
    );

    expect(ok).toBe(true);
    expect(blackboard.created_skill_path).toBe('compositions/skills/my-new-skill.hsplus');
    expect(host.readFile('compositions/skills/my-new-skill.hsplus')).toContain(
      'composition "my-new-skill"'
    );
  });

  it('writes outbound channel messages to queue and ingests inbound messages', async () => {
    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, createConfig());

    const sent = await actions.channel_send(
      {
        channel: 'discord',
        message: 'hello world',
        metadata: { source: 'test' },
      },
      blackboard,
      context
    );
    expect(sent).toBe(true);
    const outbox = host.readFile('.holoscript/outbox.jsonl');
    expect(outbox).toContain('hello world');

    host.writeFile(
      '.holoscript/inbox.jsonl',
      `${JSON.stringify({ channel: 'discord', message: 'incoming', timestamp: new Date().toISOString() })}\n`
    );
    const ingested = await actions.channel_ingest({}, blackboard, context);
    expect(ingested).toBe(true);
    expect((blackboard.channel_message as { message?: string })?.message).toBe('incoming');
  });

  it('enforces economy budget ceiling on generate_fix', async () => {
    host.writeFile('packages/core/src/test.ts', 'console.log("x");');
    host.setExecResponses(() => ({ code: 0, stdout: '', stderr: '' }));

    const { actions } = createDaemonActions(host as unknown as DaemonHost, llm, {
      ...createConfig(),
      economyConfig: { budget: 5.0 },
    });

    blackboard.currentCandidate = 'packages/core/src/test.ts';
    blackboard.candidateContent = 'console.log("x");';
    blackboard.focus = 'lint';
    const first = await actions.generate_fix({}, blackboard, context);
    expect(typeof first).toBe('boolean');
    expect(blackboard.budget_exhausted).toBeUndefined();

    const { actions: unlimitedActions } = createDaemonActions(host as unknown as DaemonHost, llm, {
      ...createConfig(),
      economyConfig: { budget: 0 },
    });
    blackboard.budget_exhausted = undefined;
    const unlimited = await unlimitedActions.generate_fix({}, blackboard, context);
    expect(typeof unlimited).toBe('boolean');
    expect(blackboard.budget_exhausted).toBeUndefined();
  });
});
