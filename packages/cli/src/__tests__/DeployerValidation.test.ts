/**
 * BaseDeployer Validation + Utilities Production Tests
 *
 * Tests config validation logic and deployment ID generation.
 */

import { describe, it, expect } from 'vitest';
import { BaseDeployer } from '../deployers/BaseDeployer';
import type {
  DeployConfig,
  DeployResult,
  DeploymentInfo,
  BuildOutput,
} from '../deployers/BaseDeployer';

// Concrete subclass for testing abstract methods
class TestDeployer extends BaseDeployer {
  constructor() {
    super('test');
  }
  async deploy(_c: DeployConfig, _b: BuildOutput): Promise<DeployResult> {
    return {
      success: true,
      url: '',
      deploymentId: '',
      duration: 0,
      regions: [],
      timestamp: new Date(),
    };
  }
  async rollback(_id: string): Promise<DeployResult> {
    return {
      success: true,
      url: '',
      deploymentId: '',
      duration: 0,
      regions: [],
      timestamp: new Date(),
    };
  }
  async getDeployments(): Promise<DeploymentInfo[]> {
    return [];
  }
  async getPreviewUrl(_branch: string): Promise<string> {
    return '';
  }

  // Expose protected method for testing
  public testGenerateDeploymentId() {
    return this.generateDeploymentId();
  }
}

const validConfig: DeployConfig = {
  target: 'vercel',
  projectName: 'my-project',
  environment: 'production',
  regions: ['us-east-1'],
  buildSettings: { minify: true, splitChunks: true, prerender: false },
};

describe('BaseDeployer.validateConfig — Production', () => {
  const deployer = new TestDeployer();

  it('accepts valid config', () => {
    expect(() => deployer.validateConfig(validConfig)).not.toThrow();
  });

  it('rejects empty project name', () => {
    expect(() => deployer.validateConfig({ ...validConfig, projectName: '' })).toThrow(
      'Project name is required'
    );
  });

  it('rejects invalid project name characters', () => {
    expect(() => deployer.validateConfig({ ...validConfig, projectName: 'bad name!' })).toThrow(
      'alphanumeric'
    );
  });

  it('rejects invalid target', () => {
    expect(() => deployer.validateConfig({ ...validConfig, target: 'aws' as any })).toThrow(
      'Invalid target'
    );
  });

  it('rejects invalid environment', () => {
    expect(() => deployer.validateConfig({ ...validConfig, environment: 'dev' as any })).toThrow(
      'Invalid environment'
    );
  });

  it('rejects empty regions', () => {
    expect(() => deployer.validateConfig({ ...validConfig, regions: [] })).toThrow(
      'At least one region'
    );
  });

  it('rejects missing buildSettings', () => {
    const bad = { ...validConfig, buildSettings: undefined } as any;
    expect(() => deployer.validateConfig(bad)).toThrow('Build settings are required');
  });

  it('rejects non-boolean minify', () => {
    const bad = {
      ...validConfig,
      buildSettings: { ...validConfig.buildSettings, minify: 'yes' },
    } as any;
    expect(() => deployer.validateConfig(bad)).toThrow('minify must be a boolean');
  });
});

describe('BaseDeployer.generateDeploymentId — Production', () => {
  const deployer = new TestDeployer();

  it('includes deployer name', () => {
    const id = deployer.testGenerateDeploymentId();
    expect(id).toContain('test-');
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => deployer.testGenerateDeploymentId()));
    expect(ids.size).toBe(10);
  });
});
