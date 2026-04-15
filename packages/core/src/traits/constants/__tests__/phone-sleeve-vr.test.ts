import { describe, it, expect } from 'vitest';
import { PHONE_SLEEVE_VR_TRAITS } from '../mobile/phone-sleeve-vr';
import { VR_TRAITS } from '../index';

describe('Phone Sleeve VR Traits', () => {
  it('exports 25 traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toHaveLength(25);
  });

  it('contains hardware form factor traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('phone_sleeve');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('sleeve_nfc_trigger');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('sleeve_lens_profile');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('phone_detection');
  });

  it('contains display traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('stereo_split');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('barrel_distortion');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('chromatic_aberration_fix');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('ipd_adjust');
  });

  it('contains sensor/tracking traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('gyro_head_tracking');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('accel_sensor_fusion');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('mag_drift_correction');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('positional_estimation');
  });

  it('contains interaction traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('gaze_cursor');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('gaze_dwell_select');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('bt_controller');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('tap_select');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('voice_command');
  });

  it('contains performance traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('thermal_throttle');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('battery_aware_lod');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('sleeve_foveated');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('low_persistence');
  });

  it('contains comfort traits', () => {
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('vr_comfort_vignette');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('reorient_snap');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('static_horizon');
    expect(PHONE_SLEEVE_VR_TRAITS).toContain('session_timer');
  });

  it('all traits are included in VR_TRAITS', () => {
    for (const trait of PHONE_SLEEVE_VR_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });

  it('has no duplicate traits', () => {
    const unique = new Set(PHONE_SLEEVE_VR_TRAITS);
    expect(unique.size).toBe(PHONE_SLEEVE_VR_TRAITS.length);
  });

  it('all trait names follow snake_case convention', () => {
    for (const trait of PHONE_SLEEVE_VR_TRAITS) {
      expect(trait).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
