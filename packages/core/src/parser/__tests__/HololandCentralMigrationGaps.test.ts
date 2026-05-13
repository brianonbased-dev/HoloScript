import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

describe('HoloLand Central Migration Gap Verification', () => {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });

  // G1: system keyword at top level (outside composition)
  it('G1: parses top-level system block', () => {
    const source = `system TutorialSystem {
      state { currentStep: 0, completed: false, visible: true }
      steps: [
        { title: "Welcome", message: "Hello", action: "next" }
      ]
      on_start { state.visible = true }
      action next() { state.currentStep += 1 }
      ui { panel "Tutorial" { text "Title" { content: "Hello" } } }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast?.root?.type).toBe('system');
  });

  // G8: component keyword at top level
  it('G8: parses top-level component block', () => {
    const source = `component MobileControls {
      props { visible: true, joystickSize: 120 }
      state { joystickPosition: [0, 0], isMoving: false }
      ui { if (device.isMobile) { joystick "Move" { position: "bottom-left" } } }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
    expect(result.ast?.root?.type).toBe('component');
  });

  // G2: ES6-style inter-file import
  it('G2: parses ES6-style import from .hsplus', () => {
    const source = `import { TutorialSystem } from "./systems/Tutorial.hsplus"`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  // G2: @import directive (this should already work)
  it('G2: parses @import directive', () => {
    const source = `@import "other.holo"`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  // G10: storage API
  it('G10: parses storage.get and storage.set in system body', () => {
    const source = `system TestStorage {
      on_start {
        const saved = storage.get("key")
        storage.set("key", "value")
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  // G10: device API
  it('G10: parses device.isMobile and device.prefersReducedMotion', () => {
    const source = `system TestDevice {
      on_start {
        if (device.isMobile) { state.mobile = true }
        if (device.prefersReducedMotion()) { state.reduced = true }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  // Full app.hsplus from migration spec (simplified)
  it('FULL: parses simplified app.hsplus root composition', () => {
    const source = `composition "HololandCentral" {
      config { title: "Hololand Central", version: "1.0.0", renderMode: "progressive" }
      system TutorialSystem
      system EasterEggSystem
      system ThemeSystem
      system MultiplayerSystem
      page "Landing" { include "./pages/Landing.hsplus" }
    }`;
    const result = parser.parse(source);
    if (!result.success) {
      console.log('app.hsplus parse errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.success).toBe(true);
    expect(result.ast?.root?.type).toBe('composition');
  });

  // TutorialSystem from migration spec
  it('FULL: parses TutorialSystem from migration spec', () => {
    const source = `system TutorialSystem {
      state { currentStep: 0, completed: false, visible: true }
      steps: [
        { title: "Welcome to Hololand", message: "This is your gateway.", action: "next" }
      ]
      on_start {
        if (storage.get("tutorial_completed")) {
          state.visible = false
          state.completed = true
        }
      }
      action next() {
        state.currentStep += 1
        if (state.currentStep >= steps.length) { finish() }
      }
      action finish() {
        state.visible = false
        state.completed = true
        storage.set("tutorial_completed", true)
      }
      ui {
        if (state.visible) {
          panel "Tutorial" {
            @overlay
            position: "center"
            style: "glass"
            text "Title" { content: steps[state.currentStep].title, size: "large" }
            text "Message" { content: steps[state.currentStep].message }
            button "Next" { label: "Next", on_click: next }
            button "Skip" { label: "Skip", on_click: skip }
          }
        }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });

  // MobileControls component from migration spec
  it('FULL: parses MobileControls component from migration spec', () => {
    const source = `component MobileControls {
      props { visible: true, joystickSize: 120, deadzone: 0.1 }
      state { joystickPosition: [0, 0], isMoving: false }
      ui {
        if (device.isMobile && props.visible) {
          joystick "Move" {
            position: "bottom-left"
            size: props.joystickSize
            deadzone: props.deadzone
            on_move: (x, y) -> { state.joystickPosition = [x, y]; state.isMoving = true; input.setMovement(x, y) }
            on_release: () -> { state.isMoving = false; input.setMovement(0, 0) }
          }
          button "Jump" { position: "bottom-right", icon: "jump", on_press: () -> input.jump() }
        }
      }
    }`;
    const result = parser.parse(source);
    expect(result.success).toBe(true);
  });
});
