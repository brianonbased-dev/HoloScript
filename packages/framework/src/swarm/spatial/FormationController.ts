/**
 * FormationController - Geometric swarm formations
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Manages precise geometric arrangements of swarm agents
 */

import { Vector3 } from './Vector3';

/**
 * Formation patterns
 */
export type FormationType = 'line' | 'circle' | 'grid' | 'wedge' | 'diamond' | 'sphere' | 'custom';

/**
 * Formation slot - assigned position for an agent
 */
export interface IFormationSlot {
  index: number;
  agentId: string | null;
  localPosition: Vector3;
  worldPosition: Vector3;
  isLeaderSlot: boolean;
}

/**
 * Formation configuration
 */
export interface IFormationConfig {
  type: FormationType;
  spacing: number;
  orientation: Vector3;
  scale: number;
  centerOffset: Vector3;
  rotationAngle: number; // Radians around Y axis
}

/**
 * FormationController - Manages geometric swarm formations
 */
export class FormationController {
  private slots: Map<number, IFormationSlot> = new Map();
  private agentSlots: Map<string, number> = new Map();
  private center: Vector3 = Vector3.zero();
  private config: IFormationConfig;
  private slotCount: number = 0;

  constructor(config?: Partial<IFormationConfig>) {
    this.config = {
      type: 'line',
      spacing: 2,
      orientation: new Vector3(0, 0, 1),
      scale: 1,
      centerOffset: Vector3.zero(),
      rotationAngle: 0,
      ...config,
    };
  }

  /**
   * Generate formation slots for given count
   */
  generateSlots(count: number): IFormationSlot[] {
    this.slots.clear();
    this.slotCount = count;

    let positions: Vector3[] = [];

    switch (this.config.type) {
      case 'line':
        positions = this.generateLineFormation(count);
        break;
      case 'circle':
        positions = this.generateCircleFormation(count);
        break;
      case 'grid':
        positions = this.generateGridFormation(count);
        break;
      case 'wedge':
        positions = this.generateWedgeFormation(count);
        break;
      case 'diamond':
        positions = this.generateDiamondFormation(count);
        break;
      case 'sphere':
        positions = this.generateSphereFormation(count);
        break;
      default:
        positions = this.generateLineFormation(count);
    }

    // Create slots from positions
    for (let i = 0; i < positions.length; i++) {
      const slot: IFormationSlot = {
        index: i,
        agentId: null,
        localPosition: positions[i],
        worldPosition: this.localToWorld(positions[i]),
        isLeaderSlot: i === 0,
      };
      this.slots.set(i, slot);
    }

    return this.getAllSlots();
  }

  /**
   * Line formation - agents in a row
   */
  private generateLineFormation(count: number): Vector3[] {
    const positions: Vector3[] = [];
    const startOffset = -((count - 1) * this.config.spacing) / 2;

    for (let i = 0; i < count; i++) {
      positions.push(new Vector3(startOffset + i * this.config.spacing, 0, 0));
    }

    return positions;
  }

  /**
   * Circle formation - agents in a ring
   */
  private generateCircleFormation(count: number): Vector3[] {
    const positions: Vector3[] = [];
    const radius = (count * this.config.spacing) / (2 * Math.PI);

    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      positions.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }

