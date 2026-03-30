/**
 * WorkspaceManager tests — v5.9 "Developer Portal"
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceManager } from '../WorkspaceManager';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('WorkspaceManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'holoscript-ws-'));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures on Windows
    }
  });

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  describe('init', () => {
    it('creates holoscript.workspace.json', () => {
      const manager = new WorkspaceManager(tempDir);
      const config = manager.init('test-workspace');

      expect(config.name).toBe('test-workspace');
      expect(config.version).toBe('1.0.0');
      expect(config.members).toEqual(['packages/*']);
      expect(existsSync(join(tempDir, 'holoscript.workspace.json'))).toBe(true);
    });

    it('uses custom members', () => {
      const manager = new WorkspaceManager(tempDir);
      const config = manager.init('custom', ['apps/*', 'libs/*']);

      expect(config.members).toEqual(['apps/*', 'libs/*']);
    });
  });

  // ===========================================================================
  // LOADING
  // ===========================================================================

  describe('load', () => {
    it('loads existing workspace config', () => {
      const manager = new WorkspaceManager(tempDir);
      manager.init('loaded-ws');

      const manager2 = new WorkspaceManager(tempDir);
      const config = manager2.load();

      expect(config).not.toBeNull();
      expect(config!.name).toBe('loaded-ws');
    });

    it('returns null when no config exists', () => {
      const manager = new WorkspaceManager(tempDir);
      expect(manager.load()).toBeNull();
    });
  });

  // ===========================================================================
  // MEMBER RESOLUTION
  // ===========================================================================

  describe('member resolution', () => {
    it('resolves members from glob pattern', () => {
      // Create packages directory with members
      mkdirSync(join(tempDir, 'packages', 'core'), { recursive: true });
      mkdirSync(join(tempDir, 'packages', 'cli'), { recursive: true });
      writeFileSync(
        join(tempDir, 'packages', 'core', 'package.json'),
        JSON.stringify({ name: '@holoscript/core' })
      );

      const manager = new WorkspaceManager(tempDir);
      manager.init('ws');

      const members = manager.getMembers();
      expect(members.length).toBe(2);
      expect(members.some((m) => m.name === '@holoscript/core')).toBe(true);
    });

    it('finds composition files in members', () => {
      mkdirSync(join(tempDir, 'packages', 'scenes'), { recursive: true });
      writeFileSync(join(tempDir, 'packages', 'scenes', 'main.holo'), '@world {}');
      writeFileSync(join(tempDir, 'packages', 'scenes', 'test.hs'), 'object Box {}');

      const manager = new WorkspaceManager(tempDir);
      manager.init('ws');

      const member = manager.getMember('scenes');
      expect(member).toBeDefined();
      expect(member!.compositions).toHaveLength(2);
    });
  });

  // ===========================================================================
  // BUILD ORDER
  // ===========================================================================

  describe('build order', () => {
    it('returns topological build order', () => {
      // Create members with dependencies
      mkdirSync(join(tempDir, 'packages', 'core'), { recursive: true });
      mkdirSync(join(tempDir, 'packages', 'app'), { recursive: true });
      writeFileSync(
        join(tempDir, 'packages', 'app', 'main.holo'),
        'import "core/types"\nobject App {}'
      );

      const manager = new WorkspaceManager(tempDir);
      manager.init('ws');

      const order = manager.getBuildOrder();
      expect(order.hasCycles).toBe(false);
      expect(order.groups.length).toBeGreaterThan(0);
      expect(order.total).toBe(2);
    });

    it('detects no members gracefully', () => {
      const manager = new WorkspaceManager(tempDir);
      manager.init('empty', ['nonexistent/*']);

      const order = manager.getBuildOrder();
      expect(order.total).toBe(0);
      expect(order.groups).toHaveLength(0);
    });
  });

  // ===========================================================================
  // IMPORT RESOLUTION
  // ===========================================================================

  describe('import resolution', () => {
    it('resolves relative imports', () => {
      mkdirSync(join(tempDir, 'packages', 'scenes'), { recursive: true });
      writeFileSync(join(tempDir, 'packages', 'scenes', 'a.holo'), 'object A {}');
      writeFileSync(join(tempDir, 'packages', 'scenes', 'b.holo'), 'import "./a"');

      const manager = new WorkspaceManager(tempDir);
      manager.init('ws');

      const resolution = manager.resolveImport(
        './a.holo',
        join(tempDir, 'packages', 'scenes', 'b.holo')
      );
      expect(resolution.found).toBe(true);
    });

    it('returns not found for missing imports', () => {
      const manager = new WorkspaceManager(tempDir);
      manager.init('ws');

      const resolution = manager.resolveImport('nonexistent/file', join(tempDir, 'test.holo'));
      expect(resolution.found).toBe(false);
    });
  });

  // ===========================================================================
  // WORKSPACE INFO
  // ===========================================================================

  describe('workspace info', () => {
    it('returns comprehensive workspace info', () => {
      mkdirSync(join(tempDir, 'packages', 'core'), { recursive: true });
      writeFileSync(join(tempDir, 'packages', 'core', 'scene.holo'), '@world {}');

      const manager = new WorkspaceManager(tempDir);
      manager.init('info-test');

      const info = manager.getInfo();
      expect(info.name).toBe('info-test');
      expect(info.version).toBe('1.0.0');
      expect(info.memberCount).toBe(1);
      expect(info.totalCompositions).toBe(1);
    });
  });
});
