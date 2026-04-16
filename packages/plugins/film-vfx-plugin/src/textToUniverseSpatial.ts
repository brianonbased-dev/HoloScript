/** Default semantic tags consumed by `render-service` minimal `parseScene` parser. */
export const DEFAULT_TEXT_TO_UNIVERSE_TAGS = ['fractal', 'density_field', 'non_euclidean'] as const;

/**
 * HoloScript-like snippet for render previews / shared scenes: includes
 * `universe_tags` and `fractal_depth` so `parseHoloScriptCode` attaches `universeSemantics`.
 */
export function buildTextToUniverseRenderSnippet(opts: {
  objectName?: string;
  tags?: readonly string[];
  fractalDepth?: number;
}): string {
  const objectName = opts.objectName ?? 'TTU_SceneRoot';
  const tags = opts.tags?.length ? opts.tags : DEFAULT_TEXT_TO_UNIVERSE_TAGS;
  const tagStr = tags.map((t) => `"${String(t).replace(/"/g, '')}"`).join(', ');
  const depth = opts.fractalDepth ?? 3;
  return [
    'composition "TextToUniverse_Render" {',
    `  object "${objectName}" @text_to_universe {`,
    `    universe_tags: [${tagStr}]`,
    `    fractal_depth: ${depth}`,
    '    geometry: "sphere"',
    '    color: "#8866ff"',
    '    position: [0, 2, 0]',
    '  }',
    '}',
  ].join('\n');
}
