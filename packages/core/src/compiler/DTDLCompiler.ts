/**
 * HoloScript → Azure DTDL (Digital Twin Definition Language) Compiler
 *
 * Generates DTDL v3 compliant models for Azure Digital Twins from HoloScript.
 *
 * Maps:
 *   - Composition → DTDL Interface
 *   - Templates → DTDL Interfaces with extends
 *   - @state → DTDL Properties
 *   - @on_* handlers → DTDL Commands
 *   - emit() calls → DTDL Telemetry
 *   - Object hierarchy → DTDL Relationships
 *   - Traits → DTDL Components
 *
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from './identity/ANSNamespace';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloTemplate,
  HoloState,
  HoloLogic,
  HoloValue,
  HoloEnvironment,
} from '../parser/HoloCompositionTypes';
import type { Extensible } from '../types/utility-types';

export interface DTDLCompilerOptions {
  /** DTDL context version */
  dtdlVersion?: 2 | 3;
  /** Base namespace for model IDs */
  namespace?: string;
  /** Model version */
  modelVersion?: number;
  /** Include description comments */
  includeDescriptions?: boolean;
  /** Include HoloScript trait mappings */
  includeTraitComponents?: boolean;
}

// DTDL Types
export interface DTDLInterface {
  '@context': string;
  '@type': 'Interface';
  '@id': string;
  displayName?: string;
  description?: string;
  extends?: string | string[];
  contents?: DTDLContent[];
  schemas?: DTDLSchema[];
}

export type DTDLContent =
  | DTDLProperty
  | DTDLTelemetry
  | DTDLCommand
  | DTDLRelationship
  | DTDLComponent;

export interface DTDLProperty {
  '@type': 'Property' | ['Property', ...string[]];
  name: string;
  schema: DTDLSchema;
  displayName?: string;
  description?: string;
  writable?: boolean;
  unit?: string;
}

export interface DTDLTelemetry {
  '@type': 'Telemetry' | ['Telemetry', ...string[]];
  name: string;
  schema: DTDLSchema;
  displayName?: string;
  description?: string;
  unit?: string;
}

export interface DTDLCommand {
  '@type': 'Command';
  name: string;
  displayName?: string;
  description?: string;
  request?: {
    name: string;
    schema: DTDLSchema;
  };
  response?: {
    name: string;
    schema: DTDLSchema;
  };
}

export interface DTDLRelationship {
  '@type': 'Relationship';
  name: string;
  displayName?: string;
  description?: string;
  target?: string;
  minMultiplicity?: number;
  maxMultiplicity?: number;
  properties?: DTDLProperty[];
}

export interface DTDLComponent {
  '@type': 'Component';
  name: string;
  schema: DTDLSchema;
  displayName?: string;
  description?: string;
}

export type DTDLSchema =
  | string
  | DTDLMapSchema
  | DTDLArraySchema
  | DTDLEnumSchema
  | DTDLObjectSchema;

export interface DTDLMapSchema {
  '@type': 'Map';
  mapKey: { name: string; schema: DTDLSchema };
  mapValue: { name: string; schema: DTDLSchema };
}

export interface DTDLArraySchema {
  '@type': 'Array';
  elementSchema: DTDLSchema;
}

export interface DTDLEnumSchema {
  '@type': 'Enum';
  valueSchema: 'integer' | 'string';
  enumValues: Array<{ name: string; enumValue: string | number; displayName?: string }>;
}

export interface DTDLObjectSchema {
  '@type': 'Object';
  fields: Array<{ name: string; schema: DTDLSchema; displayName?: string }>;
}

