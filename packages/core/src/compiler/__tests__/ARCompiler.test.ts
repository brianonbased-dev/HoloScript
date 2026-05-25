import { describe, expect, test, vi } from 'vitest';
import { ARCompiler } from '../ARCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

describe('ARCompiler', () => {
  const parser = new HoloCompositionParser();

  test('should generate WebXR AR setup for a basic AR composition', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: {
        hit_test: true,
        image_tracking: false,
      },
    });

    const input = `
      composition "ARMenu" {
        spatial_group "cafe_table" {
          object "menu_panel" @overlay {
            layout: "vertical"
            text: "Today's Specials"
          }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.success).toBe(true);
    expect(result.target).toBe('webxr');
    expect(result.code).toContain('const arRuntime = new ARRuntime({');
    expect(result.code).toContain('hit_test: true');
  });

  test('should include beacon tracking for @ar_beacon traits', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: {
        hit_test: false,
        image_tracking: true,
      },
    });

    const input = `
      composition "QuestHub" {
        spatial_group "store_front" {
          object "scan_target" @ar_beacon(type: "qr", id: "quest_123") {
            mesh: "cube"
            position: [1, 0.5, -0.25]
          }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');
    expect(result.success).toBe(true);
    expect(result.code).toContain("arRuntime.onBeaconDetected('quest_123', (pose) => {");
    expect(result.code).toContain("type: 'qr'");
    expect(result.code).toContain("objectName: 'scan_target'");
    expect(result.code).toContain('position: { x: 1, y: 0.5, z: -0.25 }');
    expect(result.code).not.toContain("arRuntime.onBeaconDetected('global'");
  });

  test('should preserve claimed AR trait ids and coordinates in generated code', () => {
    const compiler = new ARCompiler({
      target: 'webxr',
      minify: false,
      source_maps: false,
      features: {
        hit_test: true,
        image_tracking: true,
      },
    });

    const input = `
      composition "ARDeepRatchet" {
        spatial_group "city" {
          object "cafe_anchor" @geo_anchor(id: "cafe_geo", latitude: 33.4484, longitude: -112.074, altitude: 10) {
            position: [1, 2, 3]
          }

          object "ticket_marker" @qr_scan(id: "vip_qr", payload: "VIP42") {
            position: [0, 1, 0]
          }

          object "portal_door" @ar_portal(id: "lobby_portal", destination: "lobby") {
            position: [2, 0, -1]
          }

          object "camera_hud" @camera_overlay(id: "receipt_hud", text: "Align receipt") {
            position: [0, 1.4, -0.5]
          }

          object "pay_gate" @x402_paywall(id: "vip_gate", price: 5, asset: "USDC", network: "base") {
            position: [0, 0, -2]
          }

          object "menu_panel" @overlay(id: "menu_overlay") {
            text: "Today's Specials"
          }

          object "scan_target" @ar_beacon(type: "qr", id: "quest_123") {
            mesh: "cube"
            position: [1, 0.5, -0.25]
          }
        }
      }
    `;

    const parseResult = parser.parse(input);
    const result = compiler.compile(parseResult.ast!, 'test-token');

    expect(result.success).toBe(true);
    expect(result.code).toContain('registerGeoAnchor?.(geoAnchor_cafe_anchor)');
    expect(result.code).toContain('latitude: 33.4484');
    expect(result.code).toContain('longitude: -112.074');
    expect(result.code).toContain("onQRCodeDetected?.('vip_qr'");
    expect(result.code).toContain("payload: 'VIP42'");
    expect(result.code).toContain('registerPortal?.(arPortal_portal_door)');
    expect(result.code).toContain("destination: 'lobby'");
    expect(result.code).toContain('registerCameraOverlay?.(cameraOverlay_camera_hud)');
    expect(result.code).toContain("text: 'Align receipt'");
    expect(result.code).toContain('requirePayment?.(x402Paywall_pay_gate)');
    expect(result.code).toContain("protocol: 'x402'");
    expect(result.code).toContain("asset: 'USDC'");
    expect(result.code).toContain("registerOverlay?.({ id: 'menu_overlay'");
    expect(result.code).toContain("arRuntime.onBeaconDetected('quest_123'");
    expect(result.code).toContain('position: { x: 1, y: 0.5, z: -0.25 }');
    expect(result.code).not.toContain("onBeaconDetected('global'");
  });
});
