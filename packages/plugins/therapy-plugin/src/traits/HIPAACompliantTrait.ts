import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './types';

export interface HIPAACompliantConfig {
  encryption: 'aes256' | 'none';
  accessRole: 'therapist' | 'patient' | 'admin';
  auditEnabled: boolean;
  auditLog: Array<{ timestamp: number; action: string; role: string }>;
}

const handler: TraitHandler<HIPAACompliantConfig> = {
  name: 'hipaa_compliant',
  defaultConfig: {
    encryption: 'aes256',
    accessRole: 'therapist',
    auditEnabled: true,
    auditLog: [],
  },
  onEvent(_node: HSPlusNode, config: HIPAACompliantConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'hipaa_compliant:audit_access') {
      const payload = event.payload as { action: string; role: string };
      if (config.auditEnabled) {
        const entry = { timestamp: Date.now(), action: payload.action, role: payload.role };
        config.auditLog.push(entry);
        ctx.emit?.('audit_entry', entry);
      }
    } else if (event.type === 'hipaa_compliant:set_encryption') {
      config.encryption = (event.payload as { encryption: HIPAACompliantConfig['encryption'] }).encryption;
    } else if (event.type === 'hipaa_compliant:set_role') {
      config.accessRole = (event.payload as { role: HIPAACompliantConfig['accessRole'] }).role;
    }
  },
};

export const HIPAACompliantTrait = handler;
