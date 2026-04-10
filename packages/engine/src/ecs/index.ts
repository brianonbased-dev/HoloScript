export {
	ComponentRegistry,
	registerBuiltInComponents,
	type ComponentSchema,
} from './ComponentRegistry';

export {
	ComponentStore,
	type ComponentPool,
} from './ComponentStore';

export {
	EntityRegistry,
	type Entity as RegistryEntity,
} from './EntityRegistry';

export {
	SystemScheduler,
	type SystemPhase,
	type SystemDef,
	type PhaseStats,
} from './SystemScheduler';

export {
	World,
	type Entity as WorldEntity,
	type ComponentType,
	type WorldOp,
} from './World';

