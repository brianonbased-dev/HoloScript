import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    endpoints: 'src/endpoints.ts',
    auth: 'src/auth.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
});
