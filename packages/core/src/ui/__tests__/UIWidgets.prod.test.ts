/**
 * UIWidgetFactory Production Tests
 *
 * Create + interact: button, slider, toggle, textInput, dropdown, progress.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UIWidgetFactory, type SliderWidget, type ToggleWidget, type TextInputWidget, type DropdownWidget, type ProgressBarWidget } from '../UIWidgets';

describe('UIWidgetFactory — Production', () => {
  let factory: UIWidgetFactory;

  beforeEach(() => {
    factory = new UIWidgetFactory();
  });

  describe('createButton', () => {
    it('creates with defaults', () => {
      const btn = factory.createButton('Click');
      expect(btn.type).toBe('button');
      expect(btn.label).toBe('Click');
      expect(btn.enabled).toBe(true);
      expect(btn.visible).toBe(true);
    });

    it('pressButton fires callback', () => {
      const fn = vi.fn();
      const btn = factory.createButton('X', fn);
      expect(factory.pressButton(btn.id)).toBe(true);
      expect(fn).toHaveBeenCalledOnce();
    });

    it('pressButton fails on disabled', () => {
      const btn = factory.createButton('X');
      btn.enabled = false;
      expect(factory.pressButton(btn.id)).toBe(false);
    });
  });

  describe('createSlider', () => {
    it('creates with min/max/value/step', () => {
      const sl = factory.createSlider('Volume', 0, 100, 50, 5);
      expect(sl.type).toBe('slider');
      expect(sl.min).toBe(0);
      expect(sl.max).toBe(100);
      expect(sl.value).toBe(50);
    });

    it('setSliderValue clamps and steps', () => {
      const sl = factory.createSlider('Vol', 0, 100, 50, 10);
      factory.setSliderValue(sl.id, 73);
      const w = factory.getWidget<SliderWidget>(sl.id)!;
      expect(w.value).toBe(70); // rounded to nearest step
    });

    it('setSliderValue fires onChange', () => {
      const fn = vi.fn();
      const sl = factory.createSlider('Vol');
      sl.onChange = fn;
      factory.setSliderValue(sl.id, 25);
      expect(fn).toHaveBeenCalled();
    });
  });

  describe('createToggle', () => {
    it('creates unchecked by default', () => {
      const tg = factory.createToggle('Dark Mode');
      expect(tg.type).toBe('toggle');
      expect(tg.checked).toBe(false);
    });

    it('toggleWidget flips', () => {
      const tg = factory.createToggle('DM');
      factory.toggleWidget(tg.id);
      expect(factory.getWidget<ToggleWidget>(tg.id)!.checked).toBe(true);
      factory.toggleWidget(tg.id);
      expect(factory.getWidget<ToggleWidget>(tg.id)!.checked).toBe(false);
    });
  });

  describe('createTextInput', () => {
    it('creates with placeholder', () => {
      const ti = factory.createTextInput('Name', 'Enter name');
      expect(ti.type).toBe('textInput');
      expect(ti.placeholder).toBe('Enter name');
      expect(ti.maxLength).toBe(256);
    });

    it('setTextValue truncates to maxLength', () => {
      const ti = factory.createTextInput('N');
      (ti as any).maxLength = 5;
      factory.setTextValue(ti.id, 'HelloWorld');
      expect(factory.getWidget<TextInputWidget>(ti.id)!.value).toBe('Hello');
    });
  });

  describe('createDropdown', () => {
    it('creates with options', () => {
      const opts = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
      const dd = factory.createDropdown('Pick', opts);
      expect(dd.type).toBe('dropdown');
      expect(dd.options).toHaveLength(2);
      expect(dd.selectedIndex).toBe(0);
    });

    it('selectDropdownOption updates', () => {
      const opts = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
      const dd = factory.createDropdown('Pick', opts);
      expect(factory.selectDropdownOption(dd.id, 1)).toBe(true);
      expect(factory.getWidget<DropdownWidget>(dd.id)!.selectedIndex).toBe(1);
    });

    it('selectDropdownOption rejects out of range', () => {
      const dd = factory.createDropdown('Pick', [{ label: 'A', value: 'a' }]);
      expect(factory.selectDropdownOption(dd.id, 5)).toBe(false);
    });
  });

  describe('createProgressBar', () => {
    it('creates clamped', () => {
      const pb = factory.createProgressBar('Loading', 1.5);
      expect(pb.type).toBe('progress');
      expect(pb.value).toBe(1); // clamped to 1
    });

    it('setProgressValue clamps', () => {
      const pb = factory.createProgressBar('Load', 0.5);
      factory.setProgressValue(pb.id, -0.5);
      expect(factory.getWidget<ProgressBarWidget>(pb.id)!.value).toBe(0);
    });
  });

  describe('query', () => {
    it('getWidgetCount', () => {
      factory.createButton('A');
      factory.createSlider('B');
      expect(factory.getWidgetCount()).toBe(2);
    });

    it('getAllWidgets', () => {
      factory.createButton('A');
      factory.createToggle('B');
      expect(factory.getAllWidgets()).toHaveLength(2);
    });

    it('removeWidget', () => {
      const btn = factory.createButton('X');
      expect(factory.removeWidget(btn.id)).toBe(true);
      expect(factory.getWidget(btn.id)).toBeUndefined();
    });
  });
});
