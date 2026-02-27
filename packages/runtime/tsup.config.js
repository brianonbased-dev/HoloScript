import { defineConfig } from 'tsup';
export default defineConfig([
    // ES/CJS modules for bundlers
    {
        entry: {
            index: 'src/index.ts',
            events: 'src/events.ts',
            storage: 'src/storage.ts',
            device: 'src/device.ts',
            timing: 'src/timing.ts',
            math: 'src/math.ts',
            navigation: 'src/navigation.ts',
            browser: 'src/browser/BrowserRuntime.ts',
        },
        format: ['esm', 'cjs'],
        dts: true,
        sourcemap: true,
        clean: true,
        splitting: false,
        treeshake: true,
        external: ['react', '@react-three/fiber', 'three', 'monaco-editor', '@hololand/world'],
    },
    // Global/IIFE bundle for <script> tag loading
    {
        entry: {
            'holoscript.global': 'src/browser/BrowserRuntime.ts',
        },
        format: ['iife'],
        globalName: 'HoloScript',
        sourcemap: true,
        minify: true,
        noExternal: [/(.*)/], // Bundle everything except peer deps
        external: ['three', 'monaco-editor'],
        esbuildOptions(options) {
            options.banner = {
                js: '/* HoloScript Runtime v2.1.0 - https://holoscript.net */',
            };
        },
    },
]);
