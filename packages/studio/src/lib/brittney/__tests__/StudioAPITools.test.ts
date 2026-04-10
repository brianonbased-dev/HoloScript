/**
 * Tests for StudioAPITools + StudioAPIExecutor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STUDIO_API_TOOLS, STUDIO_API_TOOL_NAMES } from '../StudioAPITools';
import type { StudioToolDefinition } from '../StudioAPITools';
import { executeStudioTool, isStudioAPITool } from '../StudioAPIExecutor';

// ─── Tool definitions ───────────────────────────────────────────────────────

describe('STUDIO_API_TOOLS', () => {
  it('exports a non-empty array of tool definitions', () => {
    expect(STUDIO_API_TOOLS.length).toBeGreaterThan(23);
  });

  it('every tool has the correct structure', () => {
    for (const tool of STUDIO_API_TOOLS) {
      expect(tool.type).toBe('function');
      expect(typeof tool.function.name).toBe('string');
      expect(tool.function.name.length).toBeGreaterThan(0);
      expect(typeof tool.function.description).toBe('string');
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect(tool.function.parameters.type).toBe('object');
    }
  });

  it('all tool names are unique', () => {
    const names = STUDIO_API_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('no tool name collides with scene tools', () => {
    const sceneToolNames = [
      'add_trait', 'remove_trait', 'set_trait_property', 'create_object', 'compose_traits',
      'mount_scenario_panel', 'delete_object', 'move_object', 'rotate_object', 'scale_object',
      'rename_object', 'duplicate_object', 'list_objects', 'get_object',
    ];
    for (const tool of STUDIO_API_TOOLS) {
      expect(sceneToolNames).not.toContain(tool.function.name);
    }
  });

  it('STUDIO_API_TOOL_NAMES matches STUDIO_API_TOOLS', () => {
    expect(STUDIO_API_TOOL_NAMES.size).toBe(STUDIO_API_TOOLS.length);
    for (const tool of STUDIO_API_TOOLS) {
      expect(STUDIO_API_TOOL_NAMES.has(tool.function.name)).toBe(true);
    }
  });

  it('required fields are arrays of strings', () => {
    for (const tool of STUDIO_API_TOOLS) {
      const required = tool.function.parameters.required;
      if (required) {
        expect(Array.isArray(required)).toBe(true);
        for (const r of required) {
          expect(typeof r).toBe('string');
          // Required field should exist in properties
          expect(Object.keys(tool.function.parameters.properties)).toContain(r);
        }
      }
    }
  });
});

// ─── Tool categories ────────────────────────────────────────────────────────

describe('Tool categories', () => {
  function findTool(name: string): StudioToolDefinition | undefined {
    return STUDIO_API_TOOLS.find((t) => t.function.name === name);
  }

  it('has absorb tools', () => {
    expect(findTool('absorb_scan_repo')).toBeDefined();
    expect(findTool('absorb_get_status')).toBeDefined();
    expect(findTool('absorb_query')).toBeDefined();
    expect(findTool('absorb_get_credits')).toBeDefined();
  });

  it('has scaffold tools', () => {
    expect(findTool('scaffold_project')).toBeDefined();
    expect(findTool('workspace_import')).toBeDefined();
  });

  it('has generation tools', () => {
    expect(findTool('generate_code')).toBeDefined();
    expect(findTool('generate_material')).toBeDefined();
    expect(findTool('autocomplete')).toBeDefined();
    expect(findTool('critique_code')).toBeDefined();
  });

  it('has holomesh tools', () => {
    expect(findTool('holomesh_contribute')).toBeDefined();
    expect(findTool('holomesh_marketplace_search')).toBeDefined();
    expect(findTool('holomesh_team_join')).toBeDefined();
    expect(findTool('holomesh_team_board')).toBeDefined();
  });

  it('has export tools', () => {
    expect(findTool('export_scene')).toBeDefined();
    expect(findTool('export_gltf')).toBeDefined();
    expect(findTool('deploy_project')).toBeDefined();
  });

  it('has scene management tools', () => {
    expect(findTool('save_scene')).toBeDefined();
    expect(findTool('load_template')).toBeDefined();
    expect(findTool('get_examples')).toBeDefined();
    expect(findTool('get_prompts')).toBeDefined();
  });

  it('has daemon tools', () => {
    expect(findTool('start_daemon_job')).toBeDefined();
    expect(findTool('get_daemon_status')).toBeDefined();
  });

  it('has health/config tools', () => {
    expect(findTool('get_capabilities')).toBeDefined();
    expect(findTool('get_mcp_config')).toBeDefined();
  });

  it('has github file access tools', () => {
    expect(findTool('read_file')).toBeDefined();
    expect(findTool('search_code')).toBeDefined();
    expect(findTool('list_files')).toBeDefined();
  });

  it('read_file requires owner, repo, path', () => {
    const tool = findTool('read_file');
    expect(tool?.function.parameters.required).toEqual(['owner', 'repo', 'path']);
  });

  it('search_code requires owner, repo, query', () => {
    const tool = findTool('search_code');
    expect(tool?.function.parameters.required).toEqual(['owner', 'repo', 'query']);
  });

  it('list_files requires owner, repo', () => {
    const tool = findTool('list_files');
    expect(tool?.function.parameters.required).toEqual(['owner', 'repo']);
  });
});

// ─── isStudioAPITool ────────────────────────────────────────────────────────

describe('isStudioAPITool', () => {
  it('returns true for Studio API tools', () => {
    expect(isStudioAPITool('absorb_scan_repo')).toBe(true);
    expect(isStudioAPITool('generate_code')).toBe(true);
    expect(isStudioAPITool('deploy_project')).toBe(true);
    expect(isStudioAPITool('get_capabilities')).toBe(true);
  });

  it('returns false for scene tools', () => {
    expect(isStudioAPITool('add_trait')).toBe(false);
    expect(isStudioAPITool('create_object')).toBe(false);
    expect(isStudioAPITool('compose_traits')).toBe(false);
  });

  it('returns false for unknown tools', () => {
    expect(isStudioAPITool('nonexistent_tool')).toBe(false);
  });
});

// ─── executeStudioTool ──────────────────────────────────────────────────────

describe('executeStudioTool', () => {
  const BASE_URL = 'http://localhost:3000';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns error for unknown tool name', async () => {
    const result = await executeStudioTool('nonexistent_tool', {}, BASE_URL);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown Studio API tool');
  });

  it('calls GET endpoint for absorb_get_status', async () => {
    const mockData = { projects: [{ id: '1', name: 'test', status: 'complete' }] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await executeStudioTool('absorb_get_status', {}, BASE_URL);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/absorb/projects`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('calls POST endpoint for absorb_scan_repo with body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'proj_1', status: 'pending' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { repoUrl: 'https://github.com/user/repo', name: 'My Project' };
    const result = await executeStudioTool('absorb_scan_repo', args, BASE_URL);
    expect(result.success).toBe(true);

    const callArgs = vi.mocked(fetch).mock.calls[0];
    expect(callArgs[0]).toBe(`${BASE_URL}/api/absorb/projects`);
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ repoUrl: args.repoUrl, name: args.name });
  });

  it('handles HTTP error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );

    const result = await executeStudioTool('absorb_get_credits', {}, BASE_URL);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('handles fetch exceptions', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await executeStudioTool('absorb_get_credits', {}, BASE_URL);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });

  it('forwards auth headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const headers = { cookie: 'session=abc123', authorization: 'Bearer tok' };
    await executeStudioTool('get_capabilities', {}, BASE_URL, headers);

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const init = callArgs[1] as RequestInit;
    const fetchHeaders = init.headers as Record<string, string>;
    expect(fetchHeaders['cookie']).toBe('session=abc123');
    expect(fetchHeaders['authorization']).toBe('Bearer tok');
  });

  it('resolves dynamic path segments for team tools', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await executeStudioTool('holomesh_team_board', { teamId: 'team-42' }, BASE_URL);
    const callArgs = vi.mocked(fetch).mock.calls[0];
    expect(callArgs[0]).toBe(`${BASE_URL}/api/holomesh/team/team-42/board`);
  });

  it('builds query params for GET endpoints', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await executeStudioTool(
      'holomesh_marketplace_search',
      { query: 'physics', category: 'traits' },
      BASE_URL
    );
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const url = callArgs[0] as string;
    expect(url).toContain('q=physics');
    expect(url).toContain('category=traits');
  });

  it('handles generate_code POST with optional fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'scene "Test" {}' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { prompt: 'A cube with physics', existingCode: 'object "Cube" {}' };
    const result = await executeStudioTool('generate_code', args, BASE_URL);
    expect(result.success).toBe(true);

    const callArgs = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.prompt).toBe('A cube with physics');
    expect(body.existingCode).toBe('object "Cube" {}');
  });

  it('handles non-JSON responses gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('plain text response', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );

    const result = await executeStudioTool('get_examples', {}, BASE_URL);
    expect(result.success).toBe(true);
    expect(result.data).toBe('plain text response');
  });

  it('passes scaffold_project body through fully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const dna = {
      name: 'TestProject',
      repoUrl: 'https://github.com/test/proj',
      techStack: ['typescript'],
      frameworks: ['next.js'],
      languages: ['typescript'],
      packageCount: 3,
      testCoverage: 80,
      codeHealthScore: 7,
      compilationTargets: ['r3f'],
      traits: ['physics'],
    };

    await executeStudioTool('scaffold_project', dna, BASE_URL);
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.name).toBe('TestProject');
    expect(body.techStack).toEqual(['typescript']);
  });

  it('encodes special characters in team ID', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await executeStudioTool('holomesh_team_join', { teamId: 'team with spaces' }, BASE_URL);
    const callArgs = vi.mocked(fetch).mock.calls[0];
    const url = callArgs[0] as string;
    expect(url).toContain('team%20with%20spaces');
  });

  it('deploy_project passes code and optional params', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://deploy.example.com/abc' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { code: 'scene "Main" {}', name: 'MyApp', target: 'r3f' };
    const result = await executeStudioTool('deploy_project', args, BASE_URL);
    expect(result.success).toBe(true);

    const callArgs = vi.mocked(fetch).mock.calls[0];
    expect(callArgs[0]).toBe(`${BASE_URL}/api/deploy`);
    const body = JSON.parse((callArgs[1] as RequestInit).body as string);
    expect(body.code).toBe('scene "Main" {}');
    expect(body.name).toBe('MyApp');
    expect(body.target).toBe('r3f');
  });

  it('export_scene sends code and format', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ output: '<threejs code>' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { code: 'object "Box" {}', format: 'threejs' };
    const result = await executeStudioTool('export_scene', args, BASE_URL);
    expect(result.success).toBe(true);

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.code).toBe('object "Box" {}');
    expect(body.format).toBe('threejs');
  });

  // ─── GitHub file access tools ──────────────────────────────────────────────

  it('read_file calls GET /api/github/file with query params', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ path: 'src/index.ts', content: 'console.log("hi")' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { owner: 'user', repo: 'my-repo', path: 'src/index.ts' };
    const result = await executeStudioTool('read_file', args, BASE_URL);
    expect(result.success).toBe(true);

    const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(callUrl).toContain('/api/github/file');
    expect(callUrl).toContain('owner=user');
    expect(callUrl).toContain('repo=my-repo');
    expect(callUrl).toContain('path=src%2Findex.ts');

    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('GET');
  });

  it('search_code calls GET /api/github/search with query params', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ totalCount: 3, results: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { owner: 'user', repo: 'my-repo', query: 'function main' };
    const result = await executeStudioTool('search_code', args, BASE_URL);
    expect(result.success).toBe(true);

    const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(callUrl).toContain('/api/github/search');
    expect(callUrl).toContain('owner=user');
    expect(callUrl).toContain('repo=my-repo');
    expect(callUrl).toContain('query=function+main');
  });

  it('list_files calls GET /api/github/tree with query params', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ path: 'src', entries: [], total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { owner: 'user', repo: 'my-repo', path: 'src' };
    const result = await executeStudioTool('list_files', args, BASE_URL);
    expect(result.success).toBe(true);

    const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(callUrl).toContain('/api/github/tree');
    expect(callUrl).toContain('owner=user');
    expect(callUrl).toContain('repo=my-repo');
    expect(callUrl).toContain('path=src');
  });

  it('list_files omits empty path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ path: '/', entries: [], total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const args = { owner: 'user', repo: 'my-repo' };
    const result = await executeStudioTool('list_files', args, BASE_URL);
    expect(result.success).toBe(true);

    const callUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(callUrl).toContain('/api/github/tree');
    expect(callUrl).toContain('owner=user');
    expect(callUrl).toContain('repo=my-repo');
  });

  it('isStudioAPITool returns true for github tools', () => {
    expect(isStudioAPITool('read_file')).toBe(true);
    expect(isStudioAPITool('search_code')).toBe(true);
    expect(isStudioAPITool('list_files')).toBe(true);
  });
});

// ─── Description quality ────────────────────────────────────────────────────

describe('Tool description quality', () => {
  it('every description contains actionable context for Claude', () => {
    for (const tool of STUDIO_API_TOOLS) {
      const desc = tool.function.description;
      // Descriptions should be substantial enough to guide tool selection
      expect(desc.length).toBeGreaterThan(50);
      // Should contain usage guidance (when to use it)
      const hasGuidance = desc.includes('Use ') || desc.includes('use ');
      expect(hasGuidance).toBe(true);
    }
  });

  it('tool names use semantic underscore convention', () => {
    for (const tool of STUDIO_API_TOOLS) {
      // Names should use underscores, not camelCase or dashes
      expect(tool.function.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
