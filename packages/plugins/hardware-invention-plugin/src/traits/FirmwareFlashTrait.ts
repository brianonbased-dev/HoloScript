/** @firmware_flash Trait — Firmware programming and OTA updates. @trait firmware_flash */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type FlashProtocol = 'uart' | 'swd' | 'jtag' | 'spi' | 'usb_dfu' | 'ota_wifi' | 'ota_ble';
export interface FirmwareFlashConfig { targetMCU: string; protocol: FlashProtocol; baudRate: number; firmwarePath: string; firmwareVersion: string; verifyAfterFlash: boolean; backupFirst: boolean; }
export interface FirmwareFlashState { isFlashing: boolean; progressPercent: number; lastFlashResult: 'success' | 'failed' | 'none'; flashCount: number; }

const defaultConfig: FirmwareFlashConfig = { targetMCU: '', protocol: 'uart', baudRate: 115200, firmwarePath: '', firmwareVersion: '0.0.0', verifyAfterFlash: true, backupFirst: true };

export function createFirmwareFlashHandler(): TraitHandler<FirmwareFlashConfig> {
  return { name: 'firmware_flash', defaultConfig,
    onAttach(n: HSPlusNode, _c: FirmwareFlashConfig, ctx: TraitContext) { n.__fwState = { isFlashing: false, progressPercent: 0, lastFlashResult: 'none', flashCount: 0 }; ctx.emit?.('firmware:ready'); },
    onDetach(n: HSPlusNode, _c: FirmwareFlashConfig, ctx: TraitContext) { delete n.__fwState; ctx.emit?.('firmware:disconnected'); },
    onUpdate(n: HSPlusNode, _c: FirmwareFlashConfig, ctx: TraitContext, _d: number) {
      const s = n.__fwState as FirmwareFlashState | undefined;
      if (s?.isFlashing && s.progressPercent < 100) { s.progressPercent = Math.min(100, s.progressPercent + 2); if (s.progressPercent >= 100) { s.isFlashing = false; s.lastFlashResult = 'success'; s.flashCount++; ctx.emit?.('firmware:complete', { version: _c.firmwareVersion }); } }
    },
    onEvent(n: HSPlusNode, c: FirmwareFlashConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__fwState as FirmwareFlashState | undefined; if (!s) return;
      if (e.type === 'firmware:flash') { s.isFlashing = true; s.progressPercent = 0; ctx.emit?.('firmware:flashing', { target: c.targetMCU, protocol: c.protocol }); }
      if (e.type === 'firmware:abort') { s.isFlashing = false; s.lastFlashResult = 'failed'; ctx.emit?.('firmware:aborted'); }
    },
  };
}
