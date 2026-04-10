import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wotThingHandler, WoTThingConfig } from './WoTThingTrait';

describe('WoTThingTrait', () => {
  let mockNode: any;
  let mockContext: any;

  beforeEach(() => {
    mockNode = { name: 'smart-lamp' };
    mockContext = {
      emit: vi.fn(),
      getState: vi.fn().mockReturnValue({ on: true, brightness: 80 }),
      setState: vi.fn(),
    };
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize and trigger auto-generation', () => {
    const config: WoTThingConfig = {
      title: 'Smart Lamp',
      security: 'nosec',
      auto_generate: true,
    };

    wotThingHandler.onAttach!(mockNode, config, mockContext);

    expect((mockNode as any).__wotThingState).toBeDefined();

    // Auto-generation is deferred
    vi.advanceTimersByTime(0);

    expect(mockContext.emit).toHaveBeenCalledWith('wot_thing_generate', { nodeId: 'smart-lamp' });
  });

  it('should detect state changes and invalidate TD', () => {
    const config: WoTThingConfig = { title: 'Lamp', security: 'nosec' };
    wotThingHandler.onAttach!(mockNode, config, mockContext);

    const state = (mockNode as any).__wotThingState;
    state.tdGenerated = true;
    state.cachedTD = '{}';

    // Initial update - sets hash
    wotThingHandler.onUpdate!(mockNode, config, mockContext, 0.16);
    expect(state.cachedTD).toBe('{}'); // Should not invalidate on first run

    // Change state
    mockContext.getState.mockReturnValue({ on: false, brightness: 80 });

    // Second update - hash changes
    wotThingHandler.onUpdate!(mockNode, config, mockContext, 0.16);

    expect(state.cachedTD).toBeNull(); // Should be invalidated
    expect(mockContext.emit).toHaveBeenCalledWith('wot_thing_stale', expect.any(Object));
  });

  it('should handle manual generation request', () => {
    const config: WoTThingConfig = { title: 'Lamp', security: 'nosec' };
    wotThingHandler.onAttach!(mockNode, config, mockContext);
    wotThingHandler.onEvent!(mockNode, config, mockContext, {
      type: 'wot_generate_request',
    } as any);

    expect(mockContext.emit).toHaveBeenCalledWith(
      'wot_thing_generate',
      expect.objectContaining({
        nodeId: 'smart-lamp',
        config,
      })
    );
  });

  it('should update state on TD generated event', () => {
    const config: WoTThingConfig = { title: 'Lamp', security: 'nosec' };
    wotThingHandler.onAttach!(mockNode, config, mockContext);

    wotThingHandler.onEvent!(mockNode, config, mockContext, {
      type: 'wot_td_generated',
      td: '{"title": "Lamp"}',
      errors: [],
    } as any);

    const state = (mockNode as any).__wotThingState;
    expect(state.tdGenerated).toBe(true);
    expect(state.cachedTD).toBe('{"title": "Lamp"}');
  });
});
