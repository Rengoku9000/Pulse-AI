import * as React from "react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const LANGS = [
  { code: "en-IN", label: "EN", name: "English" },
  { code: "hi-IN", label: "HI", name: "Hindi" },
  { code: "kn-IN", label: "KN", name: "Kannada" },
  { code: "ta-IN", label: "TA", name: "Tamil" },
  { code: "te-IN", label: "TE", name: "Telugu" },
];

const IDLE_HINTS = [
  "Need help with your symptoms?",
  "You can speak naturally.",
  "Voice triage available.",
  "Ask me anything clinical.",
];

const STEPS = [
  "Extracting symptom context…",
  "Retrieving medical guidance…",
  "Synthesizing response…",
];

const C = {
  bg:      "#070B11",
  surface: "#0D1117",
  border:  "#1C2333",
  cyan:    "#00D1FF",
  em:      "#10B981",
  amber:   "#F59E0B",
  muted:   "#8B97AA",
  dim:     "#4B5A6E",
};

/* ── Block parser for structured AI output ── */
const BLOCK_RE = /\[(OBSERVATION|RISK SIGNALS?|RECOMMENDATION|DISCLAIMER|FOLLOW.?UP)\]/gi;
function parseBlocks(text) {
  if (!BLOCK_RE.test(text)) return null;
  BLOCK_RE.lastIndex = 0;
  const parts = text.split(/(\[[A-Z ]+\])/i).filter(Boolean);
  const out = [];
  let label = null;
  for (const p of parts) {
    if (/^\[[A-Z ]+\]$/i.test(p)) { label = p.replace(/[\[\]]/g,"").trim(); }
    else if (label) { out.push({ label, content: p.trim() }); label = null; }
    else if (p.trim()) { out.push({ label: null, content: p.trim() }); }
  }
  return out;
}

const BLOCK_COLORS = {
  "OBSERVATION":   ["#00D1FF15","#00D1FF30","#00D1FF"],
  "RISK SIGNALS":  ["#F59E0B15","#F59E0B30","#F59E0B"],
  "RISK SIGNAL":   ["#F59E0B15","#F59E0B30","#F59E0B"],
  "RECOMMENDATION":["#10B98115","#10B98130","#10B981"],
  "DISCLAIMER":    ["#1A1D24","#2A2D35","#4B5A6E"],
  "FOLLOW-UP":     ["#7C3AED15","#7C3AED30","#A78BFA"],
  "FOLLOW UP":     ["#7C3AED15","#7C3AED30","#A78BFA"],
};

/* ── Live canvas waveform ── */
function Waveform({ stream, active }) {
  const ref = React.useRef(null);
  const raf = React.useRef(null);
  React.useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!stream || !active) {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      const bars=18, bw=Math.floor(canvas.width/bars)-2;
      for(let i=0;i<bars;i++){
        ctx.fillStyle="rgba(0,209,255,0.18)";
        ctx.beginPath(); ctx.roundRect(i*(bw+2),(canvas.height-4)/2,bw,4,2); ctx.fill();
      }
      return;
    }
    const ac = new (window.AudioContext||window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser(); an.fftSize=64;
    src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const bars=18, bw=Math.floor(canvas.width/bars)-2;
    const draw=()=>{
      raf.current=requestAnimationFrame(draw);
      an.getByteFrequencyData(buf);
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for(let i=0;i<bars;i++){
        const v=buf[Math.floor(i*buf.length/bars)]/255;
        const h=Math.max(3,v*canvas.height*0.8);
        ctx.fillStyle=`rgba(0,209,255,${0.4+v*0.6})`;
        ctx.shadowColor="#00D1FF"; ctx.shadowBlur=v*8;
        ctx.beginPath(); ctx.roundRect(i*(bw+2),(canvas.height-h)/2,bw,h,2); ctx.fill();
      }
    };
    draw();
    return ()=>{ cancelAnimationFrame(raf.current); ac.close(); };
  },[stream,active]);
  return <canvas ref={ref} width={180} height={32} style={{display:"block",borderRadius:4}} />;
}

