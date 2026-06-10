/**
 * Raw-JSON tool-call rescue — parser.
 *
 * Small/sovereign models sometimes emit a tool invocation as plain text
 * ({"name":"…","arguments":{…}}, optionally ```-fenced) instead of a native
 * tool_use block — the turn then ends with raw JSON in the chat and nothing
 * executed (founder repro 2026-06-10: a turn ending in {"name":"tend_garden"}
 * — a scene action from garden.holo, not a tool). The Brittney route uses
 * this parser to detect that shape and recover instead of stalling.
 */

/**
 * Detect an assistant reply that is NOTHING BUT a JSON tool invocation.
 * Conservative by design: surrounding prose, arrays, or unexpected keys
 * disqualify, so ordinary answers that merely contain JSON are never rescued.
 */
export function parseTextToolCall(
  text: string
): { name: string; args: Record<string, unknown> } | null {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    const obj = JSON.parse(t) as unknown;
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
    const record = obj as Record<string, unknown>;
    if (typeof record['name'] !== 'string' || record['name'].length === 0) return null;
    const allowedKeys = new Set(['name', 'arguments', 'parameters', 'input', 'id', 'type']);
    if (Object.keys(record).some((k) => !allowedKeys.has(k))) return null;
    const argsRaw = record['arguments'] ?? record['parameters'] ?? record['input'] ?? {};
    if (typeof argsRaw !== 'object' || argsRaw === null || Array.isArray(argsRaw)) return null;
    return { name: record['name'], args: argsRaw as Record<string, unknown> };
  } catch {
    return null;
  }
}
