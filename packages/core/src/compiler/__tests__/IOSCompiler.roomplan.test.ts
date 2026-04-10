import { describe, it, expect, vi } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeRoomPlanComposition(): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'living_room',
        properties: [],
        traits: [{ name: 'roomplan_scan', config: {} }],
      },
    ] as any,
  });
}

describe('IOSCompiler — RoomPlan integration', () => {
  // =========== Detection ===========

  it('does NOT emit roomPlanFile when no roomplan traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.roomPlanFile).toBeUndefined();
  });

  it('emits roomPlanFile when roomplan_scan trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toBeDefined();
    expect(typeof result.roomPlanFile).toBe('string');
    expect(result.roomPlanFile!.length).toBeGreaterThan(0);
  });

  // =========== Framework imports ===========

  it('imports RoomPlan framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('import RoomPlan');
  });

  it('imports SwiftUI', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('import SwiftUI');
  });

  // =========== HoloEntity model ===========

  it('defines HoloEntity struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('struct HoloEntity: Identifiable');
    expect(result.roomPlanFile).toContain('let label: String');
    expect(result.roomPlanFile).toContain('let category: String');
    expect(result.roomPlanFile).toContain('let traits: [String]');
  });

  // =========== RoomPlanManager ===========

  it('generates RoomPlanManager class', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('class GeneratedARSceneRoomPlanManager');
  });

  it('respects custom className option', () => {
    const compiler = new IOSCompiler({ className: 'MyRoom' });
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('class MyRoomRoomPlanManager');
    expect(result.roomPlanFile).toContain('struct MyRoomRoomPlanView');
  });

  // =========== Capture session ===========

  it('creates RoomCaptureSession', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('RoomCaptureSession()');
    expect(result.roomPlanFile).toContain('session.delegate = self');
  });

  it('checks RoomCaptureSession.isSupported', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('RoomCaptureSession.isSupported');
  });

  it('includes startScan and stopScan methods', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('func startScan()');
    expect(result.roomPlanFile).toContain('func stopScan()');
  });

  // =========== Surface mapping ===========

  it('maps wall surfaces', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('case .wall:');
    expect(result.roomPlanFile).toContain('"roomplan_wall"');
  });

  it('maps floor and ceiling surfaces', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('case .floor:');
    expect(result.roomPlanFile).toContain('"roomplan_floor"');
    expect(result.roomPlanFile).toContain('case .ceiling:');
    expect(result.roomPlanFile).toContain('"roomplan_ceiling"');
  });

  it('maps door, window, and opening surfaces', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('case .door:');
    expect(result.roomPlanFile).toContain('"roomplan_door"');
    expect(result.roomPlanFile).toContain('case .window:');
    expect(result.roomPlanFile).toContain('"roomplan_window"');
    expect(result.roomPlanFile).toContain('case .opening:');
    expect(result.roomPlanFile).toContain('"roomplan_opening"');
  });

  // =========== Object mapping ===========

  it('maps furniture categories', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('case .table:');
    expect(result.roomPlanFile).toContain('"roomplan_table"');
    expect(result.roomPlanFile).toContain('case .chair:');
    expect(result.roomPlanFile).toContain('"roomplan_chair"');
    expect(result.roomPlanFile).toContain('case .sofa:');
    expect(result.roomPlanFile).toContain('"roomplan_sofa"');
    expect(result.roomPlanFile).toContain('case .bed:');
    expect(result.roomPlanFile).toContain('"roomplan_bed"');
  });

  it('maps storage and fireplace', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('case .storage:');
    expect(result.roomPlanFile).toContain('"roomplan_storage"');
    expect(result.roomPlanFile).toContain('case .fireplace:');
    expect(result.roomPlanFile).toContain('"roomplan_fireplace"');
  });

  it('maps fixtures (toilet, bathtub, sink)', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('.toilet, .bathtub, .sink');
    expect(result.roomPlanFile).toContain('"roomplan_fixture"');
  });

  it('maps appliances', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('.oven, .dishwasher, .refrigerator, .washerDryer');
    expect(result.roomPlanFile).toContain('"roomplan_appliance"');
  });

  it('maps television to screen trait', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('case .television:');
    expect(result.roomPlanFile).toContain('"roomplan_screen"');
  });

  // =========== .holo export ===========

  it('generates exportToHolo method', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('func exportToHolo() -> String');
    expect(result.roomPlanFile).toContain('composition RoomScan');
  });

  // =========== Delegate ===========

  it('implements RoomCaptureSessionDelegate', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('RoomCaptureSessionDelegate');
    expect(result.roomPlanFile).toContain('captureSession(');
    expect(result.roomPlanFile).toContain('didUpdate room');
    expect(result.roomPlanFile).toContain('didEndWith data');
  });

  // =========== SwiftUI View ===========

  it('generates SwiftUI scanning view', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.roomPlanFile).toContain('struct GeneratedARSceneRoomPlanView: View');
    expect(result.roomPlanFile).toContain('Button("Start Scan")');
    expect(result.roomPlanFile).toContain('Button("Stop Scan")');
  });

  // =========== Other files remain intact ===========

  it('still generates all standard files alongside roomPlanFile', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeRoomPlanComposition(), 'test-token');
    expect(result.viewFile).toBeDefined();
    expect(result.sceneFile).toBeDefined();
    expect(result.stateFile).toBeDefined();
    expect(result.infoPlist).toBeDefined();
    expect(result.roomPlanFile).toBeDefined();
  });

  // =========== Multiple roomplan traits ===========

  it('detects roomplan traits on any object in composition', () => {
    const comp = makeComposition({
      objects: [
        { name: 'regular', properties: [], traits: [] },
        { name: 'scanner', properties: [], traits: [{ name: 'roomplan_furniture', config: {} }] },
      ] as any,
    });
    const compiler = new IOSCompiler();
    const result = compiler.compile(comp, 'test-token');
    expect(result.roomPlanFile).toBeDefined();
  });
});
