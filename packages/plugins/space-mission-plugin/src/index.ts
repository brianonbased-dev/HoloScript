export { createTrajectoryPlanHandler, type TrajectoryPlanConfig, type OrbitalElements, type ManeuverNode } from './traits/TrajectoryPlanTrait';
export { createMissionTimelineHandler, type MissionTimelineConfig, type Milestone, type MissionPhase } from './traits/MissionTimelineTrait';
export { createTelemetryDashboardHandler, type TelemetryDashboardConfig, type TelemetryChannel } from './traits/TelemetryDashboardTrait';
export * from './traits/types';

import { createTrajectoryPlanHandler } from './traits/TrajectoryPlanTrait';
import { createMissionTimelineHandler } from './traits/MissionTimelineTrait';
import { createTelemetryDashboardHandler } from './traits/TelemetryDashboardTrait';

export const pluginMeta = { name: '@holoscript/plugin-space-mission', version: '1.0.0', traits: ['trajectory_plan', 'mission_timeline', 'telemetry_dashboard'] };
export const traitHandlers = [createTrajectoryPlanHandler(), createMissionTimelineHandler(), createTelemetryDashboardHandler()];
