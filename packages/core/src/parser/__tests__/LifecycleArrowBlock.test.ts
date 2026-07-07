import { describe, expect, it } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

function parse(source: string) {
  return new HoloScriptPlusParser().parse(source);
}

function firstNode(source: string): any {
  const root = parse(source).ast.root as any;
  return root.type === 'fragment' ? root.children?.[0] : root;
}

describe('lifecycle arrow blocks', () => {
  it('consumes a brace body after a lifecycle arrow', () => {
    const node = firstNode(`object "Worker" {
  @on_update(dt) => { tick(dt); emit("worker_tick", {}) }
}`);

    const hook = node.directives.find((directive: any) => directive.type === 'lifecycle');
    expect(hook).toMatchObject({ hook: 'on_update', params: ['dt'] });
    expect(hook.body).toContain('tick(dt)');
    expect(hook.body).toContain('emit("worker_tick", {})');
  });

  it('parses the room mesh provider fixture without leaving arrow bodies behind', () => {
    const result = parse(`@trait room_mesh_provider {
  capability_tags: ["room_mesh_provider", "real_time_room_mesh", "mixed_reality_room_geometry", "r3f_renderer"]
  @on_spawn => { emit("room_mesh_provider_ready", {}) }
  @on_update(room_scan) => { mesh = provide_room_mesh(room_scan); return mesh }
  @receipt room_mesh_provider_config { type: "RoomMeshProviderReceipt"; timestamp: now() }
}`);

    expect(result.success).toBe(true);

    const root = result.ast.root as any;
    const provider = root.type === 'fragment' ? root.children?.[0] : root;
    const hooks = provider.directives.filter((directive: any) => directive.type === 'lifecycle');
    expect(hooks.map((hook: any) => hook.hook)).toEqual(['on_spawn', 'on_update']);
    expect(hooks[0].body).toContain('room_mesh_provider_ready');
    expect(hooks[1].body).toContain('provide_room_mesh(room_scan)');
  });

  it('consumes generic arrow handler bodies when the hook is not registered', () => {
    const node = firstNode(`object "Worker" {
  @on_custom_task => { run_custom_task(); }
}`);

    const handler = node.directives.find((directive: any) => directive.name === 'on_custom_task');
    expect(handler).toMatchObject({ type: 'trait', name: 'on_custom_task' });
    expect(handler.config.body).toContain('run_custom_task()');
  });
});
