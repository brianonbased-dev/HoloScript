import { describe, expect, it } from 'vitest';

import * as reconstruction from '../index';

describe('@holoscript/core/reconstruction public exports', () => {
  it('exports the agent-inference perceiver consumed by MCP server', () => {
    expect(reconstruction.deriveAgentInferencePerception).toBeTypeOf('function');
  });
});
