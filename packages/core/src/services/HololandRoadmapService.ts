/**
 * Hololand Roadmap Service
 *
 * Manages spatialized project milestones and governance state.
 * Implements Phase 5 'Spatial Governance'.
 *
 * Pattern: P.GOVERNANCE.01
 */

import { logger } from '../logger';

export interface Sprint {
  id: string;
  title: string;
  description: string;
  status: 'planned' | 'in-progress' | 'completed' | 'blocked';
  progress: number; // 0-100
  dueDate?: string;
  tags?: string[];
  dependencies?: string[];
}

export class HololandRoadmapService {
  private milestones: Map<string, Sprint> = new Map();
  private static instance: HololandRoadmapService;

  private constructor() {
    // Initial bootstrap milestones (Phase 1-5 example)
    this.addMilestone({
      id: 'phase1',
      title: 'Infrastructure Readiness',
      description: 'HoloScript core messaging and UAA2 bridge foundation',
      status: 'completed',
      progress: 100,
    });
    this.addMilestone({
      id: 'phase4',
      title: 'Sovereign IP Isolation',
      description: 'Decoupling proprietary logic into private bridge',
      status: 'completed',
      progress: 100,
    });
    this.addMilestone({
      id: 'phase5',
      title: 'Industrial Mastery',
      description: 'Digital Twin Gateway and Spatial Governance',
      status: 'in-progress',
      progress: 40,
    });
  }

  public static getInstance(): HololandRoadmapService {
    if (!HololandRoadmapService.instance) {
      HololandRoadmapService.instance = new HololandRoadmapService();
    }
    return HololandRoadmapService.instance;
  }

  public addMilestone(Sprint: Sprint): void {
    this.milestones.set(Sprint.id, Sprint);
    logger.info(`[Roadmap] Sprint added: ${Sprint.title}`);
  }

  public updateMilestone(id: string, updates: Partial<Sprint>): boolean {
    const existing = this.milestones.get(id);
    if (!existing) return false;

    this.milestones.set(id, { ...existing, ...updates });
    logger.info(`[Roadmap] Sprint updated: ${id}`, updates);
    return true;
  }

  public getMilestone(id: string): Sprint | undefined {
    return this.milestones.get(id);
  }

  public getAllMilestones(): Sprint[] {
    return Array.from(this.milestones.values());
  }

  public getProgress(): number {
    const all = this.getAllMilestones();
    if (all.length === 0) return 0;
    const totalProgress = all.reduce((sum, m) => sum + m.progress, 0);
    return totalProgress / all.length;
  }
}

export const roadmapService = HololandRoadmapService.getInstance();
