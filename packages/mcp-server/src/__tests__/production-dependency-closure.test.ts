import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../../../..');
const readRepoFile = (relativePath: string): string =>
  readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('mcp-server production dependency closure', () => {
  it('declares both the verifier and its meaning runtime as production dependencies', () => {
    const manifest = JSON.parse(readRepoFile('packages/mcp-server/package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(manifest.dependencies?.['@holoscript/uaal']).toMatch(/^workspace:/);
    expect(manifest.dependencies?.['@holoscript/meaning']).toMatch(/^workspace:/);
  });

  it('builds and retains meaning before uaal in the Railway production image', () => {
    const dockerfile = readRepoFile('infrastructure/Dockerfile.mcp-server');
    const meaningBuild = 'RUN cd packages/meaning && pnpm exec tsup --no-dts';
    const uaalBuild = 'RUN cd packages/uaal && pnpm exec tsup --no-dts';

    expect(dockerfile).toContain('COPY packages/meaning/ packages/meaning/');
    expect(dockerfile.indexOf(meaningBuild)).toBeGreaterThanOrEqual(0);
    expect(dockerfile.indexOf(meaningBuild)).toBeLessThan(dockerfile.indexOf(uaalBuild));
    expect(dockerfile).toContain(
      'COPY --from=builder /app/packages/meaning/dist packages/meaning/dist'
    );
    expect(dockerfile).toContain(
      'ln -sfn /app/packages/meaning /app/node_modules/@holoscript/meaning'
    );
    expect(dockerfile).toContain('test -f /app/packages/meaning/dist/index.js');
  });

  it('redeploys when either side of the verifier contract changes', () => {
    const railwayConfig = readRepoFile('packages/mcp-server/railway.toml');

    expect(railwayConfig).toContain('"packages/meaning/**"');
    expect(railwayConfig).toContain('"packages/uaal/**"');
  });
});
