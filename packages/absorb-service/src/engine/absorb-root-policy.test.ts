import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { absorbAllowedRoots, absorbRootRefusal } from './absorb-root-policy';
import { handleCodebaseTool } from '../mcp/codebase-tools';

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
    expect(absorbRootRefusal(os.homedir(), { HOLOSCRIPT_WORKSPACE_ROOT: workspace })).not.toBeNull();
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

  it('holo_absorb_repo refuses a root outside the allowlist', async () => {
    const outside = tempDir('absorb-tool-outside-');
    const previous = process.env.ABSORB_ALLOWED_ROOTS;
    process.env.ABSORB_ALLOWED_ROOTS = tempDir('absorb-tool-allowed-');
    try {
      const absorbed = (await handleCodebaseTool('holo_absorb_repo', {
        rootDirs: [outside],
        outputFormat: 'stats',
      })) as { error?: string };
      expect(absorbed.error).toBe('rootDir_not_allowed');
    } finally {
      if (previous === undefined) delete process.env.ABSORB_ALLOWED_ROOTS;
      else process.env.ABSORB_ALLOWED_ROOTS = previous;
    }
  });
});
