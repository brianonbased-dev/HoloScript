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
  it('copies every connector workspace package required by Studio', () => {
    for (const packageName of connectorPackages) {
      const folder = packageName.replace('@holoscript/', '');
      expect(dockerfile).toContain(`COPY packages/${folder}/ packages/${folder}/`);
    }
  });

  it('builds every copied connector workspace package in the Docker build stage', () => {
    for (const packageName of connectorPackages) {
      const folder = packageName.replace('@holoscript/', '');
      expect(dockerfile).toContain(`RUN cd packages/${folder} && npx tsup --no-dts || true`);
    }
  });
});
