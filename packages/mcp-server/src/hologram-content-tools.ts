/**
 * Hologram MCP Content Tools - reference tools whose response payload IS a
 * hologram, not text.
 *
 * Today: tool returns text -> client renders.
 * Tomorrow: tool returns .holo bundle -> client (Quest, Vision Pro, browser
 *           R3F) hands off to renderer.
 *
 * v0.1 ships ONE reference tool - `visualize_query_result` - that builds a
 * 3D bar-chart composition from rows of {label, value} and returns a
 * `HologramMcpResponse` with content_type `application/holoscript+holo`.
 *
 * Spec: task_1778114362909_zp7u (Hologram return type for MCP).
 *
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  HOLOGRAM_CONTENT_TYPES,
  buildHologramMcpResponse,
  type HologramMcpResponse,
} from '@holoscript/core';

// =============================================================================
// JSON Schemas
// =============================================================================

const QUERY_ROW_SCHEMA = {
  type: 'object',
  description: 'A single row in the query result. `value` is rendered as bar height.',
  properties: {
    label: { type: 'string', description: 'X-axis label.' },
    value: { type: 'number', description: 'Bar height (clamped to [0, 100]).' },
    color: {
      type: 'string',
      description: 'Optional hex color. Falls back to a teal/violet gradient.',
    },
  },
  required: ['label', 'value'],
};

// =============================================================================
// Tool Definitions
// =============================================================================

export const hologramContentToolDefinitions: Tool[] = [
  {
    name: 'visualize_query_result',
    description:
      'Reference tool for the hologram MCP content_type protocol: accepts query rows {label, value}, builds a .holo composition rendering them as 3D bars, and returns a `HologramMcpResponse` with content_type `application/holoscript+holo`. Hologram-aware clients (Studio, R3F renderer, Quest 3) detect the content_type and hand off to /hologram instead of rendering text. Chat-only clients still see a text summary at content[0].text. See task_1778114362909_zp7u.',
    inputSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          description: 'Query result rows. At least one row is required.',
          items: QUERY_ROW_SCHEMA,
          minItems: 1,
        },
        title: {
          type: 'string',
          description: 'Optional chart title shown above the bars.',
        },
        scale: {
          type: 'number',
          description: 'Y-axis scale multiplier (default 0.02 for value 0-100).',
        },
      },
      required: ['rows'],
    },
  },
];

const HOLOGRAM_CONTENT_NAMES = new Set(hologramContentToolDefinitions.map((t) => t.name));

export function isHologramContentToolName(name: string): boolean {
  return HOLOGRAM_CONTENT_NAMES.has(name);
}

// =============================================================================
// Composition Builder
// =============================================================================

export interface VisualizeQueryResultRow {
  label: string;
  value: number;
  color?: string;
}

function clampValue(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function sanitizeLabel(s: unknown): string {
  if (typeof s !== 'string') return '';
  // Strip control chars + quote chars that would break the .holo string literal.
  return s.replace(/[\x00-\x1f"\\]/g, '').slice(0, 64);
}

const SAFE_COLOR_PATTERN =
  /^(?:#?[0-9a-fA-F]{3,8}|hsl\(\s*\d{1,3}(?:\.\d+)?(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\))$/;

function sanitizeColor(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const trimmed = s.trim();
  return SAFE_COLOR_PATTERN.test(trimmed) ? trimmed : undefined;
}

function defaultColor(idx: number, total: number): string {
  // Teal -> Violet gradient (HSL h: 170 -> 280)
  const h = total <= 1 ? 200 : 170 + (110 * idx) / (total - 1);
  return `hsl(${h.toFixed(0)}, 75%, 55%)`;
}

function parseRows(raw: unknown): VisualizeQueryResultRow[] {
  if (!Array.isArray(raw)) {
    throw new Error('visualize_query_result: rows must be an array');
  }
  if (raw.length === 0) {
    throw new Error('visualize_query_result: rows must contain at least one row');
  }
  const rows: VisualizeQueryResultRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      throw new Error(`visualize_query_result: rows[${i}] must be an object`);
    }
    const obj = item as Record<string, unknown>;
    const label = sanitizeLabel(obj.label);
    if (!label) {
      throw new Error(`visualize_query_result: rows[${i}].label must be a non-empty string`);
    }
    const value = clampValue(obj.value);
    const color = sanitizeColor(obj.color);
    rows.push({ label, value, color });
  }
  return rows;
}

/**
 * Build a .holo composition rendering `rows` as 3D bars. The composition is
 * deliberately minimal - anchor object + one bar per row + label billboards -
 * so the renderer can parse + display it without external assets.
 */
