/**
 * Brittney Session
 *
 * Manages conversation history and builds the scene context payload
 * sent to the LLM with each message.
 */

import type { SceneNode } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrittneyMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BrittneyStreamEvent {
  type: 'text' | 'tool_call' | 'error' | 'done';
  payload: unknown;
}

export interface ToolCallPayload {
  name: string;
  arguments: Record<string, unknown>;
}

// ─── Context serializer ───────────────────────────────────────────────────────

/**
 * Converts the current SceneNode array into a compact text summary
 * that fits in the system prompt without overwhelming the context window.
 */
export function buildSceneContext(nodes: SceneNode[], selectedId: string | null): string {
  if (nodes.length === 0) return 'Scene is empty — no objects yet.';

  const lines: string[] = [`Scene contains ${nodes.length} object(s):`];

  for (const node of nodes) {
    const traitList =
      node.traits.length === 0
        ? 'no traits'
        : node.traits
            .map((t) => {
              const props = Object.entries(t.properties)
                .slice(0, 3)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ');
              return `@${t.name}${props ? `(${props})` : ''}`;
            })
            .join(', ');

    const selected = node.id === selectedId ? ' [SELECTED]' : '';
    lines.push(`  - "${node.name}" (${node.type})${selected}: ${traitList}`);
  }

  return lines.join('\n');
}

/**
 * Rich context builder — includes the raw .holo code so Brittney can
 * directly read and modify the scene source. Prioritises code over the
 * node graph summary when both are available.
 */
export function buildRichContext(
  code: string,
  nodes: SceneNode[],
  selectedId: string | null,
  selectedName: string | null
): string {
  const sections: string[] = [];

  // Selected object hint
  if (selectedName) {
    sections.push(`Currently selected object: "${selectedName}"`);
  } else {
    sections.push('No object is currently selected.');
  }

  // Node graph summary (compact)
  if (nodes.length > 0) {
    sections.push(buildSceneContext(nodes, selectedId));
  }

  // Full scene source — the ground truth
  if (code.trim()) {
    const truncated = code.length > 4000 ? code.slice(0, 4000) + '\n… (truncated)' : code;
    sections.push(`\nFull scene code (HoloScript):\n\`\`\`holoscript\n${truncated}\n\`\`\``);
  } else {
    sections.push('\nScene code is empty. You can create objects with createObject().');
  }

  return sections.join('\n\n');
}

// ─── Stream consumer ──────────────────────────────────────────────────────────

/**
 * Calls POST /api/brittney and yields parsed SSE events.
 */
export async function* streamBrittney(
  messages: BrittneyMessage[],
  sceneContext: string
): AsyncGenerator<BrittneyStreamEvent> {
  const response = await fetch('/api/brittney', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, sceneContext }),
  });

  if (!response.ok || !response.body) {
    yield { type: 'error', payload: `API error ${response.status}: ${response.statusText}` };
    yield { type: 'done', payload: null };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as BrittneyStreamEvent;
        yield event;
        if (event.type === 'done') return;
      } catch {
        // malformed chunk — skip
      }
    }
  }
}
