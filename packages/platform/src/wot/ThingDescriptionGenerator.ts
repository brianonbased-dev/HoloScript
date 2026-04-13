/**
 * W3C WoT Thing Description Generator
 *
 * Generates W3C Thing Description 1.1 JSON from HoloScript objects
 * with @wot_thing trait.
 *
 * @see https://www.w3.org/TR/wot-thing-description11/
 * @version 1.0.0
 */

import type { HSPlusNode } from '@holoscript/core';

// Local directive type (HSPlusDirective is not exported from @holoscript/core)
type HSPlusDirective = { type: string; name?: string; [key: string]: unknown };

// =============================================================================
// W3C THING DESCRIPTION TYPES (TD 1.1)
// =============================================================================

export type SecurityScheme =
  | NoSecurityScheme
  | BasicSecurityScheme
  | BearerSecurityScheme
  | OAuth2SecurityScheme
  | APIKeySecurityScheme;

export interface NoSecurityScheme {
  scheme: 'nosec';
}

export interface BasicSecurityScheme {
  scheme: 'basic';
  in?: 'header' | 'query' | 'body' | 'cookie';
  name?: string;
}

export interface BearerSecurityScheme {
  scheme: 'bearer';
  in?: 'header' | 'query' | 'body' | 'cookie';
  name?: string;
  authorization?: string;
  alg?: string;
  format?: string;
}

export interface OAuth2SecurityScheme {
  scheme: 'oauth2';
  flow: 'code' | 'client' | 'implicit' | 'device';
  authorization?: string;
  token?: string;
  refresh?: string;
  scopes?: string[];
}

export interface APIKeySecurityScheme {
  scheme: 'apikey';
  in: 'header' | 'query' | 'body' | 'cookie';
  name: string;
}

export interface DataSchema {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  type?: 'boolean' | 'integer' | 'number' | 'string' | 'object' | 'array' | 'null';
  const?: unknown;
  default?: unknown;
  unit?: string;
  oneOf?: DataSchema[];
  enum?: unknown[];
  readOnly?: boolean;
  writeOnly?: boolean;
  format?: string;
  items?: DataSchema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, DataSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export interface Form {
  href: string;
  contentType?: string;
  contentCoding?: string;
  subprotocol?: string;
  security?: string | string[];
  scopes?: string | string[];
  op?: string | string[];
}

export interface PropertyAffordance extends DataSchema {
  forms?: Form[];
  observable?: boolean;
}

export interface ActionAffordance {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  forms?: Form[];
  input?: DataSchema;
  output?: DataSchema;
  safe?: boolean;
  idempotent?: boolean;
  synchronous?: boolean;
}

export interface EventAffordance {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  forms?: Form[];
  subscription?: DataSchema;
  data?: DataSchema;
  dataResponse?: DataSchema;
  cancellation?: DataSchema;
}

export interface Link {
  href: string;
  type?: string;
  rel?: string;
  anchor?: string;
  hreflang?: string | string[];
}

export interface ThingDescription {
  '@context': string | (string | Record<string, string>)[];
  '@type'?: string | string[];
  id?: string;
  title: string;
  titles?: Record<string, string>;
  description?: string;
  descriptions?: Record<string, string>;
  version?: { instance: string; model?: string };
  created?: string;
  modified?: string;
  support?: string;
  base?: string;
  properties?: Record<string, PropertyAffordance>;
  actions?: Record<string, ActionAffordance>;
  events?: Record<string, EventAffordance>;
  links?: Link[];
  forms?: Form[];
  security: string | string[];
  securityDefinitions: Record<string, SecurityScheme>;
}

// =============================================================================
// WOT THING TRAIT CONFIG
// =============================================================================

export interface WoTThingConfig {
  title: string;
  description?: string;
  security: 'nosec' | 'basic' | 'bearer' | 'oauth2' | 'apikey';
  base?: string;
  id?: string;
  version?: string;
}

// =============================================================================
// GENERATOR OPTIONS
// =============================================================================

export interface ThingDescriptionGeneratorOptions {
  /** Base URL for form hrefs */
  baseUrl?: string;
  /** Default content type for forms */
  contentType?: string;
  /** Include observable flag for all properties */
  defaultObservable?: boolean;
  /** Custom security definitions */
  securityDefinitions?: Record<string, SecurityScheme>;
}

// =============================================================================
// THING DESCRIPTION GENERATOR
// =============================================================================

export class ThingDescriptionGenerator {
  private options: ThingDescriptionGeneratorOptions;

