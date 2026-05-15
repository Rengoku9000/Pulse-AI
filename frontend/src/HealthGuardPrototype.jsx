import * as React from "react";
import { Activity, Clock } from "lucide-react";
import CinematicIntro from "./CinematicIntro";
import AmbientBackground from "./AmbientBackground";
import VoiceIntakeModule from "./VoiceIntakeModule";
import CopilotChat from "./CopilotChat";
import ClinicalReport from "./ClinicalReport";
import MedicalReportPreview from "./MedicalReportPreview";

const Icons = { Activity, Clock };
const API_URL = import.meta.env.VITE_API_URL || "/api";
const DEFAULT_MESSAGE = "I have fever, dizziness, chest pain, and trouble breathing.";

const Sparkline = ({ data, color, className = "" }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d - min) / range) * 100}`).join(' ');
  return (
    <svg viewBox="0 -10 100 120" preserveAspectRatio="none" className={`w-full h-6 overflow-visible ${className}`}>
      <polyline fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={points} className="opacity-90" />
    </svg>
  );
};

const App = () => {
  // Intro gate — hides dashboard until cinematic sequence completes
  const [introComplete, setIntroComplete] = React.useState(false);
  const [appVisible, setAppVisible] = React.useState(false);

  const handleIntroComplete = React.useCallback(() => {
    setIntroComplete(true);
    // Slight stagger so the dissolve feels intentional
    requestAnimationFrame(() => requestAnimationFrame(() => setAppVisible(true)));
  }, []);

  // Continuous scroll mapping tracked cleanly from 0.0 to 1.0
  const [scrollProgress, setScrollProgress] = React.useState(0);
  const [systemClock, setSystemClock] = React.useState('');

  // Floating Command Palette state
  const [showCommandPalette, setShowCommandPalette] = React.useState(false);
  const [paletteSearch, setPaletteSearch] = React.useState('');

  // Interruption controls
  const [autoScrollIntervalId, setAutoScrollIntervalId] = React.useState(null);
  const [actionFeedback, setActionFeedback] = React.useState('');
  
  // Compact Topology Node inspection selections
  const [selectedNodeId, setSelectedNodeId] = React.useState('node3');

  const [patientMessage, setPatientMessage] = React.useState(DEFAULT_MESSAGE);
  const [triageResponse, setTriageResponse] = React.useState(null);
  const [triageLoading, setTriageLoading] = React.useState(false);
  const [triageError, setTriageError] = React.useState("");
  
  // Enterprise Copilot State
  const [chatInput, setChatInput] = React.useState('');
  const [aiThinking, setAiThinking] = React.useState(false);
  const [showReport, setShowReport] = React.useState(false);
  const [showMedReport, setShowMedReport] = React.useState(false);
  // AI Processing overlay — shown during backend triage call
  const [triageProcessing, setTriageProcessing] = React.useState(false);
  const [processStep, setProcessStep] = React.useState(0);
  const processStepRef = React.useRef(null);
  
  const [chatMessages, setChatMessages] = React.useState([
    { id: 1, sender: 'ai', text: 'PulseGuard AI is ready. Tell me what you are feeling, and I will help guide the next safe step.' }
  ]);

  // Production Event logs arrays
  const [eventFeed, setEventFeed] = React.useState([
    { id: 1, time: '18:00:12', text: 'Patient symptom intake started.', type: 'info' },
    { id: 2, time: '18:01:45', text: 'Safety checks and language support are ready.', type: 'success' }
  ]);

  const [terminalLogs, setTerminalLogs] = React.useState([
    { id: 1, time: '14:10', text: "Vitals preview is calm and ready for symptom review.", label: "[CARE]" },
    { id: 2, time: '14:11', text: "Voice intake is available in multiple languages.", label: "[READY]" }
  ]);

  const score = triageResponse?.emergency_score ?? 0;
  const riskTone = score >= 70 ? "high" : score >= 30 ? "medium" : "low";
  const selectedRiskNode = riskTone === "high" ? "node4" : riskTone === "medium" ? "node3" : "node1";
  const activeRiskLabel = triageResponse?.risk_level || "Awaiting Triage";
  const clinicalSummary =
    triageResponse?.clinical_summary ||
    "Share symptoms to receive patient-friendly guidance, safety checks, and the right next step.";
  const guidance =
    triageResponse?.guidance ||
    "No symptom review has been run yet. Enter what the patient is feeling to get safe guidance.";
  const recommendation =
    triageResponse?.emergency_recommendation ||
    "No care recommendation has been generated yet.";
  const language = triageResponse?.language || "Pending";
  const ragChunks = triageResponse?.telemetry?.rag_context_chunks ?? 0;

  // High-fidelity UTC System Clock ticker
  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setSystemClock(now.toISOString().split('T')[1].slice(0, 8) + ' UTC');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Continuous Scroll progress mapping listener
  React.useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 0) {
        const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
        setScrollProgress(progress);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Global CMD+K Palette Listener
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (e.key === 'Escape') setShowCommandPalette(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    setSelectedNodeId(selectedRiskNode);
  }, [selectedRiskNode]);

  React.useEffect(() => {
    if (!triageResponse) return;
    const timeNow = new Date().toISOString().split('T')[1].slice(0, 5);
    setTerminalLogs(prev => [
      ...prev.slice(-5),
      { id: Date.now(), time: timeNow, text: `Symptom review completed: ${triageResponse.risk_level} at ${triageResponse.emergency_score}/100.`, label: score >= 70 ? "[URGENT]" : score >= 30 ? "[REVIEW]" : "[CARE]" },
      { id: Date.now() + 1, time: timeNow, text: `Medical context used: ${triageResponse.telemetry?.rag_context_chunks ?? 0} references. Language: ${triageResponse.language}.`, label: "[INFO]" },
    ]);
    setChatMessages(prev => [
      ...prev,
      { id: Date.now() + 2, sender: 'ai', text: triageResponse.clinical_summary },
    ]);
  }, [triageResponse, score]);

  // Highly controlled chapter indices mapping real-time viewport displays
  const getChapterIndex = () => {
    if (scrollProgress < 0.12) return 1;
    if (scrollProgress < 0.28) return 2;
    if (scrollProgress < 0.50) return 3;
    if (scrollProgress < 0.70) return 4;
    if (scrollProgress < 0.85) return 5;
    return 6;
  };

  const currentChapter = getChapterIndex();

  // Controlled stream simulator
  React.useEffect(() => {
    if (scrollProgress >= 0.15 && scrollProgress < 0.50) {
      const interval = setInterval(() => {
        const msgs = [
          { text: "Oxygen level may need closer attention.", label: "[URGENT]" },
          { text: "Heart rate looks elevated in this example.", label: "[REVIEW]" },
          { text: "Checking whether symptoms need urgent attention.", label: "[REVIEW]" }
        ];
        const nextMsg = msgs[Math.floor(Math.random() * msgs.length)];
        const timeNow = new Date().toISOString().split('T')[1].slice(0, 5);
        setTerminalLogs(prev => [...prev.slice(-6), { id: Date.now(), time: timeNow, ...nextMsg }]);
      }, 2400); 
      return () => clearInterval(interval);
    }
  }, [scrollProgress]);

  // Cancel programmatic scroll automation if operator wheel inputs intervene
  React.useEffect(() => {
    const handleWheel = () => {
      if (autoScrollIntervalId) {
        clearInterval(autoScrollIntervalId);
        setAutoScrollIntervalId(null);
        const timeStr = new Date().toTimeString().split(' ')[0];
        setEventFeed(f => [{ id: Date.now(), time: timeStr, text: 'Auto-scroll paused. You can continue at your own pace.', type: 'warn' }, ...f]);
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [autoScrollIntervalId]);

  // ── Scroll executor ────────────────────────────────────────────────────────
  const scrollToChapterOffset = (targetProgress) => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: maxScroll * targetProgress, behavior: 'smooth' });
  };

  // ── Cinematic autopilot: Ch3 → Ch4 → Ch5 → Ch6 ────────────────────────────
  // Called after triage response arrives. Returns a cleanup function.
  const autopilotRef = React.useRef([]);

  const clearAutopilot = () => {
    autopilotRef.current.forEach(clearTimeout);
    autopilotRef.current = [];
  };

  const launchAutopilot = () => {
    clearAutopilot();
    // Chapter progression targets and dwell times
    const stages = [
      { progress: 0.38, dwell: 2800 },  // Ch3 — AI Triage Activation (show reasoning cards)
      { progress: 0.60, dwell: 2400 },  // Ch4 — Risk Assessment (show severity tiers)
      { progress: 0.80, dwell: 2200 },  // Ch5 — Physician Escalation (show timeline)
      { progress: 0.98, dwell: 0    },  // Ch6 — ICU Command Center (final)
    ];
    let cumulative = 0;
    stages.forEach(({ progress, dwell }, i) => {
      const t = setTimeout(() => scrollToChapterOffset(progress), cumulative);
      autopilotRef.current.push(t);
      cumulative += dwell;
      // Dismiss the processing overlay once we reach Ch4 (reasoning is visible)
      if (i === 1) {
        const t2 = setTimeout(() => {
          setTriageProcessing(false);
          clearInterval(processStepRef.current);
        }, cumulative - dwell + 800);
        autopilotRef.current.push(t2);
      }
    });
  };

  // ── Triage submission ────────────────────────────────────────────────────────
  const submitTriage = async () => {
    setTriageLoading(true);
    setTriageError("");
    // Phase 1: show overlay + scroll to Ch3 immediately — no black screen
    setTriageProcessing(true);
    setProcessStep(0);
    processStepRef.current = setInterval(
      () => setProcessStep(s => (s < 3 ? s + 1 : s)), 950
    );
    scrollToChapterOffset(0.38);
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'pulseguard-ui', message: patientMessage }),
      });
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      const data = await res.json();
      setTriageResponse(data);
      const timeStr = new Date().toTimeString().split(' ')[0];
      setEventFeed(f => [
        { id: Date.now(), time: timeStr, text: `Symptom review completed: ${data.risk_level}`, type: data.emergency_score >= 70 ? 'warn' : 'success' },
        ...f,
      ]);
      // Phase 2: launch cinematic chapter progression Ch3 → Ch4 → Ch5 → Ch6
      launchAutopilot();
    } catch (err) {
      setTriageError('Unable to review symptoms right now. Please try again, or consult a healthcare professional if symptoms feel urgent.');
      setTriageProcessing(false);
      clearInterval(processStepRef.current);
      scrollToChapterOffset(0.05);  // return to intake — never leave user on blank screen
    } finally {
      setTriageLoading(false);
    }
  };

  // Cleanup all timers on unmount
  React.useEffect(() => () => {
    clearAutopilot();
    clearInterval(processStepRef.current);
  }, []); // eslint-disable-line

  // Allow user wheel to interrupt autopilot
  // (existing wheel handler already clears autoScrollIntervalId, autopilot timers are self-contained)

  // Execute remediation action with luxury sinusoidal easing traversal
  const handlePrimaryAction = () => {
    const timeStr = new Date().toTimeString().split(' ')[0];
    
    setActionFeedback(`${recommendation} A clear care summary has been prepared.`);
    setEventFeed(f => [{ id: Date.now(), time: timeStr, text: 'Care team notification prepared with the symptom summary.', type: 'success' }, ...f]);

    if (autoScrollIntervalId) clearInterval(autoScrollIntervalId);
    
    const startY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const targetY = maxScroll * 0.98;
    const startTime = Date.now();
    const duration = 2400; // Premium pacing curve

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        clearInterval(interval);
        setAutoScrollIntervalId(null);
        window.scrollTo(0, targetY);
      } else {
        const t = elapsed / duration;
        const easeInOutQuad = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const currentY = startY + (targetY - startY) * easeInOutQuad;
        window.scrollTo(0, currentY);
      }
    }, 16);

    setAutoScrollIntervalId(interval);
  };

  const handleSecondaryAction = (label) => {
    setActionFeedback(`Care note saved: ${label}. The guidance panel is still available.`);
  };


  // ---------------------------------------------------------
  // CLINICAL DICTIONARY & METRICS
  // ---------------------------------------------------------
  const isFailed = score >= 70 || (score >= 30 && currentChapter >= 2 && currentChapter <= 4);
  
  const metrics = {
    spo2: isFailed ? (score >= 70 ? '89%' : '93%') : '98%',
    spo2Trend: isFailed ? '↓' : '',
    spo2Spark: isFailed ? [98, 97, 95, 93, score >= 70 ? 90 : 94, score >= 70 ? 89 : 93, score >= 70 ? 89 : 93] : [98, 98, 97, 98, 98, 98],
    bpm: isFailed ? (score >= 70 ? '135' : '112') : '72',
    bpmTrend: isFailed ? '↑' : '',
    bpmSpark: isFailed ? [72, 85, 100, 112, score >= 70 ? 125 : 110, score >= 70 ? 135 : 112, score >= 70 ? 135 : 112] : [72, 73, 71, 72, 74, 72],
    resp: isFailed ? (score >= 70 ? '28' : '22') : '16',
    respTrend: isFailed ? '↑' : '',
    respSpark: isFailed ? [16, 18, 20, 22, score >= 70 ? 25 : 22, score >= 70 ? 28 : 22, score >= 70 ? 28 : 22] : [16, 15, 16, 16, 17, 16],
    statusStr: triageResponse ? activeRiskLabel.toUpperCase() : 'READY TO HELP',
    riskScore: `${score}/100`,
  };

  const topoNodes = [ 
    { id: 'node1', label: 'Share Symptoms' },
    { id: 'node2', label: 'Check Vitals' },
    { id: 'node3', label: 'Safety Review' },
    { id: 'node4', label: 'Care Guidance' }
  ];

  // Highly restrained, data-first ambient lighting interpolation style maps
  const getAmbientGlowStyle = () => {
    let color = 'rgba(6,182,212,0.03)'; // Base Clinical Cyan
    if (currentChapter >= 6) color = 'rgba(6,182,212,0.04)'; // Stable Cyan
    else if (currentChapter >= 5) color = 'rgba(16,185,129,0.04)'; // Emerald Recovery
    else if (currentChapter >= 3) color = 'rgba(217,119,6,0.06)'; // Deep Amber Medical Escalation
    else if (currentChapter >= 2) color = 'rgba(217,119,6,0.03)'; // Soft Amber Warning
    
    return {
      background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
      transform: `scale(${1 + scrollProgress * 0.012})`,
      transition: 'background 1.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s ease-out'
    };
  };

  // Restrained CSS-animated waveform for Voice Intake
  const VoiceWaveform = ({ active }) => {
    return (
      <div className="flex items-center justify-center space-x-1.5 h-8 px-4 rounded bg-[#0A0B10] border border-[#1A1D24]">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={`w-1 rounded-sm bg-[#06B6D4] transition-all duration-300 ease-in-out`}
            style={{
              height: active ? `${Math.random() * 60 + 20}%` : '20%',
              opacity: active ? 1 : 0.5,
              animation: active ? `pulseWave ${1 + (i * 0.2)}s infinite alternate` : 'none'
            }}
          />
        ))}
      </div>
    );
  };

    return (
    <div className="w-full bg-[#060609] text-[#EDEDEE] font-sans selection:bg-[#06B6D4] selection:text-white relative select-none antialiased">
      {/* ── PERSISTENT AMBIENT BACKGROUND (mounts once, never remounts) ── */}
      <AmbientBackground chapter={currentChapter} riskTone={riskTone} />

      {/* ── CINEMATIC INTRO GATE ─────────────────────────────── */}
      {!introComplete && <CinematicIntro onComplete={handleIntroComplete} />}
      <style>{`
        @keyframes pulseWave {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1.2); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.5s ease-out forwards;
        }
      `}</style>
      {/* App cross-dissolves in from black as intro completes */}
      <div
        className="w-full min-h-[700vh] relative"
        style={{
          opacity: appVisible ? 1 : 0,
          transition: appVisible ? 'opacity 1.4s cubic-bezier(0.16,1,0.3,1)' : 'none',
          // Sit above the 6 ambient background layers (z-index 0–5)
          position: 'relative',
          zIndex: 6,
        }}
      >
        <div className="sticky top-0 left-0 w-full h-screen overflow-hidden flex flex-col justify-between z-10 box-border">
          
          {/* Old static grid removed — AmbientBackground now owns this layer */}
          <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Ambient glow pulse — kept as a subtle chapter-reactive accent above AmbientBackground */}
            <div className="absolute top-1/6 left-1/4 w-[50rem] h-[50rem] rounded-full blur-[140px] pointer-events-none origin-center" style={getAmbientGlowStyle()} />
          </div>

          {/* UPPER ZONE: PREMIUM HEADER BANNER */}
          <header className="relative z-40 h-16 px-4 lg:px-8 border-b border-[#1A1D24] bg-[#060609]/90 backdrop-blur-xl flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-7 h-7 rounded bg-gradient-to-br from-[#06B6D4] to-[#10B981] p-[1px]">
                  <div className="w-full h-full bg-[#060609] rounded-[5px] flex items-center justify-center">
                    <Icons.Activity className="w-4 h-4 text-[#06B6D4]" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-bold tracking-tight text-white text-sm">PulseGuard <span className="text-[#06B6D4]">AI</span></span>
                  <span className="text-[9px] text-[#8A8F98] font-mono tracking-wider uppercase">Patient Support and Safe Triage</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-5 font-mono text-xs">
              <div className="hidden lg:flex items-center space-x-4 border-r border-[#1A1D24] pr-5">
                <span className="flex items-center space-x-1.5 text-[10px] bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded border border-[#10B981]/20">
                  <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse"></span>
                  <span>LANGUAGE HELP READY</span>
                </span>
                <span className="flex items-center space-x-1.5 text-[10px] bg-[#06B6D4]/10 text-[#06B6D4] px-2 py-0.5 rounded border border-[#06B6D4]/20">
                  <span className="w-1.5 h-1.5 bg-[#06B6D4] rounded-full animate-pulse"></span>
                  <span>VOICE INPUT READY</span>
                </span>
              </div>
              <div className="hidden lg:flex items-center space-x-2 text-[#8A8F98] pr-2">
                  <Icons.Clock className="w-3.5 h-3.5 text-[#06B6D4]" />
                  <span className="text-[#EDEDEE]">{systemClock || '03:47 UTC'}</span>
              </div>
            </div>
          </header>

          {/* UPPER ZONE: COMPACT CLINICAL TOPOLOGY STRIP */}
          <section className="relative z-30 h-14 px-4 lg:px-8 border-b border-[#1A1D24] bg-[#0A0A0F]/90 flex items-center justify-between shrink-0">
            <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-2 font-mono text-xs">
              
              <div className="flex items-center space-x-2 text-[#8A8F98] shrink-0 hidden sm:flex">
                <span className="text-[11px] font-bold text-white uppercase tracking-wider hidden lg:inline">Care Journey</span>
              </div>

              {/* Nodes Array */}
              <div className="flex-1 flex items-center justify-center max-w-3xl mx-auto px-4">
                {topoNodes.map((node, i) => (
                  <React.Fragment key={node.id}>
                    <button 
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`px-3 py-1.5 rounded-[4px] border text-[11px] transition-all font-mono whitespace-nowrap relative ${
                        selectedNodeId === node.id ? 'bg-[#1C1E25] border-[#06B6D4] text-white font-bold shadow-sm' : 'bg-[#0E0F14] border-[#1A1D24] text-[#8A8F98] hover:border-[#2A2E39]'
                      }`}
                    >
                      {(i === 1 || i === 2) && currentChapter >= 2 && currentChapter <= 4 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#D97706] border-2 border-[#0A0A0F]" />}
                      {node.label}
                    </button>
                    {i < topoNodes.length - 1 && (
                      <div className={`w-8 sm:w-16 h-[2px] relative transition-colors duration-500 mx-2 ${
                        (i === 0 || i === 1) && currentChapter >= 2 && currentChapter <= 4 ? 'bg-[#D97706]' : 'bg-[#2A2D35]'
                      }`}>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* State Chip */}
              <div className="shrink-0 flex items-center space-x-2">
                <span className={`px-2.5 py-1 rounded-[4px] text-[11px] font-bold tracking-wider uppercase border ${
                  riskTone === "high" ? 'bg-[#D97706]/10 text-[#D97706] border-[#D97706]/30' : riskTone === "medium" ? 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30' : 'bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/30'
                }`}>
                  {metrics.statusStr}
                </span>
              </div>

            </div>
          </section>

          {/* DYNAMIC NARRATIVE CORE CONTAINMENT ZONE */}
          <main className="relative z-20 flex-1 w-full max-w-6xl mx-auto px-4 lg:px-8 py-6 flex flex-col justify-center items-center overflow-y-auto box-border">
            
            {/* CHAPTER 1: PATIENT VOICE INTAKE */}
            {currentChapter === 1 && (
              <div className="w-full animate-fade-in">
                <VoiceIntakeModule
                  patientMessage={patientMessage}
                  setPatientMessage={setPatientMessage}
                  triageLoading={triageLoading}
                  triageError={triageError}
                  submitTriage={submitTriage}
                />
              </div>
            )}

            {/* CHAPTER 2: SYMPTOM ESCALATION */}
            {currentChapter === 2 && (
              <div className="w-full max-w-5xl animate-fade-in space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white tracking-tight">Your Symptoms Are Being Reviewed</h2>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* SpO2 Card */}
                  <div className="lg:col-span-4 p-6 rounded-xl bg-[#0A0B10] border border-[#D97706]/40 flex flex-col justify-between shadow-sm">
                    <span className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#8A8F98]">Oxygen Saturation (SpO2)</span>
                    <div className="my-6 flex items-baseline space-x-2">
                      <span className="text-6xl font-bold text-white">{metrics.spo2}</span>
                      <span className="text-2xl text-[#D97706] font-bold">{metrics.spo2Trend}</span>
                    </div>
                    <Sparkline data={metrics.spo2Spark} color="#D97706" className="mt-auto" />
                  </div>
                  
                  {/* Audit Trail Log */}
                  <div className="lg:col-span-8 bg-[#0A0B10] border border-[#1A1D24] rounded-xl p-5 font-mono text-[11px] flex flex-col h-[280px]">
                    <div className="text-[#8A8F98] pb-3 border-b border-[#1A1D24] mb-3 font-bold uppercase tracking-widest">Care Review Notes</div>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                      {terminalLogs.map((log) => (
                        <div key={log.id} className="flex items-start space-x-3 text-[#D1D5DB] leading-relaxed border-l-2 pl-3 border-[#1A1D24]">
                          <span className="text-[#8A8F98] shrink-0 w-12">{log.time}</span>
                          <span className={`shrink-0 font-bold w-24 ${log.label === '[URGENT]' ? 'text-[#D97706]' : 'text-[#06B6D4]'}`}>{log.label}</span>
                          <span className="text-white">{log.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 3: AI TRIAGE ACTIVATION - THE 12 COLUMN DASHBOARD REWRITE */}
            {currentChapter === 3 && (
              <div className="w-full animate-fade-in flex flex-col h-full space-y-6">
                <div className="text-center shrink-0">
                  <h2 className="text-3xl font-bold text-white tracking-tight">Safe AI Symptom Guidance</h2>
                </div>
                
                <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-0">
                  
                  {/* LEFT COLUMN: 3 ACTIVE VITALS */}
                  <div className="lg:col-span-3 flex flex-col space-y-3 min-h-0">
                    <div className="flex-1 p-4 rounded-xl bg-[#0A0B10] border border-[#D97706]/40 flex flex-col justify-between">
                      <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">SpO2 Level</span>
                      <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-bold text-white">{metrics.spo2}</span>
                        <span className="text-lg text-[#D97706] font-bold">{metrics.spo2Trend}</span>
                      </div>
                      <Sparkline data={metrics.spo2Spark} color="#D97706" className="mt-1" />
                    </div>
                    <div className="flex-1 p-4 rounded-xl bg-[#0A0B10] border border-[#D97706]/40 flex flex-col justify-between">
                      <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">Heart Rate</span>
                      <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-bold text-white">{metrics.bpm}</span>
                        <span className="text-xs text-[#8A8F98] ml-1">bpm</span>
                        <span className="text-lg text-[#D97706] font-bold">{metrics.bpmTrend}</span>
                      </div>
                      <Sparkline data={metrics.bpmSpark} color="#D97706" className="mt-1" />
                    </div>
                    <div className="flex-1 p-4 rounded-xl bg-[#0A0B10] border border-[#D97706]/40 flex flex-col justify-between">
                      <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">Resp Rate</span>
                      <div className="flex items-baseline space-x-1">
                        <span className="text-4xl font-bold text-white">{metrics.resp}</span>
                        <span className="text-xs text-[#8A8F98] ml-1">bpm</span>
                        <span className="text-lg text-[#D97706] font-bold">{metrics.respTrend}</span>
                      </div>
                      <Sparkline data={metrics.respSpark} color="#D97706" className="mt-1" />
                    </div>
                  </div>

                  {/* CENTER COLUMN: DOMINANT AI REASONING STACK */}
                  <div className="lg:col-span-6 flex flex-col space-y-4 min-h-0 justify-center px-2">
                    {/* Reasoning Block 1 */}
                    <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] opacity-0 animate-fade-in-up" style={{ animationDelay: '0.1s', animationFillMode: 'both' }}>
                      <div className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase pb-2 border-b border-[#1A1D24]">Step 01 - Symptoms Shared</div>
                      <p className="text-sm text-white font-medium leading-relaxed pt-3">{patientMessage}</p>
                    </div>
                    
                    {/* Reasoning Block 2 */}
                    <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] opacity-0 animate-fade-in-up" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
                      <div className="text-[10px] font-mono font-bold text-[#06B6D4] uppercase pb-2 border-b border-[#1A1D24]">Step 02 - Safety Check</div>
                      <p className="text-sm text-white font-medium leading-relaxed pt-3">Care urgency score is <strong className="text-[#06B6D4] text-base">{score}/100</strong>. Language: {language}. Medical references checked: {ragChunks}.</p>
                    </div>
                    
                    {/* Reasoning Block 3 */}
                    <div className="p-6 rounded-xl bg-[#140D0A] border-2 border-[#D97706] shadow-sm opacity-0 animate-fade-in-up" style={{ animationDelay: '1.2s', animationFillMode: 'both' }}>
                      <div className="text-[11px] font-mono font-bold text-[#D97706] uppercase pb-2 border-b border-[#D97706]/30 flex items-center space-x-2">
                        <span className="w-2 h-2 bg-[#D97706] rounded-full animate-pulse"></span>
                        <span>Step 03 - Suggested Next Step</span>
                      </div>
                      <p className="text-lg text-white font-bold leading-relaxed pt-3">{clinicalSummary}</p>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: SEVERITY ESCALATION ROUTING */}
                  <div className="lg:col-span-3 flex flex-col space-y-3 min-h-0">
                    <div className="w-full text-center py-2 mb-2 border-b border-[#1A1D24]">
                       <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase tracking-widest">Care Level</span>
                    </div>
                    <div className="p-4 rounded-xl bg-[#0A0B10] border border-[#1A1D24] opacity-40 flex items-center space-x-3">
                      <div className="w-1.5 h-full bg-[#8A8F98] rounded-sm absolute left-0 top-0 bottom-0"></div>
                      <div>
                        <span className="text-[#8A8F98] text-[10px] font-mono font-bold tracking-widest block uppercase">Low Risk</span>
                        <span className="text-white text-xs">Self-care guidance</span>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[#0A0B10] border border-[#1A1D24] opacity-40 flex items-center space-x-3">
                      <div className="w-1.5 h-full bg-[#F59E0B] rounded-sm absolute left-0 top-0 bottom-0"></div>
                      <div>
                        <span className="text-[#F59E0B] text-[10px] font-mono font-bold tracking-widest block uppercase">Medium Risk</span>
                        <span className="text-white text-xs">Consider clinician advice</span>
                      </div>
                    </div>
                    <div className="p-5 rounded-xl bg-[#140C07] border border-[#D97706] flex flex-col justify-center transform scale-[1.02] relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[#D97706]"></div>
                      <span className="text-[#D97706] text-[11px] font-mono font-bold tracking-widest block uppercase mb-1 flex items-center space-x-2">
                        <span className="w-1.5 h-1.5 bg-[#D97706] rounded-full animate-pulse"></span>
                        <span>High Risk</span>
                      </span>
                      <span className="text-white font-bold text-sm">{activeRiskLabel}</span>
                      <span className="text-[#D97706]/80 text-xs mt-2 italic font-mono">{triageResponse?.topology_stage || "review pending"}</span>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* CHAPTER 4: EMERGENCY RISK ASSESSMENT */}
            {currentChapter === 4 && (
              <div className="w-full max-w-4xl animate-fade-in space-y-6">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white tracking-tight">Recommended Level of Care</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* LOW */}
                  <div className="p-6 rounded-xl bg-[#0A0B10] border border-[#1A1D24] opacity-40 flex flex-col">
                    <span className="text-[#8A8F98] text-[11px] font-mono font-bold tracking-widest mb-2 uppercase">Care level: Low</span>
                    <h4 className="text-white font-bold text-lg mb-2">Home Monitoring</h4>
                    <p className="text-[#8A8F98] text-xs">Symptoms may be suitable for home care and monitoring, with medical advice if they worsen.</p>
                  </div>
                  {/* MED */}
                  <div className="p-6 rounded-xl bg-[#0A0B10] border border-[#1A1D24] opacity-40 flex flex-col">
                    <span className="text-[#F59E0B] text-[11px] font-mono font-bold tracking-widest mb-2 uppercase">Care level: Medium</span>
                    <h4 className="text-white font-bold text-lg mb-2">Talk to a Clinician</h4>
                    <p className="text-[#8A8F98] text-xs">Some symptoms may need a healthcare professional's advice soon.</p>
                  </div>
                  {/* HIGH */}
                  <div className="p-6 rounded-xl bg-[#140C07] border border-[#D97706] shadow-sm flex flex-col transform scale-105 z-10 relative overflow-hidden">
                     <div className="absolute top-0 left-0 w-full h-1 bg-[#D97706]" />
                    <span className="text-[#D97706] text-xs font-mono font-bold tracking-widest mb-2 uppercase flex items-center space-x-2 pt-2">
                      <span className="w-2 h-2 bg-[#D97706] rounded-full animate-pulse"></span>
                      <span>Care level: High</span>
                    </span>
                    <h4 className="text-white font-extrabold text-2xl mb-3 leading-tight">Seek Urgent Help Now</h4>
                    <p className="text-[#FCD34D] text-sm leading-relaxed">{recommendation}</p>
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 5: PHYSICIAN ESCALATION */}
            {currentChapter === 5 && (
              <div className="w-full max-w-5xl animate-fade-in space-y-6">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white tracking-tight">Prepare a Care Summary</h2>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                  {/* Tabular Timeline */}
                  <div className="flex-1 p-6 rounded-xl bg-[#0A0B10] border border-[#1A1D24]">
                    <div className="text-[11px] font-mono font-bold text-[#8A8F98] uppercase pb-3 border-b border-[#1A1D24] mb-4 tracking-widest">Symptom Review Timeline</div>
                    <table className="w-full text-xs font-mono text-left">
                      <tbody className="divide-y divide-[#1A1D24]">
                        <tr>
                          <td className="py-3 text-[#8A8F98] w-24">14:13 UTC</td>
                          <td className="py-3 text-[#D97706] font-bold w-28">[URGENT]</td>
                          <td className="py-3 text-[#EDEDEE]">Patient message submitted to /api/chat</td>
                        </tr>
                        <tr>
                          <td className="py-3 text-[#8A8F98]">14:16 UTC</td>
                          <td className="py-3 text-[#D97706] font-bold">[REVIEW]</td>
                          <td className="py-3 text-[#EDEDEE]">Risk score computed at {score}/100</td>
                        </tr>
                        <tr>
                          <td className="py-3 text-[#8A8F98]">14:18 UTC</td>
                          <td className="py-3 text-[#06B6D4] font-bold">[CARE]</td>
                          <td className="py-3 text-[#EDEDEE]">Care level marked as {activeRiskLabel}</td>
                        </tr>
                        <tr>
                          <td className="py-3 text-[#10B981]">14:20 UTC</td>
                          <td className="py-3 text-[#10B981] font-bold">[SYSTEM]</td>
                          <td className="py-3 text-[#10B981] animate-pulse">{recommendation}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Action Block */}
                  <div className="flex-1 p-8 rounded-xl bg-[#060B10] border border-[#06B6D4]/40 flex flex-col justify-center space-y-6">
                    <span className="text-[#06B6D4] font-mono font-bold text-[11px] tracking-widest uppercase">Care Action</span>
                    <button onClick={handlePrimaryAction} className="w-full py-4 rounded bg-white hover:bg-[#EDEDEE] text-[#060609] font-bold text-base transition-colors shadow-sm tracking-tight">
                      Share Summary with Care Team
                    </button>
                    <button
                      onClick={() => setShowReport(true)}
                      className="w-full py-3 rounded font-bold text-sm transition-all tracking-tight"
                      style={{
                        background: triageResponse ? 'linear-gradient(135deg,#00D1FF18,#10B98118)' : '#0A0B10',
                        border: `1px solid ${triageResponse ? '#00D1FF40' : '#1A1D24'}`,
                        color: triageResponse ? '#00D1FF' : '#4B5563',
                        cursor: triageResponse ? 'pointer' : 'default',
                      }}
                      disabled={!triageResponse}
                    >
                      {triageResponse ? '⬡ Generate Intelligence Report' : 'Run triage to generate report'}
                    </button>
                    {actionFeedback && <div className="p-4 rounded bg-[#0A0B10] border border-[#1A1D24] font-mono text-[11px] text-[#10B981] text-center">{actionFeedback}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* CHAPTER 6: HEALTHCARE COMMAND CENTER */}
            {currentChapter === 6 && (
              <div className="w-full max-w-6xl animate-fade-in space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">Active Triage Cases</span>
                    <span className="text-4xl font-bold text-white mt-3">{triageResponse ? 1 : 0} <span className="text-sm text-[#10B981] font-normal tracking-tight ml-1">{triageResponse ? "live case" : "pending"}</span></span>
                  </div>
                  <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">Patient SpO2 Avg</span>
                    <div className="mt-3 flex items-baseline space-x-1.5">
                      <span className="text-4xl font-bold text-[#10B981]">{metrics.spo2}</span>
                      <span className="text-xs text-[#8A8F98]">{activeRiskLabel}</span>
                    </div>
                  </div>
                  <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">Patient BPM Avg</span>
                    <span className="text-4xl font-bold text-white mt-3">{metrics.bpm}</span>
                  </div>
                  <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] flex flex-col justify-between shadow-sm">
                    <span className="text-[10px] font-mono font-bold text-[#8A8F98] uppercase">Current Risk Index</span>
                    <span className="text-4xl font-bold text-white mt-3">{metrics.riskScore}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                  <div className="md:col-span-7 space-y-5 font-mono text-sm text-left">
                    <div className="p-6 rounded-xl bg-[#0A0B10] border border-[#1A1D24] shadow-sm">
                      <span className="text-xs text-[#06B6D4] uppercase block mb-3 font-bold tracking-widest">Care Summary</span>
                      <p className="text-[13px] text-[#D1D5DB] leading-relaxed">
                        {clinicalSummary}
                      </p>
                    </div>
                    <div className="p-6 rounded-xl bg-[#0A0B10] border border-[#1A1D24] shadow-sm">
                      <span className="text-xs text-[#06B6D4] uppercase block mb-3 font-bold tracking-widest">Guidance</span>
                      <p className="text-[13px] text-[#D1D5DB] leading-relaxed">{guidance}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] shadow-sm">
                        <span className="text-[10px] text-[#8A8F98] uppercase block mb-3 font-bold tracking-widest">Helpful Notes</span>
                        {(triageResponse?.operational_insights || ["Run symptom review to populate helpful care notes."]).map((item) => (
                          <p key={item} className="text-[11px] text-[#D1D5DB] leading-relaxed mb-2">{item}</p>
                        ))}
                      </div>
                      <div className="p-5 rounded-xl bg-[#0A0B10] border border-[#1A1D24] shadow-sm">
                        <span className="text-[10px] text-[#8A8F98] uppercase block mb-3 font-bold tracking-widest">Safety Actions</span>
                        {(triageResponse?.safety_actions || ["Safety actions will appear after the symptom review completes."]).map((item) => (
                          <p key={item} className="text-[11px] text-[#D1D5DB] leading-relaxed mb-2">{item}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-5 rounded-xl overflow-hidden" style={{ height: 380 }}>
                    <CopilotChat
                      triageResponse={triageResponse}
                      patientMessage={patientMessage}
                    />
                  </div>
                </div>

                {/* Remove MedicalReportPreview inline embed — replaced by ClinicalReport overlay button */}
              </div>
            )}
          </main>

          {/* LOWER ZONE: HIGH-END COMPACT REPLAY DESK SCRUBBER */}
          <footer className="relative z-40 h-12 px-4 lg:px-8 border-t border-[#1A1D24] bg-[#0A0A0F] text-[11px] font-mono text-[#8A8F98] flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-white font-bold text-[10px] uppercase">Care Journey:</span>
              <span className="text-[10px] hidden md:inline text-[#4B5563]">Move through intake, review, guidance, and summary</span>
            </div>
            
            <div className="flex items-center space-x-1">
              {[
                { label: "Ch 1: Intake", prog: 0.05 },
                { label: "Ch 2: Review", prog: 0.20 },
                { label: "Ch 3: Guidance", prog: 0.40 },
                { label: "Ch 4: Care Level", prog: 0.60 },
                { label: "Ch 5: Care Team", prog: 0.80 },
                { label: "Ch 6: Summary", prog: 0.98 }
              ].map((sch, i) => (
                <button
                  key={i}
                  onClick={() => scrollToChapterOffset(sch.prog)}
                  className={`px-2.5 py-1 rounded-[4px] text-[10px] font-bold font-mono transition-colors hidden sm:inline-block ${
                    currentChapter === (i + 1) ? 'bg-[#EDEDEE] text-[#060609]' : 'text-[#8A8F98] hover:text-white'
                  }`}
                >
                  {sch.label}
                </button>
              ))}
            </div>
          </footer>
        </div>
      </div>

      {/* ── CLINICAL INTELLIGENCE REPORT OVERLAY ── */}
      {showReport && (
        <ClinicalReport
          triageResponse={triageResponse}
          patientMessage={patientMessage}
          metrics={metrics}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* ── AI ANALYSIS BANNER — slim, non-blocking, shows during triage call ── */}
      {triageProcessing && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          zIndex: 850, width: 'min(520px, 92vw)',
          background: 'rgba(7,11,17,0.96)', backdropFilter: 'blur(16px)',
          border: '1px solid #00D1FF30', borderRadius: 14,
          padding: '14px 20px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,209,255,0.08)',
          animation: 'ai-banner-in 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <style>{`
            @keyframes ai-banner-in { from{opacity:0;transform:translateX(-50%) translateY(16px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
            @keyframes ai-pulse-dot { 0%,100%{opacity:0.3} 50%{opacity:1} }
          `}</style>

          {/* Top row: label + live step */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="#00D1FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 700,
                color: '#00D1FF', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                PulseGuard AI · Clinical Analysis
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#00D1FF',
                  animation: `ai-pulse-dot 1.2s ${i*0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>
          </div>

          {/* Step list */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
            {[
              'Extracting symptom patterns',
              'Retrieving medical context',
              'Assessing escalation risk',
              'Generating care guidance',
            ].map((step, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                opacity: i <= processStep ? 1 : 0.28,
                transition: 'opacity 0.45s ease',
                padding: '3px 0',
                fontFamily: 'monospace', fontSize: 10,
                color: i < processStep ? '#10B981' : i === processStep ? '#00D1FF' : '#4B5A6E',
              }}>
                <div style={{
                  width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                  border: `1px solid ${i < processStep ? '#10B981' : i === processStep ? '#00D1FF' : '#1C2333'}`,
                  background: i < processStep ? '#10B981' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {i < processStep
                    ? <span style={{ fontSize: 7, color: '#060609', lineHeight: 1 }}>✓</span>
                    : i === processStep
                      ? <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#00D1FF', display: 'block' }} />
                      : null}
                </div>
                <span>{step}</span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 12, height: 2, background: '#1C2333', borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 1,
              background: 'linear-gradient(90deg, #00D1FF, #10B981)',
              width: `${Math.round((processStep / 3) * 100)}%`,
              transition: 'width 0.9s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
        </div>
      )}


    </div>
  );
};

export default App;

