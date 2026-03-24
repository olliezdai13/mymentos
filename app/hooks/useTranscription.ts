"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface Utterance {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

// Types are defined in app/types/speech.d.ts

export function useTranscription() {
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          setUtterances((prev) => [
            ...prev,
            { text: text.trim(), timestamp: Date.now(), isFinal: true },
          ]);
          setInterimText("");
        } else {
          interim += text;
        }
      }

      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setIsListening(false);
        shouldRestartRef.current = false;
      }
    };

    recognition.onend = () => {
      // Web Speech API stops after silence — auto-restart if we still want to listen
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started, ignore
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      // Already started
    }
  }, []);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  // Full transcript as a single string
  const fullTranscript = utterances.map((u) => u.text).join(" ");

  return {
    utterances,
    interimText,
    fullTranscript,
    isListening,
    isSupported,
    start,
    stop,
  };
}
