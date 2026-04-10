/**
 * RoomPlan Spatial Scanning Traits
 *
 * Traits for Apple's RoomPlan framework (iOS 16+): automatic room mapping
 * with furniture and fixture detection, producing structured .holo scenes
 * with semantic labels on every entity.
 *
 * Categories:
 *   - Scanning (session control, quality, real-time feedback)
 *   - Structural surfaces (walls, floors, ceilings)
 *   - Openings (doors, windows, generic openings)
 *   - Furniture & fixtures (tables, chairs, appliances, etc.)
 *   - Output (scene graph export, coordinate mapping)
 */
export const ROOMPLAN_TRAITS = [
  // --- Scanning ---
  'roomplan_scan',              // marks scene as a RoomPlan capture target (iOS 16+)
  'roomplan_realtime_preview',  // show live mesh preview during scan
  'roomplan_scan_quality',      // scan quality level: quick | standard | detailed

  // --- Structural Surfaces ---
  'roomplan_wall',              // detected wall surface
  'roomplan_floor',             // detected floor surface
  'roomplan_ceiling',           // detected ceiling surface

  // --- Openings ---
  'roomplan_door',              // detected door opening
  'roomplan_window',            // detected window opening
  'roomplan_opening',           // generic opening (archway, pass-through)

  // --- Furniture & Fixtures ---
  'roomplan_furniture',         // generic detected furniture item
  'roomplan_table',             // classified table
  'roomplan_chair',             // classified chair / seating
  'roomplan_sofa',              // classified sofa / couch
  'roomplan_bed',               // classified bed
  'roomplan_storage',           // classified storage (cabinet, shelf, dresser)
  'roomplan_appliance',         // classified appliance (oven, fridge, washer)
  'roomplan_fixture',           // classified fixture (sink, toilet, bathtub)
  'roomplan_screen',            // classified screen (TV, monitor)
  'roomplan_fireplace',         // classified fireplace

  // --- Output ---
  'roomplan_scene_export',      // export captured room as .holo scene graph
  'roomplan_coordinate_map',    // map RoomPlan world coordinates to HoloScript space
] as const;

export type RoomPlanTraitName = (typeof ROOMPLAN_TRAITS)[number];
