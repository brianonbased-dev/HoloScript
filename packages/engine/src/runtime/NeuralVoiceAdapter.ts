/**
 * Neural Voice Adapters for HoloScript+
 *
 * Provides unified interfaces for high-fidelity neural text-to-speech.
 * Supports streaming audio for low-latency spatial dialogue.
 */

export interface VoiceOptions {
  voiceId: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface VoiceProvider {
  /**
   * Synthesize text to an audio stream or buffer
   */
  synthesize(text: string, options: VoiceOptions): Promise<ArrayBuffer>;
}

/**
 * ElevenLabs Neural Voice Adapter
 */
export class ElevenLabsAdapter implements VoiceProvider {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1/text-to-speech';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, options: VoiceOptions): Promise<ArrayBuffer> {
    const url = `${this.baseUrl}/${options.voiceId}/stream`;

    // In a real implementation, we would use fetch with the API key
    // Here we provide the logic following ElevenLabs API patterns
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': this.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs synthesis failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }
}

/**
 * Azure Neural Voice Adapter
 */
export class AzureVoiceAdapter implements VoiceProvider {
  private subscriptionKey: string;
  private region: string;

  constructor(subscriptionKey: string, region: string) {
    this.subscriptionKey = subscriptionKey;
    this.region = region;
  }

  async synthesize(text: string, options: VoiceOptions): Promise<ArrayBuffer> {
    const url = `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'Content-Type': 'application/ssml+xml',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
      },
      body: `
        <speak version='1.0' xml:lang='en-US'>
          <voice name='${options.voiceId}'>
            ${text}
          </voice>
        </speak>
      `.trim(),
    });

    if (!response.ok) {
      throw new Error(`Azure synthesis failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }
}

/**
 * Voice Manager to select and manage providers
 */
export class VoiceManager {
  private providers: Map<string, VoiceProvider> = new Map();
  private defaultProvider: string | null = null;

  public registerProvider(name: string, provider: VoiceProvider, setAsDefault = false): void {
    this.providers.set(name, provider);
    if (setAsDefault || !this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  public async speak(
    text: string,
    providerName?: string,
    options?: VoiceOptions
  ): Promise<ArrayBuffer> {
    const name = providerName || this.defaultProvider;
    if (!name || !this.providers.has(name)) {
      throw new Error(`Voice provider "${name}" not found.`);
    }

    const provider = this.providers.get(name)!;
    return await provider.synthesize(text, options || { voiceId: 'default' });
  }
}
