import type { VRHand, Vector3, HSPlusNode } from '@holoscript/core';
// HSPlusRuntime not yet re-exported from @holoscript/core dist — local shim
type _HSPlusRuntime = { vrContext?: unknown; [key: string]: unknown };
import { createUIButton } from './UIButton';
import { createUIPanel } from './UIPanel';

import { TransitionSystem } from '@holoscript/engine/animation/TransitionSystem';

import { AnimationEngine } from '@holoscript/engine/animation/AnimationEngine';

export class HandMenuSystem {
  private menuNodeId: string | null = null;
  private menuNode: any = null;
  private isMenuVisible: boolean = false;
  private isTransitioning: boolean = false;
  private lastToggleTime: number = 0;
  private transitions: TransitionSystem;

  constructor(
    private runtime: any,
    engine?: AnimationEngine
  ) {
    this.transitions = new TransitionSystem(engine || new AnimationEngine());
  }

  update(delta: number) {
    // Drive transition animations
    this.transitions.update(delta);

    // Check left hand palm orientation
    const leftHand = (this.runtime as unknown as { vrContext?: { hands?: { left?: VRHand } } }).vrContext?.hands?.left;
    if (!leftHand) return;

    if (this.checkPalmFacingUser(leftHand)) {
      if (!this.isMenuVisible && !this.isTransitioning && Date.now() - this.lastToggleTime > 1000) {
        this.showMenu(leftHand);
      }
    } else {
      if (this.isMenuVisible && !this.isTransitioning) {
        this.hideMenu();
      }
    }
  }

  // Check if palm normal points to headset
  private checkPalmFacingUser(_hand: VRHand): boolean {
    // Simplified heuristic — needs real vector math with hand orientation quaternion.
    // Placeholder: returns false until calibrated.
    return false;
  }

  private showMenu(hand: VRHand) {
    if (this.menuNodeId) return;

    const menuId = 'hand_menu_' + Date.now();
    const menu = createUIPanel(
      menuId,
      {
        width: 0.2,
        height: 0.15,
        color: '#1a1a1a',
      },
      [
        createUIButton(`${menuId}_btn1`, {
          text: 'Home',
          position: [0, 0.03, 0.01],
          width: 0.18,
          height: 0.04,
          data: { action: 'home' },
        }),
        createUIButton(`${menuId}_btn2`, {
          text: 'Settings',
          position: [0, -0.03, 0.01],
          width: 0.18,
          height: 0.04,
          data: { action: 'settings' },
        }),
      ]
    );

    // Position near the hand
    const hp = hand.position as unknown as [number, number, number];
    menu.properties!.position = {
      x: hp[0],
      y: hp[1] + 0.1,
      z: hp[2],
    };

    // Start invisible for transition
    menu.properties!.opacity = 0;
    menu.properties!.scale = 0;

    (this.runtime as unknown as { mountObject(node: HSPlusNode): void }).mountObject(menu);
    this.menuNodeId = menuId;
    this.menuNode = menu;
    this.isMenuVisible = true;
    this.isTransitioning = true;
    this.lastToggleTime = Date.now();

    // Animate in: scale + fade
    this.transitions.popIn(
      menuId,
      
      (s) => {
        if (this.menuNode?.properties) this.menuNode.properties.scale = s;
      },
      
      (o) => {
        if (this.menuNode?.properties) this.menuNode.properties.opacity = o;
      },
      {
        duration: 0.35,
        onComplete: () => {
          this.isTransitioning = false;
        },
      }
    );
  }

  private hideMenu() {
    if (!this.menuNodeId || !this.menuNode) return;

    this.isTransitioning = true;
    const nodeIdToRemove = this.menuNodeId;

    // Animate out: scale + fade, then unmount
    this.transitions.popOut(
      nodeIdToRemove,
      
      (s) => {
        if (this.menuNode?.properties) this.menuNode.properties.scale = s;
      },
      
      (o) => {
        if (this.menuNode?.properties) this.menuNode.properties.opacity = o;
      },
      {
        duration: 0.25,
        onComplete: () => {
          
          if (this.runtime.unmountObject) {
            
            this.runtime.unmountObject(nodeIdToRemove);
          }
          this.isTransitioning = false;
        },
      }
    );

    this.menuNodeId = null;
    this.menuNode = null;
    this.isMenuVisible = false;
    this.lastToggleTime = Date.now();
  }
}
