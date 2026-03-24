"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type SessionState = "idle" | "listening" | "thinking" | "surfacing";

// Web Speech API types (not in default TS lib)
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const SILENCE_TIMEOUT_MS = 5000;
const QUESTION_DISPLAY_MS = 15000;

export default function Home() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [question, setQuestion] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef<string[]>([]);

  // Keep ref in sync
  transcriptRef.current = transcript;

  // Fullscreen
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  const fetchQuestion = useCallback(async () => {
    setSessionState("thinking");
    try {
      const res = await fetch("/api/facilitate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptRef.current.join(" ") }),
      });
      const data = await res.json();
      setQuestion(data.question ?? "What does this moment mean to you?");
    } catch {
      setQuestion("What would you like to share next?");
    }
    setSessionState("surfacing");
    dismissTimer.current = setTimeout(() => {
      setQuestion(null);
      setSessionState("listening");
      resetSilenceTimer();
    }, QUESTION_DISPLAY_MS);
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      fetchQuestion();
    }, SILENCE_TIMEOUT_MS);
  }, [fetchQuestion]);

  // Speech recognition setup
  const startListening = useCallback(() => {
    const Ctor: SpeechRecognitionConstructor | undefined =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = Array.from(event.results) as SpeechRecognitionResult[];
      const last = results.at(-1);
      if (last?.isFinal) {
        setTranscript(prev => [...prev, last[0].transcript.trim()]);
      }
      resetSilenceTimer();
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      // Auto-restart if still in listening/surfacing state
      if (recognitionRef.current) {
        recognition.start();
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    resetSilenceTimer();
  }, [resetSilenceTimer]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  // Spacebar → trigger question immediately
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && sessionState === "listening") {
        e.preventDefault();
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        fetchQuestion();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sessionState, fetchQuestion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  function handleStart() {
    setSessionState("listening");
    setTranscript([]);
    setQuestion(null);
    startListening();
  }

  function handleEnd() {
    stopListening();
    setSessionState("idle");
    setQuestion(null);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center select-none overflow-hidden">
      {/* Fullscreen toggle */}
      <button
        onClick={handleFullscreen}
        className="absolute top-5 right-5 p-2 text-gray-300 hover:text-gray-500 transition-colors z-10"
        aria-label="Toggle fullscreen"
      >
        {isFullscreen ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
            <line x1="10" y1="14" x2="3" y2="21" /><line x1="21" y1="3" x2="14" y2="10" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        )}
      </button>

      {/* Wordmark */}
      <div className="absolute top-5 left-6 text-gray-300 text-sm font-medium tracking-widest uppercase">
        mymentos
      </div>

      {/* Core UI */}
      <div className="flex flex-col items-center gap-12">
        {/* Orb */}
        <div className="relative flex items-center justify-center w-32 h-32">
          {/* Ripple rings — only when listening */}
          {sessionState === "listening" && (
            <>
              <span className="absolute inset-0 rounded-full bg-black/5 animate-ripple" />
              <span className="absolute inset-0 rounded-full bg-black/5 animate-ripple [animation-delay:0.6s]" />
              <span className="absolute inset-0 rounded-full bg-black/5 animate-ripple [animation-delay:1.2s]" />
            </>
          )}

          {/* Thinking ring */}
          {sessionState === "thinking" && (
            <span className="absolute inset-0 rounded-full border border-gray-200 animate-spin-slow" />
          )}

          {/* Core circle */}
          <div
            className={`
              rounded-full transition-all duration-700 ease-in-out
              ${sessionState === "idle"
                ? "w-14 h-14 bg-gray-100 animate-idle-pulse"
                : sessionState === "listening"
                ? "w-20 h-20 bg-black"
                : sessionState === "thinking"
                ? "w-16 h-16 bg-gray-400 animate-idle-pulse"
                : "w-14 h-14 bg-gray-200"
              }
            `}
          />
        </div>

        {/* Status label */}
        <div className="h-5 flex items-center justify-center">
          {sessionState === "idle" && (
            <span className="text-xs text-gray-300 tracking-widest uppercase animate-fade-in">
              ready
            </span>
          )}
          {sessionState === "listening" && (
            <span className="text-xs text-gray-400 tracking-widest uppercase animate-fade-in">
              listening · space to prompt
            </span>
          )}
          {sessionState === "thinking" && (
            <span className="text-xs text-gray-400 tracking-widest uppercase animate-fade-in">
              thinking
            </span>
          )}
        </div>

        {/* Question card */}
        {sessionState === "surfacing" && question && (
          <div
            className="animate-question-in max-w-sm text-center cursor-pointer"
            onClick={() => {
              if (dismissTimer.current) clearTimeout(dismissTimer.current);
              setQuestion(null);
              setSessionState("listening");
              resetSilenceTimer();
            }}
          >
            <p className="text-gray-800 text-lg font-light leading-relaxed tracking-wide">
              {question}
            </p>
            <span className="mt-4 block text-xs text-gray-300 tracking-widest uppercase">
              tap to continue
            </span>
          </div>
        )}

        {/* CTA */}
        {sessionState === "idle" && (
          <button
            onClick={handleStart}
            className="animate-fade-in px-8 py-3 bg-black text-white rounded-full text-sm font-medium tracking-wide hover:bg-gray-800 active:scale-95 transition-all"
          >
            Begin conversation
          </button>
        )}

        {sessionState === "listening" && (
          <button
            onClick={handleEnd}
            className="animate-fade-in px-6 py-2.5 border border-gray-200 text-gray-400 rounded-full text-xs font-medium tracking-widest uppercase hover:border-gray-400 hover:text-gray-600 active:scale-95 transition-all"
          >
            End
          </button>
        )}
      </div>
    </div>
  );
}
