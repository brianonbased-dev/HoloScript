/**
 * CompletionProvider.ts
 *
 * Provides auto-completion for HoloScript editing.
 * Covers traits, directives, node types, properties, presets,
 * domain blocks, simulation constructs, and HSPlus keywords.
 *
 * @version 4.2.0
 */

export interface CompletionItem {
    label: string;
    kind: 'trait' | 'directive' | 'property' | 'type' | 'keyword' | 'preset' | 'snippet' | 'block' | 'module';
    detail?: string;
    insertText?: string;
    documentation?: string;
}

// Known trait names
const TRAIT_COMPLETIONS: CompletionItem[] = [
    { label: 'grabbable', kind: 'trait', detail: 'Make node grabbable in VR', insertText: '@grabbable' },
    { label: 'audio', kind: 'trait', detail: 'Spatial audio source', insertText: '@audio(sound: "")' },
    { label: 'particles', kind: 'trait', detail: 'Attach particle system', insertText: '@particles(preset: "dust")' },
    { label: 'animation', kind: 'trait', detail: 'Keyframe animation', insertText: '@animation(clip: "")' },
    { label: 'state', kind: 'trait', detail: 'Finite state machine', insertText: '@state(initial: "idle")' },
    { label: 'sync', kind: 'trait', detail: 'Network synchronization', insertText: '@sync(rate: 20)' },
    { label: 'theme', kind: 'trait', detail: 'Apply theme styles', insertText: '@theme(classes: [])' },
    { label: 'events', kind: 'trait', detail: 'Event bus wiring', insertText: '@events(listen: {})' },
    { label: 'scrollable', kind: 'trait', detail: 'Physics-based scrolling', insertText: '@scrollable' },
    { label: 'keyboard', kind: 'trait', detail: 'VR keyboard input', insertText: '@keyboard' },
    // Physics & simulation traits
    { label: 'physics', kind: 'trait', detail: 'Enable physics simulation', insertText: '@physics' },
    { label: 'collidable', kind: 'trait', detail: 'Enable collision detection', insertText: '@collidable' },
    { label: 'networked', kind: 'trait', detail: 'Network replication', insertText: '@networked' },
    { label: 'pbr', kind: 'trait', detail: 'PBR material mode', insertText: '@pbr' },
    { label: 'spatial', kind: 'trait', detail: 'Spatial audio mode', insertText: '@spatial' },
    { label: 'hrtf', kind: 'trait', detail: 'HRTF spatial audio', insertText: '@hrtf' },
    { label: 'looping', kind: 'trait', detail: 'Loop animation/particles', insertText: '@looping' },
    { label: 'dynamic', kind: 'trait', detail: 'Dynamic updates enabled', insertText: '@dynamic' },
    { label: 'lod', kind: 'trait', detail: 'Level of detail system', insertText: '@lod' },
    { label: 'obstacle_avoidance', kind: 'trait', detail: 'AI obstacle avoidance', insertText: '@obstacle_avoidance' },
    { label: 'safety_rated', kind: 'trait', detail: 'Safety-rated component', insertText: '@safety_rated' },
    { label: 'telemetry', kind: 'trait', detail: 'Telemetry streaming', insertText: '@telemetry' },
];

// Known directive names
const DIRECTIVE_COMPLETIONS: CompletionItem[] = [
    { label: 'version', kind: 'directive', detail: 'Scene version', insertText: '@version("1.0")' },
    { label: 'author', kind: 'directive', detail: 'Author metadata', insertText: '@author("")' },
    { label: 'if', kind: 'directive', detail: 'Conditional rendering', insertText: '@if(condition)' },
    { label: 'each', kind: 'directive', detail: 'List iteration', insertText: '@each(items as item)' },
    { label: 'on', kind: 'directive', detail: 'Event handler', insertText: '@on("event")' },
    { label: 'emit', kind: 'directive', detail: 'Emit event', insertText: '@emit("event")' },
    { label: 'slot', kind: 'directive', detail: 'Content slot', insertText: '@slot("default")' },
];

