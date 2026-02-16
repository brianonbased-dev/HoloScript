import { InputBindings } from '../input/InputBindings';
import { WebRTCTransport } from '../network/WebRTCTransport';

export class VoiceManager {
    private isPttPressed = false;
    private isMuted = false;
    private mutedPeers: Set<string> = new Set();
    
    constructor(
        private input: InputBindings,
        private transport: WebRTCTransport
    ) {}

    update(): void {
        // Check PTT input (assuming input system updates key states elsewhere and we query bindings)
        // Since InputBindings is event or state based, we'll assume a polling approach for now 
        // or that we receive input events. 
        // For this cycle, I'll simulate polling checking the binding action.
        
        // Note: In a real implementation, InputManager would drive this.
        // Here we'll expose a method to be called by the game loop.
    }

    /**
     * Call this when input state changes
     */
    setPushToTalkState(pressed: boolean): void {
        this.isPttPressed = pressed;
        this.updateMicState();
    }

    toggleMute(): void {
        this.isMuted = !this.isMuted;
        this.updateMicState();
    }

    mutePeer(peerId: string, muted: boolean): void {
        if (muted) {
            this.mutedPeers.add(peerId);
        } else {
            this.mutedPeers.delete(peerId);
        }
        // In a real implementation, we would set GainNode to 0 for this peer's stream
        // transport.setPeerVolume(peerId, muted ? 0 : 1);
    }

    private updateMicState(): void {
        // Mic is active if:
        // 1. Not globally muted AND
        // 2. PTT is pressed
        const isActive = !this.isMuted && this.isPttPressed;
        this.transport.setMicrophoneEnabled(isActive);
    }

    isPeerMuted(peerId: string): boolean {
        return this.mutedPeers.has(peerId);
    }
}
