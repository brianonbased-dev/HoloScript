/**
 * @fileoverview Colyseus Multiplayer Compiler (BRIDGE target)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile HoloScript compositions (MMO world/zone/npc constructs) to a
 * Colyseus multiplayer game server room schema + handler. Colyseus is a
 * Node.js authoritative multiplayer framework.
 *
 * OUTPUT: A single TypeScript source file containing:
 *   1. Room State schema  (@colyseus/schema decorators)
 *   2. Room class         (Room<GameRoomState> subclass)
 *   3. app.ts bootstrap   (Server.define registration)
 *
 * MAPPING RULES:
 *   HoloZone / world blocks          → Room definition name
 *   HoloObjectDecl @npc              → entity tracked in state with position
 *   HoloObjectDecl @spawn_point      → spawnPoints array in room state
 *   HoloLogic on_event 'player_join' → onJoin handler
 *   HoloLogic on_event 'player_leave'→ onLeave handler
 *   HoloLogic on_event 'player_action'→ onMessage handler
 *   @max_players trait               → room options maxClients
 *   @tick_rate trait                 → room patchRate (default 20 Hz)
 *   @server_side trait               → authoritative (non-sync'd) schema field
 *   Fallback                         → generic MMO room with PlayerState
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloLogic,
  HoloEventHandler,
  HoloValue,
  HoloZone,
  HoloWorld,
} from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ColyseusCompilerOptions {
  /** Target Colyseus version constraints. Default: 'v0.15' */
  colyseusVersion: 'v0.14' | 'v0.15';
  /** Minify the generated TypeScript output. Default: false */
  minify: boolean;
  /** Include source map comments. Default: false */
  source_maps: boolean;
  /** Emit strict TypeScript (import type etc). Default: true */
  strictMode: boolean;
}

export interface ColyseusCompilationResult {
  success: boolean;
  /** The single generated TypeScript file content */
  code: string;
  /** Room class name derived from the composition */
  roomClassName: string;
  /** Schema class names emitted */
  schemaClasses: string[];
  warnings: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal trait names
// ---------------------------------------------------------------------------

type ColyseusTraitName =
  | 'npc'
  | 'spawn_point'
  | 'max_players'
  | 'tick_rate'
  | 'server_side'
  | 'mmo_entity'
  | 'faction'
  | 'boss';

const COLYSEUS_TRAIT_NAMES: readonly ColyseusTraitName[] = [
  'npc',
  'spawn_point',
  'max_players',
  'tick_rate',
  'server_side',
  'mmo_entity',
  'faction',
  'boss',
];

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

export class ColyseusCompiler extends CompilerBase {
  protected readonly compilerName = 'ColyseusCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // BRIDGE target — lives in the gamedev domain (server-side of MMO)
    return ANSCapabilityPath.UNITY; // reuse gamedev tier; Colyseus is not yet in ANS
  }

  private options: ColyseusCompilerOptions;
  private errors: string[] = [];
  private warnings: string[] = [];
  private lines: string[] = [];
  private schemaClasses: string[] = [];

