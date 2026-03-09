/**
 * Lightweight HoloScript parser for browser preview rendering.
 *
 * Extracts objects, materials, animations, and environment settings
 * from HoloScript source code using regex-based parsing.
 * This is intentionally simplified for preview purposes --
 * the full AST parser lives in @holoscript/core.
 */

import { resolveColor } from './colors';
import type { ParsedObject, ParsedEnvironment, ParseResult } from './types';

/**
 * Extract balanced braces content starting from a given index.
 */
function extractBraces(str: string, startIdx: number): string {
  let depth = 0;
  let start = -1;
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return str.slice(start, i);
      }
    }
  }
  return '';
}

function parsePosition(props: string): [number, number, number] {
  const arr = props.match(/position\s*:\s*\[([^\]]+)\]/);
  const obj = props.match(
    /position\s*:\s*\{\s*x\s*:\s*([\d.-]+)\s*,\s*y\s*:\s*([\d.-]+)\s*,\s*z\s*:\s*([\d.-]+)\s*\}/
  );
  if (arr) {
    const parts = arr[1].split(',').map((n) => parseFloat(n.trim()) || 0);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  if (obj) {
    return [parseFloat(obj[1]), parseFloat(obj[2]), parseFloat(obj[3])];
  }
  return [0, 0, 0];
}

function parseScale(props: string): [number, number, number] {
  const arr = props.match(/scale\s*:\s*\[([^\]]+)\]/);
  const num = props.match(/scale\s*:\s*([\d.]+)/);
  const obj = props.match(
    /scale\s*:\s*\{\s*x\s*:\s*([\d.-]+)\s*,\s*y\s*:\s*([\d.-]+)\s*,\s*z\s*:\s*([\d.-]+)\s*\}/
  );
  if (arr) {
    const parts = arr[1].split(',').map((n) => parseFloat(n.trim()) || 1);
    return [parts[0] ?? 1, parts[1] ?? 1, parts[2] ?? 1];
  }
  if (obj) {
    return [parseFloat(obj[1]), parseFloat(obj[2]), parseFloat(obj[3])];
  }
  if (num) {
    const s = parseFloat(num[1]);
    return [s, s, s];
  }
  return [1, 1, 1];
}

function parseRotation(props: string): [number, number, number] {
  const arr = props.match(/rotation\s*:\s*\[([^\]]+)\]/);
  const obj = props.match(
    /rotation\s*:\s*\{\s*x\s*:\s*([\d.-]+)\s*,\s*y\s*:\s*([\d.-]+)\s*,\s*z\s*:\s*([\d.-]+)\s*\}/
  );
  if (arr) {
    return arr[1].split(',').map((n) => ((parseFloat(n.trim()) || 0) * Math.PI) / 180) as [
      number,
      number,
      number,
    ];
  }
  if (obj) {
    return [parseFloat(obj[1]), parseFloat(obj[2]), parseFloat(obj[3])].map(
      (r) => (r * Math.PI) / 180
    ) as [number, number, number];
  }
  return [0, 0, 0];
}

/**
 * Parse HoloScript source code into a structured representation
 * suitable for Three.js rendering.
 */
export function parseHoloScript(source: string): ParseResult {
  const objects: ParsedObject[] = [];
  const environment: ParsedEnvironment = {};

  // Parse environment block
  const envMatch = source.match(/environment\s*[:{]\s*\{([^}]+)\}/);
  if (envMatch) {
    const envBody = envMatch[1];
    const skyboxMatch = envBody.match(/skybox\s*:\s*['"]([^'"]+)['"]/);
    if (skyboxMatch) {
      environment.skybox = skyboxMatch[1].toLowerCase();
    }
    const bgMatch = envBody.match(/background\s*:\s*['"]?#?([\w]+)['"]?/);
    if (bgMatch && !skyboxMatch) {
      environment.background = bgMatch[1];
    }
  }

  // Parse objects: orb, object, object[], button, slider
  const orbPattern =
    /(?:orb|object(?:\[\])?|button|slider)\s+["']?([\w_]+)["']?(?:\s+using\s+["']([\w_]+)["'])?(?:\s+@[\w]+)*\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = orbPattern.exec(source)) !== null) {
    const name = match[1];
    const props = extractBraces(source, match.index);
    if (!props) continue;

    // Color
    const colorMatch = props.match(/color\s*:\s*["']?#?([\w]+)["']?/);
    const color = resolveColor(colorMatch?.[1]);

    // Geometry
    const geoMatch = props.match(/(?:geometry|model)\s*:\s*['"](\w+)['"]/);
    const typeMatch = props.match(/type\s*:\s*['"](\w+)['"]/);
    const geometry = geoMatch
      ? geoMatch[1].toLowerCase()
      : typeMatch
        ? typeMatch[1].toLowerCase()
        : 'cube';

    // Material
    const matMatch = props.match(/material\s*:\s*['"](\w+)['"]/);
    const material = matMatch ? matMatch[1].toLowerCase() : 'standard';

    // Glow
    const glow = /glow\s*:\s*true/i.test(props);

    // Texture
    const textureMatch = props.match(/texture\s*:\s*["']([^"']+)["']/);
    const repeatMatch = props.match(/textureRepeat\s*:\s*\[([^\]]+)\]/);
    const offsetMatch = props.match(/textureOffset\s*:\s*\[([^\]]+)\]/);

    // Animation
    const animMatch = props.match(/animate\s*:\s*['"](\w+)['"]/);
    const animSpeedMatch = props.match(/animSpeed\s*:\s*([\d.]+)/);
    const animAmpMatch = props.match(/animAmplitude\s*:\s*([\d.]+)/);
    const animRadiusMatch = props.match(/animRadius\s*:\s*([\d.]+)/);

    const parsed: ParsedObject = {
      name,
      geometry,
      position: parsePosition(props),
      rotation: parseRotation(props),
      scale: parseScale(props),
      color,
      material,
      glow,
    };

    if (textureMatch) {
      parsed.texture = textureMatch[1];
    }
    if (repeatMatch) {
      const rp = repeatMatch[1].split(',').map((n) => parseFloat(n.trim()) || 1);
      parsed.textureRepeat = [rp[0] ?? 1, rp[1] ?? 1];
    }
    if (offsetMatch) {
      const op = offsetMatch[1].split(',').map((n) => parseFloat(n.trim()) || 0);
      parsed.textureOffset = [op[0] ?? 0, op[1] ?? 0];
    }
    if (animMatch) {
      parsed.animate = animMatch[1].toLowerCase();
      if (animSpeedMatch) parsed.animSpeed = parseFloat(animSpeedMatch[1]);
      if (animAmpMatch) parsed.animAmplitude = parseFloat(animAmpMatch[1]);
      if (animRadiusMatch) parsed.animRadius = parseFloat(animRadiusMatch[1]);
    }

    objects.push(parsed);
  }

  return { objects, environment };
}
