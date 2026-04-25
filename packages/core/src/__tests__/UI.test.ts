import { describe, it, expect } from 'vitest';
import { UIRenderer } from '../ui/UIRenderer';
import { UILayoutEngine } from '../ui/UILayout';
import { UIWidgetFactory } from '../ui/UIWidgets';

describe('Cycle 117: UI Framework', () => {
  // -------------------------------------------------------------------------
  // UIRenderer
  // -------------------------------------------------------------------------

  it('should build UI hierarchy and hit test', () => {
    const renderer = new UIRenderer();
    const root = renderer.getRoot();
    const btn = renderer.createNode('button', 'myBtn');
    btn.rect = { x: 50, y: 50, width: 100, height: 40 };
    renderer.addChild(root, btn);

    const hit = renderer.hitTest(80, 60);
    expect(hit).not.toBeNull();
    expect(hit!.node.id).toBe(btn.id);

    const miss = renderer.hitTest(0, 0); // root is not interactive
    expect(miss).toBeNull();
  });

  it('should manage focus order', () => {
    const renderer = new UIRenderer();
    const root = renderer.getRoot();
    const btn1 = renderer.createNode('button');
    const btn2 = renderer.createNode('button');
    const label = renderer.createNode('text'); // not focusable
    renderer.addChild(root, btn1);
    renderer.addChild(root, btn2);
    renderer.addChild(root, label);

    renderer.setFocus(btn1.id);
    expect(renderer.getFocusedNode()!.id).toBe(btn1.id);

    const next = renderer.focusNext();
    expect(next!.id).toBe(btn2.id);
  });

  it('should lookup nodes by tag', () => {
    const renderer = new UIRenderer();
    const root = renderer.getRoot();
    const panel = renderer.createNode('container', 'inventoryPanel');
    renderer.addChild(root, panel);

    expect(renderer.findByTag('inventoryPanel')!.id).toBe(panel.id);
    expect(renderer.findByTag('nonexistent')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // UILayout
  // -------------------------------------------------------------------------

  it('should compute column layout', () => {
    const engine = new UILayoutEngine();
    const parent = engine.createNode({ direction: 'column', width: 200, height: 200, gap: 10 });
    const child1 = engine.createNode({ width: 200, height: 50 });
    const child2 = engine.createNode({ width: 200, height: 50 });
    engine.addChild(parent, child1);
    engine.addChild(parent, child2);

    engine.compute(parent, 200, 200);

    expect(child1.result[1]).toBe(0);
    expect(child2.result[1]).toBe(60); // 50 + 10 gap
  });

  it('should distribute space via flexGrow', () => {
    const engine = new UILayoutEngine();
    const parent = engine.createNode({ direction: 'row', width: 300, height: 100 });
    const child1 = engine.createNode({ width: 50, height: 100, flexGrow: 1 });
    const child2 = engine.createNode({ width: 50, height: 100, flexGrow: 2 });
    engine.addChild(parent, child1);
    engine.addChild(parent, child2);

    engine.compute(parent, 300, 100);

    // 200 free space, 1:2 ratio
    expect(child1.result.width).toBeCloseTo(50 + 200 / 3, 0);
    expect(child2.result.width).toBeCloseTo(50 + 400 / 3, 0);
  });

  it('should center-align items', () => {
    const engine = new UILayoutEngine();
    const parent = engine.createNode({
      direction: 'column',
      width: 200,
      height: 200,
      alignItems: 'center',
    });
    const child = engine.createNode({ width: 80, height: 30 });
    engine.addChild(parent, child);

    engine.compute(parent, 200, 200);
    expect(child.result[0]).toBeCloseTo(60, 0); // (200-80)/2
  });

  // -------------------------------------------------------------------------
  // UIWidgets
  // -------------------------------------------------------------------------

  it('should create and interact with widgets', () => {
    const factory = new UIWidgetFactory();
    let clicked = false;
    const btn = factory.createButton('Click Me', () => {
      clicked = true;
    });

    factory.pressButton(btn.id);
    expect(clicked).toBe(true);
    expect(btn.state).toBe('pressed');
  });

  it('should handle slider with stepping', () => {
    const factory = new UIWidgetFactory();
    const slider = factory.createSlider('Volume', 0, 100, 50, 10);

    factory.setSliderValue(slider.id, 37);
    expect(slider.value).toBe(40); // Snapped to step 10

    factory.setSliderValue(slider.id, 150);
    expect(slider.value).toBe(100); // Clamped to max
  });

  it('should manage toggle and dropdown', () => {
    const factory = new UIWidgetFactory();

    const toggle = factory.createToggle('Dark Mode');
    expect(toggle.checked).toBe(false);
    factory.toggleWidget(toggle.id);
    expect(toggle.checked).toBe(true);

    const dropdown = factory.createDropdown('Theme', [
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ]);
    factory.selectDropdownOption(dropdown.id, 1);
    expect(dropdown.selectedIndex).toBe(1);
  });

  it('should handle text input with max length', () => {
    const factory = new UIWidgetFactory();
    const input = factory.createTextInput('Name', 'Enter name...');
    input.maxLength = 10;

    factory.setTextValue(input.id, 'Hello World!!');
    expect(input.value).toBe('Hello Worl'); // Truncated to 10
  });
});
