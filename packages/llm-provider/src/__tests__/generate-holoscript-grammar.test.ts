import { describe, expect, it } from 'vitest';
import { BaseLLMAdapter } from '../base-adapter';
import type { LLMCompletionRequest, LLMCompletionResponse } from '../types';

/**
 * Task rnbt — a grammar on a HoloScript generation request reaches `complete()`, where
 * the local OpenAI-compatible adapter forwards it to llama.cpp. Without the pass-through
 * the MCP generators could hand the grammar over and nothing would ever constrain decoding.
 */
class RecordingAdapter extends BaseLLMAdapter {
  readonly name = 'mock' as const;
  readonly models = ['test-model'] as const;
  readonly defaultHoloScriptModel = 'test-model';
  readonly requests: LLMCompletionRequest[] = [];

  protected getDefaultModel(): string {
    return 'test-model';
  }

  async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    this.requests.push(request);
    return {
      content: 'composition "Lamp" {\n  object "lamp" {\n    geometry: "sphere"\n  }\n}',
    } as unknown as LLMCompletionResponse;
  }
}

describe('BaseLLMAdapter.generateHoloScript — grammar pass-through', () => {
  it('forwards the request grammar to complete()', async () => {
    const adapter = new RecordingAdapter({ apiKey: 'test' });
    await adapter.generateHoloScript({
      prompt: 'a lamp',
      targetFormat: 'holo',
      grammar: 'root ::= "x"',
    });
    expect(adapter.requests).toHaveLength(1);
    expect(adapter.requests[0].grammar).toBe('root ::= "x"');
  });

  it('sends no grammar field when the request has none', async () => {
    const adapter = new RecordingAdapter({ apiKey: 'test' });
    await adapter.generateHoloScript({ prompt: 'a lamp', targetFormat: 'holo' });
    expect(adapter.requests[0]).not.toHaveProperty('grammar');
  });
});
