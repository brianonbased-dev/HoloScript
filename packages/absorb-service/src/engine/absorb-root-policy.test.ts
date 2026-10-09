import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { absorbAllowedRoots, absorbRootRefusal } from './absorb-root-policy';
import { handleCodebaseTool } from '../mcp/codebase-tools';
import { handleAbsorbTypescriptTool } from '../mcp/absorb-typescript-tools';

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('absorb root allowlist', () => {
  it('allows a folder inside an allowed root and refuses one outside', () => {
    const allowed = tempDir('absorb-allowed-');
    const outside = tempDir('absorb-outside-');
    fs.mkdirSync(path.join(allowed, 'repo'));
    const env = { ABSORB_ALLOWED_ROOTS: allowed };
    expect(absorbRootRefusal(path.join(allowed, 'repo'), env)).toBeNull();
    expect(absorbRootRefusal(allowed, env)).toBeNull();
    expect(absorbRootRefusal(outside, env)).toContain('outside the folders this server may scan');
    expect(absorbRootRefusal(path.join(allowed, '..'), env)).not.toBeNull();
  });

  it('defaults to the workspace root and the daemon project root when unset', () => {
    const workspace = tempDir('absorb-workspace-');
    const roots = absorbAllowedRoots({ HOLOSCRIPT_WORKSPACE_ROOT: workspace });
    expect(roots).toContain(fs.realpathSync.native(workspace));
    expect(roots.some((root) => root.endsWith('holoscript-daemon'))).toBe(true);
    expect(
      absorbRootRefusal(os.homedir(), { HOLOSCRIPT_WORKSPACE_ROOT: workspace })
    ).not.toBeNull();
  });

  it('follows a link: a link inside an allowed root that points outside is refused', (ctx) => {
    const allowed = tempDir('absorb-link-allowed-');
    const outside = tempDir('absorb-link-outside-');
    const link = path.join(allowed, 'escape');
    try {
      fs.symlinkSync(outside, link, 'junction');
    } catch {
      ctx.skip();
    }
    expect(absorbRootRefusal(link, { ABSORB_ALLOWED_ROOTS: allowed })).not.toBeNull();
  });

  it('every tool that opens a caller-named folder refuses one outside the allowlist', async () => {
    const outside = tempDir('absorb-tool-outside-');
    const previous = process.env.ABSORB_ALLOWED_ROOTS;
    process.env.ABSORB_ALLOWED_ROOTS = tempDir('absorb-tool-allowed-');
    try {
      const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
        rootDirs: [outside],
        outputFormat: 'stats',
      })) as { error?: string };
      expect(absorbed.error).toBe('rootDir_not_allowed');

      // Every other tool that opens a caller-named folder (2026-10-04 review).
      const changes = (await handleCodebaseTool('holo_detect_changes', {
        previousGraphJson: '{}',
        rootDir: outside,
      })) as { error?: string };
      expect(changes.error).toBe('rootDir_not_allowed');
      const drift = (await handleCodebaseTool('holo_detect_drift', {
        rootDir: outside,
      })) as { error?: string };
      expect(drift.error).toBe('rootDir_not_allowed');
      const transform = (await handleAbsorbTypescriptTool('absorb_suggest_holoscript_transform', {
        rootDir: outside,
      })) as { error?: string };
      expect(transform.error).toBe('rootDir_not_allowed');
    } finally {
      if (previous === undefined) delete process.env.ABSORB_ALLOWED_ROOTS;
      else process.env.ABSORB_ALLOWED_ROOTS = previous;
    }
  });
});

/**
 * The server's own state is never scanned (2026-10-08). On the hosted mcp-server the
 * workspace root is /app and the volume holding HOLOMESH_DATA_DIR is mounted inside it
 * (/app/.holoscript/holomesh: the key registry, boards, teams), so the default allowlist
 * let any logged-in caller absorb it and read back its file names and code symbols.
 */
