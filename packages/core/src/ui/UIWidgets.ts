/**
 * UIWidgets.ts
 *
 * Pre-built UI widget library: button, slider, toggle,
 * text input, dropdown, and progress bar.
 *
 * @module ui
 */

// =============================================================================
// TYPES
// =============================================================================

export type WidgetState = 'normal' | 'hovered' | 'pressed' | 'disabled' | 'focused';

export interface WidgetBase {
  id: string;
  type: string;
  state: WidgetState;
  enabled: boolean;
  visible: boolean;
  label: string;
}

// =============================================================================
// BUTTON
// =============================================================================

export interface ButtonWidget extends WidgetBase {
  type: 'button';
  onClick: (() => void) | null;
}

// =============================================================================
// SLIDER
// =============================================================================

export interface SliderWidget extends WidgetBase {
  type: 'slider';
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: ((value: number) => void) | null;
}

// =============================================================================
// TOGGLE
// =============================================================================

export interface ToggleWidget extends WidgetBase {
  type: 'toggle';
  checked: boolean;
  onToggle: ((checked: boolean) => void) | null;
}

// =============================================================================
// TEXT INPUT
// =============================================================================

export interface TextInputWidget extends WidgetBase {
  type: 'textInput';
  value: string;
  placeholder: string;
  maxLength: number;
  password: boolean;
  onSubmit: ((value: string) => void) | null;
  onChange: ((value: string) => void) | null;
}

// =============================================================================
// DROPDOWN
// =============================================================================

export interface DropdownOption {
  label: string;
  value: string;
}

export interface DropdownWidget extends WidgetBase {
  type: 'dropdown';
  options: DropdownOption[];
  selectedIndex: number;
  isOpen: boolean;
  onSelect: ((index: number, option: DropdownOption) => void) | null;
}

// =============================================================================
// PROGRESS BAR
// =============================================================================

export interface ProgressBarWidget extends WidgetBase {
  type: 'progress';
  value: number; // 0-1
  color: string;
  animated: boolean;
}

// =============================================================================
// UNION TYPE
// =============================================================================

export type Widget =
  | ButtonWidget
  | SliderWidget
  | ToggleWidget
  | TextInputWidget
  | DropdownWidget
  | ProgressBarWidget;

// =============================================================================
// WIDGET FACTORY
// =============================================================================

let _widgetId = 0;

export class UIWidgetFactory {
  private widgets: Map<string, Widget> = new Map();

  // ---------------------------------------------------------------------------
  // Creation
  // ---------------------------------------------------------------------------

  createButton(label: string, onClick?: () => void): ButtonWidget {
    const w: ButtonWidget = {
      id: `widget_${_widgetId++}`,
      type: 'button',
      state: 'normal',
      enabled: true,
      visible: true,
      label,
      onClick: onClick ?? null,
    };
    this.widgets.set(w.id, w);
    return w;
  }

  createSlider(label: string, min = 0, max = 100, value = 50, step = 1): SliderWidget {
    const w: SliderWidget = {
      id: `widget_${_widgetId++}`,
      type: 'slider',
      state: 'normal',
      enabled: true,
      visible: true,
      label,
      value,
      min,
      max,
      step,
      onChange: null,
    };
    this.widgets.set(w.id, w);
    return w;
  }

  createToggle(label: string, checked = false): ToggleWidget {
    const w: ToggleWidget = {
      id: `widget_${_widgetId++}`,
      type: 'toggle',
      state: 'normal',
      enabled: true,
      visible: true,
      label,
      checked,
      onToggle: null,
    };
    this.widgets.set(w.id, w);
    return w;
  }

  createTextInput(label: string, placeholder = ''): TextInputWidget {
    const w: TextInputWidget = {
      id: `widget_${_widgetId++}`,
      type: 'textInput',
      state: 'normal',
      enabled: true,
      visible: true,
      label,
      value: '',
      placeholder,
      maxLength: 256,
      password: false,
      onSubmit: null,
      onChange: null,
    };
    this.widgets.set(w.id, w);
    return w;
  }

  createDropdown(label: string, options: DropdownOption[]): DropdownWidget {
    const w: DropdownWidget = {
      id: `widget_${_widgetId++}`,
      type: 'dropdown',
      state: 'normal',
      enabled: true,
      visible: true,
      label,
      options: [...options],
      selectedIndex: 0,
      isOpen: false,
      onSelect: null,
    };
    this.widgets.set(w.id, w);
    return w;
  }

  createProgressBar(label: string, value = 0): ProgressBarWidget {
    const w: ProgressBarWidget = {
      id: `widget_${_widgetId++}`,
      type: 'progress',
      state: 'normal',
      enabled: true,
      visible: true,
      label,
      value: Math.max(0, Math.min(1, value)),
      color: '#4CAF50',
      animated: false,
    };
    this.widgets.set(w.id, w);
    return w;
  }

  // ---------------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------------

  pressButton(widgetId: string): boolean {
    const w = this.widgets.get(widgetId);
    if (!w || w.type !== 'button' || !w.enabled) return false;
    w.state = 'pressed';
    if (w.onClick) w.onClick();
    return true;
  }

  setSliderValue(widgetId: string, value: number): boolean {
    const w = this.widgets.get(widgetId);
    if (!w || w.type !== 'slider' || !w.enabled) return false;
    const clamped = Math.max(w.min, Math.min(w.max, value));
    const stepped = Math.round((clamped - w.min) / w.step) * w.step + w.min;
    w.value = stepped;
    if (w.onChange) w.onChange(stepped);
    return true;
  }

  toggleWidget(widgetId: string): boolean {
    const w = this.widgets.get(widgetId);
    if (!w || w.type !== 'toggle' || !w.enabled) return false;
    w.checked = !w.checked;
    if (w.onToggle) w.onToggle(w.checked);
    return true;
  }

  setTextValue(widgetId: string, value: string): boolean {
    const w = this.widgets.get(widgetId);
    if (!w || w.type !== 'textInput' || !w.enabled) return false;
    w.value = value.slice(0, w.maxLength);
    if (w.onChange) w.onChange(w.value);
    return true;
  }

  selectDropdownOption(widgetId: string, index: number): boolean {
    const w = this.widgets.get(widgetId);
    if (!w || w.type !== 'dropdown' || !w.enabled) return false;
    if (index < 0 || index >= w.options.length) return false;
    w.selectedIndex = index;
    w.isOpen = false;
    if (w.onSelect) w.onSelect(index, w.options[index]);
    return true;
  }

  setProgressValue(widgetId: string, value: number): boolean {
    const w = this.widgets.get(widgetId);
    if (!w || w.type !== 'progress') return false;
    w.value = Math.max(0, Math.min(1, value));
    return true;
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  getWidget<T extends Widget = Widget>(id: string): T | undefined {
    return this.widgets.get(id) as T | undefined;
  }

  getWidgetCount(): number {
    return this.widgets.size;
  }

  getAllWidgets(): Widget[] {
    return [...this.widgets.values()];
  }

  removeWidget(id: string): boolean {
    return this.widgets.delete(id);
  }
}
