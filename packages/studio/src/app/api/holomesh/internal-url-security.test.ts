import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('HoloMesh Studio internal fetch SSRF guard', () => {
  it('documents the pinned same-server URL environment variable', () => {
    const envExample = readRepoFile('.env.example');
    expect(envExample).toContain('NEXTJS_INTERNAL_URL=http://localhost:3000');
    expect(envExample).toContain('Do not derive this from request Host headers');
  });

  it('does not derive HoloMesh delegate internal fetches from request origin', () => {
    const source = readRepoFile('packages/studio/src/app/api/holomesh/delegate/route.ts');
    expect(source).toContain('process.env.NEXTJS_INTERNAL_URL');
    expect(source).toContain('/api/holoclaw/run');
    expect(source).not.toContain('req.nextUrl.origin');
    expect(source).not.toContain('request.nextUrl.origin');
  });

  it('does not derive HoloMesh team automation internal fetches from request origin', () => {
    const source = readRepoFile('packages/studio/src/app/api/holomesh/team/automate/route.ts');
    expect(source).toContain('process.env.NEXTJS_INTERNAL_URL');
    expect(source).toContain('/api/holomesh/delegate');
    expect(source).not.toContain('req.nextUrl.origin');
    expect(source).not.toContain('request.nextUrl.origin');
  });
});
