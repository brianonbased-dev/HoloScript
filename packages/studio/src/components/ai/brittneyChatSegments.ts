import type { ToolResult } from '@/lib/brittney';

export type BrittneyChatSegment =
  | { id: string; kind: 'text'; text: string }
  | { id: string; kind: 'toolResults'; results: ToolResult[] };

export function buildChatSegments(
  text: string,
  toolResults: ToolResult[] = []
): BrittneyChatSegment[] {
  const segments: BrittneyChatSegment[] = [];
  if (text.length > 0) {
    segments.push({ id: 'text-0', kind: 'text', text });
  }
  if (toolResults.length > 0) {
    segments.push({ id: `tools-${segments.length}`, kind: 'toolResults', results: toolResults });
  }
  return segments;
}

export function appendTextSegment(
  segments: BrittneyChatSegment[] | undefined,
  text: string
): BrittneyChatSegment[] {
  const current = segments ?? [];
  if (text.length === 0) return current;

  const last = current[current.length - 1];
  if (last?.kind === 'text') {
    return [
      ...current.slice(0, -1),
      {
        ...last,
        text: last.text + text,
      },
    ];
  }

  return [...current, { id: `text-${current.length}`, kind: 'text', text }];
}

export function appendToolResultSegment(
  segments: BrittneyChatSegment[] | undefined,
  result: ToolResult
): BrittneyChatSegment[] {
  const current = segments ?? [];
  const last = current[current.length - 1];
  if (last?.kind === 'toolResults') {
    return [
      ...current.slice(0, -1),
      {
        ...last,
        results: [...last.results, result],
      },
    ];
  }

  return [...current, { id: `tools-${current.length}`, kind: 'toolResults', results: [result] }];
}

export function updateToolResultSegment(
  segments: BrittneyChatSegment[] | undefined,
  resultIndex: number,
  update: (result: ToolResult) => ToolResult
): BrittneyChatSegment[] | undefined {
  if (resultIndex < 0) return segments;

  let remaining = resultIndex;
  let changed = false;
  const next = (segments ?? []).map((segment) => {
    if (segment.kind === 'text') return segment;
    if (changed) return segment;
    if (remaining >= segment.results.length) {
      remaining -= segment.results.length;
      return segment;
    }

    changed = true;
    return {
      ...segment,
      results: segment.results.map((result, index) =>
        index === remaining ? update(result) : result
      ),
    };
  });

  return changed ? next : segments;
}
