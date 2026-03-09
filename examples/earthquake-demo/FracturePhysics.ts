/**
 * Fracture Physics System for Earthquake Demo
 *
 * Simulates progressive structural collapse, stress propagation,
 * and debris generation for realistic earthquake effects.
 *
 * @module demos/earthquake/FracturePhysics
 */

import type { BuildingStructure, StructuralElement, WeakPoint } from './ProceduralBuilding.js';

export interface EarthquakeConfig {
  /** Earthquake intensity (0-10 Richter-like scale) */
  intensity: number;

  /** Duration in seconds */
  duration: number;

  /** Frequency of ground shake (Hz) */
  frequency: number;

  /** Epicenter position [x, y, z] (distance affects intensity) */
  epicenter: [number, number, number];

  /** Vertical shake component (0-1, relative to horizontal) */
  verticalComponent: number;
}

export interface DebrisParticle {
  /** Particle ID */
  id: number;

  /** Source element that fractured */
  sourceElementId: number;

  /** Position [x, y, z] */
  position: [number, number, number];

  /** Velocity [vx, vy, vz] */
  velocity: [number, number, number];

  /** Angular velocity [wx, wy, wz] (rad/s) */
  angularVelocity: [number, number, number];

  /** Particle size (radius) */
  radius: number;

  /** Mass (kg) */
  mass: number;

  /** Material type */
  material: 'concrete' | 'steel' | 'composite';

  /** Time since spawn (for effects) */
  age: number;

  /** Is particle active */
  active: boolean;
}

export interface CollapseEvent {
  /** Time of event (seconds) */
  time: number;

  /** Element that failed */
  elementId: number;

  /** Failure mode */
  failureMode: 'snap' | 'bend' | 'crush' | 'shear';

  /** Position of failure */
  position: [number, number, number];

  /** Debris spawned from this event */
  debrisCount: number;

  /** Elements affected by cascade */
  cascadeElements: number[];
}

/**
 * Fracture Physics System
 *
 * Manages structural analysis, progressive collapse, and debris generation
 * for realistic earthquake simulations.
 */
export class FracturePhysics {
  private building: BuildingStructure;
  private earthquakeConfig: EarthquakeConfig | null = null;
  private earthquakeStartTime: number = 0;
  private currentTime: number = 0;

  private failedElements = new Set<number>();
  private collapseEvents: CollapseEvent[] = [];
  private debrisParticles: DebrisParticle[] = [];
  private debrisIdCounter = 0;

  constructor(building: BuildingStructure) {
    this.building = building;
  }

  /**
   * Trigger an earthquake
   */
  triggerEarthquake(config: EarthquakeConfig): void {
    this.earthquakeConfig = config;
    this.earthquakeStartTime = this.currentTime;
    this.failedElements.clear();
    this.collapseEvents = [];
    this.debrisParticles = [];

    console.log(
      `🌊 Earthquake triggered: Intensity ${config.intensity}, Duration ${config.duration}s`
    );
  }

  /**
   * Update physics simulation
   */
  update(dt: number): void {
    this.currentTime += dt;

    if (!this.earthquakeConfig) return;

    const timeSinceStart = this.currentTime - this.earthquakeStartTime;

    // Check if earthquake is still active
    if (timeSinceStart > this.earthquakeConfig.duration) {
      // Earthquake ended, but continue simulating collapse
      this.earthquakeConfig = null;
    }

    // Apply earthquake forces to structure
    if (this.earthquakeConfig) {
      this.applyEarthquakeForces(timeSinceStart);
    }

    // Update structural stress
    this.updateStructuralStress();

    // Check for failures
    this.checkForFailures();

    // Propagate failures (cascade effect)
    this.propagateFailures();

    // Update debris particles
    this.updateDebrisParticles(dt);
  }

