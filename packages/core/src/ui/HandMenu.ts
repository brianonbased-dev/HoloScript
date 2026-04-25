export interface HandLike {
  position?: [number, number, number] | [number, number, number];
  rotation?: unknown;
  orientation?: unknown;
}

export interface HandMenuRuntime {
  vrContext?: {
    hands?: {
      left?: HandLike | null;
      right?: HandLike | null;
    };
    headset?: {
      position?: [number, number, number];
      rotation?: unknown;
    };
  } | null;
  mountObject?: (node: unknown) => unknown;
  unmountObject?: (id: string) => void;
  createNode?: (...args: unknown[]) => unknown;
}

interface HandMenuNode {
  id: string;
  type: 'object';
  name: string;
  properties: {
    position: [number, number, number];
    scale: number;
    opacity: number;
    geometry: string;
    color: string;
  };
}

const MENU_Y_OFFSET = 0.12;
const TOGGLE_DEBOUNCE_MS = 250;

function coord(
  value: [number, number, number] | [number, number, number] | undefined,
  index: 0 | 1 | 2,
  key: 'x' | 'y' | 'z'
): number {
  if (!value) return 0;
  return Array.isArray(value) ? (value[index] ?? 0) : (value[key] ?? 0);
}

export class HandMenuSystem {
  private runtime: HandMenuRuntime;
  private isMenuVisible = false;
  private menuNodeId: string | null = null;
  private lastToggleTime = 0;
  private transitions = { showDuration: 0.18, hideDuration: 0.12 };

  constructor(runtime: HandMenuRuntime) {
    this.runtime = runtime;
  }

  update(_delta: number): void {
    const leftHand = this.runtime.vrContext?.hands?.left;
    if (!leftHand) return;

    const palmFacingUser = this.checkPalmFacingUser(leftHand);

    if (palmFacingUser) {
      const now = Date.now();
      if (!this.isMenuVisible && now - this.lastToggleTime >= TOGGLE_DEBOUNCE_MS) {
        this.showMenu(leftHand);
      }
      return;
    }

    if (this.isMenuVisible) {
      this.hideMenu();
    }
  }

  private checkPalmFacingUser(_hand: HandLike): boolean {
    return false;
  }

  private showMenu(hand: HandLike): void {
    if (this.isMenuVisible) return;

    const basePosition = hand.position;
    const node: HandMenuNode = {
      id: `hand_menu_${Date.now()}`,
      type: 'object',
      name: 'HandMenu',
      properties: {
        position: [
          coord(basePosition, 0, 'x'),
          coord(basePosition, 1, 'y') + MENU_Y_OFFSET,
          coord(basePosition, 2, 'z'),
        ],
        scale: 0,
        opacity: 0,
        geometry: 'plane',
        color: '#222222',
      },
    };

    this.runtime.mountObject?.(node);
    this.menuNodeId = node.id;
    this.isMenuVisible = true;
    this.lastToggleTime = Date.now();
  }

  private hideMenu(): void {
    if (!this.isMenuVisible) return;

    if (this.menuNodeId) {
      this.runtime.unmountObject?.(this.menuNodeId);
    }

    this.isMenuVisible = false;
    this.menuNodeId = null;
    this.lastToggleTime = Date.now();
  }
}
