import * as React from "react";

/* ──────────────────────────────────────────────────────────
   LANGUAGE CONFIG
────────────────────────────────────────────────────────── */
const LANGUAGES = [
  { code: "en-IN", label: "EN",  name: "English" },
  { code: "hi-IN", label: "HI",  name: "Hindi" },
  { code: "kn-IN", label: "KN",  name: "Kannada" },
  { code: "ta-IN", label: "TA",  name: "Tamil" },
  { code: "te-IN", label: "TE",  name: "Telugu" },
];

/* ──────────────────────────────────────────────────────────
   SYMPTOM KEYWORD EXTRACTION  (client-side, instant)
────────────────────────────────────────────────────────── */
const SYMPTOM_KEYWORDS = [
  "chest pain","chest","pain","breathing","breath","breathe","difficulty","dizz",
  "fever","headache","nausea","vomit","cough","fatigue","weakness","swelling",
  "palpitation","heart","pressure","unconscious","faint","bleed","wound","trauma",
  "ache","sore","throat","rash","allergy","seizure","stroke","paralysis",
];
const RISK_KEYWORDS = [
  { k:"chest pain",   r:"Chest pain may need urgent attention" },
  { k:"breathing",    r:"Respiratory distress indicator" },
  { k:"unconscious",  r:"Unconsciousness needs emergency help" },
  { k:"stroke",       r:"Neurological emergency" },
  { k:"seizure",      r:"Neurological event detected" },
  { k:"bleed",        r:"Hemorrhagic risk indicator" },
  { k:"heart",        r:"Cardiovascular alert" },
  { k:"pressure",     r:"Blood pressure anomaly possible" },
];

function extractSymptoms(text) {
  const lower = text.toLowerCase();
  const symptoms = [...new Set(SYMPTOM_KEYWORDS.filter(k => lower.includes(k)))];
  const risks = RISK_KEYWORDS.filter(r => lower.includes(r.k)).map(r => r.r);
  return { symptoms, risks };
}

/* ──────────────────────────────────────────────────────────
   LIVE WAVEFORM — uses AnalyserNode on real mic stream
────────────────────────────────────────────────────────── */
function LiveWaveform({ stream }) {
  const canvasRef = React.useRef(null);
  const rafRef    = React.useRef(null);
  const analyserRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stream) return;
    const ctx = canvas.getContext("2d");
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source   = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    source.connect(analyser);
    analyserRef.current = analyser;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(buf);
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      const bars = 24, bw = Math.floor(W / bars) - 2;
      for (let i = 0; i < bars; i++) {
        const val = buf[Math.floor(i * buf.length / bars)] / 255;
        const h   = Math.max(3, val * H * 0.85);
        const x   = i * (bw + 2);
        const alpha = 0.5 + val * 0.5;
        ctx.fillStyle = `rgba(6,182,212,${alpha})`;
        ctx.shadowColor = "#06B6D4";
        ctx.shadowBlur  = val * 6;
        ctx.beginPath();
        ctx.roundRect(x, (H - h) / 2, bw, h, 2);
        ctx.fill();
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioCtx.close();
    };
  }, [stream]);

  /* idle bars when no stream */
  React.useEffect(() => {
    if (stream) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, bars = 24, bw = Math.floor(W / bars) - 2;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < bars; i++) {
      ctx.fillStyle = "rgba(6,182,212,0.18)";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(i * (bw + 2), (H - 4) / 2, bw, 4, 2);
      ctx.fill();
    }
  }, [stream]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={40}
      style={{ display: "block", borderRadius: 4 }}
    />
  );
}