export function buildVisualizeQueryResultHolo(
  rows: VisualizeQueryResultRow[],
  title: string | undefined,
  scale: number
): string {
  const total = rows.length;
  const spacing = 0.4;
  const totalWidth = total * spacing;
  const x0 = -totalWidth / 2 + spacing / 2;
  const safeTitle = sanitizeLabel(title);

  const lines: string[] = [];
  lines.push(`composition "QueryResult${safeTitle ? ` - ${safeTitle}` : ''}" {`);
  lines.push('  environment {');
  lines.push('    skybox: "studio"');
  lines.push('    ambient_light: 0.4');
  lines.push('  }');
  lines.push('');

  // Origin / floor
  lines.push('  object "QueryFloor" {');
  lines.push('    geometry: "plane"');
  lines.push('    position: [0, 0, 0]');
  lines.push(`    scale: [${(totalWidth + spacing).toFixed(3)}, 0.01, ${spacing.toFixed(3)}]`);
  lines.push('    color: "#1a1a2e"');
  lines.push('  }');
  lines.push('');

  // Title billboard
  if (safeTitle) {
    lines.push('  object "QueryTitle" {');
    lines.push(`    @text { value: "${safeTitle}", size: 0.12 }`);
    lines.push('    @billboard { mode: "camera-facing" }');
    lines.push(`    position: [0, ${(spacing + 0.6).toFixed(3)}, 0]`);
    lines.push('  }');
    lines.push('');
  }

  // Bars
  for (let i = 0; i < total; i++) {
    const r = rows[i];
    const label = sanitizeLabel(r.label) || `row-${i + 1}`;
    const value = clampValue(r.value);
    const x = (x0 + i * spacing).toFixed(3);
    const height = Math.max(value * scale, 0.01);
    const h = height.toFixed(3);
    const halfH = (height / 2).toFixed(3);
    const color = sanitizeColor(r.color) ?? defaultColor(i, total);

    lines.push(`  object "QueryBar_${i}" {`);
    lines.push('    geometry: "box"');
    lines.push(`    position: [${x}, ${halfH}, 0]`);
    lines.push(`    scale: [${(spacing * 0.6).toFixed(3)}, ${h}, ${(spacing * 0.6).toFixed(3)}]`);
    lines.push(`    color: "${color}"`);
    lines.push('  }');

    // Bar label billboard
    lines.push(`  object "QueryLabel_${i}" {`);
    lines.push(`    @text { value: "${label}", size: 0.06 }`);
    lines.push('    @billboard { mode: "camera-facing" }');
    lines.push(`    position: [${x}, -0.08, 0]`);
    lines.push('  }');

    // Value billboard above bar
    lines.push(`  object "QueryValue_${i}" {`);
    lines.push(`    @text { value: "${value.toFixed(2)}", size: 0.05 }`);
    lines.push('    @billboard { mode: "camera-facing" }');
    lines.push(`    position: [${x}, ${(parseFloat(h) + 0.08).toFixed(3)}, 0]`);
    lines.push('  }');
  }

  lines.push('}');
  return lines.join('\n');
}

function buildSummaryText(rows: VisualizeQueryResultRow[], title: string | undefined): string {
  const t = title ? `${title}: ` : '';
  const top = [...rows].sort((a, b) => b.value - a.value).slice(0, 3);
  const summary = top.map((r) => `${r.label}=${r.value.toFixed(2)}`).join(', ');
  return `${t}${rows.length} row(s). Top: ${summary}. Hologram-aware clients render this as a 3D bar chart; chat-only clients see this text.`;
}

// =============================================================================
// Handler
// =============================================================================

export async function handleHologramContentTool(
  name: string,
  args: Record<string, unknown>
): Promise<HologramMcpResponse> {
  if (name !== 'visualize_query_result') {
    throw new Error(`Unknown hologram-content tool: ${name}`);
  }

  const rows = parseRows(args.rows);
  const title =
    typeof args.title === 'string' && args.title.trim() ? args.title.trim() : undefined;
  const scale =
    typeof args.scale === 'number' && Number.isFinite(args.scale) && args.scale > 0
      ? args.scale
      : 0.02;

  const holoCode = buildVisualizeQueryResultHolo(rows, title, scale);
  const text = buildSummaryText(rows, title);

  return buildHologramMcpResponse({
    contentType: HOLOGRAM_CONTENT_TYPES.holo,
    payload: { kind: 'holo-code', holoCode },
    text,
    producedBy: 'visualize_query_result',
    label: title ?? 'Query Result',
    caption: `${rows.length} row(s) rendered as 3D bars`,
    hints: { preferredViewer: 'auto', animate: true },
    extraMeta: { rowCount: rows.length, scale },
  });
}
