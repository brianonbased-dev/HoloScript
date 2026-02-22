/**
 * ClothTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { clothHandler } from '../ClothTrait';

function makeNode() { return { id: 'cloth_node' }; }
function makeCtx() { return { emit: vi.fn() }; }
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...clothHandler.defaultConfig!, ...cfg };
  clothHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

describe('clothHandler.defaultConfig', () => {
  const d = clothHandler.defaultConfig!;
  it('resolution=32', () => expect(d.resolution).toBe(32));
  it('stiffness=0.8', () => expect(d.stiffness).toBe(0.8));
  it('damping=0.01', () => expect(d.damping).toBeCloseTo(0.01));
  it('mass=1.0', () => expect(d.mass).toBe(1.0));
  it('gravity_scale=1.0', () => expect(d.gravity_scale).toBe(1.0));
  it('wind_response=0.5', () => expect(d.wind_response).toBe(0.5));
  it('tearable=false', () => expect(d.tearable).toBe(false));
  it('self_collision=false', () => expect(d.self_collision).toBe(false));
  it('pin_vertices=[]', () => expect(d.pin_vertices).toEqual([]));
});

describe('clothHandler.onAttach', () => {
  it('creates __clothState', () => expect(attach().node.__clothState).toBeDefined());
  it('isSimulating=true', () => expect(attach().node.__clothState.isSimulating).toBe(true));
  it('isTorn=false', () => expect(attach().node.__clothState.isTorn).toBe(false));
  it('windForce={0,0,0}', () => expect(attach().node.__clothState.windForce).toEqual({x:0,y:0,z:0}));
  it('vertices grid is res×res', () => {
    const {node} = attach({resolution:4});
    expect(node.__clothState.vertices.length).toBe(4);
    expect(node.__clothState.vertices[0].length).toBe(4);
  });
  it('pin_vertices marks isPinned correctly', () => {
    const {node} = attach({resolution:4, pin_vertices:[[0,0],[1,2]]});
    expect(node.__clothState.vertices[0][0].isPinned).toBe(true);
    expect(node.__clothState.vertices[1][2].isPinned).toBe(true);
    expect(node.__clothState.vertices[2][2].isPinned).toBe(false);
  });
  it('constraint count = (res-1)*res*2 for res=4', () => {
    const {node} = attach({resolution:4});
    expect(node.__clothState.constraints.length).toBe(24);
  });
  it('emits cloth_create', () => {
    const {ctx} = attach({resolution:4, stiffness:0.9});
    expect(ctx.emit).toHaveBeenCalledWith('cloth_create', expect.objectContaining({resolution:4, stiffness:0.9}));
  });
  it('vertex mass = config.mass/(res*res)', () => {
    const {node} = attach({resolution:4, mass:4});
    expect(node.__clothState.vertices[1][1].mass).toBeCloseTo(4/16, 5);
  });
});

describe('clothHandler.onDetach', () => {
  it('removes __clothState', () => {
    const {node, config, ctx} = attach();
    clothHandler.onDetach!(node, config, ctx);
    expect(node.__clothState).toBeUndefined();
  });
  it('emits cloth_destroy when isSimulating=true', () => {
    const {node, config, ctx} = attach();
    ctx.emit.mockClear();
    clothHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('cloth_destroy', {node});
  });
  it('no cloth_destroy when isSimulating=false', () => {
    const {node, config, ctx} = attach();
    node.__clothState.isSimulating = false;
    ctx.emit.mockClear();
    clothHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('cloth_destroy', expect.any(Object));
  });
});

describe('clothHandler.onUpdate', () => {
  it('emits cloth_apply_force with scaled wind', () => {
    const {node, config, ctx} = attach({wind_response:0.5});
    node.__clothState.windForce = {x:4, y:0, z:2};
    ctx.emit.mockClear();
    clothHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('cloth_apply_force', expect.objectContaining({force:{x:2,y:0,z:1}}));
  });
  it('no cloth_apply_force when wind_response=0', () => {
    const {node, config, ctx} = attach({wind_response:0});
    node.__clothState.windForce = {x:5, y:0, z:0};
    ctx.emit.mockClear();
    clothHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('cloth_apply_force', expect.any(Object));
  });
  it('always emits cloth_step with deltaTime', () => {
    const {node, config, ctx} = attach();
    ctx.emit.mockClear();
    clothHandler.onUpdate!(node, config, ctx, 0.033);
    expect(ctx.emit).toHaveBeenCalledWith('cloth_step', {node, deltaTime:0.033});
  });
  it('no-op when isSimulating=false', () => {
    const {node, config, ctx} = attach();
    node.__clothState.isSimulating = false;
    ctx.emit.mockClear();
    clothHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

describe('clothHandler.onEvent', () => {
  it('wind_update sets windForce', () => {
    const {node, config, ctx} = attach();
    clothHandler.onEvent!(node, config, ctx, {type:'wind_update', direction:{x:3,y:0,z:-1}});
    expect(node.__clothState.windForce).toEqual({x:3,y:0,z:-1});
  });
  it('cloth_apply_force emits cloth_external_force with radius', () => {
    const {node, config, ctx} = attach();
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_apply_force', force:{x:1,y:0,z:0}, radius:1.5});
    expect(ctx.emit).toHaveBeenCalledWith('cloth_external_force', expect.objectContaining({radius:1.5}));
  });
  it('cloth_apply_force defaults radius to 0.5', () => {
    const {node, config, ctx} = attach();
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_apply_force', force:{x:1,y:0,z:0}});
    expect(ctx.emit).toHaveBeenCalledWith('cloth_external_force', expect.objectContaining({radius:0.5}));
  });
  it('cloth_pin_vertex marks isPinned=true and emits cloth_update_pin', () => {
    const {node, config, ctx} = attach({resolution:4});
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_pin_vertex', x:1, y:2});
    expect(node.__clothState.vertices[1][2].isPinned).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('cloth_update_pin', expect.objectContaining({vertex:[1,2], pinned:true}));
  });
  it('cloth_unpin_vertex marks isPinned=false', () => {
    const {node, config, ctx} = attach({resolution:4, pin_vertices:[[0,0]]});
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_unpin_vertex', x:0, y:0});
    expect(node.__clothState.vertices[0][0].isPinned).toBe(false);
  });
  it('cloth_pin_vertex graceful for out-of-bounds', () => {
    const {node, config, ctx} = attach({resolution:4});
    expect(() => clothHandler.onEvent!(node, config, ctx, {type:'cloth_pin_vertex', x:99, y:99})).not.toThrow();
  });
  it('cloth_constraint_break sets broken+isTorn when tearable=true', () => {
    const {node, config, ctx} = attach({resolution:4, tearable:true});
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_constraint_break', constraintIndex:0});
    expect(node.__clothState.constraints[0].broken).toBe(true);
    expect(node.__clothState.isTorn).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('on_cloth_tear', expect.objectContaining({constraintIndex:0}));
  });
  it('cloth_constraint_break no-op when tearable=false', () => {
    const {node, config, ctx} = attach({resolution:4, tearable:false});
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_constraint_break', constraintIndex:0});
    expect(node.__clothState.constraints[0].broken).toBe(false);
  });
  it('cloth_pause sets isSimulating=false', () => {
    const {node, config, ctx} = attach();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_pause'});
    expect(node.__clothState.isSimulating).toBe(false);
  });
  it('cloth_resume sets isSimulating=true', () => {
    const {node, config, ctx} = attach();
    node.__clothState.isSimulating = false;
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_resume'});
    expect(node.__clothState.isSimulating).toBe(true);
  });
  it('cloth_reset reinitializes grid and clears isTorn', () => {
    const {node, config, ctx} = attach({resolution:4, tearable:true});
    node.__clothState.isTorn = true;
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_reset'});
    expect(node.__clothState.isTorn).toBe(false);
    expect(node.__clothState.vertices.length).toBe(4);
    expect(ctx.emit).toHaveBeenCalledWith('cloth_reinitialize', expect.objectContaining({node}));
  });
  it('cloth_query emits cloth_info snapshot', () => {
    const {node, config, ctx} = attach({resolution:4});
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_query', queryId:'q1'});
    expect(ctx.emit).toHaveBeenCalledWith('cloth_info', expect.objectContaining({
      queryId:'q1', isSimulating:true, isTorn:false, vertexCount:16,
    }));
  });
  it('cloth_query brokenConstraints counts broken', () => {
    const {node, config, ctx} = attach({resolution:4, tearable:true});
    node.__clothState.constraints[0].broken = true;
    node.__clothState.constraints[2].broken = true;
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_query', queryId:'q2'});
    const c = ctx.emit.mock.calls.find((c:any[])=>c[0]==='cloth_info');
    expect(c?.[1].brokenConstraints).toBe(2);
  });
  it('cloth_vertex_update patches vertex positions', () => {
    const {node, config, ctx} = attach({resolution:2});
    const positions = [{x:1,y:2,z:3},{x:4,y:5,z:6},{x:7,y:8,z:9},{x:10,y:11,z:12}];
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_vertex_update', positions});
    expect(node.__clothState.vertices[0][0].position).toEqual({x:1,y:2,z:3});
  });
  it('cloth_vertex_update emits cloth_mesh_update', () => {
    const {node, config, ctx} = attach({resolution:2});
    const positions = [{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:0,z:1},{x:1,y:0,z:1}];
    ctx.emit.mockClear();
    clothHandler.onEvent!(node, config, ctx, {type:'cloth_vertex_update', positions});
    expect(ctx.emit).toHaveBeenCalledWith('cloth_mesh_update', expect.objectContaining({node}));
  });
});
