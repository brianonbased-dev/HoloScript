/**
 * InputManager.ts
 *
 * Unified input polling: keyboard, mouse, gamepad state tracking,
 * action mapping, axis dead zones, and input buffering.
 *
 * @module input
 */

// =============================================================================
// TYPES
// =============================================================================

export type InputDeviceType = 'keyboard' | 'mouse' | 'gamepad';

export interface KeyState {
  pressed: boolean;
  justPressed: boolean;
  justReleased: boolean;
  heldDuration: number; // Seconds held
}

export interface MouseState {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  scrollDelta: number;
  buttons: Map<number, KeyState>;
}

export interface GamepadAxis {
  value: number; // -1 to 1
  deadZone: number;
}

export interface GamepadState {
  connected: boolean;
  id: string;
  buttons: Map<number, KeyState>;
  axes: GamepadAxis[];
}

export interface InputAction {
  name: string;
  value: number; // 0 or 1 for digital, -1 to 1 for analog
  pressed: boolean;
  justPressed: boolean;
  justReleased: boolean;
}

export interface InputSnapshot {
  timestamp: number;
  keys: Map<string, KeyState>;
  mouse: MouseState;
  gamepads: Map<number, GamepadState>;
  actions: Map<string, InputAction>;
}

// =============================================================================
// INPUT MANAGER
// =============================================================================

export class InputManager {
  private keys: Map<string, KeyState> = new Map();
  private prevKeys: Set<string> = new Set();
  private mouse: MouseState;
  private gamepads: Map<number, GamepadState> = new Map();
  private actionMappings: Map<string, string[]> = new Map(); // action -> [key bindings]
  private actions: Map<string, InputAction> = new Map();
  private defaultDeadZone = 0.15;
  private inputBuffer: Array<{ action: string; timestamp: number }> = [];
  private bufferDuration = 200; // ms

  constructor() {
    this.mouse = {
      x: 0,
      y: 0,
      deltaX: 0,
      deltaY: 0,
      scrollDelta: 0,
      buttons: new Map(),
    };
  }

  // ---------------------------------------------------------------------------
  // Key Input
  // ---------------------------------------------------------------------------

  keyDown(key: string): void {
    const existing = this.keys.get(key);
    if (!existing || !existing.pressed) {
      this.keys.set(key, {
        pressed: true,
        justPressed: true,
        justReleased: false,
        heldDuration: 0,
      });
    }
  }

  keyUp(key: string): void {
    const existing = this.keys.get(key);
    if (existing) {
      existing.pressed = false;
      existing.justReleased = true;
    } else {
      this.keys.set(key, {
        pressed: false,
        justPressed: false,
        justReleased: true,
        heldDuration: 0,
      });
    }
  }

  isKeyPressed(key: string): boolean {
    return this.keys.get(key)?.pressed ?? false;
  }

  isKeyJustPressed(key: string): boolean {
    return this.keys.get(key)?.justPressed ?? false;
  }

  isKeyJustReleased(key: string): boolean {
    return this.keys.get(key)?.justReleased ?? false;
  }

