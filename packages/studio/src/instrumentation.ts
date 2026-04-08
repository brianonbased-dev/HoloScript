import { requireConfig, REQUIRED_VARS } from '@holoscript/config';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    requireConfig(REQUIRED_VARS.STUDIO as unknown as string[], 'studio');
  }
}
