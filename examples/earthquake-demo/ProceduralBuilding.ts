/**
 * Procedural Building Generator for Earthquake Demo
 *
 * Generates multi-story buildings with structural elements (beams, columns, floors)
 * for realistic earthquake collapse simulations.
 *
 * @module demos/earthquake/ProceduralBuilding
 */

export interface BuildingConfig {
  /** Number of floors (typically 5-10) */
  floors: number;

  /** Height of each floor in meters */
  floorHeight: number;

  /** Building width (X-axis) in meters */
  width: number;

  /** Building depth (Z-axis) in meters */
  depth: number;

  /** Number of columns per side */
  columnsPerSide: number;

  /** Number of beams per floor */
  beamsPerFloor: number;

  /** Column diameter in meters */
  columnDiameter?: number;

  /** Beam width in meters */
  beamWidth?: number;

  /** Floor slab thickness in meters */
  floorThickness?: number;
}

export interface StructuralElement {
  /** Unique element ID */
  id: number;

  /** Element type */
  type: 'column' | 'beam' | 'floor' | 'foundation';

  /** Position in world space */
  position: [number, number, number];

  /** Dimensions [width, height, depth] */
  dimensions: [number, number, number];

  /** Material type */
  material: 'concrete' | 'steel' | 'composite';

  /** Structural health (0-100%) */
  health: number;

  /** IDs of connected elements */
  connections: number[];

  /** Mass in kg */
  mass: number;

  /** Load-bearing capacity (Newtons) */
  loadCapacity: number;

  /** Current stress level (0-100%) */
  stress: number;

  /** Floor level (0 = foundation) */
  floor: number;
}

export interface WeakPoint {
  /** ID of element containing weak point */
  elementId: number;

  /** Stress threshold for failure (0-100%) */
  failureThreshold: number;

  /** How the element fails */
  failureMode: 'snap' | 'bend' | 'crush' | 'shear';

  /** Position within element (0-1) */
  position: number;
}

export interface BuildingStructure {
  /** All structural elements */
  elements: StructuralElement[];

  /** Identified weak points */
  weakPoints: WeakPoint[];

  /** Building configuration */
  config: BuildingConfig;

  /** Total mass of building (kg) */
  totalMass: number;

  /** Center of mass */
  centerOfMass: [number, number, number];

  /** Bounding box */
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

/**
 * Procedural Building Generator
 *
 * Generates realistic multi-story building structures with proper
 * structural elements and connections for earthquake simulation.
 */
export class ProceduralBuilding {
  private elementIdCounter = 0;

  /**
   * Generate a complete building structure
   */
  generateStructure(config: BuildingConfig): BuildingStructure {
    const elements: StructuralElement[] = [];
    const weakPoints: WeakPoint[] = [];

    // Set defaults
    const columnDiameter = config.columnDiameter ?? 0.5;
    const beamWidth = config.beamWidth ?? 0.4;
    const floorThickness = config.floorThickness ?? 0.3;

    // Generate foundation
    const foundation = this.generateFoundation(config);
    elements.push(foundation);

    // Generate columns for each floor
    const columns = this.generateColumns(config, columnDiameter);
    elements.push(...columns);

    // Generate beams connecting columns
    const beams = this.generateBeams(config, columns, beamWidth);
    elements.push(...beams);

    // Generate floor slabs
    const floors = this.generateFloors(config, floorThickness);
    elements.push(...floors);

    // Establish connections
    this.establishConnections(elements);

    // Identify weak points
    const weakPts = this.identifyWeakPoints(elements, config);
    weakPoints.push(...weakPts);

    // Calculate total mass and center of mass
    const totalMass = elements.reduce((sum, el) => sum + el.mass, 0);
    const centerOfMass = this.calculateCenterOfMass(elements);
    const bounds = this.calculateBounds(elements);

    return {
      elements,
      weakPoints,
      config,
      totalMass,
      centerOfMass,
      bounds,
    };
  }

  /**
   * Generate foundation element
   */
  private generateFoundation(config: BuildingConfig): StructuralElement {
    const thickness = 0.5; // 50cm thick foundation
    const width = config.width + 2; // Extend 1m beyond building
    const depth = config.depth + 2;

    return {
      id: this.elementIdCounter++,
      type: 'foundation',
      position: [0, -thickness / 2, 0],
      dimensions: [width, thickness, depth],
      material: 'concrete',
      health: 100,
      connections: [],
      mass: width * thickness * depth * 2400, // Concrete density ~2400 kg/m³
      loadCapacity: 1e8, // Very high capacity
      stress: 0,
      floor: 0,
    };
  }

