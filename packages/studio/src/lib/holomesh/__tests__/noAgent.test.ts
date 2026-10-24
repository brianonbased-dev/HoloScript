import { describe, it, expect } from 'vitest';
import { isNoHoloMeshAgentBody, isNoHoloMeshAgentResponse } from '../noAgent';

describe('noAgent helpers', () => {
  it('recognises the body', () => {
    expect(isNoHoloMeshAgentBody({ code: 'no_holomesh_agent' })).toBe(true);
    expect(isNoHoloMeshAgentBody({ code: 'other' })).toBe(false);
    expect(isNoHoloMeshAgentBody(null)).toBe(false);
  });
  it('only a 404 with that code counts, and the response stays readable', async () => {
    const r = new Response(JSON.stringify({ code: 'no_holomesh_agent' }), { status: 404 });
    expect(await isNoHoloMeshAgentResponse(r)).toBe(true);
    expect(await r.json()).toEqual({ code: 'no_holomesh_agent' });
    expect(await isNoHoloMeshAgentResponse(new Response(JSON.stringify({ code: 'no_holomesh_agent' }), { status: 500 }))).toBe(false);
    expect(await isNoHoloMeshAgentResponse(new Response('nope', { status: 404 }))).toBe(false);
  });
});
