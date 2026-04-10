/**
 * @holoscript/mvc-schema - JSON schemas
 *
 * JSON Schema definitions for all 5 MVC objects with validation rules.
 *
 * @packageDocumentation
 */

import decisionHistorySchema from './decision-history.schema.json';
import taskStateSchema from './task-state.schema.json';
import preferencesSchema from './preferences.schema.json';
import spatialContextSchema from './spatial-context.schema.json';
import evidenceTrailSchema from './evidence-trail.schema.json';

export {
  decisionHistorySchema,
  taskStateSchema,
  preferencesSchema,
  spatialContextSchema,
  evidenceTrailSchema,
};

/**
 * All MVC schemas as a map
 */
export const mvcSchemas = {
  'decision-history': decisionHistorySchema,
  'task-state': taskStateSchema,
  preferences: preferencesSchema,
  'spatial-context': spatialContextSchema,
  'evidence-trail': evidenceTrailSchema,
} as const;

/**
 * Schema type mapping
 */
export type MVCSchemaType = keyof typeof mvcSchemas;