  getKeyHeldDuration(key: string): number {
    return this.keys.get(key)?.heldDuration ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Mouse Input
  // ---------------------------------------------------------------------------

  setMousePosition(x: number, y: number): void {
    this.mouse.deltaX = x - this.mouse.x;
    this.mouse.deltaY = y - this.mouse.y;
    this.mouse.x = x;
    this.mouse.y = y;
  }

  mouseButtonDown(button: number): void {
    this.mouse.buttons.set(button, {
      pressed: true,
      justPressed: true,
      justReleased: false,
      heldDuration: 0,
    });
  }

  mouseButtonUp(button: number): void {
    const existing = this.mouse.buttons.get(button);
    if (existing) {
      existing.pressed = false;
      existing.justReleased = true;
    }
  }

  setScrollDelta(delta: number): void {
    this.mouse.scrollDelta = delta;
  }

  getMousePosition(): { x: number; y: number } {
    return { x: this.mouse.x, y: this.mouse.y };
  }

  getMouseDelta(): { x: number; y: number } {
    return { x: this.mouse.deltaX, y: this.mouse.deltaY };
  }

  isMouseButtonPressed(button: number): boolean {
    return this.mouse.buttons.get(button)?.pressed ?? false;
  }

  // ---------------------------------------------------------------------------
  // Gamepad Input
  // ---------------------------------------------------------------------------

  connectGamepad(index: number, id: string, axisCount: number = 4): void {
    const axes: GamepadAxis[] = [];
    for (let i = 0; i < axisCount; i++) {
      axes.push({ value: 0, deadZone: this.defaultDeadZone });
    }
    this.gamepads.set(index, { connected: true, id, buttons: new Map(), axes });
  }

  disconnectGamepad(index: number): void {
    const gp = this.gamepads.get(index);
    if (gp) gp.connected = false;
  }

  setGamepadAxis(padIndex: number, axisIndex: number, value: number): void {
    const gp = this.gamepads.get(padIndex);
    if (!gp || axisIndex >= gp.axes.length) return;
    const axis = gp.axes[axisIndex];
    axis.value = Math.abs(value) < axis.deadZone ? 0 : value;
  }

  getGamepadAxis(padIndex: number, axisIndex: number): number {
    const gp = this.gamepads.get(padIndex);
    if (!gp || axisIndex >= gp.axes.length) return 0;
    return gp.axes[axisIndex].value;
  }

  gamepadButtonDown(padIndex: number, button: number): void {
    const gp = this.gamepads.get(padIndex);
    if (!gp) return;
    gp.buttons.set(button, {
      pressed: true,
      justPressed: true,
      justReleased: false,
      heldDuration: 0,
    });
  }

  setDeadZone(value: number): void {
    this.defaultDeadZone = Math.max(0, Math.min(1, value));
  }

  // ---------------------------------------------------------------------------
  // Action Mapping
  // ---------------------------------------------------------------------------

  mapAction(actionName: string, keys: string[]): void {
    this.actionMappings.set(actionName, keys);
    if (!this.actions.has(actionName)) {
      this.actions.set(actionName, {
        name: actionName,
        value: 0,
        pressed: false,
        justPressed: false,
        justReleased: false,
      });
    }
  }

  unmapAction(actionName: string): void {
    this.actionMappings.delete(actionName);
    this.actions.delete(actionName);
  }

  getAction(actionName: string): InputAction | undefined {
    return this.actions.get(actionName);
  }

  isActionPressed(actionName: string): boolean {
    return this.actions.get(actionName)?.pressed ?? false;
  }

  isActionJustPressed(actionName: string): boolean {
    return this.actions.get(actionName)?.justPressed ?? false;
  }

  // ---------------------------------------------------------------------------
  // Input Buffer (fighting game style)
  // ---------------------------------------------------------------------------

  getBufferedAction(actionName: string, withinMs?: number): boolean {
    const cutoff = Date.now() - (withinMs ?? this.bufferDuration);
    return this.inputBuffer.some((e) => e.action === actionName && e.timestamp >= cutoff);
  }

  setBufferDuration(ms: number): void {
    this.bufferDuration = Math.max(0, ms);
  }

  // ---------------------------------------------------------------------------
  // Update (call once per frame)
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const now = Date.now();

    // Update key hold durations and clear justPressed/justReleased
    for (const [key, state] of this.keys) {
      if (state.pressed) state.heldDuration += dt;
      state.justPressed = false;
      state.justReleased = false;
    }

    // Clear mouse deltas
    this.mouse.deltaX = 0;
    this.mouse.deltaY = 0;
    this.mouse.scrollDelta = 0;
    for (const state of this.mouse.buttons.values()) {
      state.justPressed = false;
      state.justReleased = false;
      if (state.pressed) state.heldDuration += dt;
    }

    // Gamepad button states
    for (const gp of this.gamepads.values()) {
      for (const state of gp.buttons.values()) {
        state.justPressed = false;
        state.justReleased = false;
        if (state.pressed) state.heldDuration += dt;
      }
    }

    // Resolve actions
    for (const [actionName, bindings] of this.actionMappings) {
      const action = this.actions.get(actionName);
      if (!action) continue;

      const wasPressed = action.pressed;
      let isPressed = false;

      for (const binding of bindings) {
        if (this.keys.get(binding)?.pressed) {
          isPressed = true;
          break;
        }
      }

      action.pressed = isPressed;
      action.justPressed = isPressed && !wasPressed;
      action.justReleased = !isPressed && wasPressed;
      action.value = isPressed ? 1 : 0;

      if (action.justPressed) {
        this.inputBuffer.push({ action: actionName, timestamp: now });
      }
    }

    // Prune old buffer entries
    const cutoff = now - this.bufferDuration * 2;
    this.inputBuffer = this.inputBuffer.filter((e) => e.timestamp > cutoff);
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  getSnapshot(): InputSnapshot {
    return {
      timestamp: Date.now(),
      keys: new Map(this.keys),
      mouse: { ...this.mouse, buttons: new Map(this.mouse.buttons) },
      gamepads: new Map(this.gamepads),
      actions: new Map(this.actions),
    };
  }

  reset(): void {
    this.keys.clear();
    this.mouse = { x: 0, y: 0, deltaX: 0, deltaY: 0, scrollDelta: 0, buttons: new Map() };
    this.gamepads.clear();
    this.inputBuffer = [];
    for (const action of this.actions.values()) {
      action.pressed = false;
      action.justPressed = false;
      action.justReleased = false;
      action.value = 0;
    }
  }
}