export class DTDLCompiler extends CompilerBase {
  protected readonly compilerName = 'DTDLCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.DTDL;
  }

  private options: Required<DTDLCompilerOptions>;
  private generatedInterfaces: DTDLInterface[] = [];

  constructor(options: DTDLCompilerOptions = {}) {
    super();
    this.options = {
      dtdlVersion: options.dtdlVersion ?? 3,
      namespace: options.namespace || 'dtmi:holoscript',
      modelVersion: options.modelVersion ?? 1,
      includeDescriptions: options.includeDescriptions ?? true,
      includeTraitComponents: options.includeTraitComponents ?? true,
    };
  }

  /**
   * Get trait name from either string or { name: string } format
   */
  private getTraitName(trait: string | { name: string }): string {
    return typeof trait === 'string' ? trait : trait.name;
  }

  /**
   * Check if traits include a specific trait name
   */
  private hasTrait(
    traits: Array<string | { name: string }> | undefined,
    targetTrait: string
  ): boolean {
    return traits?.some((t) => this.getTraitName(t) === targetTrait) ?? false;
  }

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    this.generatedInterfaces = [];

    // Generate interfaces for templates first (they're base types)
    if (composition.templates) {
      for (const template of composition.templates) {
        this.generatedInterfaces.push(this.compileTemplate(template));
      }
    }

    // Generate the main composition interface
    const mainInterface = this.compileComposition(composition);
    this.generatedInterfaces.push(mainInterface);

    // Generate interfaces for objects that define state/logic
    if (composition.objects) {
      for (const obj of composition.objects) {
        if (this.objectNeedsInterface(obj)) {
          this.generatedInterfaces.push(this.compileObject(obj));
        }
      }
    }

    // Return as JSON array
    return JSON.stringify(this.generatedInterfaces, null, 2);
  }

  private compileComposition(composition: HoloComposition): DTDLInterface {
    const modelId = this.generateModelId(composition.name);
    const contents: DTDLContent[] = [];

    // Add environment properties
    if (composition.environment) {
      contents.push(...this.compileEnvironmentProperties(composition.environment));
    }

    // Add state as properties
    if (composition.state) {
      contents.push(...this.compileStateProperties(composition.state));
    }

    // Add logic handlers as commands
    if (composition.logic) {
      contents.push(...this.compileLogicCommands(composition.logic));
    }

    // Add relationships to objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        contents.push(this.createObjectRelationship(obj));
      }
    }

    // Add spatial group relationships
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        contents.push({
          '@type': 'Relationship',
          name: this.sanitizeName(group.name),
          displayName: group.name,
          description: `Spatial group containing ${group.objects?.length || 0} objects`,
        });
      }
    }

    const iface: DTDLInterface = {
      '@context': this.getDtdlContext(),
      '@type': 'Interface',
      '@id': modelId,
      displayName: composition.name,
      contents,
    };

    if (this.options.includeDescriptions) {
      iface.description = `Generated from HoloScript composition "${this.escapeStringValue(composition.name as string, 'TypeScript')}"`;
    }

    return iface;
  }

  private compileTemplate(template: HoloTemplate): DTDLInterface {
    const modelId = this.generateModelId(template.name);
    const contents: DTDLContent[] = [];

    // Template state as properties
    if (template.state) {
      contents.push(...this.compileStateProperties(template.state));
    }

    // Template actions as commands
    if (template.actions) {
      for (const action of template.actions) {
        contents.push({
          '@type': 'Command',
          name: action.name,
          displayName: action.name,
          description: `Action defined in template ${this.escapeStringValue(template.name as string, 'TypeScript')}`,
        });
      }
    }

    // Traits as components - handle both string array and object array formats
    if (template.traits && this.options.includeTraitComponents) {
      for (const trait of template.traits) {
        // Handle both { name: 'physics' } and 'physics' formats
        const traitName = typeof trait === 'string' ? trait : trait.name;
        const component = this.traitToComponent(traitName);
        if (component) {
          contents.push(component);
        }
      }
    }

    const iface: DTDLInterface = {
      '@context': this.getDtdlContext(),
      '@type': 'Interface',
      '@id': modelId,
      displayName: template.name,
      contents,
    };

    // Handle template inheritance
    const templateExt = template as Extensible<HoloTemplate>;
    if (templateExt.extends) {
      iface.extends = [this.generateModelId(templateExt.extends as string)];
    }

    return iface;
  }

  private compileObject(obj: HoloObjectDecl): DTDLInterface {
    const modelId = this.generateModelId(obj.name);
    const contents: DTDLContent[] = [];

    // Add position as property
    const posProp = obj.properties.find((p) => p.key === 'position');
    if (posProp) {
      contents.push({
        '@type': ['Property', 'Location'],
        name: 'position',
        schema: {
          '@type': 'Object',
          fields: [
            { name: 'x', schema: 'double' },
            { name: 'y', schema: 'double' },
            { name: 'z', schema: 'double' },
          ],
        },
        writable: true,
      });
    }

    // Add other properties
    for (const prop of obj.properties) {
      if (prop.key !== 'position' && prop.key !== 'geometry') {
        contents.push(this.propertyToContent(prop.key, prop.value));
      }
    }

    // Add telemetry for sensor traits - handle both string and object trait formats
    if (this.hasTrait(obj.traits, 'sensor') || this.hasTrait(obj.traits, 'observable')) {
      contents.push({
        '@type': 'Telemetry',
        name: 'sensorReading',
        schema: 'double',
        description: 'Sensor telemetry data',
      });
    }

    // Add traits as components - handle both string and object trait formats
    if (obj.traits && this.options.includeTraitComponents) {
      for (const trait of obj.traits) {
        const traitName = this.getTraitName(trait);
        const component = this.traitToComponent(traitName);
        if (component) {
          contents.push(component);
        }
      }
    }

    const iface: DTDLInterface = {
      '@context': this.getDtdlContext(),
      '@type': 'Interface',
      '@id': modelId,
      displayName: obj.name,
      contents,
    };

    // Handle template usage
    if (obj.template) {
      iface.extends = this.generateModelId(obj.template);
    }

    return iface;
  }

  private compileEnvironmentProperties(env: HoloEnvironment): DTDLProperty[] {
    const props: DTDLProperty[] = [];

    // Handle both structured format (properties array) and plain object format
    const envExt = env as Extensible<HoloEnvironment>;

    // If env has a properties array, use it; otherwise treat env itself as key-value object
    if (Array.isArray(envExt.properties)) {
      for (const prop of envExt.properties as Array<{ key: string; value: unknown }>) {
        this.addEnvironmentProperty(props, prop.key, prop.value);
      }
    } else {
      // Plain object format: { skybox: 'sunset', ambient_light: 0.5 }
      for (const key of Object.keys(envExt)) {
        if (key !== 'type') {
          this.addEnvironmentProperty(props, key, envExt[key]);
        }
      }
    }

    return props;
  }

  private addEnvironmentProperty(props: DTDLProperty[], key: string, _value: unknown): void {
    if (key === 'skybox') {
      props.push({
        '@type': 'Property',
        name: 'skybox',
        schema: 'string',
        displayName: 'Skybox',
        description: 'Environment skybox setting',
      });
    } else if (key === 'ambient_light') {
      props.push({
        '@type': 'Property',
        name: 'ambientLight',
        schema: 'double',
        displayName: 'Ambient Light',
        description: 'Ambient light level',
      });
    } else if (key === 'fog') {
      props.push({
        '@type': 'Property',
        name: 'fogEnabled',
        schema: 'boolean',
        displayName: 'Fog Enabled',
      });
    }
  }

  private compileStateProperties(state: HoloState): DTDLProperty[] {
    const props: DTDLProperty[] = [];

    for (const prop of state.properties) {
      props.push(this.propertyToContent(prop.key, prop.value));
    }

    return props;
  }

  private compileLogicCommands(logic: HoloLogic): DTDLCommand[] {
    const commands: DTDLCommand[] = [];

    // Handle both handlers and rules formats
    const logicExt = logic as Extensible<HoloLogic>;
    const items = (logicExt.handlers || logicExt.rules || []) as Array<{ event: string; actions?: unknown[] }>;

    for (const item of items) {
      const event = item.event;
      if (event?.startsWith('on_')) {
        commands.push({
          '@type': 'Command',
          name: event.replace('on_', ''),
          displayName: this.formatEventName(event),
          description: `Event handler for ${event}`,
        });
      }
    }

    return commands;
  }

  private propertyToContent(key: string, value: HoloValue): DTDLProperty {
    return {
      '@type': 'Property',
      name: this.sanitizeName(key),
      schema: this.inferSchema(value),
      displayName: this.formatDisplayName(key),
      writable: true,
    };
  }

  private createObjectRelationship(obj: HoloObjectDecl): DTDLRelationship {
    return {
      '@type': 'Relationship',
      name: `has${this.pascalCase(obj.name)}`,
      displayName: obj.name,
      target: this.objectNeedsInterface(obj) ? this.generateModelId(obj.name) : undefined,
      maxMultiplicity: 1,
    };
  }

  private traitToComponent(trait: string): DTDLComponent | null {
    // Map HoloScript traits to DTDL components
    const traitComponents: Record<string, { schema: DTDLSchema; description: string }> = {
      grabbable: {
        schema: `${this.options.namespace}:component:Grabbable;${this.options.modelVersion}`,
        description: 'Allows object to be grabbed/manipulated',
      },
      networked: {
        schema: `${this.options.namespace}:component:Networked;${this.options.modelVersion}`,
        description: 'Enables network synchronization',
      },
      physics: {
        schema: `${this.options.namespace}:component:Physics;${this.options.modelVersion}`,
        description: 'Enables physics simulation',
      },
      collidable: {
        schema: `${this.options.namespace}:component:Collidable;${this.options.modelVersion}`,
        description: 'Enables collision detection',
      },
      sensor: {
        schema: `${this.options.namespace}:component:Sensor;${this.options.modelVersion}`,
        description: 'IoT sensor capabilities',
      },
      observable: {
        schema: `${this.options.namespace}:component:Observable;${this.options.modelVersion}`,
        description: 'State observation capabilities',
      },
    };

    const config = traitComponents[trait];
    if (!config) return null;

    return {
      '@type': 'Component',
      name: trait,
      schema: config.schema,
      description: config.description,
    };
  }

  private inferSchema(value: HoloValue): DTDLSchema {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'double';
    }
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) {
      if (value.length > 0) {
        return {
          '@type': 'Array',
          elementSchema: this.inferSchema(value[0]),
        };
      }
      return { '@type': 'Array', elementSchema: 'double' };
    }
    if (typeof value === 'object' && value !== null) {
      const fields = Object.entries(value).map(([k, v]) => ({
        name: k,
        schema: this.inferSchema(v as HoloValue),
      }));
      return { '@type': 'Object', fields };
    }
    return 'string';
  }

  private getDtdlContext(): string {
    return this.options.dtdlVersion === 3 ? 'dtmi:dtdl:context;3' : 'dtmi:dtdl:context;2';
  }

  private generateModelId(name: string): string {
    const sanitized = this.sanitizeName(name);
    return `${this.options.namespace}:${sanitized};${this.options.modelVersion}`;
  }

  private objectNeedsInterface(obj: HoloObjectDecl): boolean {
    // Objects need their own interface if they have state, logic, or complex traits
    const hasState = obj.properties.some((p) => p.key === 'state' || typeof p.value === 'object');
    const complexTraitList = ['networked', 'sensor', 'observable', 'state'];
    const hasComplexTraits = obj.traits?.some((t) =>
      complexTraitList.includes(this.getTraitName(t))
    );
    return hasState || hasComplexTraits || false;
  }

  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_');
  }

  private formatDisplayName(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }

  private formatEventName(event: string): string {
    return event
      .replace(/^on_/, '')
      .replace(/_/g, ' ')
      .replace(/^./, (s) => s.toUpperCase());
  }

  private pascalCase(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }
}

