/**
 * Codebase-brain answers reach agents short, and following the offered
 * follow-up returns everything the short answer said it left out
 * (2026-10-05; see absorb-service/src/mcp/agent-brief.ts).
 */
import { describe, expect, it } from 'vitest';
import { _handleSingleToolLogic } from '../index';

function body(response: unknown): Record<string, unknown> {
  const text = (response as { content: Array<{ text: string }> }).content[0].text;
  return JSON.parse(text) as Record<string, unknown>;
}

describe('agent-facing codebase answers through the server dispatch', () => {
  it('holo_graph_status is brief by default, and its full follow-up returns every omitted field', async () => {
    const brief = body(await _handleSingleToolLogic('holo_graph_status', {}));
    expect(brief.detail).toBe('brief');
    expect(typeof brief.answer).toBe('string');
    const omitted = brief.omitted as string[];
    const followUps = brief.followUps as Array<{ tool: string; args: Record<string, unknown> }>;
    const full = followUps.find((f) => f.args.detail === 'full');
    expect(full, JSON.stringify(brief).slice(0, 400)).toBeDefined();

    const complete = body(await _handleSingleToolLogic(full!.tool, full!.args));
    expect(complete.detail).toBeUndefined();
    for (const key of omitted.filter((k) => !k.includes(' '))) {
      expect(complete, `omitted key ${key} missing from the full answer`).toHaveProperty(key);
    }
    expect(JSON.stringify(brief).length).toBeLessThan(JSON.stringify(complete).length / 3);
  }, 120_000);

  it('leaves other tools untouched', async () => {
    const parsed = body(
      await _handleSingleToolLogic('parse_hs', { code: 'composition "B" { object "C" { geometry: "cube" } }' })
    );
    expect(parsed.detail).toBeUndefined();
  }, 120_000);
});