  constructor(options: ThingDescriptionGeneratorOptions = {}) {
    this.options = {
      baseUrl: options.baseUrl || '',
      contentType: options.contentType || 'application/json',
      defaultObservable: options.defaultObservable ?? true,
      securityDefinitions: options.securityDefinitions,
    };
  }

  /**
   * Generate a Thing Description from a HoloScript node with @wot_thing trait
   */
  generate(node: HSPlusNode): ThingDescription | null {
    const wotTrait = this.findWoTTrait(node);
    if (!wotTrait) {
      return null;
    }

    const config = this.parseWoTConfig(wotTrait);
    const stateProperties = this.extractStateProperties(node);
    const actions = this.extractActions(node);
    const events = this.extractEvents(node);

    const td: ThingDescription = {
      '@context': 'https://www.w3.org/2022/wot/td/v1.1',
      id: config.id || `urn:holoscript:${node.name || 'thing'}`,
      title: config.title || node.name || 'Unnamed Thing',
      security: 'default',
      securityDefinitions: this.buildSecurityDefinitions(config.security),
    };

    if (config.description) {
      td.description = config.description;
    }

    if (config.base || this.options.baseUrl) {
      td.base = config.base || this.options.baseUrl;
    }

    if (config.version) {
      td.version = { instance: config.version };
    }

    if (Object.keys(stateProperties).length > 0) {
      td.properties = stateProperties;
    }

    if (Object.keys(actions).length > 0) {
      td.actions = actions;
    }

    if (Object.keys(events).length > 0) {
      td.events = events;
    }

    return td;
  }

  /**
   * Generate Thing Descriptions for all nodes with @wot_thing trait
   */
  generateAll(nodes: HSPlusNode[]): ThingDescription[] {
    const results: ThingDescription[] = [];

    const processNode = (node: HSPlusNode) => {
      const td = this.generate(node);
      if (td) {
        results.push(td);
      }

      if (node.children) {
        for (const child of node.children) {
          processNode(child);
        }
      }
    };

    for (const node of nodes) {
      processNode(node);
    }

    return results;
  }

  /**
   * Find @wot_thing directive in node
   */
  private findWoTTrait(node: HSPlusNode): HSPlusDirective | null {
    if (!node.directives) {
      return null;
    }

    return (
      node.directives.find(
        (d: any) =>
          (d.type === 'trait' && d.name === 'wot_thing') ||
          (d.type === 'directive' && d.name === 'wot_thing')
      ) || null
    );
  }

  /**
   * Parse @wot_thing config from directive
   */
  private parseWoTConfig(directive: HSPlusDirective): WoTThingConfig {
    const dir = directive as {
      type: string;
      args?: Record<string, unknown>;
      config?: Record<string, unknown>;
    };
    const args = dir.args || dir.config || {};

    return {
      title: String(args.title || ''),
      description: args.description ? String(args.description) : undefined,
      security: (args.security as WoTThingConfig['security']) || 'nosec',
      base: args.base ? String(args.base) : undefined,
      id: args.id ? String(args.id) : undefined,
      version: args.version ? String(args.version) : undefined,
    };
  }

  /**
   * Extract TD properties from @state block
   */
  private extractStateProperties(node: HSPlusNode): Record<string, PropertyAffordance> {
    const properties: Record<string, PropertyAffordance> = {};

    if (!node.directives) {
      return properties;
    }

    // Find @state directive (use any for flexibility with directive variants)
    const stateDirective = node.directives.find(
      (d: { type: string; name?: string; [key: string]: unknown }) =>
        d.type === 'state' || (d.type === 'directive' && d.name === 'state')
    );

    if (!stateDirective || !(stateDirective as { body?: unknown }).body) {
      // Also check node.properties for inline state
      if (node.properties?.state && typeof node.properties.state === 'object') {
        return this.mapStateToProperties(node.properties.state as Record<string, unknown>);
      }
      return properties;
    }

    // Parse state body
    const rawBody = (stateDirective as { body?: unknown }).body;
    const stateBody =
      typeof rawBody === 'object' && rawBody !== null ? (rawBody as Record<string, unknown>) : {};
    return this.mapStateToProperties(stateBody);
  }