// Export trait component interfaces for reference
export const DTDL_TRAIT_COMPONENTS: DTDLInterface[] = [
  {
    '@context': 'dtmi:dtdl:context;3',
    '@type': 'Interface',
    '@id': 'dtmi:holoscript:component:Grabbable;1',
    displayName: 'Grabbable',
    description: 'Component for objects that can be grabbed in VR/AR',
    contents: [
      { '@type': 'Property', name: 'isGrabbed', schema: 'boolean', writable: false },
      { '@type': 'Property', name: 'grabDistance', schema: 'double', writable: true },
    ],
  },
  {
    '@context': 'dtmi:dtdl:context;3',
    '@type': 'Interface',
    '@id': 'dtmi:holoscript:component:Networked;1',
    displayName: 'Networked',
    description: 'Component for network-synchronized objects',
    contents: [
      { '@type': 'Property', name: 'networkId', schema: 'string', writable: false },
      { '@type': 'Property', name: 'syncRate', schema: 'integer', writable: true },
      { '@type': 'Property', name: 'ownerId', schema: 'string', writable: false },
    ],
  },
  {
    '@context': 'dtmi:dtdl:context;3',
    '@type': 'Interface',
    '@id': 'dtmi:holoscript:component:Physics;1',
    displayName: 'Physics',
    description: 'Component for physics-enabled objects',
    contents: [
      { '@type': 'Property', name: 'mass', schema: 'double', writable: true },
      { '@type': 'Property', name: 'friction', schema: 'double', writable: true },
      { '@type': 'Property', name: 'restitution', schema: 'double', writable: true },
      { '@type': 'Property', name: 'isKinematic', schema: 'boolean', writable: true },
    ],
  },
  {
    '@context': 'dtmi:dtdl:context;3',
    '@type': 'Interface',
    '@id': 'dtmi:holoscript:component:Sensor;1',
    displayName: 'Sensor',
    description: 'Component for IoT sensor capabilities',
    contents: [
      { '@type': 'Property', name: 'sensorType', schema: 'string', writable: false },
      { '@type': 'Telemetry', name: 'value', schema: 'double' },
      { '@type': 'Telemetry', name: 'timestamp', schema: 'dateTime' },
    ],
  },
];

export default DTDLCompiler;
