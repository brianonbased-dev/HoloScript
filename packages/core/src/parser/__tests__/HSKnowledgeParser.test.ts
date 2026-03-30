import { describe, it, expect } from 'vitest';
import { parseKnowledge, parsePrompts, parseServerRoutes, parseMeta } from '../HSKnowledgeParser';

// ============================================================================
// parseMeta
// ============================================================================

describe('parseMeta', () => {
  it('extracts id, name, and version from meta block', () => {
    const source = `
meta {
  id: "test-kb"
  name: "Test Knowledge Base"
  version: "2.0.0"
}
    `;
    const meta = parseMeta(source);
    expect(meta.id).toBe('test-kb');
    expect(meta.name).toBe('Test Knowledge Base');
    expect(meta.version).toBe('2.0.0');
  });

  it('returns defaults when no meta block found', () => {
    const meta = parseMeta('no meta here');
    expect(meta.id).toBe('unknown');
    expect(meta.name).toBe('Unknown');
    expect(meta.version).toBe('1.0.0');
  });

  it('returns defaults for empty string', () => {
    const meta = parseMeta('');
    expect(meta.id).toBe('unknown');
  });
});

// ============================================================================
// parseKnowledge
// ============================================================================

describe('parseKnowledge', () => {
  const sampleKnowledge = `
meta {
  id: "holoscript-kb"
  name: "HoloScript Knowledge"
  version: "1.0.0"
}

chunk materials {
  category: "rendering"
  keywords: ["pbr", "material", "shader"]
  description: "Material system overview"
  example: \`\`\`
    @material {
      roughness: 0.5
    }
  \`\`\`
}

chunk physics {
  category: "simulation"
  keywords: ["gravity", "collision", "rigidbody"]
  description: "Physics engine basics"
  example: \`\`\`
    @trait {
      mass: 1.0
    }
  \`\`\`
}
`;

  it('extracts meta from knowledge file', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.meta.id).toBe('holoscript-kb');
    expect(result.meta.name).toBe('HoloScript Knowledge');
  });

  it('parses all chunks', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.chunks).toHaveLength(2);
  });

  it('extracts chunk IDs', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.chunks[0].id).toBe('materials');
    expect(result.chunks[1].id).toBe('physics');
  });

  it('extracts categories and builds category list', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.categories).toContain('rendering');
    expect(result.categories).toContain('simulation');
  });

  it('extracts keywords as arrays', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.chunks[0].keywords).toEqual(['pbr', 'material', 'shader']);
  });

  it('extracts descriptions', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.chunks[0].description).toBe('Material system overview');
  });

  it('extracts example content from triple backticks', () => {
    // Build sample with real backticks (avoids template literal escaping issues)
    const bt = '`'.repeat(3);
    const withExample = [
      'meta { id: "t" name: "T" version: "1" }',
      'chunk demo {',
      '  category: "test"',
      '  keywords: ["a"]',
      '  description: "Demo"',
      `  example: ${bt}`,
      '    @material { roughness: 0.5 }',
      `  ${bt}`,
      '}',
    ].join('\n');
    const result = parseKnowledge(withExample);
    expect(result.chunks[0].content).toContain('@material');
    expect(result.chunks[0].content).toContain('roughness');
  });

  it('preserves the raw source string', () => {
    const result = parseKnowledge(sampleKnowledge);
    expect(result.raw).toBe(sampleKnowledge);
  });

  it('returns empty chunks for content with no chunk blocks', () => {
    const result = parseKnowledge('meta { id: "empty" name: "E" version: "1" }');
    expect(result.chunks).toHaveLength(0);
    expect(result.categories).toHaveLength(0);
  });
});

// ============================================================================
// parsePrompts
// ============================================================================

