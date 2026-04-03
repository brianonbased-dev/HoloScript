import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { pushObjectTrait } from '../runtime-types';

export interface TraitContext {
  object: THREE.Object3D;
  physicsWorld: PhysicsWorld;
  config: Record<string, any>;
  data: Record<string, any>; // Trait-specific runtime data
}

export interface TraitHandler {
  name: string;
  onApply?: (context: TraitContext) => void;
  onUpdate?: (context: TraitContext, delta: number) => void;
  onRemove?: (context: TraitContext) => void;
}

export class TraitSystem {
  private handlers: Map<string, TraitHandler> = new Map();
  private activeTraits: Map<string, TraitContext[]> = new Map();

  constructor(private physicsWorld: PhysicsWorld) {}

  register(handler: TraitHandler): void {
    this.handlers.set(handler.name, handler);
    this.activeTraits.set(handler.name, []);
  }

  apply(object: THREE.Object3D, traitName: string, config: Record<string, any> = {}): void {
    const handler = this.handlers.get(traitName);
    if (!handler) {
      console.warn(`Trait ${traitName} not registered`);
      return;
    }

    const context: TraitContext = {
      object,
      physicsWorld: this.physicsWorld,
      config,
      data: {},
    };

    if (handler.onApply) {
      handler.onApply(context);
    }

    const contexts = this.activeTraits.get(traitName)!;
    contexts.push(context);

    // Store context on object for easy access/removal
    pushObjectTrait(object, { name: traitName, context });
  }

  update(delta: number): void {
    this.activeTraits.forEach((contexts, name) => {
      const handler = this.handlers.get(name);
      if (handler && handler.onUpdate) {
        for (const context of contexts) {
          handler.onUpdate(context, delta);
        }
      }
    });
  }

  remove(_object: THREE.Object3D, _traitName: string): void {
    // Determine which context to remove
    // (Implementation omitted for brevity, would need to find specific context)
  }
}
