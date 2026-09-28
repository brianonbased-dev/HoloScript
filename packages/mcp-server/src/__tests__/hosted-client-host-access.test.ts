/**
 * A client that registers itself on the hosted server must not be able to touch the server's own disk
 * (task_1790214096204_56rj).
 *
 * The scenario, measured against ece507636 before this change: open registration + scope `tools:execute`
 * expands (SCOPE_BRIDGE) to tools:write + tools:codebase + tools:browser, and the default scope tools:read
 * is enough for the read tools. Through the real gates and the real dispatch registry a client like that
 * wrote an attacker-chosen absolute path with attacker-chosen content (holo_write_file), read any absolute
 * path (holo_read_file), and exported the emergence corpus to any path. Gate 3's path check only recorded an
 * advisory string, and the argument gate refuses only a double `../`, so an absolute path passed every gate.
 *
 * These tests use only the pieces the HTTP server itself calls, in the order it calls them
 * (securedToolExecutionInner: runTripleGate, then _handleSingleToolLogic), and a real temp directory: the
 * assertion that matters is that the file was NOT created / NOT read.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// The daimōn store resolves its data dir once, at module load: pin it before the first import of index.
const DATA_DIR = mkdtempSync(join(tmpdir(), 'hosted-client-data-'));
const PREVIOUS_DATA_DIR = process.env.HOLOMESH_DATA_DIR;
process.env.HOLOMESH_DATA_DIR = DATA_DIR;

const { runTripleGate } = await import('../security/gates');
const { authorizeToolCall } = await import('../security/tool-scopes');
const { expandScopes } = await import('../auth/oauth2-provider');
const { _handleSingleToolLogic } = await import('../index');
const { buildMeshToolManifest, clearMeshToolRegistry, publishMeshToolManifest } =
  await import('../holomesh/mesh-tool-registry');

const WORK = mkdtempSync(join(tmpdir(), 'hosted-client-work-'));
afterAll(() => {
  if (PREVIOUS_DATA_DIR === undefined) delete process.env.HOLOMESH_DATA_DIR;
  else process.env.HOLOMESH_DATA_DIR = PREVIOUS_DATA_DIR;
  rmSync(DATA_DIR, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
});

/** What a self-registered public client ends up holding, expanded exactly as the token introspection does. */
const AS_EXECUTE = expandScopes(['tools:read', 'tools:execute']) as string[];
const AS_DEFAULT = expandScopes(['tools:read']) as string[];
const AS_ADMIN = expandScopes(['admin']) as string[];

/** The HTTP server's order of operations for one tool call: gates first, dispatch only if they pass. */
async function callLikeTheServer(
  scopes: string[],
  tool: string,
  args: Record<string, unknown>
): Promise<{ gate: number; passed: boolean; reason?: string; text?: string }> {
  const auth = { active: true, clientId: 'dyn-client', scopes } as never;
  const g = runTripleGate(tool, args, auth);
  if (!g.passed) return { gate: g.gate, passed: false, reason: g.reason };
  const res = (await _handleSingleToolLogic(tool, args, {
    signedRequest: false,
    signingValid: true,
    signer: 'dyn-client',
    scopes,
  } as never)) as { content?: Array<{ text?: string }> };
  return { gate: g.gate, passed: true, text: res.content?.[0]?.text };
}

/** Tools that operate on the server's own checkout, git and test runner; they exist for the owner's agents. */
const HOST_CONTROL_TOOLS = [
  'holo_write_file',
  'holo_edit_file',
  'holo_read_file',
  'holo_git_commit',
  'holo_run_tests_targeted',
  'holo_run_related_tests',
  'holo_list_type_errors',
  'holo_batch_type_fix',
  'holo_verify_before_commit',
  'holo_quality_trend',
];

