"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type SessionState = "idle" | "listening" | "thinking" | "surfacing";

// Speech types defined in app/types/speech.d.ts

function generateWavePath(baseR: number, n: number, amp: number, phase: number): string {
  const pts = 240;
  const parts: string[] = new Array(pts + 1);
  for (let i = 0; i <= pts; i++) {
    const θ = (i / pts) * Math.PI * 2;
    const r = baseR + amp * Math.sin(n * θ + phase);
    const x = (r * Math.cos(θ)).toFixed(2);
    const y = (r * Math.sin(θ)).toFixed(2);
    parts[i] = i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }
  return parts.join("") + "Z";
}

// offset = distance from orb edge; orbRadius is computed per-frame from current scale
const WAVE_RINGS = [
  { offset: 26, n: 4, speed:  0.55, phaseOff: 0.0,  dormAmp: 2.8, maxAmp: 34 },
  { offset: 26, n: 7, speed: -0.72, phaseOff: 0.85, dormAmp: 2.2, maxAmp: 28 },
  { offset: 26, n: 5, speed:  0.38, phaseOff: 1.95, dormAmp: 1.8, maxAmp: 22 },
] as const;

// Plays a soft two-tone chime using Web Audio — no audio file needed
function playDing(ctx: AudioContext) {
  const notes = [880, 1100];
  notes.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const start = ctx.currentTime + i * 0.12;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 1.0);
    osc.start(start);
    osc.stop(start + 1.0);
  });
}

const SILENCE_TIMEOUT_MS = 5000;
const QUESTION_DISPLAY_MS = 15000;

