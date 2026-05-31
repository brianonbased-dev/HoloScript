import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
// Import from the /parser subpath, NOT the '@holoscript/core' barrel: the barrel
// eager-loads the optional @holoscript/engine peer and crashes a fresh install
// (ERR_MODULE_NOT_FOUND). The /parser subpath is engine-free.
import { parseHolo } from '@holoscript/core/parser';

/**
 * HoloScript Vite plugin
 *
 * Parses .holo files with @holoscript/core — the authoritative HoloScript
 * parser — and injects the scene data as a global the Three.js runtime reads.
 * (Earlier starters shipped a regex shim here; that was wrong. The real parser
 * understands nested objects, traits, timelines, and every construct the
 * language adds, so your dev preview matches production.)
 */
function holoscriptPlugin() {
  return {
    name: 'vite-plugin-holoscript',

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const scenePath = path.resolve('src/scene.holo');
        if (!fs.existsSync(scenePath)) return html;

        const source = fs.readFileSync(scenePath, 'utf-8');
        const sceneData = parseScene(source);

        const script = `<script>window.__HOLOSCRIPT_SCENE__ = ${JSON.stringify(sceneData)};</script>`;
        return html.replace('</head>', `${script}\n</head>`);
      },
    },

    handleHotUpdate({ file, server }) {
      if (file.endsWith('.holo')) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

/**
 * Parse a .holo source with @holoscript/core and flatten the AST into the
 * simple `{ name, objects: [{ name, traits, ...props }] }` shape the bundled
 * Three.js renderer consumes. Object properties are inlined onto each object
 * (e.g. `obj.geometry`, `obj.position`) for direct renderer access.
 */
function parseScene(source) {
  const result = parseHolo(source);

  if (!result || result.success === false) {
    const errors = (result && result.errors) || [];
    if (errors.length) {
      // Surface parse errors in the dev console rather than rendering garbage.
      console.error('[holoscript] scene parse errors:');
      for (const e of errors) {
        const loc = e.line ? ` (line ${e.line})` : '';
        console.error(`  - ${e.message || e}${loc}`);
      }
    }
    return { name: 'Untitled', objects: [] };
  }

  const ast = result.ast ?? {};
  const objects = (ast.objects ?? []).map((obj) => {
    const out = {
      name: obj.name,
      traits: (obj.traits ?? []).map((t) => ({ name: t.name, config: t.config ?? {} })),
    };
    for (const prop of obj.properties ?? []) {
      out[prop.key] = prop.value;
    }
    return out;
  });

  return { name: ast.name ?? 'Untitled', objects };
}

export default defineConfig({
  plugins: [holoscriptPlugin()],
  server: {
    open: true,
  },
});
