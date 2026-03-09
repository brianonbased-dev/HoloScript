export function createEarthquakeComposition(): any {
  return {
    name: 'AdvancedEarthquakeDemo',
    description: 'High-fidelity earthquake simulation with advanced rendering',
    version: '1.0.0',
    traits: {
      simulation: {
        buildingCount: 8,
        magnitude: 7.5,
        epicenterPosition: [0, 0, 0],
        duration: 60,
      },
      particles: {
        seismicWaves: {
          count: 50000,
          color: '#ff6600',
          size: 1.5,
        },
        debris: {
          count: 30000,
          color: '#8b7355',
          size: 0.8,
        },
      },
      camera: {
        position: [50, 30, 80],
        target: [0, 0, 0],
        fov: 75,
      },
      physics: {
        gravity: [0, -9.8, 0],
        timeScale: 1.0,
      },
    },
  };
}
