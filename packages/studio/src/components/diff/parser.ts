import type { HoloComposition, HoloObject } from './types';

export function parseHolo(source: string): HoloComposition {
  const lines = source.split('\n');
  const objects: HoloObject[] = [];
  let compositionName = '';

  let currentObject: HoloObject | null = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match composition name
    const compMatch = line.match(/^composition\s+"([^"]+)"\s*\{/);
    if (compMatch) {
      compositionName = compMatch[1];
      depth++;
      continue;
    }

    // Match object declaration
    const objMatch = line.match(/^object\s+"([^"]+)"\s*\{/);
    if (objMatch) {
      currentObject = {
        name: objMatch[1],
        traits: [],
        properties: [],
        startLine: i,
        endLine: i,
      };
      depth++;
      continue;
    }

    // Match trait (@trait_name)
    if (currentObject && line.startsWith('@')) {
      const traitName = line
        .replace(/^@/, '')
        .replace(/\s*\{.*$/, '')
        .trim();
      currentObject.traits.push({ name: traitName, line: i });
      continue;
    }

    // Match property (key: value)
    const propMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
    if (currentObject && propMatch) {
      currentObject.properties.push({
        key: propMatch[1],
        value: propMatch[2].replace(/,?\s*$/, ''),
        line: i,
      });
      continue;
    }

    // Track braces
    if (line === '}') {
      depth--;
      if (currentObject && depth <= 1) {
        currentObject.endLine = i;
        objects.push(currentObject);
        currentObject = null;
      }
    }
  }

  return { name: compositionName, objects, raw: source, lines };
}
