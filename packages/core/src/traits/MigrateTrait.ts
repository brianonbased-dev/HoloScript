/**
 * MigrateTrait — v5.1
 *
 * Schema/data migration runner with ordered version steps.
 *
 * Events:
 *  migrate:register   { version, description }
 *  migrate:run        { targetVersion }
 *  migrate:step       { version, status }
 *  migrate:complete   { fromVersion, toVersion, stepsRun }
 *  migrate:error      { version, error }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface MigrateConfig {
  current_version: number;
  auto_run: boolean;
}

interface MigrationStep {
  version: number;
  description: string;
  applied: boolean;
}

export const migrateHandler: TraitHandler<MigrateConfig> = {
  name: 'migrate',
  defaultConfig: { current_version: 0, auto_run: false },

  onAttach(node: any): void {
    node.__migrateState = { steps: [] as MigrationStep[], currentVersion: 0 };
  },
  onDetach(node: any): void {
    delete node.__migrateState;
  },
  onUpdate(): void {},

  onEvent(node: any, _config: MigrateConfig, context: any, event: any): void {
    const state = node.__migrateState as
      | { steps: MigrationStep[]; currentVersion: number }
      | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'migrate:register': {
        const version = event.version as number;
        if (typeof version !== 'number') break;
        state.steps.push({
          version,
          description: (event.description as string) ?? '',
          applied: false,
        });
        state.steps.sort((a, b) => a.version - b.version);
        break;
      }
      case 'migrate:run': {
        const target = (event.targetVersion as number) ?? Infinity;
        const from = state.currentVersion;
        let count = 0;
        for (const step of state.steps) {
          if (step.version > state.currentVersion && step.version <= target && !step.applied) {
            step.applied = true;
            state.currentVersion = step.version;
            count++;
            context.emit?.('migrate:step', {
              version: step.version,
              description: step.description,
              status: 'applied',
            });
          }
        }
        context.emit?.('migrate:complete', {
          fromVersion: from,
          toVersion: state.currentVersion,
          stepsRun: count,
        });
        break;
      }
      case 'migrate:status': {
        context.emit?.('migrate:info', {
          currentVersion: state.currentVersion,
          totalSteps: state.steps.length,
          applied: state.steps.filter((s) => s.applied).length,
          pending: state.steps.filter((s) => !s.applied && s.version > state.currentVersion).length,
        });
        break;
      }
    }
  },
};

export default migrateHandler;
