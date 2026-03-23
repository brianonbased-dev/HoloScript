import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal HoloScript Vite plugin
 *
 * Parses .holo files and injects scene data as a global variable
 * that the Three.js runtime reads. In a full build, this would use
 * @holoscript/core's parser — in the starter template we use a
 * lightweight regex parser for zero-dependency startup speed.
 */
function holoscriptPlugin() {
  return {
    name: 'vite-plugin-holoscript',

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Find the .holo scene file
        const scenePath = path.resolve('src/scene.holo');
        if (!fs.existsSync(scenePath)) return html;

        const source = fs.readFileSync(scenePath, 'utf-8');
        const sceneData = parseHolo(source);

        // Inject scene data before main.js
        const script = `<script>window.__HOLOSCRIPT_SCENE__ = ${JSON.stringify(sceneData)};</script>`;
        return html.replace('</head>', `${script}\n</head>`);
      },
    },

    handleHotUpdate({ file, server }) {
      if (file.endsWith('.holo')) {
        // Full page reload on .holo change
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

/**
 * Lightweight .holo parser for dev preview
 * Extracts composition name + objects with properties and traits.
 * This is NOT the full HoloScript parser — just enough for the dev preview.
 */
function parseHolo(source) {
  const result = { name: 'Untitled', objects: [] };

  // Extract composition name
  const compMatch = source.match(/composition\s+"([^"]+)"/);
  if (compMatch) result.name = compMatch[1];

  // Extract objects
  const objectRegex = /object\s+"([^"]+)"\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
  let match;

  while ((match = objectRegex.exec(source)) !== null) {
    const name = match[1];
    const body = match[2];
    const obj = { name, traits: [], properties: {} };

    // Extract traits
    const traitRegex = /@(\w+)(?:\(([^)]*)\))?/g;
    let traitMatch;
    while ((traitMatch = traitRegex.exec(body)) !== null) {
      const traitName = traitMatch[1];
      const traitArgs = traitMatch[2];
      const config = {};
      if (traitArgs) {
        traitArgs.split(',').forEach((pair) => {
          const [k, v] = pair.split(':').map((s) => s.trim());
          if (k && v) {
            config[k] = isNaN(Number(v)) ? v.replace(/"/g, '') : Number(v);
          }
        });
      }
      obj.traits.push({ name: traitName, config });
    }

    // Extract properties
    const propRegex = /^\s*(\w[\w.]*)\s*:\s*(.+)$/gm;
    let propMatch;
    while ((propMatch = propRegex.exec(body)) !== null) {
      const key = propMatch[1].trim();
      let value = propMatch[2].trim();

      // Skip trait lines and hooks
      if (key.startsWith('@') || key === 'on_click' || key === 'on_grab') continue;

      // Parse arrays [x, y, z]
      if (value.startsWith('[')) {
        try {
          value = JSON.parse(value);
        } catch {
          // leave as string
        }
      }
      // Parse numbers
      else if (!isNaN(Number(value))) {
        value = Number(value);
      }
      // Parse quoted strings
      else if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }

      obj[key] = value;
    }

    result.objects.push(obj);
  }

  return result;
}

export default defineConfig({
  plugins: [holoscriptPlugin()],
  server: {
    open: true,
  },
});