// Node types
const TYPE_COMPLETIONS: CompletionItem[] = [
    { label: 'box', kind: 'type', detail: '3D box primitive' },
    { label: 'sphere', kind: 'type', detail: '3D sphere primitive' },
    { label: 'cylinder', kind: 'type', detail: '3D cylinder primitive' },
    { label: 'plane', kind: 'type', detail: '3D plane primitive' },
    { label: 'panel', kind: 'type', detail: 'UI panel container' },
    { label: 'button', kind: 'type', detail: 'Interactive button' },
    { label: 'text', kind: 'type', detail: 'Text element' },
    { label: 'group', kind: 'type', detail: 'Container node' },
    { label: 'light', kind: 'type', detail: 'Light source' },
    { label: 'camera', kind: 'type', detail: 'Camera viewpoint' },
];

// Property names
const PROPERTY_COMPLETIONS: CompletionItem[] = [
    { label: 'position', kind: 'property', detail: 'Vec3', insertText: 'position: [0, 0, 0]' },
    { label: 'rotation', kind: 'property', detail: 'Vec3', insertText: 'rotation: [0, 0, 0]' },
    { label: 'scale', kind: 'property', detail: 'Vec3', insertText: 'scale: [1, 1, 1]' },
    { label: 'color', kind: 'property', detail: 'Color string', insertText: 'color: "#FFFFFF"' },
    { label: 'opacity', kind: 'property', detail: 'Number 0-1', insertText: 'opacity: 1' },
    { label: 'visible', kind: 'property', detail: 'Boolean', insertText: 'visible: true' },
];

// =============================================================================
// DOMAIN & SIMULATION BLOCK COMPLETIONS (v4.2)
// =============================================================================

const BLOCK_COMPLETIONS: CompletionItem[] = [
    // Core scene
    { label: 'composition', kind: 'block', detail: 'Scene composition', insertText: 'composition "Name" {\n  \n}' },
    { label: 'template', kind: 'block', detail: 'Reusable template', insertText: 'template "Name" {\n  \n}' },
    { label: 'object', kind: 'block', detail: 'Scene object', insertText: 'object "Name" {\n  \n}' },
    { label: 'environment', kind: 'block', detail: 'Environment settings', insertText: 'environment {\n  \n}' },
    // Materials
    { label: 'material', kind: 'block', detail: 'PBR material definition', insertText: 'material "Name" @pbr {\n  baseColor: "#ffffff"\n  roughness: 0.5\n  metallic: 0.0\n}' },
    { label: 'pbr_material', kind: 'block', detail: 'PBR material', insertText: 'pbr_material "Name" {\n  baseColor: "#ffffff"\n  roughness: 0.5\n}' },
    { label: 'unlit_material', kind: 'block', detail: 'Unlit material', insertText: 'unlit_material "Name" {\n  emissive_color: "#ffffff"\n}' },
    // Physics
    { label: 'collider', kind: 'block', detail: 'Collision shape', insertText: 'collider sphere {\n  radius: 0.5\n}' },
    { label: 'rigidbody', kind: 'block', detail: 'Rigid body physics', insertText: 'rigidbody {\n  mass: 1.0\n  use_gravity: true\n}' },
    { label: 'force_field', kind: 'block', detail: 'Force field zone', insertText: 'force_field "Name" {\n  strength: 5.0\n}' },
    { label: 'articulation', kind: 'block', detail: 'Physics articulation', insertText: 'articulation "Name" {\n  \n}' },
    // Particles
    { label: 'particles', kind: 'block', detail: 'Particle system', insertText: 'particles "Name" @looping {\n  max_particles: 500\n  emission { rate: 50 }\n}' },
    { label: 'vfx', kind: 'block', detail: 'Visual effect', insertText: 'vfx "Name" {\n  \n}' },
    // Post-processing
    { label: 'post_processing', kind: 'block', detail: 'Post-processing stack', insertText: 'post_processing "Name" {\n  bloom { intensity: 0.5 }\n}' },
    // Audio
    { label: 'audio_source', kind: 'block', detail: 'Spatial audio source', insertText: 'audio_source "Name" @spatial {\n  clip: "audio.ogg"\n  volume: 0.8\n}' },
    { label: 'reverb_zone', kind: 'block', detail: 'Reverb zone', insertText: 'reverb_zone "Name" {\n  decay_time: 2.0\n}' },
    // Weather
    { label: 'weather', kind: 'block', detail: 'Weather system', insertText: 'weather "Name" {\n  wind { speed: 3.0 }\n}' },
    // Procedural
    { label: 'procedural', kind: 'block', detail: 'Procedural generation', insertText: 'procedural "Name" {\n  perlin base { scale: 100 octaves: 6 }\n}' },
    { label: 'scatter', kind: 'block', detail: 'Distribution scatter', insertText: 'scatter "Name" {\n  count: 1000\n}' },
    // LOD
    { label: 'lod', kind: 'block', detail: 'Level of detail', insertText: 'lod {\n  level 0 { mesh: "high.glb" }\n  level 100 { mesh: "low.glb" }\n}' },
    // Navigation
    { label: 'navmesh', kind: 'block', detail: 'Navigation mesh', insertText: 'navmesh "Name" {\n  agent_radius: 0.5\n  agent_height: 2.0\n}' },
    { label: 'behavior_tree', kind: 'block', detail: 'AI behavior tree', insertText: 'behavior_tree "Name" {\n  selector {\n    \n  }\n}' },
    // Input
    { label: 'input', kind: 'block', detail: 'Input mapping', insertText: 'input "Name" {\n  move: "left_stick"\n}' },
    // Domain blocks
    { label: 'sensor', kind: 'block', detail: 'IoT sensor', insertText: 'sensor "Name" {\n  type: "temperature"\n}' },
    { label: 'device', kind: 'block', detail: 'IoT device', insertText: 'device "Name" {\n  protocol: "mqtt"\n}' },
    { label: 'dashboard', kind: 'block', detail: 'Data dashboard', insertText: 'dashboard "Name" {\n  layout: "grid"\n}' },
    { label: 'lesson', kind: 'block', detail: 'Educational lesson', insertText: 'lesson "Name" {\n  objective: ""\n}' },
    { label: 'contract', kind: 'block', detail: 'Web3 smart contract', insertText: 'contract "Name" {\n  chain: "base"\n}' },
];

