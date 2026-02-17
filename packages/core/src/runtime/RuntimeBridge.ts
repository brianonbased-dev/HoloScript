/**
 * RuntimeBridge.ts
 *
 * The top-level orchestrator that wires all engine subsystems together.
 * Provides a single API surface for:
 *   parse → run → update → serialize
 *
 * Owns the ECS World, EventBus, ThemeEngine, and SystemScheduler.
 */

import { World } from '../ecs/World';
import { ComponentRegistry, registerBuiltInComponents } from '../ecs/ComponentRegistry';
import { SystemScheduler, SystemPhase } from '../ecs/SystemScheduler';
import { EventBus } from '../events/EventBus';
import { ThemeEngine } from '../theming/ThemeEngine';
import { StyleResolver } from '../theming/StyleResolver';
import { SceneRunner } from './SceneRunner';
import { TraitBinder } from './TraitBinder';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { Entity } from '../ecs/World';

export interface SystemConfig {
    name: string;
    execute?: (dt: number) => void;
    update?: (dt: number) => void;
    phase?: SystemPhase;
    priority?: number;
    enabled?: boolean;
    dependencies?: string[];
    group?: string;
    requiredComponents?: string[];
}

export interface RuntimeConfig {
    theme?: string;
    systems?: SystemConfig[];
}

export class RuntimeBridge {
    readonly world: World;
    readonly eventBus: EventBus;
    readonly themeEngine: ThemeEngine;
    readonly styleResolver: StyleResolver;
    readonly componentRegistry: ComponentRegistry;
    readonly systemScheduler: SystemScheduler;
    readonly traitBinder: TraitBinder;
    readonly sceneRunner: SceneRunner;

    private running: boolean = false;
    private totalTime: number = 0;

    constructor(config: RuntimeConfig = {}) {
        // Core
        this.world = new World();
        this.eventBus = new EventBus();
        this.componentRegistry = new ComponentRegistry();
        registerBuiltInComponents(this.componentRegistry);

        // Theming
        this.themeEngine = new ThemeEngine();
        if (config.theme) this.themeEngine.setTheme(config.theme);
        this.styleResolver = StyleResolver.fromTokens(this.themeEngine.getTokens());

        // Re-create style resolver on theme change
        this.themeEngine.onThemeChange(() => {
            const newResolver = StyleResolver.fromTokens(this.themeEngine.getTokens());
            // Copy rules into existing resolver reference
            (this as any).styleResolver = newResolver;
        });

        // ECS Systems
        this.systemScheduler = new SystemScheduler();
        if (config.systems) {
            for (const sys of config.systems) {
                const executeFn = sys.execute || sys.update;
                if (executeFn) {
                    this.systemScheduler.register(
                        sys.name,
                        executeFn,
                        sys.phase || 'update',
                        sys.priority || 0,
                        sys.dependencies || [],
                        sys.group || 'default'
                    );
                }
            }
        }

        // Traits
        this.traitBinder = new TraitBinder();

        // Scene Runner (connects parser output to ECS)
        this.sceneRunner = new SceneRunner({
            world: this.world,
            traitBinder: this.traitBinder,
            eventBus: this.eventBus,
        });
    }

    /**
     * Load and execute parsed AST.
     */
    loadScene(root: HSPlusNode): Entity {
        this.eventBus.emit('scene:loading', { nodeCount: this.countNodes(root) });
        const rootEntity = this.sceneRunner.run(root);
        this.eventBus.emit('scene:loaded', { rootEntity, spawnedCount: this.sceneRunner.spawnedCount });
        return rootEntity;
    }

    /**
     * Run one frame of the simulation.
     */
    update(delta: number): void {
        if (!this.running) return;
        this.totalTime += delta;
        this.systemScheduler.update(delta);
        this.eventBus.emit('frame', { delta, totalTime: this.totalTime });
    }

    /**
     * Start the update loop.
     */
    start(): void {
        this.running = true;
        this.eventBus.emit('runtime:start');
    }

    /**
     * Stop the update loop.
     */
    stop(): void {
        this.running = false;
        this.eventBus.emit('runtime:stop');
    }

    /**
     * Unload the current scene.
     */
    unloadScene(): void {
        this.sceneRunner.despawnAll();
        this.eventBus.emit('scene:unloaded');
    }

    /**
     * Check if running.
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * Get total elapsed time.
     */
    getTotalTime(): number {
        return this.totalTime;
    }

    /**
     * Reset everything.
     */
    reset(): void {
        this.stop();
        this.unloadScene();
        this.totalTime = 0;
        this.eventBus.clear();
    }

    private countNodes(node: HSPlusNode): number {
        let count = 1;
        if (node.children) {
            for (const child of node.children) {
                count += this.countNodes(child);
            }
        }
        return count;
    }
}
