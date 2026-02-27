import { defineConfig } from 'vite';
export default defineConfig({
    base: '/playground/',
    build: {
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: {
                    monaco: ['monaco-editor']
                }
            }
        }
    },
    server: {
        port: 3000,
        open: true
    }
});
