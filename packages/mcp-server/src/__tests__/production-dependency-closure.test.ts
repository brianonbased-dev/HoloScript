import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

  it('preserves HoloMeaning re-exports in the built uAAL package', () => {
    const buildConfig = readRepoFile('packages/uaal/tsup.config.ts');

    expect(buildConfig).toContain('treeshake: false');
    expect(buildConfig).toContain("noExternal: ['@holoscript/meaning']");
  });

  // ── HoloTunnel closure (mcp_tunnel_create outage) ──────────────────────────
  // src/holo-tunnel-tools.ts does `await import('@hololand/platform-services')`.
  // That package is a declared dependency, but was never built/copied into the
  // Railway runtime image, so the deployed tool 500'd with:
  //   "Cannot find module '/app/packages/mcp-server/node_modules/@holoscript/
  //    hololand-platform/dist/index.js'"
  // Its barrel externalizes @holoscript/runtime (also missing). Same runtime-image
  // closure class as meaning/uaal (264c42076). runtime must build BEFORE
  // hololand-platform (which depends on it).
  it('builds and retains hololand-platform and its runtime dep before the mcp-server bundle', () => {
    const dockerfile = readRepoFile('infrastructure/Dockerfile.mcp-server');
    const runtimeBuild = 'RUN cd packages/runtime && pnpm exec tsup --no-dts';
    const hololandBuild = 'RUN cd packages/hololand-platform && pnpm exec tsup --no-dts';
    const mcpServerBuild = 'RUN cd packages/mcp-server && pnpm exec tsup';

    // source copied into the builder stage
    expect(dockerfile).toContain('COPY packages/runtime/ packages/runtime/');
    expect(dockerfile).toContain('COPY packages/hololand-platform/ packages/hololand-platform/');

    // build order: runtime -> hololand-platform -> mcp-server
    expect(dockerfile.indexOf(runtimeBuild)).toBeGreaterThanOrEqual(0);
    expect(dockerfile.indexOf(hololandBuild)).toBeGreaterThanOrEqual(0);
    expect(dockerfile.indexOf(runtimeBuild)).toBeLessThan(dockerfile.indexOf(hololandBuild));
    expect(dockerfile.indexOf(hololandBuild)).toBeLessThan(dockerfile.indexOf(mcpServerBuild));

    // dist retained in the production stage
    expect(dockerfile).toContain(
      'COPY --from=builder /app/packages/runtime/dist packages/runtime/dist'
    );
    expect(dockerfile).toContain(
      'COPY --from=builder /app/packages/hololand-platform/dist packages/hololand-platform/dist'
    );

    // resolvable via @holoscript/* symlinks
    expect(dockerfile).toContain(
      'ln -sfn /app/packages/runtime /app/node_modules/@holoscript/runtime'
    );
    expect(dockerfile).toContain(
      'ln -sfn /app/packages/hololand-platform /app/node_modules/@hololand/platform-services'
    );

    // fail-fast if the dist that `await import()` loads is missing
    expect(dockerfile).toContain('test -f /app/packages/runtime/dist/index.js');
    expect(dockerfile).toContain('test -f /app/packages/hololand-platform/dist/index.js');
  });

  it('redeploys mcp-server when the tunnel packages change', () => {
    const railwayConfig = readRepoFile('packages/mcp-server/railway.toml');

    expect(railwayConfig).toContain('"packages/hololand-platform/**"');
    expect(railwayConfig).toContain('"packages/runtime/**"');
  });

  // ── Generic guard for the whole class ──────────────────────────────────────
  // The hololand-platform outage proves that declaring a dep in package.json is
  // NOT enough — the bug was declared-but-never-COPY'd into the runtime image.
  // tsup externalizes EVERY @holoscript workspace dependency in mcp-server's
  // package.json, so each one that is imported (statically or via `await import`)
  // must have its build output copied into the production Docker stage, or the
  // container 500s at runtime with "Cannot find module .../dist/index.js". This
  // asserts the whole set, not a hand-maintained allowlist, so any FUTURE
  // declared-but-unshipped @holoscript dep fails here instead of in production.
  it('copies every declared @holoscript workspace dependency into the production image', () => {
    const dockerfile = readRepoFile('infrastructure/Dockerfile.mcp-server');
    const prodStageStart = dockerfile.indexOf('# --- Production stage ---');
    expect(prodStageStart).toBeGreaterThanOrEqual(0);
    const prodStage = dockerfile.slice(prodStageStart);

    // Map @holoscript/<name> -> packages/<dir> by scanning workspace manifests
    // (handles non-obvious mappings like @holoscript/wasm -> packages/compiler-wasm).
    const packagesDir = path.join(repoRoot, 'packages');
    const nameToDir = new Map<string, string>();
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(packagesDir, entry.name, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const { name } = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string };
      if (name) nameToDir.set(name, entry.name);
    }

    const manifest = JSON.parse(readRepoFile('packages/mcp-server/package.json')) as {
      dependencies?: Record<string, string>;
    };
    const holoDeps = Object.keys(manifest.dependencies ?? {}).filter((dep) =>
      dep.startsWith('@holoscript/')
    );
    expect(holoDeps.length).toBeGreaterThan(0);

    const notShipped: string[] = [];
    for (const dep of holoDeps) {
      const dir = nameToDir.get(dep);
      expect(dir, `no workspace package resolves ${dep}`).toBeTruthy();
      // Accept any build-output COPY for the package (dist, or pkg-node for wasm).
      const isCopied = prodStage.includes(`COPY --from=builder /app/packages/${dir}/`);
      if (!isCopied) notShipped.push(`${dep} (packages/${dir})`);
    }

    expect(
      notShipped,
      `declared @holoscript deps not copied into the production runtime image: ${notShipped.join(', ')}`
    ).toEqual([]);
  });
});