  /**
   * Generate columns for all floors
   */
  private generateColumns(config: BuildingConfig, diameter: number): StructuralElement[] {
    const columns: StructuralElement[] = [];
    const { columnsPerSide, width, depth, floors, floorHeight } = config;

    // Calculate column positions
    const xSpacing = width / (columnsPerSide - 1);
    const zSpacing = depth / (columnsPerSide - 1);

    // Generate columns for each floor
    for (let floor = 0; floor < floors; floor++) {
      const y = floor * floorHeight;

      for (let xi = 0; xi < columnsPerSide; xi++) {
        for (let zi = 0; zi < columnsPerSide; zi++) {
          // Skip interior columns on upper floors (hollow building)
          if (floor > 0 && xi > 0 && xi < columnsPerSide - 1 && zi > 0 && zi < columnsPerSide - 1) {
            continue;
          }

          const x = -width / 2 + xi * xSpacing;
          const z = -depth / 2 + zi * zSpacing;

          // Material: lower floors are concrete, upper floors are steel
          const material = floor < floors / 2 ? 'concrete' : 'steel';
          const density = material === 'concrete' ? 2400 : 7850; // kg/m³

          const volume = Math.PI * (diameter / 2) ** 2 * floorHeight;

          columns.push({
            id: this.elementIdCounter++,
            type: 'column',
            position: [x, y + floorHeight / 2, z],
            dimensions: [diameter, floorHeight, diameter],
            material,
            health: 100,
            connections: [],
            mass: volume * density,
            loadCapacity: material === 'concrete' ? 5e6 : 8e6, // N
            stress: 0,
            floor: floor + 1,
          });
        }
      }
    }

    return columns;
  }

  /**
   * Generate beams connecting columns
   */
  private generateBeams(
    config: BuildingConfig,
    columns: StructuralElement[],
    beamWidth: number
  ): StructuralElement[] {
    const beams: StructuralElement[] = [];
    const { floors, floorHeight } = config;

    // Generate beams for each floor
    for (let floor = 1; floor <= floors; floor++) {
      const floorColumns = columns.filter((col) => col.floor === floor);

      // Connect adjacent columns with beams
      for (let i = 0; i < floorColumns.length; i++) {
        for (let j = i + 1; j < floorColumns.length; j++) {
          const col1 = floorColumns[i];
          const col2 = floorColumns[j];

          // Check if columns are adjacent (within 1.5× spacing)
          const dx = col2.position[0] - col1.position[0];
          const dz = col2.position[2] - col1.position[2];
          const distance = Math.sqrt(dx * dx + dz * dz);

          if (distance < config.width * 0.8 && distance > 0.1) {
            const midpoint: [number, number, number] = [
              (col1.position[0] + col2.position[0]) / 2,
              col1.position[1], // Same height as columns
              (col1.position[2] + col2.position[2]) / 2,
            ];

            const material = floor <= floors / 2 ? 'concrete' : 'steel';
            const density = material === 'concrete' ? 2400 : 7850;

            const volume = beamWidth * beamWidth * distance;

            beams.push({
              id: this.elementIdCounter++,
              type: 'beam',
              position: midpoint,
              dimensions: [distance, beamWidth, beamWidth],
              material,
              health: 100,
              connections: [col1.id, col2.id],
              mass: volume * density,
              loadCapacity: material === 'concrete' ? 2e6 : 4e6,
              stress: 0,
              floor,
            });
          }
        }
      }
    }

    return beams;
  }

  /**
   * Generate floor slabs
   */
  private generateFloors(config: BuildingConfig, thickness: number): StructuralElement[] {
    const floors: StructuralElement[] = [];
    const { width, depth, floorHeight } = config;

    for (let floor = 1; floor <= config.floors; floor++) {
      const y = floor * floorHeight;

      const volume = width * thickness * depth;
      const mass = volume * 2400; // Concrete

      floors.push({
        id: this.elementIdCounter++,
        type: 'floor',
        position: [0, y, 0],
        dimensions: [width, thickness, depth],
        material: 'concrete',
        health: 100,
        connections: [],
        mass,
        loadCapacity: 3e6,
        stress: 0,
        floor,
      });
    }

    return floors;
  }

  /**
   * Establish connections between structural elements
   */
  private establishConnections(elements: StructuralElement[]): void {
    // Connect columns to foundation
    const foundation = elements.find((el) => el.type === 'foundation');
    if (!foundation) return;

    const groundColumns = elements.filter((el) => el.type === 'column' && el.floor === 1);
    for (const col of groundColumns) {
      col.connections.push(foundation.id);
      foundation.connections.push(col.id);
    }

    // Connect columns vertically
    for (let floor = 1; floor < 10; floor++) {
      const lowerCols = elements.filter((el) => el.type === 'column' && el.floor === floor);
      const upperCols = elements.filter((el) => el.type === 'column' && el.floor === floor + 1);

      for (const lower of lowerCols) {
        for (const upper of upperCols) {
          // Check if columns are at same XZ position
          const dx = Math.abs(lower.position[0] - upper.position[0]);
          const dz = Math.abs(lower.position[2] - upper.position[2]);

          if (dx < 0.1 && dz < 0.1) {
            lower.connections.push(upper.id);
            upper.connections.push(lower.id);
          }
        }
      }
    }

    // Connect floors to columns
    for (const floorElement of elements.filter((el) => el.type === 'floor')) {
      const floorCols = elements.filter(
        (el) => el.type === 'column' && el.floor === floorElement.floor
      );

      for (const col of floorCols) {
        floorElement.connections.push(col.id);
        col.connections.push(floorElement.id);
      }
    }
  }

