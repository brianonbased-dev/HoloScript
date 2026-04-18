// Test-only compatibility bridge for mesh package tests that historically
// imported runtime symbols from @holoscript/core.
//
// Keep this shim lightweight (do NOT re-export full core source), then layer
// mesh runtime exports on top so legacy mesh tests can instantiate mesh classes
// through the old core import path.

export * from '../index';

// Minimal runtime symbols mesh source imports from @holoscript/core.
export const logger = {
	info: (..._args: unknown[]) => {},
	warn: (..._args: unknown[]) => {},
	error: (..._args: unknown[]) => {},
	debug: (..._args: unknown[]) => {},
};

export interface TraitBehavior {
	traitId?: string;
	name?: string;
	enabled?: boolean;
}

export class ProceduralSkill {
	id?: string;
	name?: string;
	constructor(init: Partial<ProceduralSkill> = {}) {
		Object.assign(this, init);
	}
}

// Transport tests expect the concrete standalone transport implementations,
// not similarly named protocol-level classes exported by network/index.
export {
	WebSocketTransport,
	createWebSocketTransport,
	type WebSocketTransportConfig,
	type NetworkMessage,
} from '../network/WebSocketTransport';

export {
	WebRTCTransport,
	createWebRTCTransport,
	type WebRTCTransportConfig,
	type SocialPacket,
	type SocialPacketType,
} from '../network/WebRTCTransport';