export default function Home() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [question, setQuestion] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [silenceResetKey, setSilenceResetKey] = useState(0);

  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const transcriptRef = useRef<string[]>([]);

  // Audio analysis refs
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const animFrameRef    = useRef<number | null>(null);
  const orbSphereRef    = useRef<HTMLDivElement | null>(null);
  const sessionStateRef = useRef<SessionState>("idle");

  // Wave ring refs — SVG paths updated directly in rAF loop
  const wave1Ref    = useRef<SVGPathElement | null>(null);
  const wave2Ref    = useRef<SVGPathElement | null>(null);
  const wave3Ref    = useRef<SVGPathElement | null>(null);
  const waveAnimRef = useRef<number | null>(null);
  const smoothedVol = useRef(0);   // 0–1, updated by audio loop, read by render loop
  const orbScale    = useRef(0.52); // current lerped scale, owned by render loop

  // Keep refs in sync
  transcriptRef.current = transcript;
  sessionStateRef.current = sessionState;

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
    // Play ding just before the question appears
    if (audioCtxRef.current) playDing(audioCtxRef.current);
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

  // Audio analysis — only job is to keep smoothedVol updated
  const startVolumeLoop = useCallback((analyser: AnalyserNode) => {
    const data = new Uint8Array(analyser.frequencyBinCount);
    function tick() {
      animFrameRef.current = requestAnimationFrame(tick);
      if (sessionStateRef.current !== "listening") return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      smoothedVol.current += ((avg / 255) - smoothedVol.current) * 0.18;
    }
    tick();
  }, []);

  // Single render loop — handles orb scale (lerped) + wave paths. Never stops.
  const startRenderLoop = useCallback(() => {
    const pathRefs = [wave1Ref, wave2Ref, wave3Ref];
    function tick() {
      waveAnimRef.current = requestAnimationFrame(tick);
      const t     = performance.now() / 1000;
      const state = sessionStateRef.current;
      const vol   = smoothedVol.current;

      // ── Orb scale: each state has a target; lerp provides smooth transitions ──
      const breathe = (amp: number, rate: number) => amp * Math.sin(t * rate * Math.PI * 2);
      let target: number;
      if      (state === "idle")      target = 0.52 + breathe(0.04, 0.35);
      else if (state === "listening") target = 1.0  + vol * 0.32;
      else if (state === "thinking")  target = 0.74 + breathe(0.03, 0.7);
      else                            target = 0.76; // surfacing

      orbScale.current += (target - orbScale.current) * 0.055; // slow lerp = smooth
      if (orbSphereRef.current) {
        orbSphereRef.current.style.transform = `scale(${orbScale.current.toFixed(4)})`;
      }

      // ── Wave rings — radius tracks orb size ──
      const orbRadius = 110 * orbScale.current; // orb sphere is 220px → radius 110
      const waveVol = state === "listening" ? vol : 0;
      for (let i = 0; i < WAVE_RINGS.length; i++) {
        const path = pathRefs[i].current;
        if (!path) continue;
        const ring  = WAVE_RINGS[i];
        const amp   = ring.dormAmp + waveVol * ring.maxAmp;
        const phase = t * ring.speed + ring.phaseOff;
        path.setAttribute("d", generateWavePath(orbRadius + ring.offset, ring.n, amp, phase));
      }
    }
    tick();
  }, []);

  // Start render loop once on mount — never stops
  useEffect(() => {
    startRenderLoop();
    return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current); };
  }, [startRenderLoop]);

  // Speech recognition + mic setup
  const startListening = useCallback(async () => {
    // — Microphone / Web Audio —
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      startVolumeLoop(analyser);
    } catch {
      // mic permission denied — orb still works, just won't react to volume
    }

    // — Speech recognition —
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
        setInterimText("");
      } else if (last) {
        setInterimText(last[0].transcript);
      }
      setSilenceResetKey(k => k + 1);
      resetSilenceTimer();
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (recognitionRef.current) recognition.start();
    };

    recognition.start();
    recognitionRef.current = recognition;
    resetSilenceTimer();
  }, [resetSilenceTimer, startVolumeLoop]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    smoothedVol.current = 0;
    // orbScale lerps back to idle naturally via the render loop
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
      <div
        className="absolute top-5 left-6 text-black text-2xl tracking-tight"
        style={{ fontFamily: "var(--font-playfair)", fontStyle: "italic", fontWeight: 500 }}
      >
        mymentos
      </div>

      {/* Debug toggle */}
      <button
        onClick={() => setShowDebug(d => !d)}
        className="absolute top-5 right-14 p-2 text-gray-300 hover:text-gray-500 transition-colors z-10 text-xs font-mono"
        aria-label="Toggle debug transcript"
      >
        {showDebug ? "hide" : "debug"}
      </button>

      {/* Debug transcript panel */}
      {showDebug && (
        <div className="absolute bottom-4 left-4 right-4 max-h-48 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-3 z-20 text-xs font-mono text-gray-600">
          <div className="text-gray-400 mb-1">transcript ({transcript.length} utterances)</div>
          {transcript.length === 0 && !interimText && (
            <span className="text-gray-300">waiting for speech...</span>
          )}
          {transcript.map((t, i) => (
            <span key={i}>{t} </span>
          ))}
          {interimText && (
            <span className="text-gray-400 italic">{interimText}</span>
          )}
        </div>
      )}

      {/* Core UI — slides up when surfacing */}
      <div
        className="flex flex-col items-center gap-12"
        style={{
          transform: `translateY(${sessionState === "surfacing" ? "-9vh" : "0"})`,
          transition: "transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Orb + sinusoidal wave rings */}
        <div className="relative flex items-center justify-center" style={{ width: 440, height: 440 }}>

          {/* SVG wave rings — always rendered, amplitude driven by volume */}
          <svg
            className="absolute inset-0 pointer-events-none"
            viewBox="-220 -220 440 440"
            width="440"
            height="440"
          >
            <path ref={wave1Ref} fill="none" className={`orb-wave orb-wave-1 orb-wave--${sessionState}`} />
            <path ref={wave2Ref} fill="none" className={`orb-wave orb-wave-2 orb-wave--${sessionState}`} />
            <path ref={wave3Ref} fill="none" className={`orb-wave orb-wave-3 orb-wave--${sessionState}`} />
          </svg>

          {/* Orb sphere */}
          <div className="orb-wrapper">
            <div ref={orbSphereRef} className={`orb-sphere orb-sphere--${sessionState}`}>
              <div className={`orb-blob orb-warm${sessionState === "thinking" ? " orb-warm--thinking" : ""}`} />
              <div className={`orb-blob orb-pink${sessionState === "thinking" ? " orb-pink--thinking" : ""}`} />
              <div className="orb-blob orb-center" />
              <div className="orb-sheen" />
            </div>
          </div>

          {/* Countdown arc — outside the orb container to the right */}
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{
              right: "-48px",
              opacity: sessionState === "listening" ? 0.45 : 0,
              transition: "opacity 0.8s ease",
            }}
          >
            {sessionState === "listening" && (
              <svg key={silenceResetKey} width="22" height="22" viewBox="0 0 28 28" className="countdown-svg">
                <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(180,180,180,0.35)" strokeWidth="1.2" />
                <circle
                  cx="14" cy="14" r="11"
                  fill="none" stroke="rgba(140,140,140,0.7)" strokeWidth="1.2"
                  strokeDasharray="69.1" strokeDashoffset="0"
                  strokeLinecap="round"
                  transform="rotate(-90 14 14)"
                  className="countdown-progress"
                  style={{ animationDuration: `${SILENCE_TIMEOUT_MS}ms` }}
                />
              </svg>
            )}
          </div>

        </div>

        {/* Status label — one at a time, cross-fades */}
        <div className="relative h-5 flex items-center justify-center" style={{ minWidth: 180 }}>
          {(["idle", "listening", "thinking"] as const).map((s) => (
            <span
              key={s}
              className="absolute text-xs tracking-widest uppercase whitespace-nowrap"
              style={{
                opacity: sessionState === s ? 1 : 0,
                transform: `translateY(${sessionState === s ? 0 : 5}px)`,
                transition: "opacity 0.55s ease, transform 0.55s ease",
                color: s === "idle" ? "#d1d5db" : "#9ca3af",
              }}
            >
              {s === "idle" ? "ready" : s === "listening" ? "space to prompt" : "thinking"}
            </span>
          ))}
        </div>

        {/* placeholder keeps button from shifting when question is absent */}
        <div className="h-0" />

        {/* CTA buttons — always rendered, fade in/out via opacity */}
        <div className="h-12 flex items-center justify-center">
          <button
            onClick={handleStart}
            className="btn-sand px-8 py-3 rounded-full text-sm font-medium tracking-wide active:scale-95 absolute"
            style={{
              opacity: sessionState === "idle" ? 1 : 0,
              pointerEvents: sessionState === "idle" ? "auto" : "none",
              transform: `scale(${sessionState === "idle" ? 1 : 0.95})`,
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            Begin conversation
          </button>
          <button
            onClick={handleEnd}
            className="px-6 py-2.5 border border-gray-200 text-gray-400 rounded-full text-xs font-medium tracking-widest uppercase hover:border-gray-400 hover:text-gray-600 active:scale-95 absolute"
            style={{
              opacity: sessionState === "listening" ? 1 : 0,
              pointerEvents: sessionState === "listening" ? "auto" : "none",
              transform: `scale(${sessionState === "listening" ? 1 : 0.95})`,
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            End
          </button>
        </div>
      </div>

      {/* Question card — fixed so it never touches the flex layout */}
      {sessionState === "surfacing" && question && (
        <div
          className="fixed inset-x-0 flex justify-center px-8 pointer-events-none"
          style={{ top: "62%" }}
        >
          <div
            className="pointer-events-auto max-w-sm text-center cursor-pointer"
            style={{ animation: "question-in 1.6s cubic-bezier(0.22, 1, 0.36, 1) 0.25s both" }}
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
            <span className="mt-5 block text-xs text-gray-300 tracking-widest uppercase">
              tap to continue
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
