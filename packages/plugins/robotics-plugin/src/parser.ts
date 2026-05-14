/**
 * HoloScript Parser
 *
 * Converts token stream into Abstract Syntax Tree (AST).
 * Uses recursive descent parsing.
 */

import { Token, TokenType } from './lexer';
import { CompositionNode, ObjectNode, PropertyValue, DomainRandomizationConfig, ActuatorGroupConfig } from './ast';

export class Parser {
  private tokens: Token[];
  private position: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): CompositionNode {
    return this.parseComposition();
  }

  private currentToken(): Token {
    const token = this.tokens[this.position];
    if (!token) {
      throw new Error('Unexpected end of input');
    }
    return token;
  }

  private peek(offset: number = 1): Token {
    const pos = this.position + offset;
    const token = pos < this.tokens.length ? this.tokens[pos] : this.tokens[this.tokens.length - 1];
    if (!token) {
      throw new Error('Unexpected end of input');
    }
    return token;
  }

  private advance(): Token {
    const token = this.currentToken();
    this.position++;
    return token;
  }

  private expect(type: TokenType, value?: string): Token {
    const token = this.currentToken();

    if (token.type !== type) {
      throw new Error(
        `Expected ${type}${value ? ` "${value}"` : ''} but got ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }

    if (value !== undefined && token.value !== value) {
      throw new Error(
        `Expected "${value}" but got "${token.value}" at line ${token.line}, column ${token.column}`
      );
    }

    return this.advance();
  }

  private parseComposition(): CompositionNode {
    const startToken = this.expect(TokenType.KEYWORD, 'composition');
    const name = this.expect(TokenType.STRING).value;
    this.expect(TokenType.LBRACE);

    const objects: ObjectNode[] = [];
    let domainRandomization: DomainRandomizationConfig | undefined;

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      // Check for domain_randomization block at composition level
      if (this.currentToken().type === TokenType.IDENTIFIER &&
          this.currentToken().value === 'domain_randomization') {
        this.advance();
        this.expect(TokenType.COLON);
        domainRandomization = this.parseDomainRandomizationBlock();
      } else {
        objects.push(this.parseObject());
      }
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'composition',
      name,
      objects,
      domainRandomization,
      line: startToken.line,
      column: startToken.column,
    };
  }

  private parseObject(): ObjectNode {
    const startToken = this.expect(TokenType.KEYWORD, 'object');
    const name = this.expect(TokenType.STRING).value;

    // Parse traits (@trait1 @trait2 ...)
    const traits: string[] = [];
    while (this.currentToken().type === TokenType.TRAIT) {
      traits.push(this.advance().value);
    }

    this.expect(TokenType.LBRACE);

    // Parse properties (key: value)
    const properties: Record<string, PropertyValue> = {};
    let domainRandomization: DomainRandomizationConfig | undefined;
    let actuatorGroups: ActuatorGroupConfig[] | undefined;

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      // Support both object "link" @trait { ... } and object "link" { @trait ... }.
      if (this.currentToken().type === TokenType.TRAIT) {
        const trait = this.advance().value;
        if (!traits.includes(trait)) {
          traits.push(trait);
        }
      }
      // Check for domain_randomization block
      else if (this.currentToken().type === TokenType.IDENTIFIER &&
          this.currentToken().value === 'domain_randomization') {
        this.advance();
        this.expect(TokenType.COLON);
        domainRandomization = this.parseDomainRandomizationBlock();
      }
      // Check for actuator_group block
      else if (this.currentToken().type === TokenType.IDENTIFIER &&
               this.currentToken().value === 'actuator_group') {
        this.advance();
        this.expect(TokenType.COLON);
        const group = this.parseActuatorGroupBlock();
        if (!actuatorGroups) actuatorGroups = [];
        actuatorGroups.push(group);
      }
      // Regular property
      else {
        const keyName = this.expect(TokenType.IDENTIFIER).value;
        this.expect(TokenType.COLON);
        const value = this.parseValue();
        properties[keyName] = value;
      }
    }

    this.expect(TokenType.RBRACE);

    return {
      type: 'object',
      name,
      traits,
      properties,
      domainRandomization,
      actuatorGroups,
      line: startToken.line,
      column: startToken.column,
    };
  }

  private parseValue(): PropertyValue {
    const token = this.currentToken();

    // String value
    if (token.type === TokenType.STRING) {
      return this.advance().value;
    }

    // Number value
    if (token.type === TokenType.NUMBER) {
      return parseFloat(this.advance().value);
    }

    // Array value [1, 2, 3]
    if (token.type === TokenType.LBRACKET) {
      return this.parseArray();
    }

    // Function call (for future: diagonal([1, 2, 3]))
    if (token.type === TokenType.IDENTIFIER && this.peek().type === TokenType.LBRACKET) {
      this.advance(); // Skip function name for now
      const args = this.parseArray();

      // For now, treat function calls as arrays (e.g., diagonal([1,2,3]) -> [1,2,3])
      // In future, could preserve function name metadata
      return args;
    }

    throw new Error(
      `Unexpected value type ${token.type} "${token.value}" at line ${token.line}, column ${token.column}`
    );
  }

  private parseArray(): PropertyValue[] {
    this.expect(TokenType.LBRACKET);

    const values: PropertyValue[] = [];

    while (
      this.currentToken().type !== TokenType.RBRACKET &&
      this.currentToken().type !== TokenType.EOF
    ) {
      if (this.currentToken().type === TokenType.NUMBER) {
        values.push(parseFloat(this.advance().value));
      } else if (this.currentToken().type === TokenType.STRING) {
        values.push(this.advance().value);
      } else if (this.currentToken().type === TokenType.LBRACKET) {
        // Nested array
        values.push(this.parseArray());
      } else {
        throw new Error(
          `Unexpected token in array: ${this.currentToken().type} at line ${this.currentToken().line}`
        );
      }

      // Optional comma
      if (this.currentToken().type === TokenType.COMMA) {
        this.advance();
      }
    }

    this.expect(TokenType.RBRACKET);
    return values;
  }

  private parseDomainRandomizationBlock(): DomainRandomizationConfig {
    this.expect(TokenType.LBRACE);
    const config: DomainRandomizationConfig = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);

      switch (key) {
        case 'physics':
          config.physics = this.parsePhysicsRandomization();
          break;
        case 'actuator':
          config.actuator = this.parseActuatorRandomization();
          break;
        case 'observation':
          config.observation = this.parseObservationRandomization();
          break;
        case 'initialState':
          config.initialState = this.parseInitialStateRandomization();
          break;
        case 'disturbance':
          config.disturbance = this.parseDisturbanceRandomization();
          break;
        default:
          // Skip unknown keys
          this.parseValue();
      }
    }

    this.expect(TokenType.RBRACE);
    return config;
  }

  private parsePhysicsRandomization(): DomainRandomizationConfig['physics'] {
    this.expect(TokenType.LBRACE);
    const physics: DomainRandomizationConfig['physics'] = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();

      if (key === 'massScale' && Array.isArray(value)) {
        physics.massScale = [value[0] as number, value[1] as number];
      } else if (key === 'frictionRange' && Array.isArray(value)) {
        physics.frictionRange = [value[0] as number, value[1] as number];
      } else if (key === 'dampingRange' && Array.isArray(value)) {
        physics.dampingRange = [value[0] as number, value[1] as number];
      } else if (key === 'armatureRange' && Array.isArray(value)) {
        physics.armatureRange = [value[0] as number, value[1] as number];
      }
    }

    this.expect(TokenType.RBRACE);
    return physics;
  }

  private parseActuatorRandomization(): DomainRandomizationConfig['actuator'] {
    this.expect(TokenType.LBRACE);
    const actuator: DomainRandomizationConfig['actuator'] = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();

      if (key === 'kpNoise' && typeof value === 'number') {
        actuator.kpNoise = value;
      } else if (key === 'kdNoise' && typeof value === 'number') {
        actuator.kdNoise = value;
      } else if (key === 'latencyNoise' && typeof value === 'number') {
        actuator.latencyNoise = value;
      }
    }

    this.expect(TokenType.RBRACE);
    return actuator;
  }

  private parseObservationRandomization(): DomainRandomizationConfig['observation'] {
    this.expect(TokenType.LBRACE);
    const observation: DomainRandomizationConfig['observation'] = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();

      if (key === 'jointPosNoise' && typeof value === 'number') {
        observation.jointPosNoise = value;
      } else if (key === 'jointVelNoise' && typeof value === 'number') {
        observation.jointVelNoise = value;
      } else if (key === 'imuNoise' && typeof value === 'number') {
        observation.imuNoise = value;
      }
    }

    this.expect(TokenType.RBRACE);
    return observation;
  }

  private parseInitialStateRandomization(): DomainRandomizationConfig['initialState'] {
    this.expect(TokenType.LBRACE);
    const initialState: DomainRandomizationConfig['initialState'] = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);

      if (key === 'jointPosRange') {
        initialState.jointPosRange = this.parseNumberRangeMap();
      } else {
        const value = this.parseValue();
        if (key === 'rootPoseRange' && Array.isArray(value)) {
          initialState.rootPoseRange = value as [number, number, number, number, number, number];
        }
      }
    }

    this.expect(TokenType.RBRACE);
    return initialState;
  }

  private parseNumberRangeMap(): Record<string, [number, number]> {
    this.expect(TokenType.LBRACE);
    const ranges: Record<string, [number, number]> = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();

      if (Array.isArray(value)) {
        ranges[key] = [value[0] as number, value[1] as number];
      }
    }

    this.expect(TokenType.RBRACE);
    return ranges;
  }

  private parseDisturbanceRandomization(): DomainRandomizationConfig['disturbance'] {
    this.expect(TokenType.LBRACE);
    const disturbance: DomainRandomizationConfig['disturbance'] = {};

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();

      if (key === 'forceRange' && Array.isArray(value)) {
        disturbance.forceRange = [value[0] as number, value[1] as number];
      } else if (key === 'intervalRange' && Array.isArray(value)) {
        disturbance.intervalRange = [value[0] as number, value[1] as number];
      }
    }

    this.expect(TokenType.RBRACE);
    return disturbance;
  }

  private parseActuatorGroupBlock(): ActuatorGroupConfig {
    // Parse actuator_group { name: "foo" type: "DelayedPDActuator" joints: ["joint1", "joint2"] ... }
    this.expect(TokenType.LBRACE);
    const group: ActuatorGroupConfig = {
      name: '',
      type: 'IdealPDActuator',
      jointNames: [],
    };

    while (
      this.currentToken().type !== TokenType.RBRACE &&
      this.currentToken().type !== TokenType.EOF
    ) {
      const key = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.COLON);
      const value = this.parseValue();

      switch (key) {
        case 'name':
          group.name = value as string;
          break;
        case 'type':
          group.type = value as ActuatorGroupConfig['type'];
          break;
        case 'joints':
          if (Array.isArray(value)) {
            group.jointNames = value as string[];
          }
          break;
        case 'stiffness':
          group.stiffness = value as number;
          break;
        case 'damping':
          group.damping = value as number;
          break;
        case 'friction':
          group.friction = value as number;
          break;
        case 'latency':
          group.latency = value as number;
          break;
      }
    }

    this.expect(TokenType.RBRACE);
    return group;
  }
}