// HSPlus language keyword completions
const HSPLUS_COMPLETIONS: CompletionItem[] = [
    { label: 'struct', kind: 'keyword', detail: 'Define a struct type', insertText: 'struct Name {\n  \n}' },
    { label: 'enum', kind: 'keyword', detail: 'Define an enum', insertText: 'enum Name {\n  \n}' },
    { label: 'interface', kind: 'keyword', detail: 'Define an interface', insertText: 'interface Name {\n  \n}' },
    { label: 'module', kind: 'keyword', detail: 'Define a module', insertText: 'module Name {\n  \n}' },
    { label: 'function', kind: 'keyword', detail: 'Define a function', insertText: 'function name() {\n  \n}' },
    { label: 'export', kind: 'keyword', detail: 'Export declaration', insertText: 'export ' },
    { label: 'import', kind: 'keyword', detail: 'Import module', insertText: 'import { } from ""' },
];

// Context-specific property completions
const BLOCK_PROPERTY_MAP: Record<string, CompletionItem[]> = {
    material: [
        { label: 'baseColor', kind: 'property', detail: 'Color hex', insertText: 'baseColor: "#ffffff"' },
        { label: 'roughness', kind: 'property', detail: '0.0 - 1.0', insertText: 'roughness: 0.5' },
        { label: 'metallic', kind: 'property', detail: '0.0 - 1.0', insertText: 'metallic: 0.0' },
        { label: 'emissive_color', kind: 'property', detail: 'Emission color', insertText: 'emissive_color: "#000000"' },
        { label: 'opacity', kind: 'property', detail: '0.0 - 1.0', insertText: 'opacity: 1.0' },
        { label: 'ior', kind: 'property', detail: 'Index of refraction', insertText: 'ior: 1.5' },
    ],
    rigidbody: [
        { label: 'mass', kind: 'property', detail: 'Mass in kg', insertText: 'mass: 1.0' },
        { label: 'use_gravity', kind: 'property', detail: 'Boolean', insertText: 'use_gravity: true' },
        { label: 'linear_damping', kind: 'property', detail: '0.0 - 1.0', insertText: 'linear_damping: 0.0' },
        { label: 'angular_damping', kind: 'property', detail: '0.0 - 1.0', insertText: 'angular_damping: 0.05' },
    ],
    particles: [
        { label: 'max_particles', kind: 'property', detail: 'Max count', insertText: 'max_particles: 500' },
        { label: 'duration', kind: 'property', detail: 'Seconds (-1 = infinite)', insertText: 'duration: -1' },
        { label: 'world_space', kind: 'property', detail: 'Boolean', insertText: 'world_space: true' },
    ],
    audio_source: [
        { label: 'clip', kind: 'property', detail: 'Audio file path', insertText: 'clip: ""' },
        { label: 'volume', kind: 'property', detail: '0.0 - 1.0', insertText: 'volume: 0.8' },
        { label: 'loop', kind: 'property', detail: 'Boolean', insertText: 'loop: true' },
        { label: 'spatialization', kind: 'property', detail: '"hrtf" | "stereo"', insertText: 'spatialization: "hrtf"' },
        { label: 'min_distance', kind: 'property', detail: 'Min distance', insertText: 'min_distance: 1' },
        { label: 'max_distance', kind: 'property', detail: 'Max distance', insertText: 'max_distance: 50' },
    ],
};

