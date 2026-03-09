/**
 * A2A Agent Card Export Target
 *
 * Compiles HoloScript compositions into Google A2A (Agent-to-Agent) Protocol
 * Agent Card JSON format for agent discovery and interoperability.
 *
 * An Agent Card describes:
 * - Agent identity and capabilities
 * - Supported input/output schemas
 * - Authentication requirements
 * - Endpoint URLs for agent communication
 *
 * @version 1.0.0
 * @see https://github.com/google/A2A
 */

// ── A2A Agent Card Types ───────────────────────────────────────────────────

/**
 * A2A Agent Card JSON structure.
 */
export interface A2AAgentCard {
  /** Agent Card version */
  version: '1.0';
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Agent URL (endpoint for A2A protocol messages) */
  url: string;
  /** Agent provider information */
  provider?: {
    organization: string;
    url?: string;
  };
  /** Supported capabilities */
  capabilities: A2ACapabilities;
  /** Authentication requirements */
  authentication?: A2AAuthentication;
  /** Default input modes */
  defaultInputModes: string[];
  /** Default output modes */
  defaultOutputModes: string[];
  /** Skills/actions the agent can perform */
  skills: A2ASkill[];
  /** Metadata extensions */
  metadata?: Record<string, unknown>;
}

export interface A2ACapabilities {
  /** Whether agent supports streaming responses */
  streaming?: boolean;
  /** Whether agent supports push notifications */
  pushNotifications?: boolean;
  /** Whether agent supports state/session tracking */
  stateTransitionHistory?: boolean;
}

export interface A2AAuthentication {
  /** Authentication schemes supported */
  schemes: string[];
  /** OAuth2 configuration */
  oauth2?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: Record<string, string>;
  };
}

export interface A2ASkill {
  /** Skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema?: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  outputSchema?: Record<string, unknown>;
  /** Tags for discovery */
  tags?: string[];
  /** Examples */
  examples?: Array<{ input: string; output: string }>;
}

// ── Compiler Configuration ─────────────────────────────────────────────────

export interface A2AAgentCardConfig {
  /** Base URL where the agent will be hosted */
  baseUrl?: string;
  /** Organization name */
  organization?: string;
  /** Enable streaming support */
  enableStreaming?: boolean;
  /** Enable push notification support */
  enablePushNotifications?: boolean;
  /** Authentication scheme */
  authScheme?: 'none' | 'bearer' | 'oauth2' | 'api-key';
}

// ── Trait-to-Skill Mapping ─────────────────────────────────────────────────

const TRAIT_SKILL_MAP: Record<string, Partial<A2ASkill>> = {
  Grabbable: {
    name: 'Manipulate Object',
    description: 'Grab and manipulate spatial objects',
    tags: ['interaction', 'spatial'],
  },
  Tradeable: {
    name: 'Trade Asset',
    description: 'Execute trades of virtual assets',
    tags: ['economy', 'trade'],
  },
  NPC: {
    name: 'NPC Dialogue',
    description: 'Engage in dialogue with NPC character',
    tags: ['ai', 'dialogue'],
  },
  Navigation: {
    name: 'Navigate Space',
    description: 'Navigate spatial environments',
    tags: ['navigation', 'spatial'],
  },
  Analytics: {
    name: 'Report Analytics',
    description: 'Generate analytics reports',
    tags: ['analytics', 'data'],
  },
  ComputerUse: {
    name: 'Computer Use',
    description: 'Interact with computer interfaces',
    tags: ['computer-use', 'automation'],
  },
  AgentDiscovery: {
    name: 'Discover Agents',
    description: 'Find and connect with other agents',
    tags: ['discovery', 'a2a'],
  },
};

// ── Compiler ───────────────────────────────────────────────────────────────

/**
 * Compiles HoloScript compositions to A2A Agent Card JSON.
 *
 * Usage:
 * ```typescript
 * const compiler = new A2AAgentCardCompiler({ baseUrl: 'https://my-agent.example.com' });
 * const result = compiler.compile(composition);
 * console.log(JSON.stringify(result.agentCard, null, 2));
 * ```
 */
export class A2AAgentCardCompiler {
  private config: Required<A2AAgentCardConfig>;

  constructor(config: A2AAgentCardConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? 'https://localhost:8080',
      organization: config.organization ?? 'HoloScript',
      enableStreaming: config.enableStreaming ?? true,
      enablePushNotifications: config.enablePushNotifications ?? false,
      authScheme: config.authScheme ?? 'bearer',
    };
  }

  compile(composition: {
    name: string;
    description?: string;
    objects?: Array<{
      name: string;
      type?: string;
      traits?: string[];
      properties?: Record<string, unknown>;
    }>;
    settings?: Record<string, unknown>;
  }): {
    success: boolean;
    agentCard: A2AAgentCard;
    json: string;
    warnings: string[];
    errors: string[];
  } {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!composition.name) {
      errors.push('Composition name is required');
    }

    // Extract skills from traits
    const skills: A2ASkill[] = [];
    const allTraits = new Set<string>();

    for (const obj of composition.objects ?? []) {
      for (const trait of obj.traits ?? []) {
        allTraits.add(trait);
      }
    }

    let skillIndex = 0;
    for (const trait of allTraits) {
      const mapping = TRAIT_SKILL_MAP[trait];
      if (mapping) {
        skills.push({
          id: `skill_${skillIndex++}`,
          name: mapping.name ?? trait,
          description: mapping.description ?? `Skill derived from ${trait} trait`,
          tags: mapping.tags,
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', description: `Action for ${trait}` },
              parameters: { type: 'object' },
            },
          },
          outputSchema: {
            type: 'object',
            properties: {
              result: { type: 'string' },
              data: { type: 'object' },
            },
          },
        });
      } else {
        // Generic skill from trait
        skills.push({
          id: `skill_${skillIndex++}`,
          name: trait,
          description: `Capability from HoloScript trait: ${trait}`,
          tags: ['holoscript', trait.toLowerCase()],
        });
      }
    }

    // Build authentication
    let authentication: A2AAuthentication | undefined;
    if (this.config.authScheme !== 'none') {
      authentication = {
        schemes: [this.config.authScheme],
      };
    }

    const agentCard: A2AAgentCard = {
      version: '1.0',
      name: composition.name,
      description:
        composition.description ??
        `HoloScript agent compiled from composition '${composition.name}'`,
      url: `${this.config.baseUrl}/a2a`,
      provider: {
        organization: this.config.organization,
        url: this.config.baseUrl,
      },
      capabilities: {
        streaming: this.config.enableStreaming,
        pushNotifications: this.config.enablePushNotifications,
        stateTransitionHistory: true,
      },
      authentication,
      defaultInputModes: ['application/json', 'text/plain'],
      defaultOutputModes: ['application/json'],
      skills,
      metadata: {
        compiler: 'HoloScript A2AAgentCardCompiler v1.0.0',
        sourceComposition: composition.name,
        traitCount: allTraits.size,
        objectCount: composition.objects?.length ?? 0,
      },
    };

    return {
      success: errors.length === 0,
      agentCard,
      json: JSON.stringify(agentCard, null, 2),
      warnings,
      errors,
    };
  }
}
