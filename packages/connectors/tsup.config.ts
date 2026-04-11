import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core.ts',
    github: 'src/github.ts',
    railway: 'src/railway.ts',
    upstash: 'src/upstash.ts',
    vscode: 'src/vscode.ts',
    appstore: 'src/appstore.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
});