describe('a self-registered client cannot use the host-control tools', () => {
  it('the scope it asks for is the one that used to reach them', () => {
    expect(AS_EXECUTE).toEqual(
      expect.arrayContaining(['tools:read', 'tools:write', 'tools:codebase'])
    );
    expect(AS_DEFAULT).toEqual(['tools:read']);
  });

  for (const tool of HOST_CONTROL_TOOLS) {
    it(`${tool} is refused at Gate 2 for tools:execute and for the default tools:read`, () => {
      expect(authorizeToolCall(tool, AS_EXECUTE).authorized).toBe(false);
      expect(authorizeToolCall(tool, AS_DEFAULT).authorized).toBe(false);
    });

    it(`${tool} still works for an administrator`, () => {
      expect(authorizeToolCall(tool, AS_ADMIN).authorized).toBe(true);
      expect(authorizeToolCall(tool, ['admin:*']).authorized).toBe(true);
    });
  }

  it('holo_write_file: the file is NOT created, and the refusal is at Gate 2', async () => {
    const target = join(WORK, 'planted.txt');
    const got = await callLikeTheServer(AS_EXECUTE, 'holo_write_file', {
      filePath: target,
      content: 'PLANTED',
    });
    expect(got.passed).toBe(false);
    expect(got.gate).toBe(2);
    expect(existsSync(target)).toBe(false);
  });

  it('holo_read_file: nothing is read, even at the default scope', async () => {
    const secret = join(WORK, 'pretend-secret.txt');
    writeFileSync(secret, 'PRETEND-SECRET-VALUE\n');
    const got = await callLikeTheServer(AS_DEFAULT, 'holo_read_file', { filePath: secret });
    expect(got.passed).toBe(false);
    expect(got.gate).toBe(2);
    expect(got.text).toBeUndefined();
  });

  it('control: an administrator still writes and reads through the same path', async () => {
    const target = join(WORK, 'admin-wrote.txt');
    const wrote = await callLikeTheServer(AS_ADMIN, 'holo_write_file', {
      filePath: target,
      content: 'ADMIN-CONTENT',
    });
    expect(wrote.passed).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('ADMIN-CONTENT');
    const read = await callLikeTheServer(AS_ADMIN, 'holo_read_file', { filePath: target });
    expect(read.passed).toBe(true);
    expect(read.text).toContain('ADMIN-CONTENT');
  });
});

