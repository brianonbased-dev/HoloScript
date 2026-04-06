/**
 * Ultra Wideband (UWB) Positioning Traits (M.010.13)
 *
 * Centimeter-precise device-to-device positioning via U1/U2 chip.
 * Apple Nearby Interaction framework. iPhone 11+.
 *
 * Categories:
 *   - Discovery (find nearby UWB devices)
 *   - Ranging (distance, direction)
 *   - Interaction (point-to-share, device-as-controller)
 */
export const UWB_POSITIONING_TRAITS = [
  'uwb_discover',              // discover nearby UWB-capable devices
  'uwb_range',                 // measure distance to peer device (cm precision)
  'uwb_direction',             // determine direction to peer device (azimuth + elevation)
  'uwb_handoff',               // hand off .holo entity to nearby device by pointing
  'uwb_anchor_peer',           // use peer device position as spatial anchor
  'uwb_controller',            // use second device as spatial controller/wand
] as const;

export type UWBPositioningTraitName = (typeof UWB_POSITIONING_TRAITS)[number];
