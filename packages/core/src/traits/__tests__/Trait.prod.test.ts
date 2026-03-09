/**
 * Trait Interface Production Tests
 *
 * The Trait interface defines the contract for class-based VR trait implementations.
 * Since it's a pure TypeScript interface (no runtime code), tests validate:
 * - Structural conformance: objects satisfy the interface shape
 * - Optional lifecycle methods are indeed optional
 * - Concrete implementations can be assigned to the interface type
 */

import { describe, it, expect, vi } from 'vitest';
import type { Trait } from '../Trait';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(): any {
  return {
    emit: vi.fn(),
    setState: vi.fn(),
    getState: vi.fn(() => ({})),
  };
}

// ── Minimal conformance ───────────────────────────────────────────────────────

describe('Trait interface — structural conformance', () => {
  it('an object with only "name" satisfies the Trait interface', () => {
    const t: Trait = { name: 'my_trait' };
    expect(t.name).toBe('my_trait');
  });

  it('onAttach, onUpdate, onDetach, onEvent are all optional', () => {
    const t: Trait = { name: 'minimal' };
    expect(t.onAttach).toBeUndefined();
    expect(t.onUpdate).toBeUndefined();
    expect(t.onDetach).toBeUndefined();
    expect(t.onEvent).toBeUndefined();
  });

  it('a full implementation with all lifecycle methods satisfies the interface', () => {
    const t: Trait = {
      name: 'full_trait',
      onAttach: vi.fn(),
      onUpdate: vi.fn(),
      onDetach: vi.fn(),
      onEvent: vi.fn(),
    };
    expect(typeof t.onAttach).toBe('function');
    expect(typeof t.onUpdate).toBe('function');
    expect(typeof t.onDetach).toBe('function');
    expect(typeof t.onEvent).toBe('function');
  });
});

// ── Class-based implementation ────────────────────────────────────────────────

describe('Trait interface — class-based implementation', () => {
  class CounterTrait implements Trait {
    name = 'counter';
    private _count = 0;

    onAttach(node: any, context: any): void {
      this._count = 0;
      context.emit('counter_started', { node });
    }

    onUpdate(_node: any, _ctx: any, delta: number): void {
      this._count += delta;
    }

    onDetach(_node: any, context: any): void {
      context.emit('counter_stopped', { count: this._count });
    }

    getCount() {
      return this._count;
    }
  }

  it('class instance satisfies Trait interface', () => {
    const t: Trait = new CounterTrait();
    expect(t.name).toBe('counter');
  });

  it('onAttach emits counter_started', () => {
    const t = new CounterTrait();
    const ctx = makeContext();
    t.onAttach!({ id: 'n1' }, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'counter_started',
      expect.objectContaining({ node: { id: 'n1' } })
    );
  });

  it('onUpdate accumulates delta into count', () => {
    const t = new CounterTrait();
    t.onAttach!({}, makeContext());
    t.onUpdate!({}, makeContext(), 16);
    t.onUpdate!({}, makeContext(), 16);
    expect(t.getCount()).toBe(32);
  });

  it('onDetach emits counter_stopped with final count', () => {
    const t = new CounterTrait();
    t.onAttach!({}, makeContext());
    t.onUpdate!({}, makeContext(), 10);
    const ctx = makeContext();
    t.onDetach!({}, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'counter_stopped',
      expect.objectContaining({ count: 10 })
    );
  });

  it('multiple class-based trait instances are independent', () => {
    const a = new CounterTrait();
    const b = new CounterTrait();
    a.onAttach!({}, makeContext());
    b.onAttach!({}, makeContext());
    a.onUpdate!({}, makeContext(), 100);
    expect(a.getCount()).toBe(100);
    expect(b.getCount()).toBe(0);
  });
});

// ── onEvent optional method ───────────────────────────────────────────────────

describe('Trait interface — onEvent conformance', () => {
  class EventTrait implements Trait {
    name = 'event_trait';
    readonly handled: string[] = [];

    onEvent(_node: any, _ctx: any, event: any): void {
      this.handled.push(event.type);
    }
  }

  it('onEvent receives event type', () => {
    const t = new EventTrait();
    t.onEvent!({}, makeContext(), { type: 'click' });
    expect(t.handled).toContain('click');
  });

  it('multiple events are all captured', () => {
    const t = new EventTrait();
    t.onEvent!({}, makeContext(), { type: 'click' });
    t.onEvent!({}, makeContext(), { type: 'hover' });
    t.onEvent!({}, makeContext(), { type: 'release' });
    expect(t.handled).toEqual(['click', 'hover', 'release']);
  });
});
