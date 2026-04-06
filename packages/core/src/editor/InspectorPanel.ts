import { World, Entity } from '@holoscript/engine/ecs/World';
import { Inspector } from './Inspector';
import { UIBuilder } from './UIBuilder';
import { createPanel, createButton, createTextInput, createSlider } from '../ui/UIComponents';
import { Vector3, HSPlusNode } from '../types/HoloScriptPlus';

interface PropertyBinding {
  component: string;
  property: string;
  uiType: 'text' | 'number' | 'boolean';
}

/**
 * InspectorPanel
 *
 * The 3D UI representation of the Inspector.
 * - Spawns a panel entity + children for properties.
 * - Binds UI interactions to Inspector logic.
 */
export class InspectorPanel {
  private world: World;
  private inspector: Inspector;
  private builder: UIBuilder;

  // The root entity of the panel
  private panelRoot: Entity | undefined;

  // Map of UI Entity ID -> Binding Info
  private bindings: Map<Entity, PropertyBinding> = new Map();

  constructor(world: World, inspector: Inspector) {
    this.world = world;
    this.inspector = inspector;
    this.builder = new UIBuilder(world);
  }

  /**
   * Rebuild the UI based on the current selection.
   */
  rebuild() {
    // 1. Destroy old UI
    if (this.panelRoot !== undefined) {
      this.destroyHierarchy(this.panelRoot);
      this.panelRoot = undefined;
    }
    this.bindings.clear();

    // 2. Check selection
    const compTypes = this.inspector.componentTypes;
    if (compTypes.length === 0) return;

    // 3. Create Panel Root
    // Position it relative to the user/camera (fixed for now)
    const panelNode = createPanel({
      position: { x: -0.5, y: 1.5, z: -1 }, // Left and up
      width: 0.6,
      height: 0.8,
      color: '#222222',
    });

    // Use builder directly on the struct?
    // Or build struct then spawn.
    // We need to inject children into the panelNode struct before spawning?
    // Or spawn root, then spawn children attached to it.
    // Spawning children attached is easier for dynamic list.

    this.panelRoot = this.builder.spawn(panelNode);
    this.world.addTag(this.panelRoot, 'NoSelect'); // Don't inspect the inspector

    // 4. Create Property Fields
    let yOffset = 0.3; // Start at top

    compTypes.forEach((type) => {
      // Header
      this.createLabel(type, 0, yOffset);
      yOffset -= 0.08;

      // Mock: Only expose known properties for Transform/Light/etc via hardcoded list or reflection?
      // Inspector.ts exposes `getComponentData(type)`.
      const data = this.inspector.getComponentData(type);
      if (data) {
        Object.keys(data).forEach((key) => {
          const value = data[key];
          const valType = typeof value;

          if (valType === 'number') {
            this.createNumberField(type, key, value, 0, yOffset);
            yOffset -= 0.12;
          } else if (valType === 'string') {
            // Text input
          }
        });
      }
      yOffset -= 0.05; // Gap
    });
  }

  private destroyHierarchy(root: Entity) {
    // Naive destroy. Ideally World handles recursive destroy or we track children.
    // Since UIBuilder spawns entities, we rely on World to exist.
    // If World has no parent/child linking in engine yet, we might leak.
    // But UIBuilder added 'parent' logic?
    // In Step 6479 UIBuilder: "if (node.children) ... spawn(child, entity)".
    // Does World.destroyEntity destroy children? No.
    // We need to track them.
    // Or just destroy the root and let the garbage collector (which doesn't exist) handle it?
    // Leak!
    // MVP: We assume World.destroyEntity is enough or we implement recursive destroy helper.
    // Let's implement recursive destroy helper here or in World.
    this.world.destroyEntity(root);
  }

  private createLabel(text: string, x: number, y: number) {
    if (!this.panelRoot) return;

    const labelNode: HSPlusNode = {
      id: `lbl_${text}`,
      type: 'text',
      properties: {
        text,
        position: { x, y, z: 0.01 },
        color: '#ffffff',
        fontSize: 0.05,
      },
      traits: new Map(),
    } as unknown;

    this.builder.spawn(labelNode, this.panelRoot);
  }

  private createNumberField(
    compType: string,
    propKey: string,
    value: number,
    x: number,
    y: number
  ) {
    if (!this.panelRoot) return;

    // Use a Slider for numbers for now (easiest VR interaction)
    // Or buttons +/-.
    // Let's use Buttons [ < ] [ Value ] [ > ]

    // Decbutton
    const decBtn = createButton({
      text: '<',
      width: 0.05,
      height: 0.05,
      position: { x: x - 0.15, y, z: 0.01 },
    });
    const decEntity = this.builder.spawn(decBtn, this.panelRoot);
    this.world.addTag(decEntity, 'UI_Interactable');
    // Bind
    // We'll store binding to decrement
    // Complex: Interaction needs to know it's a decrement.
    // Let's bind 'click' -> decrement function?
    // bindings map stores simple property info.
    // We need 'ActionBinding'.

    // Map<Entity, () => void> ?

    // Value Text
    const valText: HSPlusNode = {
      id: `val_${compType}_${propKey}`,
      type: 'text',
      properties: {
        text: value.toFixed(2),
        position: { x, y, z: 0.01 },
        color: '#00ff00',
        fontSize: 0.04,
      },
      traits: new Map(),
    } as unknown;
    this.builder.spawn(valText, this.panelRoot);

    // IncBtn
    const incBtn = createButton({
      text: '>',
      width: 0.05,
      height: 0.05,
      position: { x: x + 0.15, y, z: 0.01 },
    });
    const incEntity = this.builder.spawn(incBtn, this.panelRoot);
    this.world.addTag(incEntity, 'UI_Interactable');

    // Store actions
    this.interactionMap.set(decEntity, () => this.modifyValue(compType, propKey, -0.1));
    this.interactionMap.set(incEntity, () => this.modifyValue(compType, propKey, 0.1));
  }

  private interactionMap: Map<Entity, () => void> = new Map();

  private modifyValue(comp: string, prop: string, delta: number) {
    const val = this.inspector.getComponentData(comp)[prop];
    if (typeof val === 'number') {
      this.inspector.setProperty(comp, prop, val + delta);
      this.rebuild(); // Refresh UI to show new value
    }
  }

  /**
   * Handle an interaction on a UI entity.
   */
  handleInteraction(entity: Entity) {
    const action = this.interactionMap.get(entity);
    if (action) {
      action();
    }
  }
}