  /**
   * Apply earthquake forces to all structural elements
   */
  private applyEarthquakeForces(time: number): void {
    if (!this.earthquakeConfig) return;

    const { intensity, frequency, epicenter, verticalComponent } = this.earthquakeConfig;

    // Ground motion calculation (simplified)
    const omega = 2 * Math.PI * frequency;
    const amplitude = intensity * 0.5; // meters

    // Horizontal shake (X and Z)
    const shakeX = amplitude * Math.sin(omega * time) * Math.cos(omega * time * 1.3);
    const shakeZ = amplitude * Math.cos(omega * time) * Math.sin(omega * time * 0.7);

    // Vertical shake (Y)
    const shakeY = amplitude * verticalComponent * Math.sin(omega * time * 2);

    // Apply to all elements
    for (const element of this.building.elements) {
      if (this.failedElements.has(element.id)) continue;

      // Calculate distance from epicenter
      const dx = element.position[0] - epicenter[0];
      const dz = element.position[2] - epicenter[2];
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Attenuation with distance
      const attenuation = 1 / (1 + distance * 0.1);

      // Inertial forces due to ground acceleration
      const accelX = shakeX * attenuation;
      const accelZ = shakeZ * attenuation;
      const accelY = shakeY * attenuation;

      // Force = mass × acceleration
      const forceX = element.mass * accelX;
      const forceZ = element.mass * accelZ;
      const forceY = element.mass * accelY;

      // Calculate stress from earthquake forces
      const totalForce = Math.sqrt(forceX ** 2 + forceY ** 2 + forceZ ** 2);
      const earthquakeStress = (totalForce / element.loadCapacity) * 100;

      // Add to element's stress
      element.stress = Math.min(100, element.stress + earthquakeStress * 0.01);
    }
  }

  /**
   * Update structural stress based on loads
   */
  private updateStructuralStress(): void {
    // Calculate load distribution (simplified)
    // Higher floors apply load to lower floors

    // Reset stress accumulation
    for (const element of this.building.elements) {
      if (this.failedElements.has(element.id)) {
        element.stress = 100; // Failed elements at max stress
        continue;
      }

      // Base stress from element's own weight
      const gravityStress = ((element.mass * 9.8) / element.loadCapacity) * 10;
      element.stress = gravityStress;
    }

    // Accumulate load from above
    for (let floor = this.building.config.floors; floor >= 1; floor--) {
      const floorElements = this.building.elements.filter((el) => el.floor === floor);

      for (const element of floorElements) {
        if (this.failedElements.has(element.id)) continue;

        // Get elements above (connected and higher floor)
        const connectedAbove = element.connections
          .map((id) => this.building.elements.find((el) => el.id === id))
          .filter((el) => el && el.floor > element.floor && !this.failedElements.has(el.id));

        // Sum load from above
        let loadFromAbove = 0;
        for (const above of connectedAbove) {
          if (above) {
            loadFromAbove += above.mass * 9.8;
          }
        }

        // Add stress from load above
        const additionalStress = (loadFromAbove / element.loadCapacity) * 100;
        element.stress += additionalStress;

        // Clamp stress to 0-100%
        element.stress = Math.max(0, Math.min(100, element.stress));
      }
    }

    // Redistribute stress for failed elements
    this.redistributeStress();
  }

  /**
   * Redistribute stress when elements fail
   */
  private redistributeStress(): void {
    for (const failedId of this.failedElements) {
      const failedElement = this.building.elements.find((el) => el.id === failedId);
      if (!failedElement) continue;

      // Find connected elements that are still intact
      const intactConnected = failedElement.connections
        .map((id) => this.building.elements.find((el) => el.id === id))
        .filter((el) => el && !this.failedElements.has(el.id));

      // Distribute failed element's load to connected elements
      const loadPerElement = (failedElement.mass * 9.8) / intactConnected.length;

      for (const connected of intactConnected) {
        if (connected) {
          const additionalStress = (loadPerElement / connected.loadCapacity) * 100;
          connected.stress += additionalStress;
        }
      }
    }
  }

  /**
   * Check for structural failures based on stress
   */
  private checkForFailures(): void {
    for (const weakPoint of this.building.weakPoints) {
      const element = this.building.elements.find((el) => el.id === weakPoint.elementId);
      if (!element || this.failedElements.has(element.id)) continue;

      // Check if stress exceeds failure threshold
      if (element.stress >= weakPoint.failureThreshold) {
        // Element fails!
        this.failElement(element, weakPoint);
      }
    }
  }