describe('a caller without admin scope cannot name a host path to ANY tool', () => {
  it('holo_export_emergence_corpus: an absolute outPath is refused at Gate 3 and no file appears', async () => {
    const target = join(WORK, 'corpus-planted.jsonl');
    const got = await callLikeTheServer(AS_EXECUTE, 'holo_export_emergence_corpus', {
      outPath: target,
    });
    expect(got.passed).toBe(false);
    expect(got.gate).toBe(3);
    expect(got.reason).toMatch(/Host path argument refused/);
    expect(existsSync(target)).toBe(false);
  });

  it('holo_export_emergence_corpus with no outPath still works and writes only under the data dir', async () => {
    const got = await callLikeTheServer(AS_EXECUTE, 'holo_export_emergence_corpus', {});
    expect(got.passed).toBe(true);
    expect(existsSync(join(DATA_DIR, 'emergence', 'emergence-corpus.normalized.jsonl'))).toBe(true);
  });

  it.each([
    ['holo_scaffold_code', 'targetDir'],
    ['holo_generate_bindings', 'modulePath'],
    ['compile_to_sdk', 'outputDir'],
  ])(
    '%s refuses an absolute %s and a traversal, accepts a plain relative one',
    async (tool, key) => {
      const abs = join(WORK, 'x');
      const absolute = await callLikeTheServer(AS_EXECUTE, tool, { [key]: abs });
      expect(absolute.passed).toBe(false);
      expect(absolute.gate).toBe(3);
      const traversal = await callLikeTheServer(AS_EXECUTE, tool, { [key]: 'a/../b' });
      expect(traversal.passed).toBe(false);
      expect(traversal.gate).toBe(3);
      // The gate lets a plain relative name through (whatever the handler then does with it).
      const relative = runTripleGate(tool, { [key]: 'compositions/x' }, {
        active: true,
        clientId: 'dyn-client',
        scopes: AS_EXECUTE,
      } as never);
      expect(relative.gate).toBe(3);
      expect(relative.passed).toBe(true);
      expect(existsSync(abs)).toBe(false);
    }
  );

  it('an administrator may still name an absolute path (the owner agents rely on it)', () => {
    const abs = runTripleGate('holo_scaffold_code', { targetDir: join(WORK, 'x') }, {
      active: true,
      clientId: 'owner',
      scopes: AS_ADMIN,
    } as never);
    expect(abs.passed).toBe(true);
  });

  it('batch_tool_call cannot carry a path past the gate that a direct call could not', async () => {
    const target = join(WORK, 'batch-planted');
    const res = (await _handleSingleToolLogic(
      'batch_tool_call',
      {
        calls: [
          {
            name: 'holo_export_emergence_corpus',
            args: { outPath: join(WORK, 'batch-corpus.jsonl') },
          },
          { name: 'holo_scaffold_code', args: { targetDir: target } },
        ],
      },
      {
        signedRequest: false,
        signingValid: true,
        signer: 'dyn-client',
        scopes: AS_EXECUTE,
      } as never
    )) as { content?: Array<{ text?: string }> };
    const summary = JSON.parse(res.content?.[0]?.text ?? '{}') as {
      results: Array<{ name: string; ok: boolean; error?: string }>;
    };
    expect(summary.results.map((r) => r.ok)).toEqual([false, false]);
    expect(summary.results[0].error).toMatch(/Host path argument refused/);
    expect(summary.results[1].error).toMatch(/Host path argument refused/);
    expect(existsSync(join(WORK, 'batch-corpus.jsonl'))).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  it('batch_tool_call still refuses a host-control child at Gate 2', async () => {
    const target = join(WORK, 'batch-write.txt');
    const res = (await _handleSingleToolLogic(
      'batch_tool_call',
      { calls: [{ name: 'holo_write_file', args: { filePath: target, content: 'x' } }] },
      {
        signedRequest: false,
        signingValid: true,
        signer: 'dyn-client',
        scopes: AS_EXECUTE,
      } as never
    )) as { content?: Array<{ text?: string }> };
    const summary = JSON.parse(res.content?.[0]?.text ?? '{}') as {
      results: Array<{ ok: boolean; error?: string }>;
    };
    expect(summary.results[0].ok).toBe(false);
    expect(summary.results[0].error).toMatch(/authorization denied/);
    expect(existsSync(target)).toBe(false);
  });
});

// claude3-x402's review of #396 (P1): holo_reconstruct_from_video (tools:write) read any file: URL named in
// videoUrl, and its reply carried the file's byte count, or the error saying it does not exist. videoUrl was not a
// path-typed key, so no gate looked at it. Its review of #398 added the second half: the host-path rule ran only
// at Gate 3 and for batch children, so the same call made from inside the server (a mesh-invoked tool, a
// workflow step) skipped it altogether.
describe('a file: URL cannot reach the server disk, under any argument name or by any way in', () => {
  const secret = join(WORK, 'pretend-secret.bin');
  writeFileSync(secret, 'PRETEND-SECRET-BYTES');
  const secretUrl = pathToFileURL(secret).href;
  const asCaller = {
    signedRequest: false,
    signingValid: true,
    signer: 'dyn-client',
    scopes: AS_EXECUTE,
  };

  it('holo_reconstruct_from_video: a file: videoUrl is refused at Gate 3', async () => {
    const got = await callLikeTheServer(AS_EXECUTE, 'holo_reconstruct_from_video', {
      videoUrl: secretUrl,
    });
    expect(got.passed).toBe(false);
    expect(got.gate).toBe(3);
    expect(got.reason).toMatch(/Host path argument refused/);
  });

  it('the same call made from inside the server, past Gate 3, is refused by the dispatcher itself', async () => {
    const res = (await _handleSingleToolLogic(
      'holo_reconstruct_from_video',
      { videoUrl: secretUrl },
      asCaller as never
    )) as {
      content?: Array<{ text?: string }>;
    };
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/Host path argument refused/);
    expect(text).not.toMatch(/videoBytes|ENOENT/);
  });

  it('holomesh_invoke_tool cannot carry it in either', async () => {
    clearMeshToolRegistry();
    const manifest = publishMeshToolManifest(
      buildMeshToolManifest(
        {
          tool_name: 'holo_reconstruct_from_video',
          description: 'test manifest for holo_reconstruct_from_video',
          capability_tags: ['video'],
          allow_transitive_invocation: true,
        },
        { agentId: 'agent_test_publisher', name: 'test-publisher' }
      )
    );
    const got = await callLikeTheServer(AS_EXECUTE, 'holomesh_invoke_tool', {
      mesh_tool_id: manifest.id,
      args: { videoUrl: secretUrl },
      allow_high_risk: true,
    });
    expect(got.text ?? got.reason ?? '').toMatch(/Host path argument refused/);
    expect(got.text ?? '').not.toMatch(/videoBytes|ENOENT/);
    clearMeshToolRegistry();
  });

  it('an https videoUrl still passes the gate', () => {
    const g = runTripleGate(
      'holo_reconstruct_from_video',
      { videoUrl: 'https://cdn.example.com/walkthrough.mp4' },
      {
        active: true,
        clientId: 'dyn-client',
        scopes: AS_EXECUTE,
      } as never
    );
    expect(g.passed).toBe(true);
  });

  it('an administrator may still name a file: videoUrl (the owner agents use local videos)', () => {
    const g = runTripleGate('holo_reconstruct_from_video', { videoUrl: secretUrl }, {
      active: true,
      clientId: 'owner',
      scopes: AS_ADMIN,
    } as never);
    expect(g.passed).toBe(true);
  });
});
