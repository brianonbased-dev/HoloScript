import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIEventRouter } from '../ui/UIEventRouter';

// =============================================================================
// C253 — UI Event Router
// =============================================================================

describe('UIEventRouter', () => {
  let router: UIEventRouter;
  beforeEach(() => {
    router = new UIEventRouter();
  });

  it('on registers handler and emit invokes it', () => {
    const cb = vi.fn();
    router.on('btn1', 'click', cb);
    router.emit('btn1', 'click');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('emit passes event with targetId and type', () => {
    const cb = vi.fn();
    router.on('w1', 'hover', cb);
    router.emit('w1', 'hover', 10, 20);
    const evt = cb.mock.calls[0][0];
    expect(evt.targetId).toBe('w1');
    expect(evt.type).toBe('hover');
    expect(evt.x).toBe(10);
    expect(evt.y).toBe(20);
  });

  it('emit with no handlers still logs event', () => {
    router.emit('nobody', 'click');
    expect(router.getEventLog()).toHaveLength(1);
  });

  it('propagationStopped prevents further handlers', () => {
    const first = vi.fn((e) => {
      e.propagationStopped = true;
    });
    const second = vi.fn();
    router.on('btn', 'click', first);
    router.on('btn', 'click', second);
    router.emit('btn', 'click');
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('setFocus emits blur on old and focus on new', () => {
    const blurCb = vi.fn();
    const focusCb = vi.fn();
    router.on('input1', 'blur', blurCb);
    router.on('input2', 'focus', focusCb);
    router.setFocus('input1');
    router.setFocus('input2');
    expect(blurCb).toHaveBeenCalled();
    expect(focusCb).toHaveBeenCalled();
    expect(router.getFocused()).toBe('input2');
  });

  it('setHover emits hoverEnd on old', () => {
    const endCb = vi.fn();
    router.on('box1', 'hoverEnd', endCb);
    router.setHover('box1');
    router.setHover('box2');
    expect(endCb).toHaveBeenCalled();
    expect(router.getHovered()).toBe('box2');
  });

  it('setHover null emits hoverEnd', () => {
    const cb = vi.fn();
    router.on('box', 'hoverEnd', cb);
    router.setHover('box');
    router.setHover(null);
    expect(cb).toHaveBeenCalled();
    expect(router.getHovered()).toBeNull();
  });

  it('click emits pointerDown, pointerUp, click', () => {
    const types: string[] = [];
    router.on('btn', 'pointerDown', (e) => types.push(e.type));
    router.on('btn', 'pointerUp', (e) => types.push(e.type));
    router.on('btn', 'click', (e) => types.push(e.type));
    router.click('btn', 5, 5);
    expect(types).toEqual(['pointerDown', 'pointerUp', 'click']);
  });

  it('getEventLog returns copy', () => {
    router.emit('w', 'click');
    const log = router.getEventLog();
    log.length = 0;
    expect(router.getEventLog()).toHaveLength(1);
  });

  it('clearLog empties log', () => {
    router.emit('w', 'click');
    router.clearLog();
    expect(router.getEventLog()).toHaveLength(0);
  });

  it('event log caps at maxLog', () => {
    for (let i = 0; i < 120; i++) router.emit('w', 'click');
    expect(router.getEventLog().length).toBeLessThanOrEqual(100);
  });

  it('valueChange event carries value', () => {
    const cb = vi.fn();
    router.on('slider', 'valueChange', cb);
    router.emit('slider', 'valueChange', undefined, undefined, 0.75);
    expect(cb.mock.calls[0][0].value).toBe(0.75);
  });
});
