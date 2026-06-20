import { describe, expect, it } from 'vitest';
import type { ToolResult } from '@/lib/brittney';
import {
  appendTextSegment,
  appendToolResultSegment,
  buildChatSegments,
  updateToolResultSegment,
} from '../brittneyChatSegments';

function tool(toolName: string, success = true): ToolResult {
  return {
    tool: toolName,
    success,
    message: `${toolName} ${success ? 'ok' : 'failed'}`,
  };
}

describe('brittneyChatSegments', () => {
  it('keeps text chunks together until a tool result starts a new segment', () => {
    let segments = appendTextSegment(undefined, 'First ');
    segments = appendTextSegment(segments, 'round.');
    segments = appendToolResultSegment(segments, tool('create_object'));
    segments = appendTextSegment(segments, 'Second round.');

    expect(segments).toEqual([
      { id: 'text-0', kind: 'text', text: 'First round.' },
      {
        id: 'tools-1',
        kind: 'toolResults',
        results: [tool('create_object')],
      },
      { id: 'text-2', kind: 'text', text: 'Second round.' },
    ]);
  });

  it('groups consecutive tool results without flattening later text', () => {
    let segments = appendTextSegment(undefined, 'I will run tools.');
    segments = appendToolResultSegment(segments, tool('search'));
    segments = appendToolResultSegment(segments, tool('write_file'));

    expect(segments).toEqual([
      { id: 'text-0', kind: 'text', text: 'I will run tools.' },
      {
        id: 'tools-1',
        kind: 'toolResults',
        results: [tool('search'), tool('write_file')],
      },
    ]);
  });

  it('updates a tool result by global result order across segments', () => {
    let segments = buildChatSegments('Before', [tool('first')]);
    segments = appendTextSegment(segments, ' after tools.');
    segments = appendToolResultSegment(segments, tool('second', false));
    segments = appendTextSegment(segments, ' final text.');
    segments = appendToolResultSegment(segments, tool('third', false));

    const updated = updateToolResultSegment(segments, 1, (result) => ({
      ...result,
      success: true,
      message: 'second ok now',
    }));

    expect(updated?.[3]).toEqual({
      id: 'tools-3',
      kind: 'toolResults',
      results: [{ tool: 'second', success: true, message: 'second ok now' }],
    });
    expect(updated?.[5]).toEqual({
      id: 'tools-5',
      kind: 'toolResults',
      results: [tool('third', false)],
    });
  });
});
