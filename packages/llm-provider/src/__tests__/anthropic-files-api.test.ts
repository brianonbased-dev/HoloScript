/**
 * AnthropicAdapter — Files API upload + file_id content blocks
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { streamCalls, uploadCalls } = vi.hoisted(() => ({
  streamCalls: [] as Array<{ body: Record<string, unknown>; options?: Record<string, unknown> }>,
  uploadCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    public readonly beta = {
      files: {
        upload: async (args: Record<string, unknown>) => {
          uploadCalls.push(args);
          return {
            id: 'file_123',
            type: 'file' as const,
            filename: 'lean-docs.pdf',
            mime_type: 'application/pdf',
            size_bytes: 1024,
            created_at: '2026-05-12T00:00:00Z',
            downloadable: false,
          };
        },
      },
    };

    public readonly messages = {
      stream: (body: Record<string, unknown>, options?: Record<string, unknown>) => {
        streamCalls.push({ body, options });
        return {
          finalMessage: async () => ({
            content: [{ type: 'text' as const, text: 'ok' }],
            usage: { input_tokens: 1, output_tokens: 1 },
            model: (body.model as string) ?? 'claude-opus-4-7',
            stop_reason: 'end_turn',
          }),
          get request_id() { return 'req_files_test'; },
          get response() { return { headers: new Headers() }; },
        };
      },
    };

    constructor(_config: Record<string, unknown>) {
      // no-op
    }
  }
  return { default: MockAnthropic };
});

import {
  AnthropicAdapter,
  ANTHROPIC_FILES_BETA,
  collectAnthropicBetaHeaders,
} from '../adapters/anthropic';
import { anthropicFileContentBlock } from '../types';
import type { LLMCompletionRequest } from '../types';

describe('AnthropicAdapter Files API', () => {
  beforeEach(() => {
    streamCalls.length = 0;
    uploadCalls.length = 0;
  });

  it('uploadFile calls beta.files.upload with the Files API beta and maps metadata', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });

    const metadata = await adapter.uploadFile({ file: { name: 'lean-docs.pdf' } });

    expect(uploadCalls).toHaveLength(1);
    expect(uploadCalls[0]).toMatchObject({
      file: { name: 'lean-docs.pdf' },
      betas: [ANTHROPIC_FILES_BETA],
    });
    expect(metadata).toMatchObject({
      id: 'file_123',
      type: 'file',
      filename: 'lean-docs.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      createdAt: '2026-05-12T00:00:00Z',
      downloadable: false,
    });
  });

  it('document file_id blocks pass through messages.stream with the Files API beta header', async () => {
    const adapter = new AnthropicAdapter({ apiKey: 'test-key' });
    const documentBlock = anthropicFileContentBlock('file_123', 'document', {
      title: 'Lean Docs',
      citations: { enabled: true },
    });

    await adapter.complete({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Summarize this.' },
            documentBlock,
          ],
        },
      ],
    });

    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].options).toEqual({
      headers: { 'anthropic-beta': ANTHROPIC_FILES_BETA },
    });

    const messages = streamCalls[0].body.messages as Array<Record<string, unknown>>;
    const content = messages[0].content as Array<Record<string, unknown>>;
    expect(content[1]).toEqual({
      type: 'document',
      source: { type: 'file', file_id: 'file_123' },
      title: 'Lean Docs',
      citations: { enabled: true },
    });
  });

  it('container_upload blocks trigger a deduped Files API beta token', () => {
    const request: LLMCompletionRequest = {
      messages: [
        {
          role: 'user',
          content: [anthropicFileContentBlock('file_dataset', 'container_upload')],
        },
      ],
      provider: {
        anthropic: {
          betaHeaders: [ANTHROPIC_FILES_BETA, 'custom-beta-2026-01-01'],
        },
      },
    };

    expect(collectAnthropicBetaHeaders(request)).toEqual([
      ANTHROPIC_FILES_BETA,
      'custom-beta-2026-01-01',
    ]);
  });
});
