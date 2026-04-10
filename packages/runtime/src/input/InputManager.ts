import * as THREE from 'three';

export interface InputEvent {
  type: 'hover' | 'leave' | 'select_start' | 'select_end' | 'grab_start' | 'grab_end';
  object: THREE.Object3D;
  source: 'mouse' | 'hand_left' | 'hand_right';
  point?: THREE.Vector3;
}

export class InputManager {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hoveredObject: THREE.Object3D | null = null;
  private heldObject: THREE.Object3D | null = null;
  private isMouseDown = false;

  // VR Controllers
  private controllers: THREE.XRTargetRaySpace[] = [];

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private canvas: HTMLElement
  ) {
    this.setupMouse();
  }

  setupVR(renderer: THREE.WebGLRenderer) {
    const controller0 = renderer.xr.getController(0);
    const controller1 = renderer.xr.getController(1);

    controller0.addEventListener('selectstart', () =>
      this.onSelectStart('hand_right', controller0)
    );
    controller0.addEventListener('selectend', () => this.onSelectEnd('hand_right'));

    controller1.addEventListener('selectstart', () => this.onSelectStart('hand_left', controller1));
    controller1.addEventListener('selectend', () => this.onSelectEnd('hand_left'));

    this.controllers = [controller0, controller1];
    this.scene.add(controller0); // Add controller models/rays visually usually done differently but keeping simple
    this.scene.add(controller1);
  }

  private setupMouse() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Move held object if any (simple drag)
      if (this.heldObject && this.isMouseDown) {
        // Complex logic needed for proper dragging, implementing simple follow for now
        // Or leave it to 'onUpdate' in traits
      }
    });

    this.canvas.addEventListener('mousedown', () => {
      this.isMouseDown = true;
      this.onSelectStart('mouse');
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.onSelectEnd('mouse');
    });
  }

  onSelectStart(source: 'mouse' | 'hand_left' | 'hand_right', _controller?: THREE.Object3D) {
    if (this.hoveredObject) {
      this.heldObject = this.hoveredObject;
      this.heldObject.userData.isHeld = true; // Signal to traits
      this.dispatch('select_start', this.heldObject, source);

      if (this.heldObject.userData.grabbable) {
        this.dispatch('grab_start', this.heldObject, source);
      }
    }
  }

  onSelectEnd(source: 'mouse' | 'hand_left' | 'hand_right') {
    if (this.heldObject) {
      this.heldObject.userData.isHeld = false; // Signal to traits
      this.dispatch('select_end', this.heldObject, source);

      if (this.heldObject.userData.grabbable) {
        this.dispatch('grab_end', this.heldObject, source);
      }
      this.heldObject = null;
    }
  }

  update() {
    // Mouse Raycast
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    // Filter for interactable objects
    const hit = intersects.find(
      (i) =>
        i.object.userData.grabbable ||
        i.object.userData.interactable ||
        i.object.userData.holoObject
    );

    if (hit) {
      if (this.hoveredObject !== hit.object) {
        if (this.hoveredObject) {
          this.hoveredObject.userData.isHovered = false;
          this.dispatch('leave', this.hoveredObject, 'mouse');
        }
        this.hoveredObject = hit.object;
        this.hoveredObject.userData.isHovered = true;
        this.dispatch('hover', this.hoveredObject, 'mouse', hit.point);

        // Cursor hint
        this.canvas.style.cursor = 'pointer';
      }
    } else {
      if (this.hoveredObject) {
        this.hoveredObject.userData.isHovered = false;
        this.dispatch('leave', this.hoveredObject, 'mouse');
        this.hoveredObject = null;
        this.canvas.style.cursor = 'default';
      }
    }

    // VR Controller Raycasting would go here
  }

  private dispatch(
    _type: InputEvent['type'],
    _object: THREE.Object3D,
    _source: InputEvent['source'],
    _point?: THREE.Vector3
  ) {
    // Could emit global events or call methods on object if we had a component system
    // For now, setting userData properties acts as the communication bridge to Traits
    // Also logging for debug
    // console.log(`[Input] ${type} on ${object.name}`);
  }
}
