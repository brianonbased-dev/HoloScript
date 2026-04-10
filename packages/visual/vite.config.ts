import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'HoloScriptVisual',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'reactflow', '@holoscript/core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          reactflow: 'ReactFlow',
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
