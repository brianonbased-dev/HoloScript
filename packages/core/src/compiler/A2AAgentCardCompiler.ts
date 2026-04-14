/**
 * HoloScript -> A2A Agent Card Compiler
 *
 * Generates A2A Protocol-compliant Agent Card JSON manifests from HoloScript compositions.
 * The A2A (Agent-to-Agent) protocol, introduced by Google in April 2025, enables
 * interoperability between AI agents from varied providers and frameworks.
 *
 * Agent Cards are JSON metadata documents describing agent identity, capabilities,
 * skills, service endpoints, and authentication requirements. They are typically
 * published at `/.well-known/agent-card.json`.
 *
 * Maps:
 *   - Composition name                -> AgentCard name / description
 *   - Templates                       -> AgentSkill entries (reusable capabilities)
 *   - Objects with traits             -> Skill tags and capability descriptors
 *   - Logic handlers (on_*)           -> Skill examples / interaction patterns
 *   - State properties                -> Agent state-management capabilities
 *   - Environment                     -> Agent operational context
 *   - Domain blocks (iot, robotics)   -> Specialized skills with domain tags
 *   - NPCs / Dialogues               -> Conversational skills
 *   - Spatial groups                  -> Spatial coordination skills
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloTemplate,
  HoloLogic,
  HoloDomainBlock,
  HoloNPC,
  HoloDialogue,
  HoloAbility,
  HoloStateMachine,
  HoloQuest,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// A2A AGENT CARD TYPES (A2A Protocol Specification)
// =============================================================================

/**
 * A2A Agent Card - Top-level metadata document
 *
 * @see https://a2a-protocol.org/latest/specification/ (Section 4.4.1)
 */
export interface A2AAgentCard {
  /** Human-readable agent name */
  name: string;
  /** Description of the agent's purpose and capabilities */
  description: string;
  /** Service endpoint URL where the A2A server can be reached */
  url: string;
  /** Agent version (semver) */
  version: string;
  /** Optional documentation URL */
  documentationUrl?: string;
  /** Agent provider information */
  provider?: A2AAgentProvider;
  /** Agent capabilities (protocol features supported) */
  capabilities: A2AAgentCapabilities;
  /** Authentication requirements */
  authentication: A2AAgentAuthentication;
  /** Default input MIME types accepted */
  defaultInputModes: string[];
  /** Default output MIME types produced */
  defaultOutputModes: string[];
  /** List of skills this agent offers */
  skills: A2AAgentSkill[];
  /** Whether the agent supports authenticated extended cards */
  supportsAuthenticatedExtendedCard?: boolean;
  /** Agent extensions for protocol-level feature negotiation */
  extensions?: A2AAgentExtension[];
  /** Agent interfaces for structured interaction */
  interfaces?: A2AAgentInterface[];
}

/**
 * A2A Agent Provider - Organization information
 *
 * @see https://a2a-protocol.org/latest/specification/ (Section 4.4.2)
 */
export interface A2AAgentProvider {
  /** Organization name */
  organization: string;
  /** Organization URL */
  url: string;
}

/**
 * A2A Agent Capabilities - Protocol feature flags
 *
 * @see https://a2a-protocol.org/latest/specification/ (Section 4.4.3)
 */
export interface A2AAgentCapabilities {
  /** Whether the agent supports streaming responses */
  streaming?: boolean;
  /** Whether the agent supports push notifications */
  pushNotifications?: boolean;
  /** Whether the agent exposes state transition history */
  stateTransitionHistory?: boolean;
}

/**
 * A2A Agent Extension - Protocol-level feature negotiation
 *
 * @see https://a2a-protocol.org/latest/specification/ (Section 4.4.4)
 */