  /**
   * Fail a structural element
   */
  private failElement(element: StructuralElement, weakPoint: WeakPoint): void {
    console.log(
      `💥 Element ${element.id} (${element.type}, floor ${element.floor}) failed: ${weakPoint.failureMode}`
    );

    // Mark as failed
    this.failedElements.add(element.id);
    element.health = 0;
    element.stress = 100;

    // Calculate failure position
    const failurePos: [number, number, number] = [
      element.position[0],
      element.position[1] + (weakPoint.position - 0.5) * element.dimensions[1],
      element.position[2],
    ];

    // Spawn debris
    const debrisCount = this.spawnDebris(element, failurePos, weakPoint.failureMode);

    // Record collapse event
    const event: CollapseEvent = {
      time: this.currentTime,
      elementId: element.id,
      failureMode: weakPoint.failureMode,
      position: failurePos,
      debrisCount,
      cascadeElements: [],
    };

    this.collapseEvents.push(event);
  }

  /**
   * Propagate failures to connected elements (cascade effect)
   */
  private propagateFailures(): void {
    const newFailures: number[] = [];

    for (const failedId of this.failedElements) {
      const failedElement = this.building.elements.find((el) => el.id === failedId);
      if (!failedElement) continue;

      // Check connected elements
      for (const connectedId of failedElement.connections) {
        if (this.failedElements.has(connectedId)) continue;

        const connected = this.building.elements.find((el) => el.id === connectedId);
        if (!connected) continue;

        // If element is above failed element and loses support
        if (connected.floor > failedElement.floor) {
          // Check if element has enough remaining support
          const supportingElements = connected.connections.filter(
            (id) =>
              !this.failedElements.has(id) &&
              this.building.elements.find((el) => el.id === id && el.floor <= connected.floor)
          );

          // If less than 30% of supports remain, cascade failure
          const supportRatio = supportingElements.length / connected.connections.length;
          if (supportRatio < 0.3) {
            newFailures.push(connectedId);
          }
        }

        // If element is below and overloaded
        if (connected.floor <= failedElement.floor && connected.stress > 90) {
          // Highly stressed elements are more likely to fail
          if (Math.random() < 0.3) {
            newFailures.push(connectedId);
          }
        }
      }
    }

    // Apply cascade failures
    for (const elementId of newFailures) {
      const element = this.building.elements.find((el) => el.id === elementId);
      if (!element) continue;

      // Find a weak point for this element
      const weakPoint = this.building.weakPoints.find((wp) => wp.elementId === elementId);
      if (weakPoint) {
        this.failElement(element, weakPoint);

        // Record cascade in most recent event
        if (this.collapseEvents.length > 0) {
          this.collapseEvents[this.collapseEvents.length - 1].cascadeElements.push(elementId);
        }
      }
    }
  }

  /**
   * Spawn debris particles from failed element
   */
  private spawnDebris(
    element: StructuralElement,
    position: [number, number, number],
    failureMode: string
  ): number {
    // Debris count based on element size
    const volume = element.dimensions[0] * element.dimensions[1] * element.dimensions[2];
    const baseCount = Math.floor(volume * 50); // ~50 particles per cubic meter

    // Vary count based on failure mode
    const modeMultiplier = {
      snap: 0.5, // Clean break = fewer, larger pieces
      bend: 0.7, // Bending = moderate fragmentation
      crush: 1.5, // Crushing = many small pieces
      shear: 1.0, // Shear = moderate pieces
    };

    const debrisCount = Math.floor(
      baseCount * (modeMultiplier[failureMode as keyof typeof modeMultiplier] || 1.0)
    );

    // Limit debris count to prevent performance issues
    const maxDebris = 500;
    const actualCount = Math.min(debrisCount, maxDebris);

    // Spawn particles
    for (let i = 0; i < actualCount; i++) {
      // Random position around failure point
      const spread = element.dimensions[0];
      const px = position[0] + (Math.random() - 0.5) * spread;
      const py = position[1] + (Math.random() - 0.5) * spread;
      const pz = position[2] + (Math.random() - 0.5) * spread;

      // Initial velocity (ejection from failure)
      const ejectionSpeed = 2 + Math.random() * 5; // 2-7 m/s
      const vx = (Math.random() - 0.5) * ejectionSpeed;
      const vy = Math.random() * ejectionSpeed; // Upward bias
      const vz = (Math.random() - 0.5) * ejectionSpeed;

      // Angular velocity
      const wx = (Math.random() - 0.5) * 10;
      const wy = (Math.random() - 0.5) * 10;
      const wz = (Math.random() - 0.5) * 10;

      // Particle size (smaller for crush, larger for snap)
      const baseRadius = 0.1;
      const sizeFactor = failureMode === 'crush' ? 0.5 : failureMode === 'snap' ? 2.0 : 1.0;
      const radius = baseRadius * sizeFactor * (0.5 + Math.random());

      // Mass proportional to volume
      const density = element.material === 'concrete' ? 2400 : 7850;
      const particleMass = (4 / 3) * Math.PI * radius ** 3 * density;

      this.debrisParticles.push({
        id: this.debrisIdCounter++,
        sourceElementId: element.id,
        position: [px, py, pz],
        velocity: [vx, vy, vz],
        angularVelocity: [wx, wy, wz],
        radius,
        mass: particleMass,
        material: element.material,
        age: 0,
        active: true,
      });
    }

    return actualCount;
  }

