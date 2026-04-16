/**
 * Minimal scene parser for render previews.
 * Keeps service startup resilient even for malformed snippets.
 */

function safeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseVector(text, fallback = [0, 1, 0]) {
  if (!text) return fallback;
  const parts = text
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((p, idx) => safeNumber(p, fallback[idx] ?? 0));

  if (parts.length !== 3) return fallback;
  return parts;
}

function normalizeGeometry(raw) {
  const value = String(raw || 'sphere').toLowerCase();
  const aliases = new Map([
    ['box', 'cube'],
    ['plane', 'plane'],
    ['sphere', 'sphere'],
    ['cylinder', 'cylinder'],
    ['cone', 'cone'],
    ['torus', 'torus'],
    ['capsule', 'capsule'],
    ['ring', 'ring'],
    ['dodecahedron', 'dodecahedron'],
    ['icosahedron', 'icosahedron'],
    ['octahedron', 'octahedron'],
    ['tetrahedron', 'tetrahedron'],
  ]);
  return aliases.get(value) ?? 'sphere';
}

/**
 * Parses HoloScript-like snippets into lightweight render data.
 */
export function parseHoloScriptCode(code) {
  const source = String(code || '');

  const objectRegex = /object\s+"([^"]+)"[\s\S]*?\{([\s\S]*?)\}/g;
  const objects = [];

  let match;
  while ((match = objectRegex.exec(source)) !== null) {
    const [, name, body] = match;

    const geometryMatch = body.match(/geometry\s*:\s*"?([a-zA-Z0-9_\-]+)"?/);
    const colorMatch = body.match(/color\s*:\s*"?([^"\n]+)"?/);
    const emissiveMatch = body.match(/emissive\s*:\s*"?([^"\n]+)"?/);
    const positionMatch = body.match(/position\s*:\s*\[([^\]]+)\]/);
    const rotationMatch = body.match(/rotation\s*:\s*\[([^\]]+)\]/);
    const scaleMatch = body.match(/scale\s*:\s*\[([^\]]+)\]/);
    const tagsMatch = body.match(/universe_tags\s*:\s*\[([^\]]+)\]/);
    const fractalMatch = body.match(/fractal_depth\s*:\s*([0-9.+\-eE]+)/);

    const obj = {
      name,
      geometry: normalizeGeometry(geometryMatch?.[1]),
      color: colorMatch?.[1]?.trim() || '#00ffff',
      emissive: emissiveMatch?.[1]?.trim(),
      position: parseVector(positionMatch?.[1], [0, 1, 0]),
      rotation: parseVector(rotationMatch?.[1], [0, 0, 0]),
      scale: parseVector(scaleMatch?.[1], [1, 1, 1]),
    };

    if (tagsMatch || fractalMatch) {
      obj.universeSemantics = {
        tags: tagsMatch
          ? tagsMatch[1]
              .split(',')
              .map((t) => t.trim().replace(/^["']|["']$/g, ''))
              .filter(Boolean)
          : [],
        fractalDepth:
          fractalMatch != null ? safeNumber(fractalMatch[1], 0) : undefined,
      };
    }

    objects.push(obj);
  }

  const diagnostics = {
    errors: [],
    warnings: [],
    sourceLength: source.length,
  };

  if (source.trim().length > 0 && objects.length === 0) {
    diagnostics.warnings.push({
      code: 'NO_OBJECTS_PARSED',
      message: 'No object blocks were parsed from the input source.',
      severity: 'warning',
    });
  }

  return {
    objects,
    lights: [],
    environment: {},
    metadata: {
      parser: 'render-service/minimal',
      objectCount: objects.length,
      diagnostics,
    },
  };
}
