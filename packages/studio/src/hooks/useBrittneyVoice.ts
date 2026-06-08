/**
 * Assistant voice input hook.
 *
 * Provides voice input via the browser's SpeechRecognition API.
 * Returns:
 *   - isListening: boolean
 *   - isSupported: boolean
 *   - startListening / stopListening
 *   - transcript: last recognised text chunk (continuous)
 *   - interimTranscript: live unconfirmed text
 *
 * Usage in chat panels:
 *   const { isListening, isSupported, startListening, stopListening, transcript } = useAssistantVoice();
 *   useEffect(() => { if (transcript) setInput(transcript); }, [transcript]);
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/lib/logger';

interface IWebSpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface IWebSpeechRecognitionErrorEvent extends Event {
  error: string;
}

// Poly-fill type for SpeechRecognition (may not be in old TS DOM lib)
interface IWebSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: IWebSpeechRecognitionEvent) => void) | null;
  onerror: ((event: IWebSpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: any) => void) | null;
}

export interface UseAssistantVoiceReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  clearTranscript: () => void;
}

interface WindowWithWebkitSpeech {
  webkitSpeechRecognition?: typeof SpeechRecognition;
}

function getSpeechRecognitionConstructor(): typeof SpeechRecognition | undefined {
  if (typeof window === 'undefined') return undefined;
  if (typeof SpeechRecognition !== 'undefined') return SpeechRecognition;
  return (window as unknown as WindowWithWebkitSpeech).webkitSpeechRecognition;
}

export function useAssistantVoice(): UseAssistantVoiceReturn {
  const SpeechRecognitionCtor = getSpeechRecognitionConstructor();

  const [isSupported, setIsSupported] = useState(false);
  useEffect(() => {
    setIsSupported(!!SpeechRecognitionCtor);
  }, [SpeechRecognitionCtor]);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<IWebSpeechRecognition | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionCtor || isListening) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: IWebSpeechRecognitionEvent) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) setTranscript((t) => t + final);
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: IWebSpeechRecognitionErrorEvent) => {
      logger.warn('[AssistantVoice] SpeechRecognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [SpeechRecognitionCtor, isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    recognitionRef.current.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimTranscript('');
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    startListening,
    stopListening,
    clearTranscript,
  };
}

export type UseBrittneyVoiceReturn = UseAssistantVoiceReturn;
export const useBrittneyVoice = useAssistantVoice;