    return positions;
  }

  /**
   * Grid formation - agents in rows and columns
   */
  private generateGridFormation(count: number): Vector3[] {
    const positions: Vector3[] = [];
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);

    const xOffset = -((cols - 1) * this.config.spacing) / 2;
    const zOffset = -((rows - 1) * this.config.spacing) / 2;

    let index = 0;
    for (let row = 0; row < rows && index < count; row++) {
      for (let col = 0; col < cols && index < count; col++) {
        positions.push(
          new Vector3(xOffset + col * this.config.spacing, 0, zOffset + row * this.config.spacing)
        );
        index++;
      }
    }

    return positions;
  }

  /**
   * Wedge formation - V-shaped, leader at point
   */
  private generateWedgeFormation(count: number): Vector3[] {
    const positions: Vector3[] = [];

    // Leader at front
    positions.push(Vector3.zero());

    let row = 1;
    let placed = 1;

    while (placed < count) {
      // Left and right of each row
      for (let side = 0; side < 2 && placed < count; side++) {
        const x = (side === 0 ? -1 : 1) * row * this.config.spacing * 0.5;
        const z = -row * this.config.spacing;
        positions.push(new Vector3(x, 0, z));
        placed++;
      }
      row++;
    }

    return positions;
  }

  /**
   * Diamond formation - diamond shape, leader at front point
   */
  private generateDiamondFormation(count: number): Vector3[] {
    const positions: Vector3[] = [];

    // Calculate diamond dimensions
    const n = Math.ceil(Math.sqrt(2 * count + 0.25) - 0.5);
    let placed = 0;

    // Top half (expanding)
    for (let row = 0; row <= n && placed < count; row++) {
      const rowWidth = row + 1;
      const xOffset = -(row * this.config.spacing) / 2;
      const z = -row * this.config.spacing;

      for (let i = 0; i < rowWidth && placed < count; i++) {
        positions.push(new Vector3(xOffset + i * this.config.spacing, 0, z));
        placed++;
      }
    }

    // Bottom half (contracting)
    for (let row = n - 1; row >= 0 && placed < count; row--) {
      const rowWidth = row + 1;
      const xOffset = -(row * this.config.spacing) / 2;
      const z = (n - row) * this.config.spacing;

      for (let i = 0; i < rowWidth && placed < count; i++) {
        positions.push(new Vector3(xOffset + i * this.config.spacing, 0, z));
        placed++;
      }
    }

    return positions;
  }

  /**
   * Sphere formation - 3D spherical arrangement
   */
  private generateSphereFormation(count: number): Vector3[] {
    const positions: Vector3[] = [];
    const radius = (this.config.spacing * Math.cbrt(count)) / 2;

    // Use Fibonacci sphere algorithm for even distribution
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;

      positions.push(
        new Vector3(
          Math.cos(theta) * radiusAtY * radius,
          y * radius,
          Math.sin(theta) * radiusAtY * radius
        )
      );
    }

    return positions;
  }

  /**
   * Set custom formation positions
   */
  setCustomFormation(positions: Vector3[]): void {
    this.config.type = 'custom';
    this.slots.clear();
    this.slotCount = positions.length;

    for (let i = 0; i < positions.length; i++) {
      const slot: IFormationSlot = {
        index: i,
        agentId: null,
        localPosition: positions[i],
        worldPosition: this.localToWorld(positions[i]),
        isLeaderSlot: i === 0,
      };
      this.slots.set(i, slot);
    }
  }

  /**
   * Assign an agent to a slot
   */
  assignAgent(agentId: string, slotIndex?: number): number {
    // If slot specified, try to use it
    if (slotIndex !== undefined) {
      const slot = this.slots.get(slotIndex);
      if (slot && slot.agentId === null) {
        slot.agentId = agentId;
        this.agentSlots.set(agentId, slotIndex);
        return slotIndex;
      }
    }

    // Find first available slot
    for (const [index, slot] of this.slots) {
      if (slot.agentId === null) {
        slot.agentId = agentId;
        this.agentSlots.set(agentId, index);
        return index;
      }
    }

    return -1; // No slots available
  }

  /**
   * Remove an agent from its slot
   */
  removeAgent(agentId: string): boolean {
    const slotIndex = this.agentSlots.get(agentId);
    if (slotIndex === undefined) return false;

    const slot = this.slots.get(slotIndex);
    if (slot) {
      slot.agentId = null;
    }
    this.agentSlots.delete(agentId);
    return true;
  }

  /**
   * Get agent's assigned slot
   */
  getAgentSlot(agentId: string): IFormationSlot | undefined {
    const slotIndex = this.agentSlots.get(agentId);
    if (slotIndex === undefined) return undefined;
    return this.slots.get(slotIndex);
  }

  /**
   * Get target position for an agent
   */
  getAgentTarget(agentId: string): Vector3 | undefined {
    const slot = this.getAgentSlot(agentId);
    return slot?.worldPosition;
  }

  /**
   * Get all slots
   */
  getAllSlots(): IFormationSlot[] {
    return [...this.slots.values()];
  }

  /**
   * Get available (unassigned) slots
   */
  getAvailableSlots(): IFormationSlot[] {
    return this.getAllSlots().filter((s) => s.agentId === null);
  }

  /**
   * Get assigned slots
   */
  getAssignedSlots(): IFormationSlot[] {
    return this.getAllSlots().filter((s) => s.agentId !== null);
  }

  /**
   * Set formation center position
   */
  setCenter(position: Vector3): void {
    this.center = position.clone();
    this.updateWorldPositions();
  }

  /**
   * Get formation center
   */
  getCenter(): Vector3 {
    return this.center.clone();
  }

  /**
   * Set rotation angle
   */
  setRotation(angle: number): void {
    this.config.rotationAngle = angle;
    this.updateWorldPositions();
  }

  /**
   * Update world positions based on center and rotation
   */
  private updateWorldPositions(): void {
    for (const slot of this.slots.values()) {
      slot.worldPosition = this.localToWorld(slot.localPosition);
    }
  }

  /**
   * Convert local position to world position
   */
  private localToWorld(local: Vector3): Vector3 {
    // Apply scale
    let pos = local.multiply(this.config.scale);

    // Apply rotation around Y axis
    if (this.config.rotationAngle !== 0) {
      const cos = Math.cos(this.config.rotationAngle);
      const sin = Math.sin(this.config.rotationAngle);
      const newX = pos.x * cos - pos.z * sin;
      const newZ = pos.x * sin + pos.z * cos;
      pos = new Vector3(newX, pos.y, newZ);
    }

    // Apply center offset and formation offset
    return pos.add(this.center).add(this.config.centerOffset);
  }

  /**
   * Check if formation is complete (all slots filled)
   */
  isComplete(): boolean {
    return this.getAvailableSlots().length === 0;
  }

  /**
   * Get formation completeness ratio
   */
  getCompletenessRatio(): number {
    if (this.slots.size === 0) return 0;
    return this.getAssignedSlots().length / this.slots.size;
  }

  /**
   * Get formation tightness (average distance from target)
   */
  getFormationTightness(agentPositions: Map<string, Vector3>): number {
    const assigned = this.getAssignedSlots();
    if (assigned.length === 0) return 1;

    let totalError = 0;
    let count = 0;

    for (const slot of assigned) {
      if (slot.agentId) {
        const actual = agentPositions.get(slot.agentId);
        if (actual) {
          const error = actual.distanceTo(slot.worldPosition);
          totalError += error;
          count++;
        }
      }
    }

    if (count === 0) return 1;

    // Convert error to tightness (1 = perfect, 0 = very loose)
    const avgError = totalError / count;
    return Math.max(0, 1 - avgError / this.config.spacing);
  }

  /**
   * Reoptimize slot assignments (minimize total distance)
   */
  optimizeAssignments(agentPositions: Map<string, Vector3>): void {
    const agents = [...agentPositions.entries()];
    const slots = this.getAllSlots();

    // Clear current assignments
    for (const slot of slots) {
      if (slot.agentId) {
        this.agentSlots.delete(slot.agentId);
        slot.agentId = null;
      }
    }

    // Greedy assignment: closest agent to each slot
    const assignedAgents = new Set<string>();

    for (const slot of slots) {
      let bestAgent: string | null = null;
      let bestDist = Infinity;

      for (const [agentId, position] of agents) {
        if (assignedAgents.has(agentId)) continue;

        const dist = position.distanceTo(slot.worldPosition);
        if (dist < bestDist) {
          bestDist = dist;
          bestAgent = agentId;
        }
      }

      if (bestAgent) {
        slot.agentId = bestAgent;
        this.agentSlots.set(bestAgent, slot.index);
        assignedAgents.add(bestAgent);
      }
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<IFormationConfig>): void {
    this.config = { ...this.config, ...config };
    if (this.slotCount > 0) {
      this.generateSlots(this.slotCount);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): IFormationConfig {
    return { ...this.config };
  }
}