export interface A2AAgentExtension {
  /** Extension URI identifier */
  uri: string;
  /** Extension description */
  description?: string;
  /** Whether this extension is required */
  required?: boolean;
  /** Extension-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * A2A Agent Skill - A specific capability the agent offers
 *
 * @see https://a2a-protocol.org/latest/specification/ (Section 4.4.5)
 */
export interface A2AAgentSkill {
  /** Unique skill identifier */
  id: string;
  /** Human-readable skill name */
  name: string;
  /** Description of what this skill does */
  description: string;
  /** Categorization tags */
  tags: string[];
  /** Example prompts/inputs that trigger this skill */
  examples?: string[];
  /** Accepted input MIME types (overrides agent defaults) */
  inputModes?: string[];
  /** Produced output MIME types (overrides agent defaults) */
  outputModes?: string[];
}

/**
 * A2A Agent Interface - Structured interaction definition
 *
 * @see https://a2a-protocol.org/latest/specification/ (Section 4.4.6)
 */
export interface A2AAgentInterface {
  /** Interface identifier */
  id: string;
  /** Interface type (e.g., 'json-rpc', 'rest', 'graphql') */
  type: string;
  /** Interface description */
  description?: string;
  /** Interface schema or specification */
  schema?: Record<string, unknown>;
}

/**
 * A2A Agent Authentication - Auth requirements
 */
export interface A2AAgentAuthentication {
  /** Supported authentication schemes */
  schemes: string[];
  /** Optional credentials endpoint or instructions */
  credentials?: string;
}

// =============================================================================
// COMPILER OPTIONS
// =============================================================================

/**
 * Options for the A2A Agent Card Compiler
 */
export interface A2AAgentCardCompilerOptions {
  /** Base service URL for the agent endpoint (default: 'http://localhost:8080') */
  serviceUrl?: string;
  /** Agent version (default: '1.0.0') */
  agentVersion?: string;
  /** Provider organization name */
  providerOrganization?: string;
  /** Provider URL */
  providerUrl?: string;
  /** Documentation URL */
  documentationUrl?: string;
  /** Enable streaming capability (default: false) */
  enableStreaming?: boolean;
  /** Enable push notifications (default: false) */
  enablePushNotifications?: boolean;
  /** Enable state transition history (default: true) */
  enableStateHistory?: boolean;
  /** Authentication schemes (default: ['none']) */
  authSchemes?: string[];
  /** Default input MIME types (default: ['text/plain', 'application/json']) */
  defaultInputModes?: string[];
  /** Default output MIME types (default: ['text/plain', 'application/json']) */
  defaultOutputModes?: string[];
  /** Include spatial skills from spatial groups (default: true) */
  includeSpatialSkills?: boolean;
  /** Include domain block skills (default: true) */
  includeDomainSkills?: boolean;
  /** Include NPC/dialogue conversational skills (default: true) */
  includeConversationalSkills?: boolean;
  /** Include game mechanic skills (quests, abilities, etc.) (default: true) */
  includeGameMechanics?: boolean;
  /** Custom extensions to include */
  extensions?: A2AAgentExtension[];
  /** Whether to support authenticated extended cards (default: false) */
  supportsAuthenticatedExtendedCard?: boolean;
}

// =============================================================================
// COMPILER IMPLEMENTATION
// =============================================================================

/**
 * Compiles HoloScript compositions into A2A Agent Card JSON manifests.
 *
 * This compiler transforms HoloScript's rich spatial computing AST into the
 * A2A protocol's agent discovery format, enabling HoloScript agents to be
 * discovered and interoperated with by any A2A-compatible system.
 *
 * @example
 * ```typescript
 * const compiler = new A2AAgentCardCompiler({
 *   serviceUrl: 'https://my-agent.example.com',
 *   providerOrganization: 'HoloScript Labs',
 * });
 *
 * const agentCardJson = compiler.compile(composition, agentToken);
 * // Publish at: /.well-known/agent-card.json
 * ```
 */
export class A2AAgentCardCompiler extends CompilerBase {
  protected readonly compilerName = 'A2AAgentCardCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.A2A_AGENT_CARD;
  }

  private options: Required<A2AAgentCardCompilerOptions>;

