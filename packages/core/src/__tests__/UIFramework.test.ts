import { describe, it, expect, beforeEach } from 'vitest';
import { UIWidget } from '../ui/UIWidget';
import { UIEventRouter } from '../ui/UIEventRouter';
import { UIDataBinding } from '../ui/UIDataBinding';

describe('In-Game UI Framework (Cycle 184)', () => {
  describe('UIWidget', () => {
    let ui: UIWidget;

    beforeEach(() => {
      ui = new UIWidget();
    });

    it('should create widgets', () => {
      ui.createWidget('root', 'panel', { width: 800, height: 600 });
      expect(ui.getWidget('root')).toBeDefined();
      expect(ui.getWidgetCount()).toBe(1);
    });

    it('should parent widgets', () => {
      ui.createWidget('root', 'panel');
      ui.createWidget('btn', 'button', { text: 'Click' });
      ui.addChild('root', 'btn');
      const root = ui.getWidget('root')!;
      expect(root.children).toContain('btn');
    });

    it('should remove widgets recursively', () => {
      ui.createWidget('root', 'panel');
      ui.createWidget('child', 'label', { parentId: 'root' });
      ui.removeWidget('root');
      expect(ui.getWidgetCount()).toBe(0);
    });

    it('should apply styles', () => {
      ui.createWidget('box', 'panel');
      ui.setStyle('box', { backgroundColor: '#333', borderRadius: 8 });
      expect(ui.getWidget('box')!.style.backgroundColor).toBe('#333');
    });

    it('should hit test interactive widgets', () => {
      ui.createWidget('btn', 'button', { x: 10, y: 10, width: 100, height: 40 });
      const hit = ui.hitTest(50, 30);
      expect(hit).not.toBeNull();
      expect(hit!.id).toBe('btn');
    });

    it('should miss non-interactive widgets', () => {
      ui.createWidget('label', 'label', { x: 10, y: 10, width: 100, height: 40 });
      expect(ui.hitTest(50, 30)).toBeNull();
    });

    it('should sort by z-index for rendering', () => {
      ui.createWidget('bg', 'panel', { zIndex: 0 });
      ui.createWidget('fg', 'panel', { zIndex: 10 });
      const order = ui.getRenderOrder();
      expect(order[0].id).toBe('bg');
      expect(order[1].id).toBe('fg');
    });
  });

  describe('UIEventRouter', () => {
    let router: UIEventRouter;

    beforeEach(() => {
      router = new UIEventRouter();
    });

    it('should register and fire events', () => {
      let clicked = false;
      router.on('btn1', 'click', () => {
        clicked = true;
      });
      router.emit('btn1', 'click');
      expect(clicked).toBe(true);
    });

    it('should track focus', () => {
      router.on('input1', 'focus', () => {});
      router.setFocus('input1');
      expect(router.getFocused()).toBe('input1');
    });

    it('should blur previous focus', () => {
      let blurred = false;
      router.on('a', 'blur', () => {
        blurred = true;
      });
      router.on('b', 'focus', () => {});
      router.setFocus('a');
      router.setFocus('b');
      expect(blurred).toBe(true);
    });

    it('should simulate click sequence', () => {
      const events: string[] = [];
      router.on('btn', 'pointerDown', () => events.push('down'));
      router.on('btn', 'pointerUp', () => events.push('up'));
      router.on('btn', 'click', () => events.push('click'));
      router.click('btn');
      expect(events).toEqual(['down', 'up', 'click']);
    });

    it('should maintain event log', () => {
      router.emit('w1', 'hover');
      expect(router.getEventLog().length).toBe(1);
    });
  });

  describe('UIDataBinding', () => {
    let binding: UIDataBinding;

    beforeEach(() => {
      binding = new UIDataBinding();
    });

    it('should set and get model values', () => {
      binding.set('hp', 100);
      expect(binding.get('hp')).toBe(100);
    });

    it('should bind model to widget', () => {
      binding.set('score', 42);
      const b = binding.bind('score', 'scoreLabel', 'text');
      expect(binding.resolve(b.id)).toBe('42');
    });

    it('should format values', () => {
      binding.set('gold', 1500);
      const b = binding.bind('gold', 'goldLabel', 'text', 'one-way', (v) => `${v}g`);
      expect(binding.resolve(b.id)).toBe('1500g');
    });

    it('should propagate all bindings', () => {
      binding.set('a', 1);
      binding.set('b', 2);
      binding.bind('a', 'w1', 'text');
      binding.bind('b', 'w2', 'text');
      const result = binding.propagate();
      expect(result.size).toBe(2);
    });

    it('should fire change listeners', () => {
      let newVal: unknown;
      binding.onChange('hp', (v) => {
        newVal = v;
      });
      binding.set('hp', 50);
      expect(newVal).toBe(50);
    });

    it('should unbind', () => {
      const b = binding.bind('x', 'w', 'text');
      expect(binding.unbind(b.id)).toBe(true);
      expect(binding.getBindingCount()).toBe(0);
    });
  });
});