  constructor(options: Partial<ColyseusCompilerOptions> = {}) {
    super();
    this.options = {
      colyseusVersion: options.colyseusVersion ?? 'v0.15',
      minify: options.minify ?? false,
      source_maps: options.source_maps ?? false,
      strictMode: options.strictMode ?? true,
    };
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): ColyseusCompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);

    this.errors = [];
    this.warnings = [];
    this.lines = [];
    this.schemaClasses = [];

    if (!composition || composition.type !== 'Composition') {
      this.errors.push('Invalid composition tree');
      return this.buildResult('UnknownRoom');
    }

    // ── Derive room name ──────────────────────────────────────────────────
    const roomName = this.deriveRoomName(composition);
    const roomClassName = `${this.jsClassName(roomName)}Room`;

    // ── Extract nodes ─────────────────────────────────────────────────────
    const npcNodes = this.extractNodesWithAnyTrait(composition, ['npc', 'mmo_entity', 'boss']);
    const spawnNodes = this.extractNodesWithTrait(composition, 'spawn_point');
    const serverSideNodes = this.extractNodesWithTrait(composition, 'server_side');

    // ── Trait scalars ─────────────────────────────────────────────────────
    const maxPlayers = this.extractScalarTrait(composition, 'max_players', 'value', 100);
    const tickRate = this.extractScalarTrait(composition, 'tick_rate', 'hz', 20);

    // ── Logic event handlers ──────────────────────────────────────────────
    const logic = composition.logic ?? null;
    const joinHandler = logic ? this.findEventHandler(logic, 'player_join') : null;
    const leaveHandler = logic ? this.findEventHandler(logic, 'player_leave') : null;
    const actionHandler = logic ? this.findEventHandler(logic, 'player_action') : null;

    if (npcNodes.length === 0 && spawnNodes.length === 0 && !logic) {
      this.warnings.push(
        'No MMO traits (npc, spawn_point, max_players, player_join/leave/action) found. ' +
          'Emitting a generic MMO room scaffold.'
      );
    }

    // ── Emit sections ─────────────────────────────────────────────────────
    this.emitFileHeader(composition.name);
    this.emitSchemaImports();
    this.emitSchemaSection({
      roomClassName,
      npcNodes,
      spawnNodes,
      serverSideNodes,
    });
    this.emitRoomClass({
      roomClassName,
      maxPlayers,
      tickRate,
      npcNodes,
      spawnNodes,
      joinHandler,
      leaveHandler,
      actionHandler,
    });
    this.emitBootstrap(roomClassName, roomName);

    return this.buildResult(roomClassName);
  }

  // =========================================================================
  // Derivation helpers
  // =========================================================================

  private deriveRoomName(composition: HoloComposition): string {
    // Prefer world name → zone name → composition name
    if (composition.worlds && composition.worlds.length > 0) {
      const world = composition.worlds[0];
      if (world.name) return world.name;
    }
    if (composition.zones && composition.zones.length > 0) {
      const zone = composition.zones[0];
      if (zone.name) return zone.name;
    }
    return composition.name || 'HoloWorld';
  }

  private extractScalarTrait(
    composition: HoloComposition,
    traitName: ColyseusTraitName,
    key: string,
    fallback: number
  ): number {
    // Walk all top-level objects looking for the trait
    const node = this.extractNodesWithTrait(composition, traitName)[0];
    if (!node) return fallback;
    const trait = this.getTrait(node, traitName);
    if (!trait) return fallback;
    const config = trait.config ?? trait.params ?? {};
    const raw = config[key] ?? this.findObjProp(node, key);
    return this.valueToNumber(raw, fallback);
  }

  private findEventHandler(logic: HoloLogic, eventName: string): HoloEventHandler | null {
    return (
      logic.handlers.find(
        (h) =>
          h.event === eventName ||
          h.event === `on_${eventName}` ||
          h.event.includes(eventName)
      ) ?? null
    );
  }

  // =========================================================================
  // Code generation — file header
  // =========================================================================

  private emitFileHeader(compositionName: string) {
    this.push(
      `/**`,
      ` * @generated ColyseusCompiler — HoloScript BRIDGE target`,
      ` * Source composition: ${this.escapeStringValue(compositionName, 'TypeScript')}`,
      ` * Colyseus version: ${this.options.colyseusVersion}`,
      ` * DO NOT EDIT — regenerate via HoloScript compiler`,
      ` */`,
      ``
    );
  }

  // =========================================================================
  // Section 1 — Schema imports
  // =========================================================================

  private emitSchemaImports() {
    this.push(
      `// ═══════════════════════════════════════════════════════════════════`,
      `// SECTION 1 — Room State Schema (@colyseus/schema)`,
      `// ═══════════════════════════════════════════════════════════════════`,
      ``,
      `import { Schema, type, MapSchema, ArraySchema } from '@colyseus/schema';`,
      `import { Room, Client } from 'colyseus';`,
      ``
    );
  }

  // =========================================================================
  // Section 1 — Schema classes
  // =========================================================================

  private emitSchemaSection(opts: {
    roomClassName: string;
    npcNodes: HoloObjectDecl[];
    spawnNodes: HoloObjectDecl[];
    serverSideNodes: HoloObjectDecl[];
  }) {
    const { roomClassName, npcNodes, spawnNodes, serverSideNodes } = opts;

    // ── PlayerState ──────────────────────────────────────────────────────
    this.schemaClasses.push('PlayerState');
    this.push(
      `export class PlayerState extends Schema {`,
      `  @type('string') id: string = '';`,
      `  @type('string') name: string = '';`,
      `  @type('number') x: number = 0;`,
      `  @type('number') y: number = 0;`,
      `  @type('number') z: number = 0;`,
      `  @type('number') hp: number = 100;`,
      `  @type('string') faction: string = 'none';`,
      `  @type('boolean') isReady: boolean = false;`,
      `}`,
      ``
    );

    // ── NpcState (one per distinct npc type, or a generic one) ───────────
    if (npcNodes.length > 0) {
      this.schemaClasses.push('NpcState');
      this.push(
        `export class NpcState extends Schema {`,
        `  @type('string') id: string = '';`,
        `  @type('string') type: string = 'npc';`,
        `  @type('number') x: number = 0;`,
        `  @type('number') y: number = 0;`,
        `  @type('number') z: number = 0;`,
        `  @type('number') hp: number = 100;`,
        `  @type('string') faction: string = 'none';`,
        `  @type('boolean') isAlive: boolean = true;`,
        `}`,
        ``
      );
    }

    // ── SpawnPointState ──────────────────────────────────────────────────
    if (spawnNodes.length > 0) {
      this.schemaClasses.push('SpawnPointState');
      this.push(
        `export class SpawnPointState extends Schema {`,
        `  @type('string') id: string = '';`,
        `  @type('number') x: number = 0;`,
        `  @type('number') y: number = 0;`,
        `  @type('number') z: number = 0;`,
        `  @type('boolean') occupied: boolean = false;`,
        `}`,
        ``
      );
    }

    // ── Extra authoritative (server-side only) fields ────────────────────
    const serverFields = serverSideNodes.map((n) => ({
      name: this.jsIdentifier(n.name),
      comment: `// @server_side — not synced to clients`,
    }));

    // ── GameRoomState ────────────────────────────────────────────────────
    this.schemaClasses.push('GameRoomState');
    this.push(`export class GameRoomState extends Schema {`);
    this.push(`  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();`);
    if (npcNodes.length > 0) {
      this.push(`  @type({ map: NpcState }) npcs = new MapSchema<NpcState>();`);
    }
    if (spawnNodes.length > 0) {
      this.push(`  @type([SpawnPointState]) spawnPoints = new ArraySchema<SpawnPointState>();`);
    }
    this.push(`  @type('number') tickCount: number = 0;`);
    this.push(`  @type('string') phase: string = 'lobby';`);
    // Server-side non-synced fields (just plain TS properties, no @type)
    for (const sf of serverFields) {
      this.push(`  ${sf.comment}`);
      this.push(`  ${sf.name}_serverOnly: unknown = null;`);
    }
    this.push(`}`, ``);
  }

  // =========================================================================
  // Section 2 — Room class
  // =========================================================================

  private emitRoomClass(opts: {
    roomClassName: string;
    maxPlayers: number;
    tickRate: number;
    npcNodes: HoloObjectDecl[];
    spawnNodes: HoloObjectDecl[];
    joinHandler: HoloEventHandler | null;
    leaveHandler: HoloEventHandler | null;
    actionHandler: HoloEventHandler | null;
  }) {
    const {
      roomClassName,
      maxPlayers,
      tickRate,
      npcNodes,
      spawnNodes,
      joinHandler,
      leaveHandler,
      actionHandler,
    } = opts;

    this.push(
      `// ═══════════════════════════════════════════════════════════════════`,
      `// SECTION 2 — Room Class`,
      `// ═══════════════════════════════════════════════════════════════════`,
      ``
    );

    this.push(`export class ${roomClassName} extends Room<GameRoomState> {`);
    this.push(``);

    // ── onCreate ──────────────────────────────────────────────────────────
    this.push(`  onCreate(options: Record<string, unknown>): void {`);
    this.push(`    this.maxClients = ${maxPlayers};`);
    this.push(`    this.patchRate = ${Math.round(1000 / tickRate)}; // ~${tickRate} Hz`);
    this.push(`    this.setState(new GameRoomState());`);
    this.push(``);

    // Seed NPC entities from composition
    if (npcNodes.length > 0) {
      this.push(`    // Seed NPC entities from composition`);
      for (const node of npcNodes) {
        const id = this.jsString(node.name);
        const npcType = this.resolveNpcType(node);
        const pos = this.objectPosition(node);
        const faction = this.valueToString(this.findObjProp(node, 'faction'), 'none');
        const hp = this.valueToNumber(this.findObjProp(node, 'hp'), 100);
        const npcVar = `npc_${this.jsIdentifier(node.name)}`;
        this.push(`    const ${npcVar} = new NpcState();`);
        this.push(`    ${npcVar}.id = ${id};`);
        this.push(`    ${npcVar}.type = ${this.jsString(npcType)};`);
        this.push(`    ${npcVar}.x = ${pos.x};`);
        this.push(`    ${npcVar}.y = ${pos.y};`);
        this.push(`    ${npcVar}.z = ${pos.z};`);
        this.push(`    ${npcVar}.hp = ${hp};`);
        this.push(`    ${npcVar}.faction = ${this.jsString(faction)};`);
        this.push(`    this.state.npcs.set(${id}, ${npcVar});`);
      }
      this.push(``);
    }

    // Seed spawn points from composition
    if (spawnNodes.length > 0) {
      this.push(`    // Seed spawn points from composition`);
      for (const node of spawnNodes) {
        const pos = this.objectPosition(node);
        const spawnVar = `spawn_${this.jsIdentifier(node.name)}`;
        this.push(`    const ${spawnVar} = new SpawnPointState();`);
        this.push(`    ${spawnVar}.id = ${this.jsString(node.name)};`);
        this.push(`    ${spawnVar}.x = ${pos.x};`);
        this.push(`    ${spawnVar}.y = ${pos.y};`);
        this.push(`    ${spawnVar}.z = ${pos.z};`);
        this.push(`    this.state.spawnPoints.push(${spawnVar});`);
      }
      this.push(``);
    }

    // Simulation tick
    this.push(`    // Authoritative simulation tick`);
    this.push(`    this.setSimulationInterval((deltaTime) => {`);
    this.push(`      this.state.tickCount++;`);
    this.push(`      this.onTick(deltaTime);`);
    this.push(`    }, ${Math.round(1000 / tickRate)});`);
    this.push(`  }`);
    this.push(``);

    // ── onJoin ────────────────────────────────────────────────────────────
    this.push(`  onJoin(client: Client, options: Record<string, unknown>): void {`);
    this.push(`    const player = new PlayerState();`);
    this.push(`    player.id = client.sessionId;`);
    this.push(`    player.name = (options['name'] as string) || client.sessionId;`);
    this.push(`    player.faction = (options['faction'] as string) || 'none';`);
    this.push(``);
    // Place player at first available spawn point, or origin
    if (spawnNodes.length > 0) {
      this.push(`    // Assign spawn point`);
      this.push(`    const freeSpawn = this.state.spawnPoints.find((s) => !s.occupied);`);
      this.push(`    if (freeSpawn) {`);
      this.push(`      player.x = freeSpawn.x;`);
      this.push(`      player.y = freeSpawn.y;`);
      this.push(`      player.z = freeSpawn.z;`);
      this.push(`      freeSpawn.occupied = true;`);
      this.push(`    }`);
    } else {
      this.push(`    player.x = 0; player.y = 0; player.z = 0;`);
    }
    this.push(`    this.state.players.set(client.sessionId, player);`);
    if (joinHandler) {
      this.push(``);
      this.push(`    // Logic: on_event player_join`);
      this.push(`    this.handlePlayerJoin(client, player, options);`);
    }
    this.push(`    console.log(\`[${roomClassName}] Player joined: \${client.sessionId}\`);`);
    this.push(`  }`);
    this.push(``);

    // ── onLeave ───────────────────────────────────────────────────────────
    this.push(`  onLeave(client: Client, wasIntentional: boolean): void {`);
    this.push(`    const player = this.state.players.get(client.sessionId);`);
    if (spawnNodes.length > 0) {
      this.push(`    if (player) {`);
      this.push(`      // Free spawn point`);
      this.push(`      const spawn = this.state.spawnPoints.find(`);
      this.push(`        (s) => s.x === player.x && s.y === player.y && s.z === player.z`);
      this.push(`      );`);
      this.push(`      if (spawn) spawn.occupied = false;`);
      this.push(`    }`);
    }
    this.push(`    this.state.players.delete(client.sessionId);`);
    if (leaveHandler) {
      this.push(``);
      this.push(`    // Logic: on_event player_leave`);
      this.push(`    this.handlePlayerLeave(client, wasIntentional);`);
    }
    this.push(`    console.log(\`[${roomClassName}] Player left: \${client.sessionId} intentional=\${wasIntentional}\`);`);
    this.push(`  }`);
    this.push(``);

    // ── onMessage ─────────────────────────────────────────────────────────
    this.push(`  onMessage(client: Client, type: string, message: unknown): void {`);
    this.push(`    const player = this.state.players.get(client.sessionId);`);
    this.push(`    if (!player) return;`);
    this.push(``);
    this.push(`    switch (type) {`);
    this.push(`      case 'move': {`);
    this.push(`        const data = message as { x?: number; y?: number; z?: number };`);
    this.push(`        if (typeof data.x === 'number') player.x = data.x;`);
    this.push(`        if (typeof data.y === 'number') player.y = data.y;`);
    this.push(`        if (typeof data.z === 'number') player.z = data.z;`);
    this.push(`        break;`);
    this.push(`      }`);
    this.push(`      case 'chat': {`);
    this.push(`        // Broadcast chat to all clients`);
    this.push(`        this.broadcast('chat', { from: client.sessionId, text: message }, { except: client });`);
    this.push(`        break;`);
    this.push(`      }`);
    if (actionHandler) {
      this.push(`      case 'action': {`);
      this.push(`        // Logic: on_event player_action`);
      this.push(`        this.handlePlayerAction(client, player, message);`);
      this.push(`        break;`);
      this.push(`      }`);
    }
    this.push(`      default:`);
    this.push(`        console.warn(\`[${roomClassName}] Unknown message type: \${type}\`);`);
    this.push(`    }`);
    this.push(`  }`);
    this.push(``);

    // ── onTick (simulation) ───────────────────────────────────────────────
    this.push(`  // Override to add authoritative simulation logic`);
    this.push(`  protected onTick(_deltaTime: number): void {`);
    this.push(`    // Stub: add AI, physics, respawn timers, etc.`);
    this.push(`  }`);
    this.push(``);

    // ── Logic handler stubs ───────────────────────────────────────────────
    if (joinHandler) {
      this.push(`  // Derived from HoloLogic on_event player_join`);
      this.push(
        `  protected handlePlayerJoin(client: Client, player: PlayerState, options: Record<string, unknown>): void {`
      );
      this.push(`    // TODO: implement join logic from HoloScript composition`);
      this.push(`    void client; void player; void options;`);
      this.push(`  }`);
      this.push(``);
    }
    if (leaveHandler) {
      this.push(`  // Derived from HoloLogic on_event player_leave`);
      this.push(
        `  protected handlePlayerLeave(client: Client, wasIntentional: boolean): void {`
      );
      this.push(`    // TODO: implement leave logic from HoloScript composition`);
      this.push(`    void client; void wasIntentional;`);
      this.push(`  }`);
      this.push(``);
    }
    if (actionHandler) {
      this.push(`  // Derived from HoloLogic on_event player_action`);
      this.push(
        `  protected handlePlayerAction(client: Client, player: PlayerState, message: unknown): void {`
      );
      this.push(`    // TODO: implement action logic from HoloScript composition`);
      this.push(`    void client; void player; void message;`);
      this.push(`  }`);
      this.push(``);
    }

    this.push(`}`);
    this.push(``);
  }

  // =========================================================================
  // Section 3 — Bootstrap
  // =========================================================================

  private emitBootstrap(roomClassName: string, roomName: string) {
    const roomKey = roomName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    this.push(
      `// ═══════════════════════════════════════════════════════════════════`,
      `// SECTION 3 — app.ts Bootstrap`,
      `// ═══════════════════════════════════════════════════════════════════`,
      ``,
      `// Paste the following block into your Colyseus app.ts / server entry:`,
      `//`,
      `// import { Server } from 'colyseus';`,
      `// import { ${roomClassName} } from './<this-file>';`,
      `// const gameServer = new Server();`,
      `// gameServer.define(${this.jsString(roomKey)}, ${roomClassName});`,
      `// gameServer.listen(2567).then(() => console.log('Colyseus listening on :2567'));`,
      ``,
      `// ── Inline bootstrap (remove if you prefer a separate entry point) ──`,
      `import { Server } from 'colyseus';`,
      ``,
      `export function createColyseusServer(port = 2567): Server {`,
      `  const gameServer = new Server();`,
      `  gameServer.define(${this.jsString(roomKey)}, ${roomClassName});`,
      `  return gameServer;`,
      `}`,
      ``
    );
  }

  // =========================================================================
  // AST traversal helpers (mirrored from ARCompiler pattern)
  // =========================================================================

  private extractNodesWithTrait(astNode: unknown, traitName: string): HoloObjectDecl[] {
    return this.extractNodesWithAnyTrait(astNode, [traitName]);
  }

  private extractNodesWithAnyTrait(
    astNode: unknown,
    traitNames: readonly string[]
  ): HoloObjectDecl[] {
    const matched: HoloObjectDecl[] = [];
    const seen = new Set<HoloObjectDecl>();
    const cleanNames = new Set(traitNames.map((n) => this.cleanTraitName(n)));

    const traverse = (node: unknown): void => {
      if (Array.isArray(node)) {
        for (const item of node) traverse(item);
        return;
      }
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (
        this.isObjectDecl(record) &&
        this.nodeHasAnyTrait(record, cleanNames) &&
        !seen.has(record)
      ) {
        matched.push(record);
        seen.add(record);
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') traverse(value);
      }
    };

    traverse(astNode);
    return matched;
  }

  private cleanTraitName(traitName: string): string {
    return traitName.startsWith('@') ? traitName.slice(1) : traitName;
  }

  private isObjectDecl(
    record: Record<string, unknown>
  ): record is Record<string, unknown> & HoloObjectDecl {
    return (
      (record.type === 'Object' || record.type === 'ObjectDecl') &&
      typeof record.name === 'string' &&
      Array.isArray(record.traits) &&
      Array.isArray(record.properties)
    );
  }

  private nodeHasAnyTrait(node: HoloObjectDecl, traitNames: ReadonlySet<string>): boolean {
    return node.traits.some((trait) =>
      traitNames.has(this.cleanTraitName(String(trait.name)))
    );
  }

  private getTrait(node: HoloObjectDecl, traitName: string): HoloObjectTrait | undefined {
    const clean = this.cleanTraitName(traitName);
    return node.traits.find((t) => this.cleanTraitName(String(t.name)) === clean);
  }

  private findObjProp(node: HoloObjectDecl, key: string): HoloValue | undefined {
    return node.properties.find((p) => p.key === key)?.value;
  }

  private resolveNpcType(node: HoloObjectDecl): string {
    if (this.nodeHasAnyTrait(node, new Set(['boss']))) return 'boss';
    if (this.nodeHasAnyTrait(node, new Set(['mmo_entity']))) return 'entity';
    return 'npc';
  }

  private objectPosition(node: HoloObjectDecl): { x: number; y: number; z: number } {
    const raw = this.findObjProp(node, 'position');
    return this.valueToVector(raw, { x: 0, y: 0, z: 0 });
  }

  private valueToVector(
    value: HoloValue | undefined,
    fallback: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    if (Array.isArray(value)) {
      return {
        x: this.valueToNumber(value[0], fallback.x),
        y: this.valueToNumber(value[1], fallback.y),
        z: this.valueToNumber(value[2], fallback.z),
      };
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !('__bind' in value)) {
      return {
        x: this.valueToNumber(value['x'], fallback.x),
        y: this.valueToNumber(value['y'], fallback.y),
        z: this.valueToNumber(value['z'], fallback.z),
      };
    }
    return fallback;
  }

  private valueToNumber(value: HoloValue | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  private valueToString(value: HoloValue | undefined, fallback: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
  }

  // =========================================================================
  // String / identifier helpers
  // =========================================================================

  private jsString(value: string): string {
    return `'${this.escapeStringValue(value, 'TypeScript')}'`;
  }

  private jsIdentifier(value: string): string {
    const safe = value.replace(/[^A-Za-z0-9_$]/g, '_').replace(/^[^A-Za-z_$]+/, '');
    return safe || 'node';
  }

  private jsClassName(value: string): string {
    // PascalCase from snake_case or kebab-case or spaces
    return value
      .split(/[-_\s]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  // =========================================================================
  // Emit helper
  // =========================================================================

  private push(...lines: string[]): void {
    for (const line of lines) this.lines.push(line);
  }

  // =========================================================================
  // Result
  // =========================================================================

  private buildResult(roomClassName: string): ColyseusCompilationResult {
    return {
      success: this.errors.length === 0,
      code: this.lines.join('\n'),
      roomClassName,
      schemaClasses: [...this.schemaClasses],
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }
}

export default ColyseusCompiler;