describe('parsePrompts', () => {
  const samplePrompts = `
meta {
  id: "brittney-prompts"
  name: "Brittney Prompt Config"
  version: "1.0.0"
  modes: ["creative", "technical", "casual"]
}

prompt creative {
  role: "assistant"
  name: "Brittney Creative"
  domain: "art"
  tone: "enthusiastic"
  instructions: \`\`\`
    Be creative and expressive.
    Use vivid imagery.
  \`\`\`
  output_format: \`\`\`
    Respond in markdown with examples.
  \`\`\`
}

prompt technical {
  role: "engineer"
  name: "Brittney Tech"
  domain: "code"
  tone: "precise"
  expertise: ["holoscript", "webgpu", "react"]
}
`;

  it('extracts meta from prompt file', () => {
    const result = parsePrompts(samplePrompts);
    expect(result.meta.id).toBe('brittney-prompts');
  });

  it('extracts modes from meta block', () => {
    const result = parsePrompts(samplePrompts);
    expect(result.modes).toEqual(['creative', 'technical', 'casual']);
  });

  it('parses prompt blocks into a Map', () => {
    const result = parsePrompts(samplePrompts);
    expect(result.prompts.size).toBe(2);
    expect(result.prompts.has('creative')).toBe(true);
    expect(result.prompts.has('technical')).toBe(true);
  });

  it('extracts simple string properties (role, name, domain, tone)', () => {
    const result = parsePrompts(samplePrompts);
    const creative = result.prompts.get('creative')!;
    expect(creative.role).toBe('assistant');
    expect(creative.name).toBe('Brittney Creative');
    expect(creative.domain).toBe('art');
    expect(creative.tone).toBe('enthusiastic');
  });

  it('extracts multiline properties (instructions, output_format)', () => {
    const result = parsePrompts(samplePrompts);
    const creative = result.prompts.get('creative')!;
    expect(creative.instructions).toContain('Be creative');
    expect(creative.output_format).toContain('Respond in markdown');
  });

  it('extracts array properties (expertise)', () => {
    const result = parsePrompts(samplePrompts);
    const technical = result.prompts.get('technical')!;
    expect(technical['expertise']).toEqual(['holoscript', 'webgpu', 'react']);
  });

  it('sets prompt id from block name', () => {
    const result = parsePrompts(samplePrompts);
    const creative = result.prompts.get('creative')!;
    expect(creative.id).toBe('creative');
  });

  it('returns empty prompts Map for content with no prompt blocks', () => {
    const result = parsePrompts('meta { id: "empty" name: "E" version: "1" }');
    expect(result.prompts.size).toBe(0);
  });
});

// ============================================================================
// parseServerRoutes
// ============================================================================

describe('parseServerRoutes', () => {
  const sampleServer = `
meta {
  id: "brittney-server"
  name: "Brittney API"
  version: "1.0.0"
}

port: 11435

POST /api/chat {
  description: "Send a chat message"
  handler: handleChat
}

GET /api/health {
  description: "Health check endpoint"
  handler: handleHealth
}

WS /ws/stream {
  description: "WebSocket streaming"
  handler: handleStream
}

switch_endpoint {
  enum: ["openai", "anthropic", "local"]
}
`;

  it('extracts meta from server file', () => {
    const result = parseServerRoutes(sampleServer);
    expect(result.meta.id).toBe('brittney-server');
  });

  it('extracts port number', () => {
    const result = parseServerRoutes(sampleServer);
    expect(result.port).toBe(11435);
  });

  it('defaults port to 11435 when not specified', () => {
    const result = parseServerRoutes('meta { id: "x" name: "X" version: "1" }');
    expect(result.port).toBe(11435);
  });

  it('parses POST, GET, and WS routes', () => {
    const result = parseServerRoutes(sampleServer);
    expect(result.routes).toHaveLength(3);
  });

  it('extracts route method and path', () => {
    const result = parseServerRoutes(sampleServer);
    const post = result.routes.find((r) => r.method === 'POST');
    expect(post).toBeDefined();
    expect(post!.path).toBe('/api/chat');
  });

  it('extracts route description and handler', () => {
    const result = parseServerRoutes(sampleServer);
    const get = result.routes.find((r) => r.method === 'GET');
    expect(get).toBeDefined();
    expect(get!.description).toBe('Health check endpoint');
    expect(get!.handler).toBe('handleHealth');
  });

  it('extracts WS route', () => {
    const result = parseServerRoutes(sampleServer);
    const ws = result.routes.find((r) => r.method === 'WS');
    expect(ws).toBeDefined();
    expect(ws!.path).toBe('/ws/stream');
    expect(ws!.handler).toBe('handleStream');
  });

  it('extracts provider enum values', () => {
    const result = parseServerRoutes(sampleServer);
    expect(result.providers).toEqual(['openai', 'anthropic', 'local']);
  });

  it('returns empty routes for content with no route blocks', () => {
    const result = parseServerRoutes('meta { id: "empty" name: "E" version: "1" }');
    expect(result.routes).toHaveLength(0);
  });
});
