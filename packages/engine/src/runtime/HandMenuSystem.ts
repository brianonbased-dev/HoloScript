import {
  HSPlusRuntime,
  VRHand,
  _Vector3,
  type HSPlusNode,
  createUIButton,
  createUIPanel,
} from '@holoscript/core';
import { TransitionSystem } from '../animation/TransitionSystem';
import { AnimationEngine } from '../animation/AnimationEngine';

export class HandMenuSystem {
  private menuNodeId: string | null = null;
  private menuNode: unknown = null;
  private isMenuVisible: boolean = false;
  private isTransitioning: boolean = false;
  private lastToggleTime: number = 0;
  private transitions: TransitionSystem;

  constructor(
    private runtime: HSPlusRuntime,
    engine?: AnimationEngine
  ) {
    this.transitions = new TransitionSystem(engine || new AnimationEngine());
  }

  update(delta: number) {
    // Drive transition animations
    this.transitions.update(delta);

    // Check left hand palm orientation
    const leftHand = (this.runtime as unknown as { vrContext?: { hands?: { left?: VRHand } } })
      .vrContext?.hands?.left;
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
          position: { x: 0, y: 0.03, z: 0.01 },
          width: 0.18,
          height: 0.04,
          data: { action: 'home' },
        }),
        createUIButton(`${menuId}_btn2`, {
          text: 'Settings',
          position: { x: 0, y: -0.03, z: 0.01 },
          width: 0.18,
          height: 0.04,
          data: { action: 'settings' },
        }),
      ]
    );

    // Position near the hand
    menu.properties!.position = {
      x: hand.position.x,
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      y: hand.position.y + 0.1,
      z: hand.position.z,
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
        // @ts-expect-error
        if (this.menuNode?.properties) this.menuNode.properties.scale = s;
      },
      (o) => {
        // @ts-expect-error
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
        // @ts-expect-error
        if (this.menuNode?.properties) this.menuNode.properties.scale = s;
      },
      (o) => {
        // @ts-expect-error
        if (this.menuNode?.properties) this.menuNode.properties.opacity = o;
      },
      {
        duration: 0.25,
        onComplete: () => {
          // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
          if (this.runtime.unmountObject) {
            // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
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
