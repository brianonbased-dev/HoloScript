import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const envKeys = [
  'NEXT_PUBLIC_STUDIO_URL',
  'NEXT_PUBLIC_API_BASE_URL',
  'A2A_AGENT_ID',
  'A2A_AGENT_NAME',
  'A2A_AGENT_VERSION',
  'A2A_AGENT_DESCRIPTION',
  'A2A_AGENT_CAPABILITIES',
  'A2A_AGENT_SKILLS',
  'A2A_AGENT_PROVIDER_ORG',
  'A2A_AGENT_PROVIDER_URL',
] as const;

function clearAgentCardEnv() {
  for (const key of envKeys) {
    delete process.env[key];
  }
}

describe('/.well-known/agent-card.json route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearAgentCardEnv();
  });

  it('returns a canonical A2A card with required fields', async () => {
    const req = new NextRequest('https://studio.holoscript.net/.well-known/agent-card.json');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=300');

    expect(body.protocol).toBe('a2a');
    expect(body.schemaVersion).toBe('1.0');
    expect(body.id).toBe('holoscript-studio');

    expect(body.endpoint).toBe('https://studio.holoscript.net/api/a2a');
    expect(body.provider.organization).toBe('HoloScript');
    expect(body.provider.url).toBe('https://holoscript.net');

    expect(Array.isArray(body.skills)).toBe(true);
    expect(body.skills.length).toBeGreaterThan(0);
    expect(body.skills[0]).toHaveProperty('id');
    expect(body.skills[0]).toHaveProperty('name');

    expect(body.securitySchemes).toHaveProperty('bearerAuth');
    expect(Array.isArray(body.security)).toBe(true);
    expect(body.security[0]).toEqual({ bearerAuth: [] });

    expect(body.defaultInputModes).toContain('application/json');
    expect(body.defaultOutputModes).toContain('application/holoscript');

    // Compatibility fields remain available for older consumers.
    expect(body.url).toBe('https://studio.holoscript.net');
    expect(body.endpoints).toHaveProperty('tasks');
    expect(body.authentication.schemes).toContain('Bearer');
  });

  it('honors environment overrides for agent metadata', async () => {
    process.env.NEXT_PUBLIC_STUDIO_URL = 'https://example.com';
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com';
    process.env.A2A_AGENT_ID = 'custom-agent';
    process.env.A2A_AGENT_NAME = 'Custom Agent';
    process.env.A2A_AGENT_VERSION = '9.9.9';
    process.env.A2A_AGENT_DESCRIPTION = 'Custom description';
    process.env.A2A_AGENT_CAPABILITIES = 'submit_task,status';
    process.env.A2A_AGENT_SKILLS = 'Skill A,Skill B';
    process.env.A2A_AGENT_PROVIDER_ORG = 'Custom Org';
    process.env.A2A_AGENT_PROVIDER_URL = 'https://custom.example';

    const req = new NextRequest('https://ignored.example/.well-known/agent-card.json');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('custom-agent');
    expect(body.name).toBe('Custom Agent');
    expect(body.version).toBe('9.9.9');
    expect(body.description).toBe('Custom description');
    expect(body.endpoint).toBe('https://api.example.com/a2a');

    expect(body.provider.organization).toBe('Custom Org');
    expect(body.provider.url).toBe('https://custom.example');

    expect(body.legacyCapabilities).toEqual(['submit_task', 'status']);
    expect(body.skills.map((s: { name: string }) => s.name)).toEqual(['Skill A', 'Skill B']);
  });
});
