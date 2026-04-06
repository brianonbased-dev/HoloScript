/**
 * Phone Sleeve VR Traits
 *
 * Traits for phone-as-headset VR: sliding a smartphone into a sleeve/holder
 * that turns it into a stereoscopic VR display. Modernizes the Google Cardboard /
 * Samsung Gear VR concept with contemporary WebXR, sensor fusion, and lens
 * correction capabilities.
 *
 * Categories:
 *   - Hardware form factor (sleeve, lenses, NFC trigger)
 *   - Display mode (stereoscopic split, barrel distortion, chromatic correction)
 *   - Sensor fusion (gyroscope, accelerometer, magnetometer head tracking)
 *   - Interaction (gaze cursor, Bluetooth controller, tap-to-select, voice)
 *   - Performance (thermal throttle, battery-aware LOD, foveated)
 *   - Comfort (IPD adjustment, drift correction, motion sickness reduction)
 */
export const PHONE_SLEEVE_VR_TRAITS = [
  // --- Hardware Form Factor ---
  'phone_sleeve',              // marks object/scene as phone-sleeve VR target
  'sleeve_nfc_trigger',        // NFC tag in sleeve auto-launches VR app on insert
  'sleeve_lens_profile',       // describes the lens geometry (focal length, distortion coefficients)
  'phone_detection',           // auto-detect phone model for screen size / PPI calibration

  // --- Display ---
  'stereo_split',              // side-by-side stereoscopic rendering
  'barrel_distortion',         // barrel distortion shader to pre-correct for lens warp
  'chromatic_aberration_fix',  // per-channel color correction for cheap lenses
  'ipd_adjust',                // inter-pupillary distance calibration UI

  // --- Sensor / Tracking ---
  'gyro_head_tracking',        // 3-DOF orientation from phone gyroscope
  'accel_sensor_fusion',       // accelerometer + gyro complementary filter
  'mag_drift_correction',      // magnetometer-based yaw drift correction
  'positional_estimation',     // limited 6-DOF via visual-inertial odometry (ARCore/ARKit)

  // --- Interaction ---
  'gaze_cursor',               // center-of-view reticle for gaze-based selection
  'gaze_dwell_select',         // dwell timer triggers selection on gaze target
  'bt_controller',             // Bluetooth gamepad / clicker input binding
  'tap_select',                // capacitive tap on headset triggers select
  'voice_command',             // speech-to-intent for hands-free interaction

  // --- Performance ---
  'thermal_throttle',          // monitor phone temperature, reduce quality before overheat
  'battery_aware_lod',         // lower LOD / framerate when battery is low
  'sleeve_foveated',           // fixed foveated rendering (center sharp, edges lower res)
  'low_persistence',           // request low-persistence display mode to reduce blur

  // --- Comfort ---
  'vr_comfort_vignette',       // darken peripheral vision during fast movement
  'reorient_snap',             // snap-turn / recenter with single tap
  'static_horizon',            // keep horizon line stable to reduce nausea
  'session_timer',             // remind user to take breaks (phone heat + eye strain)
] as const;

export type PhoneSleeveVRTraitName = (typeof PHONE_SLEEVE_VR_TRAITS)[number];
