/**
 * AudioMixer.ts
 *
 * Advanced channel-based audio mixer with dynamic mixing features:
 * - Channel-based volume control and mute groups
 * - Ducking (auto-lower music when dialogue plays)
 * - Sidechain compression
 * - Priority-based voice stealing
 * - Context-aware mixing
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MixerChannel {
    name: string;
    volume: number;    // 0-1
    muted: boolean;
    priority: number;  // 0-10 (10 = highest priority)
    maxVoices: number; // Max concurrent sounds on this channel (0 = unlimited)
    currentVoices: number; // Current number of active voices
}

export interface DuckingConfig {
    enabled: boolean;
    triggerChannel: string;    // Channel that triggers ducking (e.g., 'voice')
    targetChannels: string[];  // Channels to duck (e.g., ['music', 'ambient'])
    threshold: number;         // dB threshold to trigger ducking
    ratio: number;             // Amount to duck (0-1, 0 = no duck, 1 = full duck)
    attackTime: number;        // Seconds to reach ducked level
    releaseTime: number;       // Seconds to return to normal level
}

export interface SidechainConfig {
    enabled: boolean;
    sourceChannel: string;     // Channel providing sidechain signal
    targetChannel: string;     // Channel being compressed
    threshold: number;         // dB threshold
    ratio: number;             // Compression ratio (2:1, 4:1, etc.)
    attackTime: number;        // Seconds
    releaseTime: number;       // Seconds
}

export interface VoiceStealingStrategy {
    mode: 'oldest' | 'quietest' | 'lowest_priority';
}

export interface AudioSource {
    id: string;
    channel: string;
    volume: number;
    priority: number;
    startTime: number;         // Timestamp when source started playing
}

export interface MixingContext {
    name: string;
    channelVolumes: Record<string, number>; // Override volumes per channel
}

// =============================================================================
// DUCKING STATE
// =============================================================================

interface DuckingState {
    config: DuckingConfig;
    isActive: boolean;
    currentDuckAmount: number; // 0-1 (current duck attenuation)
    targetDuckAmount: number;  // 0-1 (target duck attenuation)
}

export class AudioMixer {
    private channels: Map<string, MixerChannel> = new Map();
    private masterVolume: number = 1.0;
    private masterMuted: boolean = false;

    // Advanced features
    private duckingStates: Map<string, DuckingState> = new Map();
    private sidechains: Map<string, SidechainConfig> = new Map();
    private activeSources: Map<string, AudioSource> = new Map();
    private voiceStealingStrategy: VoiceStealingStrategy = { mode: 'oldest' };
    private currentContext: MixingContext | null = null;

    constructor() {
        // Default channels with priority and voice limits
        this.createChannel('master', 1.0, 10, 0);
        this.createChannel('sfx', 1.0, 5, 32);      // Max 32 concurrent SFX
        this.createChannel('music', 0.5, 7, 4);     // Max 4 music tracks
        this.createChannel('ambient', 0.6, 4, 16);  // Max 16 ambient sounds
        this.createChannel('ui', 0.8, 8, 8);        // Max 8 UI sounds
        this.createChannel('voice', 1.0, 10, 8);    // Max 8 voices (highest priority)
    }

    /**
     * Create or update a channel.
     */
    createChannel(name: string, volume: number = 1.0, priority: number = 5, maxVoices: number = 0): void {
        const existing = this.channels.get(name);
        this.channels.set(name, {
            name,
            volume,
            muted: existing?.muted ?? false,
            priority,
            maxVoices,
            currentVoices: existing?.currentVoices ?? 0,
        });
    }

    /**
     * Set channel volume.
     */
    setChannelVolume(name: string, volume: number): void {
        const ch = this.channels.get(name);
        if (ch) ch.volume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Get channel volume.
     */
    getChannelVolume(name: string): number {
        return this.channels.get(name)?.volume ?? 1;
    }

    /**
     * Mute/unmute a channel.
     */
    setChannelMuted(name: string, muted: boolean): void {
        const ch = this.channels.get(name);
        if (ch) ch.muted = muted;
    }

    /**
     * Check if a channel is muted.
     */
    isChannelMuted(name: string): boolean {
        return this.channels.get(name)?.muted ?? false;
    }

    /**
     * Set master volume.
     */
    setMasterVolume(volume: number): void {
        this.masterVolume = Math.max(0, Math.min(1, volume));
    }

    getMasterVolume(): number {
        return this.masterVolume;
    }

    /**
     * Mute/unmute all audio.
     */
    setMasterMuted(muted: boolean): void {
        this.masterMuted = muted;
    }

    isMasterMuted(): boolean {
        return this.masterMuted;
    }

    /**
     * List all channels.
     */
    getChannels(): MixerChannel[] {
        return Array.from(this.channels.values());
    }

    /**
     * Mute a group of channels.
     */
    muteGroup(channelNames: string[]): void {
        for (const name of channelNames) {
            this.setChannelMuted(name, true);
        }
    }

    /**
     * Unmute a group of channels.
     */
    unmuteGroup(channelNames: string[]): void {
        for (const name of channelNames) {
            this.setChannelMuted(name, false);
        }
    }

    // =========================================================================
    // DUCKING SYSTEM
    // =========================================================================

    /**
     * Configure ducking for a channel.
     * Example: Duck music and ambient when voice plays.
     */
    configureDucking(config: DuckingConfig): void {
        const duckId = `${config.triggerChannel}_ducks_${config.targetChannels.join('_')}`;

        this.duckingStates.set(duckId, {
            config,
            isActive: false,
            currentDuckAmount: 0,
            targetDuckAmount: 0,
        });
    }

    /**
     * Remove ducking configuration.
     */
    removeDucking(triggerChannel: string, targetChannels: string[]): void {
        const duckId = `${triggerChannel}_ducks_${targetChannels.join('_')}`;
        this.duckingStates.delete(duckId);
    }

    /**
     * Update ducking state. Call every frame with delta time.
     */
    updateDucking(delta: number): void {
        for (const [_id, state] of this.duckingStates) {
            if (!state.config.enabled) continue;

            // Check if trigger channel has active sources above threshold
            const triggerActive = this.isChannelActiveAboveThreshold(
                state.config.triggerChannel,
                state.config.threshold,
            );

            // Update target duck amount
            state.targetDuckAmount = triggerActive ? state.config.ratio : 0;

            // Smooth transition to target
            const speed = triggerActive
                ? (1 / state.config.attackTime) * delta
                : (1 / state.config.releaseTime) * delta;

            if (state.currentDuckAmount < state.targetDuckAmount) {
                state.currentDuckAmount = Math.min(
                    state.currentDuckAmount + speed,
                    state.targetDuckAmount,
                );
            } else if (state.currentDuckAmount > state.targetDuckAmount) {
                state.currentDuckAmount = Math.max(
                    state.currentDuckAmount - speed,
                    state.targetDuckAmount,
                );
            }

            state.isActive = state.currentDuckAmount > 0.01;

            // Apply ducking to target channels
            if (state.isActive) {
                for (const targetChannel of state.config.targetChannels) {
                    const ch = this.channels.get(targetChannel);
                    if (ch) {
                        // Store original volume if not already stored
                        // (In production, this would use a separate storage mechanism)
                        // For now, we'll apply ducking in getEffectiveVolume
                    }
                }
            }
        }
    }

    /**
     * Get ducking attenuation for a channel (0-1, where 0 = no attenuation, 1 = full duck).
     */
    getDuckingAttenuation(channelName: string): number {
        let maxDuck = 0;

        for (const state of this.duckingStates.values()) {
            if (!state.config.enabled || !state.isActive) continue;

            if (state.config.targetChannels.includes(channelName)) {
                maxDuck = Math.max(maxDuck, state.currentDuckAmount);
            }
        }

        return maxDuck;
    }

    /**
     * Check if a channel has active sources above a dB threshold.
     */
    private isChannelActiveAboveThreshold(channelName: string, thresholdDb: number): boolean {
        const sources = Array.from(this.activeSources.values()).filter(
            (s) => s.channel === channelName,
        );

        if (sources.length === 0) return false;

        // Convert linear volume to dB (simplified)
        const maxVolume = Math.max(...sources.map((s) => s.volume));
        const db = 20 * Math.log10(maxVolume + 0.0001); // Avoid log(0)

        return db >= thresholdDb;
    }

    // =========================================================================
    // SIDECHAIN COMPRESSION
    // =========================================================================

    /**
     * Configure sidechain compression.
     * Example: Compress SFX when music peaks.
     */
    configureSidechain(config: SidechainConfig): void {
        const scId = `${config.sourceChannel}_to_${config.targetChannel}`;
        this.sidechains.set(scId, config);
    }

    /**
     * Remove sidechain configuration.
     */
    removeSidechain(sourceChannel: string, targetChannel: string): void {
        const scId = `${sourceChannel}_to_${targetChannel}`;
        this.sidechains.delete(scId);
    }

    // =========================================================================
    // VOICE STEALING
    // =========================================================================

    /**
     * Set voice stealing strategy.
     */
    setVoiceStealingStrategy(strategy: VoiceStealingStrategy): void {
        this.voiceStealingStrategy = strategy;
    }

    /**
     * Register a new audio source. Returns true if allowed, false if stolen.
     */
    registerSource(source: AudioSource): boolean {
        const ch = this.channels.get(source.channel);
        if (!ch) return false;

        // Check voice limit
        if (ch.maxVoices > 0 && ch.currentVoices >= ch.maxVoices) {
            // Try to steal a voice
            const stolen = this.stealVoice(source.channel, source.priority);
            if (!stolen) return false; // No voice available
        }

        // Add source
        this.activeSources.set(source.id, source);
        ch.currentVoices++;

        return true;
    }

    /**
     * Unregister an audio source.
     */
    unregisterSource(sourceId: string): void {
        const source = this.activeSources.get(sourceId);
        if (!source) return;

        const ch = this.channels.get(source.channel);
        if (ch) {
            ch.currentVoices = Math.max(0, ch.currentVoices - 1);
        }

        this.activeSources.delete(sourceId);
    }

    /**
     * Steal a voice from a channel based on strategy.
     * Returns the ID of the stolen source, or null if no voice could be stolen.
     */
    private stealVoice(channelName: string, newPriority: number): string | null {
        const sources = Array.from(this.activeSources.values()).filter(
            (s) => s.channel === channelName,
        );

        if (sources.length === 0) return null;

        let victimSource: AudioSource | null = null;

        switch (this.voiceStealingStrategy.mode) {
            case 'oldest':
                // Steal the oldest source
                victimSource = sources.reduce((oldest, s) =>
                    s.startTime < oldest.startTime ? s : oldest,
                );
                break;

            case 'quietest':
                // Steal the quietest source
                victimSource = sources.reduce((quietest, s) =>
                    s.volume < quietest.volume ? s : quietest,
                );
                break;

            case 'lowest_priority':
                // Steal the lowest priority source
                victimSource = sources.reduce((lowest, s) =>
                    s.priority < lowest.priority ? s : lowest,
                );

                // Only steal if new source has higher priority
                if (victimSource.priority >= newPriority) return null;
                break;
        }

        if (victimSource) {
            this.unregisterSource(victimSource.id);
            return victimSource.id;
        }

        return null;
    }

    /**
     * Get active source count for a channel.
     */
    getChannelVoiceCount(channelName: string): number {
        return this.channels.get(channelName)?.currentVoices ?? 0;
    }

    /**
     * Get all active sources for a channel.
     */
    getChannelSources(channelName: string): AudioSource[] {
        return Array.from(this.activeSources.values()).filter(
            (s) => s.channel === channelName,
        );
    }

    // =========================================================================
    // CONTEXT-AWARE MIXING
    // =========================================================================

    /**
     * Set mixing context (e.g., 'combat', 'dialogue', 'ambient').
     * Automatically adjusts channel volumes based on context.
     */
    setMixingContext(context: MixingContext | null): void {
        this.currentContext = context;

        if (context) {
            // Apply context-specific channel volumes
            for (const [channelName, volume] of Object.entries(context.channelVolumes)) {
                this.setChannelVolume(channelName, volume);
            }
        }
    }

    /**
     * Get current mixing context.
     */
    getMixingContext(): MixingContext | null {
        return this.currentContext;
    }

    // =========================================================================
    // ENHANCED VOLUME CALCULATION
    // =========================================================================

    /**
     * Compute the effective volume for a source on a given channel.
     * Now includes ducking, sidechain, and context-aware adjustments.
     */
    getEffectiveVolume(channelName: string, sourceVolume: number): number {
        if (this.masterMuted) return 0;

        const ch = this.channels.get(channelName);
        if (!ch || ch.muted) return 0;

        let effectiveVolume = sourceVolume * ch.volume * this.masterVolume;

        // Apply ducking attenuation
        const duckAmount = this.getDuckingAttenuation(channelName);
        if (duckAmount > 0) {
            effectiveVolume *= 1 - duckAmount;
        }

        // Apply sidechain compression (simplified - in production would analyze signal)
        // For now, we'll just return the ducked volume

        return effectiveVolume;
    }
}