  constructor(options: A2AAgentCardCompilerOptions = {}) {
    super();
    this.options = {
      serviceUrl: options.serviceUrl ?? 'http://localhost:8080',
      agentVersion: options.agentVersion ?? '1.0.0',
      providerOrganization: options.providerOrganization ?? '',
      providerUrl: options.providerUrl ?? '',
      documentationUrl: options.documentationUrl ?? '',
      enableStreaming: options.enableStreaming ?? false,
      enablePushNotifications: options.enablePushNotifications ?? false,
      enableStateHistory: options.enableStateHistory ?? true,
      authSchemes: options.authSchemes ?? ['none'],
      defaultInputModes: options.defaultInputModes ?? ['text/plain', 'application/json'],
      defaultOutputModes: options.defaultOutputModes ?? ['text/plain', 'application/json'],
      includeSpatialSkills: options.includeSpatialSkills ?? true,
      includeDomainSkills: options.includeDomainSkills ?? true,
      includeConversationalSkills: options.includeConversationalSkills ?? true,
      includeGameMechanics: options.includeGameMechanics ?? true,
      extensions: options.extensions ?? [],
      supportsAuthenticatedExtendedCard: options.supportsAuthenticatedExtendedCard ?? false,
    };
  }

  /**
   * Compile a HoloComposition AST into an A2A Agent Card JSON string.
   *
   * @param composition - Parsed HoloScript composition AST
   * @param agentToken - Agent JWT token for RBAC validation
   * @param outputPath - Optional output file path for scope validation
   * @returns JSON string of the A2A Agent Card
   */
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);

    const skills: A2AAgentSkill[] = [];

    // Extract skills from templates (primary capability definitions)
    if (composition.templates) {
      for (const template of composition.templates) {
        skills.push(this.compileTemplateSkill(template));
      }
    }

    // Extract skills from objects with significant traits
    if (composition.objects) {
      for (const obj of composition.objects) {
        const skill = this.compileObjectSkill(obj);
        if (skill) {
          skills.push(skill);
        }
      }
    }

    // Extract skills from logic handlers
    if (composition.logic) {
      const logicSkills = this.compileLogicSkills(composition.logic);
      skills.push(...logicSkills);
    }

    // Extract spatial coordination skills
    if (this.options.includeSpatialSkills && composition.spatialGroups?.length > 0) {
      skills.push(this.compileSpatialSkill(composition));
    }

    // Extract domain-specific skills
    if (this.options.includeDomainSkills && composition.domainBlocks?.length) {
      for (const block of composition.domainBlocks) {
        skills.push(this.compileDomainBlockSkill(block));
      }
    }

    // Extract conversational skills from NPCs and dialogues
    if (this.options.includeConversationalSkills) {
      if (composition.npcs?.length > 0) {
        for (const npc of composition.npcs) {
          skills.push(this.compileNPCSkill(npc));
        }
      }
      if (composition.dialogues?.length > 0) {
        skills.push(this.compileDialogueSkill(composition.dialogues));
      }
    }

    // Extract game mechanic skills
    if (this.options.includeGameMechanics) {
      if (composition.quests?.length > 0) {
        skills.push(this.compileQuestSkill(composition.quests));
      }
      if (composition.abilities?.length > 0) {
        skills.push(this.compileAbilitySkill(composition.abilities));
      }
      if (composition.stateMachines?.length > 0) {
        skills.push(this.compileStateMachineSkill(composition.stateMachines));
      }
    }

    // If the composition has state, add a state management skill
    if (composition.state && composition.state.properties.length > 0) {
      skills.push(this.compileStateSkill(composition));
    }

    // Build the Agent Card
    const agentCard: A2AAgentCard = {
      name: this.formatAgentName(composition.name),
      description: this.generateDescription(composition),
      url: this.options.serviceUrl,
      version: this.options.agentVersion,
      capabilities: {
        streaming: this.options.enableStreaming,
        pushNotifications: this.options.enablePushNotifications,
        stateTransitionHistory: this.options.enableStateHistory,
      },
      authentication: {
        schemes: this.options.authSchemes,
      },
      defaultInputModes: this.options.defaultInputModes,
      defaultOutputModes: this.options.defaultOutputModes,
      skills,
    };

    // Add optional fields
    if (this.options.providerOrganization) {
      agentCard.provider = {
        organization: this.options.providerOrganization,
        url: this.options.providerUrl,
      };
    }

    if (this.options.documentationUrl) {
      agentCard.documentationUrl = this.options.documentationUrl;
    }

    if (this.options.extensions.length > 0) {
      agentCard.extensions = this.options.extensions;
    }

    if (this.options.supportsAuthenticatedExtendedCard) {
      agentCard.supportsAuthenticatedExtendedCard = true;
    }

    // Add interfaces if composition has structured interactions
    const interfaces = this.compileInterfaces(composition);
    if (interfaces.length > 0) {
      agentCard.interfaces = interfaces;
    }

    return JSON.stringify(agentCard, null, 2);
  }

  // ─── SKILL COMPILATION METHODS ──────────────────────────────────────────

  /**
   * Compile a HoloScript template into an A2A skill.
   * Templates are the primary unit of reusable capability in HoloScript.
   */
  private compileTemplateSkill(template: HoloTemplate): A2AAgentSkill {
    const tags: string[] = ['template'];

    // Add trait-based tags
    if (template.traits) {
      for (const trait of template.traits) {
        const traitName = typeof trait === 'string' ? trait : trait.name;
        tags.push(traitName);
      }
    }

    // Add action-based tags
    if (template.actions?.length > 0) {
      tags.push('interactive');
    }

    // Add state-based tags
    if (template.state?.properties?.length) {
      tags.push('stateful');
    }

    // Build examples from actions
    const examples: string[] = [];
    if (template.actions) {
      for (const action of template.actions) {
        examples.push(
          `Invoke ${this.escapeStringValue(action.name as string, 'JSON')} on ${this.escapeStringValue(template.name as string, 'JSON')}`
        );
      }
    }
    if (examples.length === 0) {
      examples.push(`Create a ${this.escapeStringValue(template.name as string, 'JSON')} instance`);
    }

    return {
      id: this.sanitizeId(template.name),
      name: this.formatDisplayName(template.name),
      description: this.generateTemplateDescription(template),
      tags,
      examples,
    };
  }

  /**
   * Compile a HoloScript object into an A2A skill (if it has significant capabilities).
   * Only objects with non-trivial traits or state produce skills.
   */
  private compileObjectSkill(obj: HoloObjectDecl): A2AAgentSkill | null {
    const significantTraits = ['networked', 'sensor', 'observable', 'ai', 'autonomous', 'agent'];
    const objTraitNames = obj.traits?.map((t) => (typeof t === 'string' ? t : t.name)) ?? [];

    const hasSignificantTraits = objTraitNames.some((t) => significantTraits.includes(t));
    const hasState = obj.state && obj.state.properties.length > 0;

    if (!hasSignificantTraits && !hasState) {
      return null;
    }

    const tags: string[] = ['object', ...objTraitNames];
    if (hasState) {
      tags.push('stateful');
    }

    const examples: string[] = [];
    if (objTraitNames.includes('sensor')) {
      examples.push(`Read sensor data from ${this.escapeStringValue(obj.name as string, 'JSON')}`);
    }
    if (objTraitNames.includes('networked')) {
      examples.push(
        `Synchronize ${this.escapeStringValue(obj.name as string, 'JSON')} across network`
      );
    }
    if (objTraitNames.includes('ai') || objTraitNames.includes('autonomous')) {
      examples.push(
        `Query ${this.escapeStringValue(obj.name as string, 'JSON')} for autonomous behavior`
      );
    }
    if (examples.length === 0) {
      examples.push(`Interact with ${this.escapeStringValue(obj.name as string, 'JSON')}`);
    }

    return {
      id: this.sanitizeId(`object_${this.escapeStringValue(obj.name as string, 'JSON')}`),
      name: this.formatDisplayName(obj.name),
      description: `${this.escapeStringValue(obj.name as string, 'JSON')} object with ${objTraitNames.join(', ')} capabilities`,
      tags,
      examples,
    };
  }

  /**
   * Compile logic handlers into event-driven skills.
   * Groups related event handlers into a single "event handling" skill.
   */
  private compileLogicSkills(logic: HoloLogic): A2AAgentSkill[] {
    const skills: A2AAgentSkill[] = [];
    const events: string[] = [];

    if (logic.handlers) {
      for (const handler of logic.handlers) {
        if (handler.event) {
          events.push(handler.event);
        }
      }
    }

    if (events.length > 0) {
      const tags: string[] = ['event-handling', 'logic'];
      const examples: string[] = [];

      for (const event of events) {
        if (event.startsWith('on_')) {
          const eventName = event.replace('on_', '');
          tags.push(eventName);
          examples.push(`Handle ${eventName} event`);
        }
      }

      skills.push({
        id: 'event_handling',
        name: 'Event Handling',
        description: `Handles ${events.length} event(s): ${events.join(', ')}`,
        tags,
        examples,
      });
    }

    // If logic has actions, create an action execution skill
    if (logic.actions?.length > 0) {
      const actionNames = logic.actions.map((a) => a.name);
      skills.push({
        id: 'action_execution',
        name: 'Action Execution',
        description: `Executes ${actionNames.length} action(s): ${actionNames.join(', ')}`,
        tags: ['actions', 'logic'],
        examples: actionNames.map((name) => `Execute ${name}`),
      });
    }

    return skills;
  }

  /**
   * Compile spatial groups into a spatial coordination skill.
   */
  private compileSpatialSkill(composition: HoloComposition): A2AAgentSkill {
    const groupNames = composition.spatialGroups.map((g) => g.name);
    const totalObjects = composition.spatialGroups.reduce(
      (sum, g) => sum + (g.objects?.length || 0),
      0
    );

    return {
      id: 'spatial_coordination',
      name: 'Spatial Coordination',
      description: `Manages ${groupNames.length} spatial group(s) containing ${totalObjects} object(s)`,
      tags: ['spatial', '3d', 'coordination', ...groupNames],
      examples: [
        `Query spatial layout of ${groupNames[0]}`,
        `Reorganize objects across spatial groups`,
      ],
    };
  }

  /**
   * Compile a domain-specific block into a specialized skill.
   */
  private compileDomainBlockSkill(block: HoloDomainBlock): A2AAgentSkill {
    const domainTags: Record<string, string[]> = {
      iot: ['iot', 'sensor', 'telemetry', 'digital-twin'],
      robotics: ['robotics', 'control', 'actuator', 'simulation'],
      dataviz: ['data-visualization', 'analytics', 'dashboard'],
      education: ['education', 'learning', 'curriculum'],
      healthcare: ['healthcare', 'medical', 'monitoring'],
      music: ['music', 'audio', 'composition'],
      architecture: ['architecture', 'building', 'design'],
      web3: ['web3', 'blockchain', 'smart-contract'],
      physics: ['physics', 'simulation', 'collision'],
      material: ['material', 'rendering', 'pbr'],
      vfx: ['vfx', 'particles', 'visual-effects'],
      weather: ['weather', 'atmosphere', 'environmental'],
      navigation: ['navigation', 'pathfinding', 'ai'],
      procedural: ['procedural', 'generation', 'algorithms'],
    };

    const tags = [
      block.domain,
      block.keyword,
      ...(domainTags[block.domain] || [block.domain]),
      ...block.traits,
    ];

    return {
      id: this.sanitizeId(
        `${block.domain}_${this.escapeStringValue(block.name as string, 'JSON')}`
      ),
      name: this.formatDisplayName(block.name),
      description: `${block.domain} domain: ${block.keyword} "${this.escapeStringValue(block.name as string, 'JSON')}" with ${Object.keys(block.properties).length} properties`,
      tags: [...new Set(tags)], // deduplicate
      examples: [
        `Query ${block.keyword} ${this.escapeStringValue(block.name as string, 'JSON')}`,
        `Update ${this.escapeStringValue(block.name as string, 'JSON')} properties`,
      ],
    };
  }

  /**
   * Compile an NPC into a conversational skill.
   */
  private compileNPCSkill(npc: HoloNPC): A2AAgentSkill {
    const tags: string[] = ['npc', 'conversational', 'character'];
    if (npc.npcType) tags.push(npc.npcType);
    if (npc.dialogueTree) tags.push('dialogue');

    const examples: string[] = [
      `Talk to ${this.escapeStringValue(npc.name as string, 'JSON')}`,
      `Ask ${this.escapeStringValue(npc.name as string, 'JSON')} a question`,
    ];

    if (npc.behaviors?.length > 0) {
      tags.push('behavioral');
      examples.push(`Trigger ${this.escapeStringValue(npc.name as string, 'JSON')} behavior`);
    }

    return {
      id: this.sanitizeId(`npc_${this.escapeStringValue(npc.name as string, 'JSON')}`),
      name: `${this.formatDisplayName(npc.name)} (NPC)`,
      description: `Non-player character "${this.escapeStringValue(npc.name as string, 'JSON')}" with ${npc.behaviors?.length || 0} behavior(s)`,
      tags,
      examples,
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json'],
    };
  }

  /**
   * Compile dialogue trees into a conversational skill.
   */
  private compileDialogueSkill(dialogues: HoloDialogue[]): A2AAgentSkill {
    const characters = [...new Set(dialogues.map((d) => d.character).filter(Boolean))];
    const totalOptions = dialogues.reduce((sum, d) => sum + (d.options?.length || 0), 0);

    return {
      id: 'dialogue_system',
      name: 'Dialogue System',
      description: `Interactive dialogue system with ${dialogues.length} dialogue node(s) and ${totalOptions} choice(s)`,
      tags: ['dialogue', 'conversational', 'interactive', ...(characters as string[])],
      examples: [
        'Start a conversation',
        'Choose a dialogue option',
        `Talk to ${characters[0] || 'a character'}`,
      ],
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json'],
    };
  }

  /**
   * Compile quests into a game mechanics skill.
   */
  private compileQuestSkill(quests: HoloQuest[]): A2AAgentSkill {
    const questTypes = [...new Set(quests.map((q) => q.questType).filter(Boolean))];
    const totalObjectives = quests.reduce((sum, q) => sum + (q.objectives?.length || 0), 0);

    return {
      id: 'quest_system',
      name: 'Quest System',
      description: `Quest management with ${quests.length} quest(s) and ${totalObjectives} objective(s)`,
      tags: ['quest', 'game-mechanics', 'objectives', ...(questTypes as string[])],
      examples: [
        'List available quests',
        'Check quest progress',
        `Accept quest: ${quests[0]?.name || 'adventure'}`,
      ],
    };
  }

  /**
   * Compile abilities into a game mechanics skill.
   */
  private compileAbilitySkill(abilities: HoloAbility[]): A2AAgentSkill {
    const abilityTypes = [...new Set(abilities.map((a) => a.abilityType))];

    return {
      id: 'ability_system',
      name: 'Ability System',
      description: `Ability system with ${abilities.length} abilities: ${abilities.map((a) => a.name).join(', ')}`,
      tags: ['abilities', 'game-mechanics', 'combat', ...abilityTypes],
      examples: abilities.map(
        (a) => `Use ability: ${this.escapeStringValue(a.name as string, 'JSON')}`
      ),
    };
  }

  /**
   * Compile state machines into a behavior management skill.
   */
  private compileStateMachineSkill(stateMachines: HoloStateMachine[]): A2AAgentSkill {
    const machineNames = stateMachines.map((sm) => sm.name);
    const totalStates = stateMachines.reduce((sum, sm) => sum + Object.keys(sm.states).length, 0);

    return {
      id: 'state_machine_system',
      name: 'State Machine System',
      description: `State machine management with ${stateMachines.length} machine(s) and ${totalStates} total state(s)`,
      tags: ['state-machine', 'behavior', 'automation', ...machineNames],
      examples: [`Query state of ${machineNames[0]}`, 'Trigger state transition'],
    };
  }

  /**
   * Compile composition state into a state management skill.
   */
  private compileStateSkill(composition: HoloComposition): A2AAgentSkill {
    const stateProps = composition.state!.properties.map((p) => p.key);

    return {
      id: 'state_management',
      name: 'State Management',
      description: `Manages ${stateProps.length} state properties: ${stateProps.join(', ')}`,
      tags: ['state', 'data', 'reactive'],
      examples: [
        `Read ${stateProps[0]} value`,
        `Update ${stateProps[0]}`,
        'Subscribe to state changes',
      ],
    };
  }

  // ─── INTERFACE COMPILATION ──────────────────────────────────────────────

  /**
   * Compile composition features into structured interfaces.
   */
  private compileInterfaces(composition: HoloComposition): A2AAgentInterface[] {
    const interfaces: A2AAgentInterface[] = [];

    // If composition has state, add a state query interface
    if (composition.state && composition.state.properties.length > 0) {
      interfaces.push({
        id: 'state-query',
        type: 'json-rpc',
        description: 'Query and update agent state properties',
        schema: {
          methods: ['getState', 'setState', 'subscribeState'],
          stateProperties: composition.state.properties.map((p) => p.key),
        },
      });
    }

    // If composition has logic, add an event interface
    if (composition.logic?.handlers?.length) {
      interfaces.push({
        id: 'event-handler',
        type: 'json-rpc',
        description: 'Trigger and handle composition events',
        schema: {
          methods: ['triggerEvent', 'subscribeEvent'],
          events: composition.logic.handlers.map((h) => h.event),
        },
      });
    }

    return interfaces;
  }

  // ─── UTILITY METHODS ────────────────────────────────────────────────────

  /**
   * Format a composition name into a human-readable agent name.
   */
  private formatAgentName(name: string): string {
    return name
      .replace(/[_-]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (s) => s.toUpperCase());
  }

  /**
   * Generate a comprehensive description from the composition.
   */
  private generateDescription(composition: HoloComposition): string {
    const parts: string[] = [];

    parts.push(`HoloScript agent "${this.escapeStringValue(composition.name as string, 'JSON')}"`);

    const features: string[] = [];
    if (composition.templates?.length) {
      features.push(`${composition.templates.length} template(s)`);
    }
    if (composition.objects?.length) {
      features.push(`${composition.objects.length} object(s)`);
    }
    if (composition.spatialGroups?.length) {
      features.push(`${composition.spatialGroups.length} spatial group(s)`);
    }
    if (composition.npcs?.length) {
      features.push(`${composition.npcs.length} NPC(s)`);
    }
    if (composition.domainBlocks?.length) {
      const domains = [...new Set(composition.domainBlocks.map((b) => b.domain))];
      features.push(`${domains.join('/')} domain(s)`);
    }

    if (features.length > 0) {
      parts.push(`with ${features.join(', ')}`);
    }

    return parts.join(' ');
  }

  /**
   * Generate description for a template skill.
   */
  private generateTemplateDescription(template: HoloTemplate): string {
    const parts: string[] = [];
    parts.push(`Template "${this.escapeStringValue(template.name as string, 'JSON')}"`);

    const traits = template.traits?.map((t) => (typeof t === 'string' ? t : t.name)) ?? [];
    if (traits.length > 0) {
      parts.push(`with traits: ${traits.join(', ')}`);
    }

    if (template.actions?.length) {
      parts.push(`- ${template.actions.length} action(s)`);
    }

    if (template.state?.properties?.length) {
      parts.push(`- ${template.state.properties.length} state property(ies)`);
    }

    return parts.join(' ');
  }

  /**
   * Format a name into a display-friendly format.
   */
  private formatDisplayName(name: string): string {
    return name
      .replace(/[_-]/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, (s) => s.toUpperCase());
  }

  /**
   * Sanitize a name into a valid A2A skill ID.
   */
  private sanitizeId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default A2AAgentCardCompiler;