  /**
   * Map state object to TD properties
   */
  private mapStateToProperties(state: Record<string, unknown>): Record<string, PropertyAffordance> {
    const properties: Record<string, PropertyAffordance> = {};

    for (const [key, value] of Object.entries(state)) {
      const property: PropertyAffordance = {
        type: this.inferType(value),
        observable: this.options.defaultObservable,
        forms: [
          {
            href: `${this.options.baseUrl}/properties/${key}`,
            contentType: this.options.contentType,
            op: ['readproperty', 'writeproperty'],
          },
        ],
      };

      // Add default value if present
      if (value !== undefined && value !== null) {
        property.default = value;
      }

      // Infer additional schema from value
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          property.type = 'integer';
        }
      }

      if (Array.isArray(value)) {
        property.type = 'array';
        if (value.length > 0) {
          property.items = { type: this.inferType(value[0]) };
        }
      }

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        property.type = 'object';
        property.properties = {};
        for (const [subKey, subValue] of Object.entries(value)) {
          property.properties[subKey] = { type: this.inferType(subValue) };
        }
      }

      properties[key] = property;
    }

    return properties;
  }

  /**
   * Extract TD actions from @on_* handlers
   */
  private extractActions(node: HSPlusNode): Record<string, ActionAffordance> {
    const actions: Record<string, ActionAffordance> = {};

    if (!node.directives) {
      return actions;
    }

    // Find @on_* directives that represent actions
    const actionPatterns = [
      /^on_click$/,
      /^on_grab$/,
      /^on_release$/,
      /^on_hover$/,
      /^on_action$/,
      /^on_command$/,
      /^on_invoke$/,
      /^on_call$/,
    ];

    for (const directive of node.directives) {
      // Check for lifecycle hooks
      const d = directive as { type: string; hook?: string; name?: string; args?: unknown };
      if (directive.type !== 'lifecycle' && d.hook === undefined) {
        continue;
      }

      const hookName = d.hook || d.name;
      if (!hookName) continue;

      const isAction = actionPatterns.some((pattern) => pattern.test(hookName));
      if (!isAction) continue;

      // Convert hook name to action name
      const actionName = hookName.replace(/^on_/, '');

      actions[actionName] = {
        title: this.toTitleCase(actionName),
        description: `Invoke ${actionName} action`,
        safe: false,
        idempotent: false,
        forms: [
          {
            href: `${this.options.baseUrl}/actions/${actionName}`,
            contentType: this.options.contentType,
            op: 'invokeaction',
          },
        ],
      };

      // Extract input schema from handler parameters if available
      if (d.args && typeof d.args === 'object') {
        actions[actionName].input = {
          type: 'object',
          properties: this.extractInputSchema(d.args as Record<string, unknown>),
        };
      }
    }

    return actions;
  }

  /**
   * Extract TD events from emit() calls
   */
  private extractEvents(node: HSPlusNode): Record<string, EventAffordance> {
    const events: Record<string, EventAffordance> = {};

    if (!node.directives) {
      return events;
    }

    // Find @observable directives
    const observableDirectives = node.directives.filter(
      (d: HSPlusDirective) =>
        d.type === 'directive' &&
        (d.name === 'observable' || d.name === 'event' || d.name === 'emit')
    );

    for (const directive of observableDirectives) {
      const dirExt = directive as {
        type: string;
        args?: Record<string, unknown>;
        config?: Record<string, unknown>;
      };
      const args = dirExt.args || dirExt.config || {};
      const eventName = args.name || args.event || 'change';

      events[String(eventName)] = {
        title: this.toTitleCase(String(eventName)),
        description: `${eventName} event`,
        forms: [
          {
            href: `${this.options.baseUrl}/events/${eventName}`,
            contentType: this.options.contentType,
            subprotocol: 'sse',
            op: 'subscribeevent',
          },
        ],
      };

      // Extract data schema from event config
      if (args.data && typeof args.data === 'object') {
        events[String(eventName)].data = {
          type: 'object',
          properties: this.extractInputSchema(args.data as Record<string, unknown>),
        };
      }
    }

    // Also scan for emit() calls in handler bodies
    const emitPattern = /emit\s*\(\s*['"]([^'"]+)['"]/g;
    for (const directive of node.directives) {
      const dirBody = (directive as { body?: unknown }).body;
      if (dirBody && typeof dirBody === 'string') {
        let match;
        while ((match = emitPattern.exec(dirBody)) !== null) {
          const eventName = match[1];
          if (!events[eventName]) {
            events[eventName] = {
              title: this.toTitleCase(eventName),
              description: `${eventName} event`,
              forms: [
                {
                  href: `${this.options.baseUrl}/events/${eventName}`,
                  contentType: this.options.contentType,
                  subprotocol: 'sse',
                  op: 'subscribeevent',
                },
              ],
            };
          }
        }
      }
    }

    return events;
  }

  /**
   * Build security definitions based on config
   */
  private buildSecurityDefinitions(
    security: WoTThingConfig['security']
  ): Record<string, SecurityScheme> {
    if (this.options.securityDefinitions) {
      return this.options.securityDefinitions;
    }

    const definitions: Record<string, SecurityScheme> = {};

    switch (security) {
      case 'basic':
        definitions.default = {
          scheme: 'basic',
          in: 'header',
        };
        break;
      case 'bearer':
        definitions.default = {
          scheme: 'bearer',
          in: 'header',
          format: 'jwt',
        };
        break;
      case 'oauth2':
        definitions.default = {
          scheme: 'oauth2',
          flow: 'code',
        };
        break;
      case 'apikey':
        definitions.default = {
          scheme: 'apikey',
          in: 'header',
          name: 'X-API-Key',
        };
        break;
      case 'nosec':
      default:
        definitions.default = {
          scheme: 'nosec',
        };
        break;
    }

    return definitions;
  }

  /**
   * Extract input schema from args object
   */
  private extractInputSchema(args: Record<string, unknown>): Record<string, DataSchema> {
    const schema: Record<string, DataSchema> = {};

    for (const [key, value] of Object.entries(args)) {
      schema[key] = { type: this.inferType(value) };
    }

    return schema;
  }

  /**
   * Infer JSON Schema type from value
   */
  private inferType(
    value: unknown
  ): 'boolean' | 'integer' | 'number' | 'string' | 'object' | 'array' | 'null' {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return 'string';
  }

  /**
   * Convert snake_case or camelCase to Title Case
   */
  private toTitleCase(str: string): string {
    return str
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\s+/, '')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Generate a Thing Description from a HoloScript node
 */
export function generateThingDescription(
  node: HSPlusNode,
  options?: ThingDescriptionGeneratorOptions
): ThingDescription | null {
  const generator = new ThingDescriptionGenerator(options);
  return generator.generate(node);
}

/**
 * Generate Thing Descriptions for all nodes in a composition
 */
export function generateAllThingDescriptions(
  nodes: HSPlusNode[],
  options?: ThingDescriptionGeneratorOptions
): ThingDescription[] {
  const generator = new ThingDescriptionGenerator(options);
  return generator.generateAll(nodes);
}

/**
 * Serialize Thing Description to JSON
 */
export function serializeThingDescription(td: ThingDescription, pretty: boolean = true): string {
  return JSON.stringify(td, null, pretty ? 2 : 0);
}

/**
 * Validate a Thing Description (basic validation)
 */
export function validateThingDescription(td: ThingDescription): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!td['@context']) {
    errors.push("Missing required field '@context'");
  }
  if (!td.title) {
    errors.push("Missing required field 'title'");
  }
  if (!td.security) {
    errors.push("Missing required field 'security'");
  }
  if (!td.securityDefinitions) {
    errors.push("Missing required field 'securityDefinitions'");
  }

  // Validate security references
  if (td.security && td.securityDefinitions) {
    const securityNames = Array.isArray(td.security) ? td.security : [td.security];
    for (const name of securityNames) {
      if (!td.securityDefinitions[name]) {
        errors.push(`Security definition '${name}' not found in securityDefinitions`);
      }
    }
  }

  // Validate forms have hrefs
  const validateForms = (forms?: Form[]) => {
    if (forms) {
      for (const form of forms) {
        if (!form.href) {
          errors.push('Form missing required href');
        }
      }
    }
  };

  if (td.properties) {
    for (const prop of Object.values(td.properties)) {
      validateForms(prop.forms);
    }
  }

  if (td.actions) {
    for (const action of Object.values(td.actions)) {
      validateForms(action.forms);
    }
  }

  if (td.events) {
    for (const event of Object.values(td.events)) {
      validateForms(event.forms);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default ThingDescriptionGenerator;