  /**
   * Update debris particle physics (simple Euler integration)
   */
  private updateDebrisParticles(dt: number): void {
    const gravity = -9.8;
    const airDrag = 0.98;
    const groundY = 0;

    for (const particle of this.debrisParticles) {
      if (!particle.active) continue;

      // Update age
      particle.age += dt;

      // Apply gravity
      particle.velocity[1] += gravity * dt;

      // Apply air drag
      particle.velocity[0] *= airDrag;
      particle.velocity[1] *= airDrag;
      particle.velocity[2] *= airDrag;

      // Update position
      particle.position[0] += particle.velocity[0] * dt;
      particle.position[1] += particle.velocity[1] * dt;
      particle.position[2] += particle.velocity[2] * dt;

      // Ground collision
      if (particle.position[1] - particle.radius < groundY) {
        particle.position[1] = groundY + particle.radius;
        particle.velocity[1] = -particle.velocity[1] * 0.3; // Bounce with damping
        particle.velocity[0] *= 0.8; // Friction
        particle.velocity[2] *= 0.8;

        // Stop if moving slowly
        if (Math.abs(particle.velocity[1]) < 0.1) {
          particle.velocity[1] = 0;
          particle.angularVelocity[0] *= 0.5;
          particle.angularVelocity[1] *= 0.5;
          particle.angularVelocity[2] *= 0.5;
        }
      }

      // Deactivate if settled
      const speed = Math.sqrt(
        particle.velocity[0] ** 2 + particle.velocity[1] ** 2 + particle.velocity[2] ** 2
      );

      if (speed < 0.05 && particle.position[1] < 1) {
        particle.active = false;
      }
    }
  }

  /**
   * Get all collapse events
   */
  getCollapseEvents(): CollapseEvent[] {
    return this.collapseEvents;
  }

  /**
   * Get active debris particles
   */
  getActiveDebris(): DebrisParticle[] {
    return this.debrisParticles.filter((p) => p.active);
  }

  /**
   * Get all debris particles (for GPU upload)
   */
  getAllDebris(): DebrisParticle[] {
    return this.debrisParticles;
  }

  /**
   * Get failed elements
   */
  getFailedElements(): number[] {
    return Array.from(this.failedElements);
  }

  /**
   * Get building statistics
   */
  getStatistics(): {
    failedElements: number;
    totalElements: number;
    failureRate: number;
    activeDebris: number;
    totalDebris: number;
    collapseEvents: number;
  } {
    return {
      failedElements: this.failedElements.size,
      totalElements: this.building.elements.length,
      failureRate: this.failedElements.size / this.building.elements.length,
      activeDebris: this.debrisParticles.filter((p) => p.active).length,
      totalDebris: this.debrisParticles.length,
      collapseEvents: this.collapseEvents.length,
    };
  }

  /**
   * Reset simulation
   */
  reset(): void {
    this.earthquakeConfig = null;
    this.earthquakeStartTime = 0;
    this.currentTime = 0;
    this.failedElements.clear();
    this.collapseEvents = [];
    this.debrisParticles = [];
    this.debrisIdCounter = 0;

    // Reset all elements
    for (const element of this.building.elements) {
      element.health = 100;
      element.stress = 0;
    }
  }

  /**
   * Check if earthquake is active
   */
  isEarthquakeActive(): boolean {
    return this.earthquakeConfig !== null;
  }

  /**
   * Check if any failures have occurred
   */
  hasFailures(): boolean {
    return this.failedElements.size > 0;
  }
}