/* ── Single message renderer ── */
function Msg({ m, streaming }) {
  const isAI = m.sender==="ai";
  const blocks = isAI && m.text ? parseBlocks(m.text) : null;
  if (!isAI) return (
    <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
      <div style={{background:"#1C2333",border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",maxWidth:"82%",fontFamily:"monospace",fontSize:11,color:"#fff",lineHeight:1.65}}>
        {m.text}
      </div>
    </div>
  );
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
        <div style={{width:18,height:18,borderRadius:"50%",background:"#00D1FF18",border:"1px solid #00D1FF40",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#00D1FF"/><circle cx="12" cy="12" r="10" stroke="#00D1FF" strokeWidth="1.5" strokeDasharray="3 3"/></svg>
        </div>
        <span style={{fontFamily:"monospace",fontSize:8,color:"#00D1FF",fontWeight:700,letterSpacing:"0.1em"}}>PULSEGUARD AI</span>
        <span style={{fontFamily:"monospace",fontSize:8,color:C.dim,marginLeft:"auto"}}>{m.time}</span>
      </div>
      <div style={{paddingLeft:24}}>
        {blocks ? blocks.map((b,i)=>{
          const [bg,br,lc]=BLOCK_COLORS[b.label?.toUpperCase()]||BLOCK_COLORS["DISCLAIMER"];
          return b.label
            ? <div key={i} style={{background:bg,border:`1px solid ${br}`,borderRadius:6,padding:"6px 10px",marginBottom:4}}>
                <div style={{fontFamily:"monospace",fontSize:8,fontWeight:700,color:lc,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:3}}>[{b.label}]</div>
                <div style={{fontSize:11,color:"#D1D5DB",lineHeight:1.65,whiteSpace:"pre-wrap"}}>{b.content}</div>
              </div>
            : b.content && <p key={i} style={{fontSize:11,color:"#D1D5DB",lineHeight:1.65,margin:"0 0 4px"}}>{b.content}</p>;
        }) : (
          <div style={{background:"#060609",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
            <span style={{fontFamily:"monospace",fontSize:11,color:"#D1D5DB",lineHeight:1.65,whiteSpace:"pre-wrap"}}>{m.text}</span>
            {streaming && <span style={{color:"#00D1FF",animation:"fc-blink 0.8s steps(1) infinite"}}>▌</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════ */
export default function FloatingCopilot({ triageResponse, patientMessage }) {
  const [open, setOpen]         = React.useState(false);
  const [input, setInput]       = React.useState("");
  const [msgs, setMsgs]         = React.useState([{
    id:1, sender:"ai", time: ts(),
    text:"⚡ PulseGuard AI online. Describe symptoms or ask anything — I support text and voice.",
  }]);
  const [streaming,setStreaming] = React.useState(false);
  const [streamId,setStreamId]  = React.useState(null);
  const [thinking,setThinking]  = React.useState(false);
  const [thinkStep,setThinkStep]= React.useState(0);
  const [listening,setListening]= React.useState(false);
  const [micStream,setMicStream]= React.useState(null);
  const [langIdx,setLangIdx]    = React.useState(0);
  const [hintIdx,setHintIdx]    = React.useState(0);
  const [showHint,setShowHint]  = React.useState(false);
  // TTS voice state
  const [aiSpeaking,setAiSpeaking]   = React.useState(false);
  const [autoListen,setAutoListen]   = React.useState(false);
  const [subtitle,setSubtitle]       = React.useState("");

  const bottomRef   = React.useRef(null);
  const abortRef    = React.useRef(null);
  const recogRef    = React.useRef(null);
  const streamRef   = React.useRef(null);
  const thinkRef    = React.useRef(null);
  const hintTimer   = React.useRef(null);
  const uttRef      = React.useRef(null);

  function ts() { return new Date().toISOString().split("T")[1].slice(0,5); }

  /* scroll */
  React.useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,thinking]);

  /* idle hint cycle */
  React.useEffect(()=>{
    if (open) { clearInterval(hintTimer.current); setShowHint(false); return; }
    hintTimer.current = setInterval(()=>{
      setShowHint(true);
      setTimeout(()=>setShowHint(false),3200);
      setHintIdx(i=>(i+1)%IDLE_HINTS.length);
    }, 8000);
    return ()=>clearInterval(hintTimer.current);
  },[open]);

  /* inject triage context */
  React.useEffect(()=>{
    if (!triageResponse) return;
    const m = {
      id:Date.now(), sender:"ai", time:ts(),
      text:`[OBSERVATION]\nTriage complete. Risk: ${triageResponse.emergency_score}/100 — ${triageResponse.risk_level}.\n\n[RISK SIGNALS]\n${triageResponse.clinical_summary}\n\n[RECOMMENDATION]\n${triageResponse.emergency_recommendation}\n\n[DISCLAIMER]\n${triageResponse.disclaimer}`,
    };
    setMsgs(p=>[...p,m]);
    if (!open) setOpen(true);
  },[triageResponse]);

  /* cleanup */
  React.useEffect(()=>()=>{
    abortRef.current?.abort();
    stopMic(true);
    stopSpeech();
    clearInterval(thinkRef.current);
  },[]);

  /* ── TTS ── */
  const stopSpeech = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setAiSpeaking(false); setSubtitle("");
  };

  const speakText = React.useCallback((text) => {
    if (!window.speechSynthesis || !text) return;
    // Strip markdown block labels for clean speech
    const clean = text
      .replace(/\[(OBSERVATION|RISK SIGNALS?|RECOMMENDATION|DISCLAIMER|FOLLOW.?UP)\]/gi,"")
      .replace(/[\*_`#>]/g,"")
      .replace(/\s+/g," ").trim()
      .slice(0,600); // cap to keep response snappy
    stopSpeech();
    const utt = new SpeechSynthesisUtterance(clean);
    // Pick the best available English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v=>/Google.*English|Microsoft.*Natural|en-IN/i.test(v.name))
                   || voices.find(v=>v.lang.startsWith("en"))
                   || voices[0];
    if (preferred) utt.voice = preferred;
    utt.rate  = 0.92; utt.pitch = 0.95; utt.volume = 1;
    utt.onstart  = () => { setAiSpeaking(true); setSubtitle(clean); };
    utt.onend    = () => {
      setAiSpeaking(false); setSubtitle("");
      // Auto-listen: restart mic after AI finishes speaking
      if (autoListen) setTimeout(()=>toggleMic(),400);
    };
    utt.onerror  = () => { setAiSpeaking(false); setSubtitle(""); };
    uttRef.current = utt;
    window.speechSynthesis.speak(utt);
  },[autoListen]);

  /* ── MIC ── */
  const stopMic = (silent=false) => {
    if (recogRef.current) { try{recogRef.current.stop();}catch(_){} recogRef.current=null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
    setMicStream(null); setListening(false);
  };

  const toggleMic = async () => {
    if (listening) { stopMic(); return; }
    // Stop AI speech when user wants to speak
    stopSpeech();
    const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio:true}); streamRef.current=stream; setMicStream(stream); }
    catch { return; }
    const r = new SR();
    r.lang = LANGS[langIdx].code; r.continuous=true; r.interimResults=true;
    r.onresult = e => {
      let final="", interim="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) final+=e.results[i][0].transcript+" ";
        else interim=e.results[i][0].transcript;
      }
      if(final.trim()) setInput(p=>(p+" "+final).trim());
      else if(interim) setSubtitle(interim); // show interim as subtitle
    };
    r.onend = () => { setSubtitle(""); };
    r.onerror = ()=>{ stopMic(true); setSubtitle(""); };
    r.start(); recogRef.current=r; setListening(true);
  };

  /* ── SEND ── */
  const send = async (text) => {
    if (!text.trim() || streaming) return;
    const userMsg = {id:Date.now(),sender:"user",text:text.trim(),time:ts()};
    const updated = [...msgs, userMsg];
    setMsgs(updated); setInput(""); stopMic();

    /* thinking animation */
    setThinking(true); setThinkStep(0);
    thinkRef.current = setInterval(()=>setThinkStep(s=>s<2?s+1:s),800);

    const aiId = Date.now()+1;
    const placeholder = {id:aiId,sender:"ai",text:"",time:ts()};

    try {
      abortRef.current = new AbortController();
      const history = updated.slice(-12).map(m=>({role:m.sender==="user"?"user":"assistant",content:m.text}));
      const ctxNote = triageResponse
        ? `Risk ${triageResponse.emergency_score}/100, level "${triageResponse.risk_level}", patient: "${patientMessage}"`
        : patientMessage ? `Patient: "${patientMessage}"` : "";

      const res = await fetch(`${API_URL}/copilot`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal:abortRef.current.signal,
        body:JSON.stringify({history,context_note:ctxNote,system_hint:""}),
      });

      clearInterval(thinkRef.current); setThinking(false);
      if (!res.ok) throw new Error(`API ${res.status}`);

      setStreaming(true); setStreamId(aiId);
      setMsgs(p=>[...p,placeholder]);

      const reader = res.body.getReader(); const dec = new TextDecoder();
      let acc="";
      while(true){
        const {done,value}=await reader.read(); if(done) break;
        for(const line of dec.decode(value,{stream:true}).split("\n")){
          if(line.startsWith("data: ")){
            const tok=line.slice(6); if(tok==="[DONE]") break;
            acc+=tok;
            setMsgs(p=>p.map(m=>m.id===aiId?{...m,text:acc}:m));
          }
        }
      }
      // Speak the completed response
      speakText(acc);
    } catch(err) {
      clearInterval(thinkRef.current); setThinking(false);
      if(err.name==="AbortError") return;
      const fallback = triageResponse
        ? `[OBSERVATION]\nCopilot offline.\n\n[RECOMMENDATION]\n${triageResponse.emergency_recommendation}\n\n[DISCLAIMER]\nConnect backend for live AI.`
        : "[OBSERVATION]\nBackend unreachable.\n\n[RECOMMENDATION]\nCheck VITE_API_URL configuration.";
      setMsgs(p=>{
        const base=p.some(m=>m.id===aiId)?p.filter(m=>m.id!==aiId):p;
        return [...base,{id:aiId,sender:"ai",text:fallback,time:ts()}];
      });
      speakText("I'm having trouble connecting right now. Please check your network.");
    } finally {
      setStreaming(false); setStreamId(null);
    }
  };

  const QUICK = ["What are the risk signals?","Should I escalate?","What follow-up to ask?"];

  /* ══ RENDER ══════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes fc-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes fc-orb{0%,100%{box-shadow:0 0 0 0 rgba(0,209,255,0.3),0 4px 24px rgba(0,0,0,0.5)}50%{box-shadow:0 0 0 10px rgba(0,209,255,0),0 4px 24px rgba(0,0,0,0.5)}}
        @keyframes fc-orb-speak{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5),0 4px 24px rgba(0,0,0,0.5)}50%{box-shadow:0 0 0 14px rgba(16,185,129,0),0 4px 24px rgba(0,0,0,0.5)}}
        @keyframes fc-open{from{opacity:0;transform:scale(0.88) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes fc-hint{0%{opacity:0;transform:translateY(4px)}15%,85%{opacity:1;transform:translateY(0)}100%{opacity:0}}
        @keyframes fc-dot{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        @keyframes fc-wave{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}
        .fc-scroll::-webkit-scrollbar{width:3px}
        .fc-scroll::-webkit-scrollbar-thumb{background:#1C2333;border-radius:2px}
      `}</style>

      {/* ── IDLE HINT ── */}
      {!open && showHint && (
        <div style={{
          position:"fixed",bottom:90,right:24,zIndex:998,
          background:"rgba(13,17,23,0.95)",border:`1px solid ${C.border}`,
          borderRadius:10,padding:"8px 14px",
          fontFamily:"monospace",fontSize:11,color:C.muted,
          animation:"fc-hint 3.2s ease forwards",pointerEvents:"none",
          maxWidth:220,textAlign:"center",
        }}>
          {IDLE_HINTS[hintIdx]}
        </div>
      )}

      {/* ── FLOATING ORB ── */}
      <button
        onClick={()=>{ stopSpeech(); setOpen(o=>!o); }}
        aria-label="Open AI Copilot"
        style={{
          position:"fixed",bottom:24,right:24,zIndex:999,
          width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",
          background: aiSpeaking
            ? "linear-gradient(135deg,#10B98130,#00D1FF18)"
            : "linear-gradient(135deg,#00D1FF22,#10B98122)",
          backdropFilter:"blur(12px)",
          outline:`1px solid ${aiSpeaking ? C.em : C.cyan}40`,
          display:"flex",alignItems:"center",justifyContent:"center",
          animation: aiSpeaking ? "fc-orb-speak 1.2s ease-in-out infinite" : "fc-orb 2.4s ease-in-out infinite",
          transition:"background 0.4s ease, transform 0.2s ease",
        }}
        onMouseEnter={e=>e.currentTarget.style.transform="scale(1.1)"}
        onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}
      >
        {/* Animated bars when AI speaking */}
        {aiSpeaking && !open ? (
          <div style={{display:"flex",alignItems:"center",gap:2}}>
            {[0,1,2,3,4].map(i=>(
              <div key={i} style={{
                width:3,height:16,borderRadius:2,background:C.em,
                animation:`fc-wave 0.8s ${i*0.1}s ease-in-out infinite`,
                transformOrigin:"center",
              }}/>
            ))}
          </div>
        ) : open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke={C.cyan} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={C.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {triageResponse && !open && !aiSpeaking && (
          <span style={{position:"absolute",top:4,right:4,width:10,height:10,borderRadius:"50%",background:"#10B981",border:"2px solid #070B11"}}/>
        )}
      </button>

      {/* ── CHAT PANEL ── */}
      {open && (
        <div style={{
          position:"fixed",bottom:92,right:24,zIndex:998,
          width:"min(400px,calc(100vw - 48px))",height:"min(560px,calc(100vh - 120px))",
          background:C.bg,border:`1px solid ${C.border}`,borderRadius:16,
          display:"flex",flexDirection:"column",overflow:"hidden",
          boxShadow:"0 24px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(0,209,255,0.06)",
          animation:"fc-open 0.32s cubic-bezier(0.16,1,0.3,1)",
        }}>

          {/* Header */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,flexShrink:0,
            background:"linear-gradient(180deg,#0D1117,#070B11)",
            display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{
                width:8,height:8,borderRadius:"50%",
                background: aiSpeaking ? C.em : "#10B981",
                boxShadow: aiSpeaking ? `0 0 10px ${C.em}` : "0 0 6px #10B98180",
                transition:"all 0.3s",
              }}/>
              <div>
                <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:"#fff",letterSpacing:"0.06em"}}>Intelligence Copilot</div>
                <div style={{fontFamily:"monospace",fontSize:8,color: aiSpeaking ? C.em : C.dim}}>
                  {aiSpeaking ? "● SPEAKING" : `PulseGuard AI · ${LANGS[langIdx].name}`}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {/* Auto-listen toggle */}
              <button onClick={()=>setAutoListen(a=>!a)} title="Auto-listen after AI speaks" style={{
                padding:"2px 7px",borderRadius:4,fontSize:8,fontFamily:"monospace",cursor:"pointer",
                border:`1px solid ${autoListen?C.em:C.border}`,
                background:autoListen?`${C.em}15`:"transparent",
                color:autoListen?C.em:C.dim,
              }}>AUTO</button>
              {/* Lang selector */}
              {LANGS.map((l,i)=>(
                <button key={l.code} onClick={()=>setLangIdx(i)} style={{
                  padding:"2px 6px",borderRadius:4,border:`1px solid ${i===langIdx?C.cyan:C.border}`,
                  background:i===langIdx?`${C.cyan}15`:"transparent",
                  color:i===langIdx?C.cyan:C.dim,fontSize:8,fontFamily:"monospace",cursor:"pointer",
                }}>{l.label}</button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="fc-scroll" style={{flex:1,overflowY:"auto",padding:"12px 14px"}}>
            {msgs.map(m=><Msg key={m.id} m={m} streaming={streaming && m.id===streamId}/>)}

            {/* Thinking */}
            {thinking && (
              <div style={{display:"flex",alignItems:"center",gap:8,paddingLeft:24,paddingBottom:8}}>
                {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:C.cyan,animation:`fc-dot 1.2s ${i*0.2}s ease-in-out infinite`}}/>)}
                <span style={{fontFamily:"monospace",fontSize:10,color:C.cyan,fontStyle:"italic"}}>{STEPS[thinkStep]}</span>
              </div>
            )}

            {/* Quick actions */}
            {msgs.length<=2 && !thinking && (
              <div style={{display:"flex",gap:6,flexWrap:"wrap",paddingLeft:24,marginTop:4}}>
                {QUICK.map(q=>(
                  <button key={q} onClick={()=>send(q)} style={{
                    padding:"3px 8px",borderRadius:4,border:`1px solid ${C.border}`,
                    background:"transparent",color:C.muted,fontSize:9,fontFamily:"monospace",cursor:"pointer",
                    transition:"all 0.2s",
                  }}
                  onMouseEnter={e=>{e.target.style.borderColor=C.cyan;e.target.style.color=C.cyan;}}
                  onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.muted;}}
                  >{q}</button>
                ))}
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* AI Speaking strip */}
          {aiSpeaking && (
            <div style={{padding:"8px 14px",borderTop:`1px solid ${C.em}30`,background:"#060D09",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <div style={{display:"flex",alignItems:"center",gap:3}}>
                {[0,1,2,3,4].map(i=>(
                  <div key={i} style={{
                    width:3,height:14,borderRadius:2,background:C.em,
                    animation:`fc-wave 0.9s ${i*0.1}s ease-in-out infinite`,
                    transformOrigin:"center",
                  }}/>
                ))}
              </div>
              <span style={{fontFamily:"monospace",fontSize:8,color:C.em,fontWeight:700,letterSpacing:"0.1em"}}>AI SPEAKING</span>
              <span style={{fontFamily:"monospace",fontSize:9,color:"#D1D5DB",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:0.8}}>{subtitle}</span>
              <button onClick={stopSpeech} style={{background:"transparent",border:`1px solid ${C.em}40`,borderRadius:4,color:C.em,fontSize:8,fontFamily:"monospace",cursor:"pointer",padding:"2px 6px"}}>STOP</button>
            </div>
          )}

          {/* Voice waveform strip */}
          {listening && (
            <div style={{padding:"6px 14px",borderTop:`1px solid ${C.border}`,background:"#060609",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <span style={{fontFamily:"monospace",fontSize:8,color:C.cyan,animation:"fc-blink 1s steps(1) infinite"}}>● LISTENING</span>
              <Waveform stream={micStream} active={listening}/>
              {subtitle && <span style={{fontFamily:"monospace",fontSize:9,color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subtitle}</span>}
              <span style={{fontFamily:"monospace",fontSize:8,color:C.dim,marginLeft:"auto"}}>{LANGS[langIdx].name}</span>
            </div>
          )}

          {/* Input row */}
          <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,flexShrink:0,
            display:"flex",alignItems:"center",gap:8}}>
            {/* Mic button */}
            <button onClick={toggleMic} style={{
              width:34,height:34,borderRadius:"50%",border:"none",cursor:"pointer",flexShrink:0,
              background:listening?C.cyan:"#1C2333",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all 0.2s",
              boxShadow:listening?`0 0 16px ${C.cyan}60`:"none",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                {listening
                  ? <rect x="6" y="6" width="12" height="12" rx="2" fill="#060609"/>
                  : <>
                      <rect x="9" y="2" width="6" height="12" rx="3" fill={C.cyan}/>
                      <path d="M5 11a7 7 0 0014 0" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                      <line x1="12" y1="18" x2="12" y2="22" stroke={C.cyan} strokeWidth="1.5" strokeLinecap="round"/>
                    </>}
              </svg>
            </button>

            {/* Text input */}
            <input
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(input);} }}
              placeholder="Ask about symptoms, risk, escalation…"
              disabled={streaming}
              style={{
                flex:1,background:"transparent",border:"none",outline:"none",
                fontFamily:"monospace",fontSize:11,color:"#fff",
                opacity:streaming?0.5:1,
              }}
            />

            {/* Send button */}
            <button onClick={()=>send(input)} disabled={!input.trim()||streaming} style={{
              width:30,height:30,borderRadius:6,border:"none",cursor:"pointer",flexShrink:0,
              background:input.trim()&&!streaming?C.cyan:"#1C2333",
              display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M22 2L11 13" stroke={input.trim()&&!streaming?"#060609":C.dim} strokeWidth="2" strokeLinecap="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={input.trim()&&!streaming?"#060609":C.dim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
