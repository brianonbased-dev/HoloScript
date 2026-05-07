import { describe, expect, it } from 'vitest';
import {
  HOLOGRAM_CONTENT_TYPES,
  HOLOGRAM_MCP_VERSION,
  buildHologramMcpResponse,
  detectHologramContent,
  validateHologramMcpResponse,
  wrapHologramMcpEnvelope,
} from '../hologram-mcp';

const CREATED_AT = '2026-05-07T00:00:00.000Z';

function makeResponse() {
  return buildHologramMcpResponse({
    contentType: HOLOGRAM_CONTENT_TYPES.holo,
    payload: { kind: 'hash', hash: 'sha256:test-hologram' },
    text: 'Hologram ready',
    producedBy: 'unit-test',
    createdAt: CREATED_AT,
    label: 'Evidence hologram',
    hints: { preferredViewer: 'auto', animate: false },
  });
}

describe('hologram MCP schema', () => {
  it('builds a valid deterministic hologram response', () => {
    const response = makeResponse();

    expect(response.content_type).toBe(HOLOGRAM_CONTENT_TYPES.holo);
    expect(response.version).toBe(HOLOGRAM_MCP_VERSION);
    expect(response.meta.createdAt).toBe(CREATED_AT);
    expect(validateHologramMcpResponse(response)).toEqual({ ok: true, errors: [] });
  });

  it('accepts url and holo-code payload references', () => {
    expect(
      validateHologramMcpResponse(
        buildHologramMcpResponse({
          contentType: HOLOGRAM_CONTENT_TYPES.mvhevc,
          payload: { kind: 'url', url: 'https://assets.example/hologram.mp4' },
          text: 'Spatial video ready',
          producedBy: 'unit-test',
          createdAt: CREATED_AT,
        })
      ).ok
    ).toBe(true);

    expect(
      validateHologramMcpResponse(
        buildHologramMcpResponse({
          contentType: HOLOGRAM_CONTENT_TYPES.holo,
          payload: { kind: 'holo-code', holoCode: 'composition Demo {}' },
          text: 'Composition ready',
          producedBy: 'unit-test',
          createdAt: CREATED_AT,
        })
      ).ok
    ).toBe(true);
  });

  it('returns structured validation errors for malformed responses', () => {
    const result = validateHologramMcpResponse({
      content_type: 'text/plain',
      payload: { kind: 'hash', hash: '' },
      meta: { producedBy: '', createdAt: '' },
      text: '',
      version: '9.0',
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining([
        'content_type',
        'payload.hash',
        'meta.producedBy',
        'meta.createdAt',
        'text',
        'version',
      ])
    );
  });

  it('wraps responses in an MCP-compatible envelope', () => {
    const response = makeResponse();
    const envelope = wrapHologramMcpEnvelope(response);

    expect(envelope.hologramContent).toBe(response);
    expect(envelope.content).toHaveLength(1);
    expect(JSON.parse(envelope.content[0]?.text ?? '{}')).toMatchObject({
      content_type: HOLOGRAM_CONTENT_TYPES.holo,
      version: HOLOGRAM_MCP_VERSION,
    });
  });

  it('detects raw, typed-channel, and legacy text-only hologram payloads', () => {
    const response = makeResponse();
    const envelope = wrapHologramMcpEnvelope(response);

    expect(detectHologramContent(response)).toBe(response);
    expect(detectHologramContent(envelope)).toBe(response);
    expect(
      detectHologramContent({
        content: [{ type: 'text', text: JSON.stringify(response) }],
      })
    ).toEqual(response);

    expect(detectHologramContent({ content: [{ type: 'text', text: 'not json' }] })).toBeNull();
  });
});
