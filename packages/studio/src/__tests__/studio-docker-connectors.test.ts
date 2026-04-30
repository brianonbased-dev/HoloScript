import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const studioRoot = resolve(__dirname, '../..');
const packageJson = JSON.parse(readFileSync(resolve(studioRoot, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
const dockerfile = readFileSync(resolve(studioRoot, 'Dockerfile'), 'utf8');

const connectorPackages = Object.keys(packageJson.dependencies ?? {}).filter((name) =>
  name.startsWith('@holoscript/connector-')
);

describe('Studio Docker connector parity', () => {
  // The Dockerfile evolved from per-connector COPY lines to a single mass
  // `COPY packages/ packages/` (commit 3d2980cc3 — "kill the deploy
  // whack-a-mole"). The test invariant is: every connector dep Studio
  // declares must be reachable inside the image. With mass-COPY that's
  // satisfied as long as the COPY itself is present and not narrowed.
  it('copies the workspace packages tree wholesale', () => {
    expect(connectorPackages.length).toBeGreaterThan(0);
    expect(dockerfile).toMatch(/^COPY packages\/ packages\/(\s|$)/m);
  });

  // Build coverage is still per-connector — only the connectors explicitly
  // listed in the Dockerfile get a tsup invocation. The current build line
  // also runs --dts-only after --no-dts so types reach disk; a copy that
  // skipped --dts-only would silently break downstream package imports
  // (commit 3d2980cc3 "dts-everywhere").
  it('builds every connector workspace package with --no-dts and --dts-only', () => {
    for (const packageName of connectorPackages) {
      const folder = packageName.replace('@holoscript/', '');
      expect(dockerfile).toContain(
        `RUN cd packages/${folder} && npx tsup --no-dts && npx tsup --dts-only || true`,
      );
    }
  });
});