export class CompletionProvider {
    private customTraits: CompletionItem[] = [];

    /** Register a custom trait completion. */
    registerTrait(item: CompletionItem): void {
        this.customTraits.push(item);
    }

    /** Get context-specific property completions for a block type. */
    getBlockPropertyCompletions(blockType: string): CompletionItem[] {
        return BLOCK_PROPERTY_MAP[blockType] || [];
    }

    /** Get completions at a cursor context. */
    getCompletions(context: { prefix: string; triggerChar?: string; blockContext?: string }): CompletionItem[] {
        const prefix = context.prefix.toLowerCase();

        // @ trigger → show traits and directives
        if (context.triggerChar === '@' || prefix.startsWith('@')) {
            const search = prefix.replace('@', '');
            return [...TRAIT_COMPLETIONS, ...DIRECTIVE_COMPLETIONS, ...this.customTraits]
                .filter(c => c.label.toLowerCase().startsWith(search));
        }

        // Inside a specific block → show context-specific properties
        if (context.blockContext) {
            const blockProps = this.getBlockPropertyCompletions(context.blockContext);
            if (blockProps.length > 0) {
                return [...blockProps, ...PROPERTY_COMPLETIONS]
                    .filter(c => !prefix || c.label.toLowerCase().startsWith(prefix));
            }
        }

        // No prefix → show block types and node types
        if (!prefix) {
            return [...BLOCK_COMPLETIONS, ...TYPE_COMPLETIONS, ...HSPLUS_COMPLETIONS];
        }

        // Property-like context
        if (prefix.includes(':') || prefix.includes('.')) {
            return PROPERTY_COMPLETIONS.filter(c =>
                c.label.toLowerCase().includes(prefix.split(/[:.]/g).pop() || ''),
            );
        }

        // General search across all completion types
        const all = [
            ...BLOCK_COMPLETIONS, ...TYPE_COMPLETIONS, ...PROPERTY_COMPLETIONS,
            ...TRAIT_COMPLETIONS, ...DIRECTIVE_COMPLETIONS, ...HSPLUS_COMPLETIONS,
            ...this.customTraits,
        ];
        return all.filter(c => c.label.toLowerCase().includes(prefix));
    }

    /** Get total available completions. */
    get totalCompletions(): number {
        return TRAIT_COMPLETIONS.length + DIRECTIVE_COMPLETIONS.length +
               TYPE_COMPLETIONS.length + PROPERTY_COMPLETIONS.length +
               BLOCK_COMPLETIONS.length + HSPLUS_COMPLETIONS.length +
               this.customTraits.length;
    }
}