/* ──────────────────────────────────────────────────────────
   PROCESSING STEPS ANIMATION
────────────────────────────────────────────────────────── */
const STEPS = [
  "Reading your symptom description...",
  "Identifying symptoms you mentioned...",
  "Checking for urgent warning signs...",
  "Preparing safe next-step guidance...",
];
function ProcessingSteps({ active }) {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (!active) { setStep(0); return; }
    const id = setInterval(() => setStep(s => (s < STEPS.length - 1 ? s + 1 : s)), 900);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div style={{ fontFamily: "monospace", fontSize: 11, marginTop: 8 }}>
      {STEPS.map((s, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "4px 0",
          opacity: i <= step ? 1 : 0.25,
          transition: "opacity 0.5s ease",
          color: i < step ? "#10B981" : i === step ? "#06B6D4" : "#8A8F98",
        }}>
          <span style={{ fontSize: 9, letterSpacing: "0.1em" }}>
            [{String(i + 1).padStart(2, "0")}]
          </span>
          <span>{s}</span>
          {i === step && active && (
            <span style={{ animation: "vi-blink 0.8s steps(1) infinite", color: "#06B6D4" }}>▌</span>
          )}
          {i < step && <span style={{ marginLeft: "auto", color: "#10B981" }}>✓</span>}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export default function VoiceIntakeModule({
  patientMessage, setPatientMessage,
  triageLoading, triageError, submitTriage,
}) {
  const [langIdx,      setLangIdx]      = React.useState(0);
  const [listening,    setListening]    = React.useState(false);
  const [transcript,   setTranscript]   = React.useState("");
  const [interimText,  setInterimText]  = React.useState("");
  const [micStream,    setMicStream]    = React.useState(null);
  const [duration,     setDuration]     = React.useState(0);
  const [extraction,   setExtraction]   = React.useState(null);
  const [micError,     setMicError]     = React.useState("");
  const [processing,   setProcessing]   = React.useState(false);

  const recogRef  = React.useRef(null);
  const timerRef  = React.useRef(null);
  const streamRef = React.useRef(null);

  const lang = LANGUAGES[langIdx];

  /* ── Cleanup on unmount ────────────────────────────── */
  React.useEffect(() => () => stopListening(true), []); // eslint-disable-line

  /* ── Keep patientMessage synced with transcript ───── */
  React.useEffect(() => {
    if (transcript) setPatientMessage(transcript);
  }, [transcript, setPatientMessage]);

  /* ── Symptom extraction whenever transcript updates ─ */
  React.useEffect(() => {
    if (transcript.trim().length > 10) {
      setExtraction(extractSymptoms(transcript));
    }
  }, [transcript]);

  /* ── Duration counter ──────────────────────────────── */
  const startTimer = () => {
    setDuration(0);
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };
  const stopTimer = () => { clearInterval(timerRef.current); };

  /* ── Stop listening ────────────────────────────────── */
  const stopListening = (silent = false) => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch (_) {} recogRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setMicStream(null);
    setListening(false);
    setInterimText("");
    stopTimer();
    if (!silent) setMicError("");
  };

  /* ── Start listening ───────────────────────────────── */
  const startListening = async () => {
    setMicError("");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicError("Web Speech API not supported in this browser. Please type symptoms below.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicStream(stream);
    } catch {
      setMicError("Microphone access denied. Please type symptoms below.");
      return;
    }
    const recog = new SpeechRecognition();
    recog.lang = lang.code;
    recog.continuous = true;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.onresult = (e) => {
      let final = "", interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " ";
        else interim = t;
      }
      if (final) setTranscript(p => (p + " " + final).trim());
      setInterimText(interim);
    };
    recog.onerror = (e) => {
      if (e.error !== "aborted") setMicError(`Speech error: ${e.error}. Please try again.`);
      stopListening(true);
    };
    recog.onend = () => { if (listening) recog.start(); }; // auto-restart for continuous
    recog.start();
    recogRef.current = recog;
    setListening(true);
    startTimer();
  };

  const toggleMic = () => { listening ? stopListening() : startListening(); };

  const handleActivateTriage = async () => {
    stopListening();
    setProcessing(true);
    await submitTriage();
    setProcessing(false);
  };

  const handleClear = () => {
    setTranscript(""); setInterimText(""); setExtraction(null);
    setPatientMessage(""); setDuration(0);
  };

  const fmtDuration = (s) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const displayText = transcript + (interimText ? " " + interimText : "");
  const canSubmit   = (patientMessage || transcript).trim().length > 2;

  /* ── Inline styles (no Tailwind dependency) ─────────── */
  const card = {
    background: "rgba(10,11,16,0.88)",
    border: "1px solid #1A1D24",
    borderRadius: 16,
    backdropFilter: "blur(8px)",
  };
  const mono = { fontFamily: "monospace" };
  const cyan = "#06B6D4";
  const dimGray = "#8A8F98";

  return (
    <div style={{ width: "100%", maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        @keyframes vi-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes vi-pulse { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes vi-ring  { 0%{transform:scale(0.9);opacity:0.7} 100%{transform:scale(1.6);opacity:0} }
        @keyframes vi-fadein{ from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ── HEADER ───────────────────────────────────── */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: "clamp(22px,3vw,32px)", fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
          How Are You Feeling Today?
        </h1>
        <p style={{ fontSize: 13, color: dimGray, marginTop: 6 }}>
          Describe symptoms in your own words. PulseGuard AI will keep the guidance safe and easy to understand.
        </p>
      </div>

      {/* ── MAIN GRID ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>

        {/* LEFT — Demographics + Language */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Demographics */}
          <div style={{ ...card, padding: 20 }}>
            <div style={{ ...mono, fontSize: 9, color: dimGray, letterSpacing: "0.12em", textTransform: "uppercase", borderBottom: "1px solid #1A1D24", paddingBottom: 8, marginBottom: 12 }}>Visit Snapshot</div>
            {[["Session","Demo"],["Mode","Patient"],["Language",lang.name],["Status","Ready"]].map(([k,v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", ...mono, fontSize: 11, padding: "3px 0" }}>
                <span style={{ color: dimGray }}>{k}</span>
                <span style={{ color: k === "Status" ? cyan : "#fff", fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Language Selector */}
          <div style={{ ...card, padding: 16 }}>
            <div style={{ ...mono, fontSize: 9, color: dimGray, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Input Language</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {LANGUAGES.map((l, i) => (
                <button key={l.code} onClick={() => setLangIdx(i)} style={{
                  padding: "5px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                  border: `1px solid ${i === langIdx ? cyan : "#1A1D24"}`,
                  background: i === langIdx ? `${cyan}18` : "transparent",
                  color: i === langIdx ? cyan : dimGray,
                  cursor: "pointer", transition: "all 0.2s", ...mono,
                }}>
                  {l.label}
                  {i === langIdx && <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.7 }}>{l.name}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Symptom Extraction */}
          {extraction && (
            <div style={{ ...card, padding: 16, animation: "vi-fadein 0.5s ease" }}>
              <div style={{ ...mono, fontSize: 9, color: cyan, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>Symptoms Noted</div>
              {extraction.symptoms.length > 0 && (
                <>
                  <div style={{ ...mono, fontSize: 9, color: dimGray, marginBottom: 6 }}>Mentioned symptoms</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                    {extraction.symptoms.slice(0,8).map(s => (
                      <span key={s} style={{ padding: "2px 7px", borderRadius: 3, background: `${cyan}15`, border: `1px solid ${cyan}30`, color: cyan, fontSize: 9, ...mono, textTransform: "uppercase" }}>{s}</span>
                    ))}
                  </div>
                </>
              )}
              {extraction.risks.length > 0 && (
                <>
                  <div style={{ ...mono, fontSize: 9, color: "#D97706", marginBottom: 6 }}>Needs attention</div>
                  {extraction.risks.map(r => (
                    <div key={r} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                      <span style={{ color: "#D97706", fontSize: 10, marginTop: 1 }}>⚠</span>
                      <span style={{ fontSize: 10, color: "#FCD34D", ...mono, lineHeight: 1.4 }}>{r}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — Voice Intake Panel */}
        <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* TOP: Microphone status + waveform */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid #1A1D24" }}>

            {/* Mic button */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              {listening && (
                <>
                  {[1, 1.6].map((s, i) => (
                    <div key={i} style={{
                      position: "absolute", inset: -6 - i * 6,
                      borderRadius: "50%", border: `1px solid ${cyan}`,
                      opacity: 0, animation: `vi-ring ${1.4 + i * 0.5}s ${i * 0.3}s ease-out infinite`,
                    }} />
                  ))}
                </>
              )}
              <button onClick={toggleMic} style={{
                width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer",
                background: listening ? cyan : "#1A1D24",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.3s ease",
                boxShadow: listening ? `0 0 20px ${cyan}60` : "none",
                flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  {listening ? (
                    /* stop icon */
                    <rect x="6" y="6" width="12" height="12" rx="2" fill={listening ? "#060609" : "#fff"} />
                  ) : (
                    /* mic icon */
                    <>
                      <rect x="9" y="2" width="6" height="12" rx="3" fill="#06B6D4"/>
                      <path d="M5 11a7 7 0 0014 0" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <line x1="12" y1="18" x2="12" y2="22" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round"/>
                      <line x1="8" y1="22" x2="16" y2="22" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round"/>
                    </>
                  )}
                </svg>
              </button>
            </div>

            {/* Waveform */}
            <div style={{ flex: 1 }}>
              <LiveWaveform stream={micStream} />
            </div>

            {/* Status right */}
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                color: listening ? cyan : dimGray, textTransform: "uppercase",
                animation: listening ? "vi-pulse 1.4s ease-in-out infinite" : "none" }}>
                {listening ? "● LISTENING" : "○ STANDBY"}
              </div>
              {listening && (
                <div style={{ ...mono, fontSize: 9, color: dimGray, marginTop: 2 }}>
                  {fmtDuration(duration)} · {lang.name}
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE: Transcription stream */}
          <div style={{ flex: 1, minHeight: 120 }}>
            <div style={{ ...mono, fontSize: 9, color: dimGray, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              Live Transcription
            </div>

            {displayText ? (
              <div style={{
                background: "#060609", border: "1px solid #1A1D24", borderRadius: 8,
                padding: 12, minHeight: 80, maxHeight: 160, overflowY: "auto",
              }}>
                <span style={{ ...mono, fontSize: 12, color: "#fff", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {transcript}
                </span>
                {interimText && (
                  <span style={{ ...mono, fontSize: 12, color: `${cyan}80`, lineHeight: 1.7 }}>
                    {" "}{interimText}
                  </span>
                )}
                {listening && <span style={{ animation: "vi-blink 0.8s steps(1) infinite", color: cyan }}>▌</span>}
              </div>
            ) : (
              <div style={{
                background: "#060609", border: `1px dashed #1A1D24`, borderRadius: 8,
                padding: 16, minHeight: 80, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <div style={{ ...mono, fontSize: 11, color: dimGray, textAlign: "center" }}>
                  {listening ? "Speak now. Your words will appear here." : "Press the mic button or type your symptoms below."}
                </div>
              </div>
            )}

            {/* Manual text area fallback */}
            {!listening && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...mono, fontSize: 9, color: dimGray, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                  Or type your symptoms
                </div>
                <textarea
                  value={patientMessage}
                  onChange={e => { setPatientMessage(e.target.value); setTranscript(e.target.value); }}
                  rows={3}
                  placeholder="Example: I have fever, chest pain, and trouble breathing..."
                  style={{
                    width: "100%", background: "#060609", border: "1px solid #1A1D24",
                    borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 12,
                    ...mono, resize: "vertical", outline: "none", boxSizing: "border-box",
                    lineHeight: 1.6, transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = cyan}
                  onBlur={e => e.target.style.borderColor = "#1A1D24"}
                />
              </div>
            )}

            {/* Processing steps */}
            <ProcessingSteps active={processing} />
          </div>

          {/* BOTTOM: Controls */}
          <div style={{ borderTop: "1px solid #1A1D24", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>

            {micError && (
              <div style={{ ...mono, fontSize: 10, color: "#D97706", padding: "6px 10px", background: "#D9770610", borderRadius: 6, border: "1px solid #D9770630" }}>
                ⚠ {micError}
              </div>
            )}

            {triageError && (
              <div style={{ ...mono, fontSize: 10, color: "#EF4444", padding: "6px 10px", background: "#EF444410", borderRadius: 6, border: "1px solid #EF444430" }}>
                {triageError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {/* Clear */}
              {(transcript || patientMessage) && !triageLoading && (
                <button onClick={handleClear} style={{
                  padding: "10px 16px", borderRadius: 8, border: "1px solid #1A1D24",
                  background: "transparent", color: dimGray, fontSize: 11, cursor: "pointer",
                  ...mono, transition: "all 0.2s",
                }}
                onMouseEnter={e => e.target.style.borderColor = "#2A2D35"}
                onMouseLeave={e => e.target.style.borderColor = "#1A1D24"}
                >
                  Clear
                </button>
              )}

              {/* Primary CTA */}
              <button
                onClick={handleActivateTriage}
                disabled={triageLoading || !canSubmit}
                style={{
                  flex: 1, padding: "12px 20px", borderRadius: 8, border: "none",
                  background: triageLoading ? "#0891B2" : canSubmit ? cyan : "#1A1D24",
                  color: canSubmit ? "#060609" : dimGray,
                  fontSize: 13, fontWeight: 700, cursor: canSubmit && !triageLoading ? "pointer" : "default",
                  transition: "all 0.3s ease", letterSpacing: "0.02em",
                  boxShadow: canSubmit && !triageLoading ? `0 0 24px ${cyan}40` : "none",
                }}
              >
                {triageLoading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <span style={{ animation: "vi-pulse 0.8s ease-in-out infinite", display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
                    Analyzing…
                  </span>
                ) : "Review My Symptoms"}
              </button>
            </div>

            {/* Confidence / readiness row */}
            {canSubmit && !triageLoading && (
              <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 9, color: dimGray }}>
                <span>WORDS: {(transcript || patientMessage).trim().split(/\s+/).filter(Boolean).length}</span>
                <span style={{ color: extraction?.risks.length ? "#D97706" : "#10B981" }}>
                  {extraction?.risks.length ? `${extraction.risks.length} WARNING SIGN${extraction.risks.length > 1 ? "S" : ""} NOTED` : "READY FOR REVIEW"}
                </span>
                {listening && <span style={{ color: cyan }}>REC {fmtDuration(duration)}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
