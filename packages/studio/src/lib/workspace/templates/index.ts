/**
 * Template barrel — re-exports all template generators.
 */

export { generateClaudeMd } from './claude-md';
export { generateNorthStarMd } from './north-star-md';
export { generateMemoryMd } from './memory-md';
export { generateSkills } from './skills';
export type { SkillDefinition } from './skills';
export { generateHooks } from './hooks';
export type { HookDefinition } from './hooks';
export { generateDaemonConfig } from './daemon-config';
export type { DaemonConfig } from './daemon-config';
export { generateTeamRoomConfig } from './team-room-config';
export type { TeamRoomConfig } from './team-room-config';