  /**
   * Identify weak points in structure
   */
  private identifyWeakPoints(elements: StructuralElement[], config: BuildingConfig): WeakPoint[] {
    const weakPoints: WeakPoint[] = [];

    // Lower floors bear more load → more stress → lower failure threshold (easier to fail)
    for (const element of elements) {
      if (element.type === 'foundation') continue;

      // floorFactor: 0 for bottom floor, 1 for top floor
      // stressFactor: 1 for bottom floor (max stress), 0 for top floor (min stress)
      const floorFactor = element.floor / config.floors;
      const stressFactor = 1 - floorFactor; // Lower floors bear more cumulative load

      // Columns have weak points at connections
      // Lower floors → lower threshold (stressFactor high → subtract more)
      if (element.type === 'column') {
        weakPoints.push({
          elementId: element.id,
          failureThreshold: 80 - stressFactor * 20, // 60% (bottom) to 80% (top)
          failureMode: 'crush',
          position: 0.1, // Near bottom
        });

        weakPoints.push({
          elementId: element.id,
          failureThreshold: 85 - stressFactor * 15, // 70% (bottom) to 85% (top)
          failureMode: 'snap',
          position: 0.9, // Near top
        });
      }

      // Beams have weak points at mid-span
      if (element.type === 'beam') {
        weakPoints.push({
          elementId: element.id,
          failureThreshold: 80 - stressFactor * 30, // 50% (bottom) to 80% (top)
          failureMode: 'bend',
          position: 0.5, // Middle
        });
      }

      // Floors can crack at high stress
      if (element.type === 'floor') {
        weakPoints.push({
          elementId: element.id,
          failureThreshold: 90 - stressFactor * 20, // 70% (bottom) to 90% (top)
          failureMode: 'shear',
          position: 0.5,
        });
      }
    }

    return weakPoints;
  }

  /**
   * Calculate center of mass
   */
  private calculateCenterOfMass(elements: StructuralElement[]): [number, number, number] {
    let totalMass = 0;
    let cx = 0,
      cy = 0,
      cz = 0;

    for (const element of elements) {
      cx += element.position[0] * element.mass;
      cy += element.position[1] * element.mass;
      cz += element.position[2] * element.mass;
      totalMass += element.mass;
    }

    return [cx / totalMass, cy / totalMass, cz / totalMass];
  }

  /**
   * Calculate bounding box
   */
  private calculateBounds(elements: StructuralElement[]): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    // Use floor slabs for XZ (they represent the building footprint exactly)
    // and all non-foundation elements for Y
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (const element of elements) {
      if (element.type === 'foundation') continue;

      const [x, y, z] = element.position;
      const [w, h, d] = element.dimensions;

      // Only floor slabs contribute to XZ bounds (exact building footprint)
      if (element.type === 'floor') {
        minX = Math.min(minX, x - w / 2);
        minZ = Math.min(minZ, z - d / 2);
        maxX = Math.max(maxX, x + w / 2);
        maxZ = Math.max(maxZ, z + d / 2);
      }

      // All structural elements contribute to Y bounds
      minY = Math.min(minY, y - h / 2);
      maxY = Math.max(maxY, y + h / 2);
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
  }

  /**
   * Get all structural elements
   */
  getStructuralElements(structure: BuildingStructure): StructuralElement[] {
    return structure.elements;
  }

  /**
   * Get weak points
   */
  getWeakPoints(structure: BuildingStructure): WeakPoint[] {
    return structure.weakPoints;
  }

  /**
   * Get element by ID
   */
  getElementById(structure: BuildingStructure, id: number): StructuralElement | undefined {
    return structure.elements.find((el) => el.id === id);
  }

  /**
   * Get connected elements
   */
  getConnectedElements(structure: BuildingStructure, elementId: number): StructuralElement[] {
    const element = this.getElementById(structure, elementId);
    if (!element) return [];

    return element.connections
      .map((id) => this.getElementById(structure, id))
      .filter((el) => el !== undefined) as StructuralElement[];
  }

  /**
   * Get building statistics
   */
  getStatistics(structure: BuildingStructure): {
    totalElements: number;
    columns: number;
    beams: number;
    floors: number;
    totalMass: number;
    averageHealth: number;
  } {
    const elements = structure.elements;

    return {
      totalElements: elements.length,
      columns: elements.filter((el) => el.type === 'column').length,
      beams: elements.filter((el) => el.type === 'beam').length,
      floors: elements.filter((el) => el.type === 'floor').length,
      totalMass: structure.totalMass,
      averageHealth: elements.reduce((sum, el) => sum + el.health, 0) / elements.length,
    };
  }
}
