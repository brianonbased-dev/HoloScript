import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDaemonActions,
  type DaemonConfig,
  type DaemonExecResult,
  type DaemonHost,
  type LLMProvider,
} from '../daemon-actions';

type Blackboard = Record<string, unknown>;

class MockHost implements DaemonHost {
  private readonly files = new Map<string, string>();
  private readonly execImpl = vi.fn<(command: string, args?: string[], opts?: { cwd?: string; timeoutMs?: number }) => Promise<DaemonExecResult>>();

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

  exec(command: string, args?: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<DaemonExecResult> {
    return this.execImpl(command, args, opts);
  }

  setExecResponses(resolver: (command: string, args?: string[]) => DaemonExecResult | Promise<DaemonExecResult>): void {
    this.execImpl.mockImplementation((command, args) => Promise.resolve(resolver(command, args)));
  }
}

function createConfig(): DaemonConfig {
  return {
    repoRoot: 'repo',
    commit: false,
    model: 'claude-3-5-haiku-20241022',
    verbose: false,
    focusRotation: ['typefix'],
    stateDir: '.holoscript',
  };
}

describe('holoscript daemon integration', () => {
  let host: MockHost;
  let llm: LLMProvider;
  let blackboard: Blackboard;
  let context: { emit: ReturnType<typeof vi.fn> };

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
    context = { emit: vi.fn() };
  });

  it('loads persisted wisdom during identity intake', async () => {
    host.seedFile('.holoscript/accumulated-wisdom.json', JSON.stringify([{ pattern: 'typefix' }]));
    host.setExecResponses(() => ({ code: 0, stdout: '', stderr: '' }));

    const actions = createDaemonActions(host, llm, createConfig());
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
          stdout: 'packages/core/src/example.ts(1,14): error TS2322: Type \'number\' is not assignable to type \'string\'.\n',
          stderr: '',
        };
      }

      return { code: 0, stdout: '', stderr: '' };
    });

    const actions = createDaemonActions(host, llm, createConfig());
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

    const actions = createDaemonActions(host, llm, createConfig());
    const ok = await actions.generate_fix({}, blackboard, context);

    expect(ok).toBe(true);
    expect(host.readFile('packages/core/src/example.ts')).toBe('export const fixed = true;\n');
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

    const actions = createDaemonActions(host, llm, createConfig());
    const ok = await actions.generate_fix({}, blackboard, context);

    expect(ok).toBe(false);
    expect(host.readFile('packages/core/src/example.ts')).toBe('export const fixed = false;\n');
    expect(blackboard.fileEdited).toBeUndefined();
  });
});