describe("the server's own state folders", () => {
  function fakeServer() {
    const app = tempDir('absorb-state-app-');
    const data = path.join(app, '.holoscript', 'holomesh');
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(
      path.join(data, 'keys.json'),
      JSON.stringify({ keys: [{ key: 'STATE-KEY-VALUE' }] })
    );
    fs.writeFileSync(
      path.join(data, 'state-module.ts'),
      'export function stateOnlySymbol(stateParam: string) { return stateParam; }\n'
    );
    fs.writeFileSync(path.join(app, 'server.ts'), 'export function appSymbol() { return 1; }\n');
    return { app, data };
  }

  async function withEnv<T>(
    vars: Record<string, string | undefined>,
    run: () => Promise<T>
  ): Promise<T> {
    const saved: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(vars)) {
      saved[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      return await run();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('a root inside the data folder is refused, even though the default allowlist covers it', async () => {
    const { app, data } = fakeServer();
    await withEnv(
      { HOLOSCRIPT_WORKSPACE_ROOT: app, HOLOMESH_DATA_DIR: data, ABSORB_ALLOWED_ROOTS: undefined },
      async () => {
        expect(absorbRootRefusal(app)).toBeNull(); // control: the app folder itself is allowed
        expect(absorbRootRefusal(data)).toContain("this server's own state");
        expect(absorbRootRefusal(path.join(app, '.holoscript'))).toContain(
          "this server's own state"
        );
        // An explicit allowlist does not reopen it.
        expect(absorbRootRefusal(data, { ABSORB_ALLOWED_ROOTS: app })).toContain(
          "this server's own state"
        );
      }
    );
  });

  it('holo_absorb_repo refuses the data folder and, scanning the app folder with includeHidden, never reads it', async () => {
    const { app, data } = fakeServer();
    await withEnv(
      {
        HOLOSCRIPT_WORKSPACE_ROOT: app,
        HOLOMESH_DATA_DIR: data,
        HOLOSCRIPT_CACHE_DIR: tempDir('absorb-state-cache-'),
        ABSORB_ALLOWED_ROOTS: undefined,
        ABSORB_MIN_SYSTEM_FREE_MB: '64',
      },
      async () => {
        const refused = (await handleCodebaseTool('holo_absorb_repo', {
          rootDir: data,
          outputFormat: 'json',
          force: true,
        })) as { error?: string };
        expect(refused.error).toBe('rootDir_not_allowed');

        const whole = await handleCodebaseTool('holo_absorb_repo', {
          rootDir: app,
          includeHidden: true,
          outputFormat: 'json',
          force: true,
        });
        const text = JSON.stringify(whole);
        expect((whole as { error?: string }).error).toBeUndefined();
        expect(text).toContain('appSymbol'); // control: the app's own code is scanned
        for (const leaked of [
          'keys.json',
          'state-module.ts',
          'stateOnlySymbol',
          'stateParam',
          'STATE-KEY-VALUE',
        ]) {
          expect(text, leaked).not.toContain(leaked);
        }
      }
    );
  }, 120_000);

  it("a Studio-style local clone in the cache's workspaces folder is still scannable when allowlisted", async () => {
    const home = tempDir('absorb-state-home-');
    const cache = path.join(home, '.holoscript');
    const clone = path.join(cache, 'workspaces', 'ws-1');
    fs.mkdirSync(clone, { recursive: true });
    await withEnv(
      {
        HOLOSCRIPT_CACHE_DIR: cache,
        HOLOMESH_DATA_DIR: undefined,
        HOLOSCRIPT_WORKSPACE_ROOT: tempDir('absorb-state-ws-'),
        ABSORB_ALLOWED_ROOTS: path.join(cache, 'workspaces'),
      },
      async () => {
        expect(absorbRootRefusal(clone)).toBeNull();
        // ...while the default data folder under the same cache stays closed.
        expect(absorbRootRefusal(path.join(cache, 'holomesh'))).toContain(
          "this server's own state"
        );
      }
    );
  });

  it('ABSORB_PROTECTED_ROOTS adds folders, and a caller passing its own env is still protected', async () => {
    const { app } = fakeServer();
    const extra = path.join(app, 'secrets');
    fs.mkdirSync(extra);
    await withEnv(
      {
        HOLOSCRIPT_WORKSPACE_ROOT: app,
        ABSORB_PROTECTED_ROOTS: extra,
        ABSORB_ALLOWED_ROOTS: undefined,
      },
      async () => {
        expect(absorbRootRefusal(extra)).toContain("this server's own state");
        // Studio's runner passes only ABSORB_ALLOWED_ROOTS; the process's state folders still apply.
        expect(absorbRootRefusal(extra, { ABSORB_ALLOWED_ROOTS: app })).toContain(
          "this server's own state"
        );
        expect(
          absorbRootRefusal(path.join(app, 'server.ts'), { ABSORB_ALLOWED_ROOTS: app })
        ).toBeNull();
      }
    );
  });
});
