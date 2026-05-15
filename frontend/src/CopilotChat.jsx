import * as React from "react";

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const API_URL = import.meta.env.VITE_API_URL || "/api";

const THINKING_STEPS = [
  "Reading symptom details...",
  "Checking trusted medical context...",
  "Looking for urgent warning signs...",
  "Preparing safe guidance...",
];

const SYSTEM_PROMPT_HINT =
  "You are PulseGuard AI, a patient-friendly healthcare guidance assistant. You help people describe symptoms, " +
  "understand possible urgency, ask relevant follow-up questions, and prepare safe next steps. " +
  "You NEVER diagnose. You use probabilistic language. You escalate appropriately.";

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function ts() {
  return new Date().toISOString().split("T")[1].slice(0, 5);
}

/* Parse structured AI response blocks */
function parseBlocks(text) {
  const blockRe = /\[(OBSERVATION|RISK SIGNALS?|RECOMMENDATION|DISCLAIMER|FOLLOW.UP|FOLLOW UP)\]\s*/gi;
  if (!blockRe.test(text)) return null;
  blockRe.lastIndex = 0;
  const parts = text.split(/(\[[A-Z ]+\])/i).filter(Boolean);
  const blocks = [];
  let label = null;
  for (const p of parts) {
    if (/^\[[A-Z ]+\]$/i.test(p)) { label = p.replace(/[\[\]]/g, "").trim(); }
    else if (label) { blocks.push({ label, content: p.trim() }); label = null; }
    else { blocks.push({ label: null, content: p.trim() }); }
  }
  return blocks;
}

const BLOCK_COLORS = {
  "OBSERVATION":   { bg: "#06B6D415", border: "#06B6D430", label: "#06B6D4" },
  "RISK SIGNALS":  { bg: "#D9770615", border: "#D9770630", label: "#F59E0B" },
  "RISK SIGNAL":   { bg: "#D9770615", border: "#D9770630", label: "#F59E0B" },
  "RECOMMENDATION":{ bg: "#10B98115", border: "#10B98130", label: "#10B981" },
  "DISCLAIMER":    { bg: "#1A1D24",   border: "#2A2D35",   label: "#8A8F98" },
  "FOLLOW-UP":     { bg: "#7C3AED15", border: "#7C3AED30", label: "#A78BFA" },
  "FOLLOW UP":     { bg: "#7C3AED15", border: "#7C3AED30", label: "#A78BFA" },
};

/* ─────────────────────────────────────────────
   SUB-COMPONENTS
───────────────────────────────────────────── */
function StructuredBlock({ label, content }) {
  const style = BLOCK_COLORS[label?.toUpperCase()] || BLOCK_COLORS["DISCLAIMER"];
  return (
    <div style={{
      background: style.bg, border: `1px solid ${style.border}`,
      borderRadius: 8, padding: "8px 12px", marginBottom: 6,
    }}>
      <div style={{
        fontFamily: "monospace", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.12em", color: style.label, marginBottom: 4, textTransform: "uppercase",
      }}>
        [{label}]
      </div>
      <div style={{ fontSize: 12, color: "#D1D5DB", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
        {content}
      </div>
    </div>
  );
}

function AIMessage({ msg, isStreaming }) {
  const blocks = msg.text ? parseBlocks(msg.text) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12, animation: "cp-fadein 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <div style={{
          width: 22, height: 22, borderRadius: "50%", background: "#06B6D420",
          border: "1px solid #06B6D440", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="5" fill="#06B6D4" />
            <circle cx="12" cy="12" r="10" stroke="#06B6D4" strokeWidth="1.5" strokeDasharray="3 3" />
          </svg>
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#06B6D4", fontWeight: 700, letterSpacing: "0.1em" }}>
          PULSEGUARD AI
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4B5563", marginLeft: "auto" }}>
          {msg.time || ts()}
        </span>
      </div>

      <div style={{ paddingLeft: 30 }}>
        {blocks ? (
          blocks.map((b, i) =>
            b.label
              ? <StructuredBlock key={i} label={b.label} content={b.content} />
              : b.content && <p key={i} style={{ fontSize: 12, color: "#D1D5DB", lineHeight: 1.65, margin: "0 0 6px" }}>{b.content}</p>
          )
        ) : (
          <div style={{
            background: "#060609", border: "1px solid #1A1D24", borderRadius: 8, padding: "10px 12px",
          }}>
            <span style={{ fontFamily: "monospace", fontSize: 12, color: "#D1D5DB", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {msg.text}
            </span>
            {isStreaming && (
              <span style={{ color: "#06B6D4", animation: "cp-blink 0.8s steps(1) infinite" }}>▌</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ msg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 12, animation: "cp-fadein 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#8A8F98", letterSpacing: "0.1em" }}>
          {msg.time || ts()}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#8A8F98", fontWeight: 700, letterSpacing: "0.1em" }}>
          YOU
        </span>
      </div>
      <div style={{
        background: "#1C1E25", border: "1px solid #2A2D35", borderRadius: 8,
        padding: "10px 12px", maxWidth: "85%",
      }}>
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#fff", lineHeight: 1.65 }}>
          {msg.text}
        </span>
      </div>
    </div>
  );
}

function ThinkingIndicator({ step }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", paddingLeft: 30 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%", background: "#06B6D4",
            animation: `cp-dot 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 10, color: "#06B6D4", fontStyle: "italic" }}>
        {THINKING_STEPS[step % THINKING_STEPS.length]}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function CopilotChat({ triageResponse, patientMessage }) {
  const [messages, setMessages] = React.useState([
    {
      id: 1, sender: "ai", time: ts(),
      text: "PulseGuard AI is here to help.\n\nTell me what symptoms you are having, how long they have been happening, and anything that feels worrying.\n\nI will not diagnose, but I can suggest safe next steps.",
    }
  ]);
  const [input, setInput]           = React.useState("");
  const [thinking, setThinking]     = React.useState(false);
  const [thinkStep, setThinkStep]   = React.useState(0);
  const [streaming, setStreaming]   = React.useState(false);
  const [streamingId, setStreamingId] = React.useState(null);

  const messagesEndRef = React.useRef(null);
  const inputRef       = React.useRef(null);
  const abortRef       = React.useRef(null);
  const thinkTimerRef  = React.useRef(null);

  /* Auto-scroll to bottom */
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  /* Inject triage context when a triage result arrives */
  React.useEffect(() => {
    if (!triageResponse) return;
    const contextMsg = {
      id: Date.now(), sender: "ai", time: ts(),
      text:
        `[OBSERVATION]\nTriage completed. Risk score: ${triageResponse.emergency_score}/100. Level: ${triageResponse.risk_level}.\n\n` +
        `[RISK SIGNALS]\n${triageResponse.clinical_summary}\n\n` +
        `[RECOMMENDATION]\n${triageResponse.emergency_recommendation}\n\n` +
        `[DISCLAIMER]\n${triageResponse.disclaimer}`,
    };
    setMessages(prev => [...prev, contextMsg]);
  }, [triageResponse]);

  /* Cleanup on unmount */
  React.useEffect(() => () => {
    abortRef.current?.abort();
    clearInterval(thinkTimerRef.current);
  }, []);

  /* Build conversation history for the API */
  const buildHistory = (currentMessages) =>
    currentMessages
      .filter(m => m.sender === "user" || (m.sender === "ai" && m.text))
      .slice(-12) // last 6 turns
      .map(m => ({ role: m.sender === "user" ? "user" : "assistant", content: m.text }));

  const startThinking = () => {
    setThinking(true);
    setThinkStep(0);
    thinkTimerRef.current = setInterval(() => setThinkStep(s => s + 1), 850);
  };

  const stopThinking = () => {
    setThinking(false);
    clearInterval(thinkTimerRef.current);
  };

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { id: Date.now(), sender: "user", text: text.trim(), time: ts() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");

    startThinking();

    // Placeholder streaming message
    const aiId = Date.now() + 1;
    const aiPlaceholder = { id: aiId, sender: "ai", text: "", time: ts() };

    try {
      abortRef.current = new AbortController();
      const history = buildHistory(updatedMessages);

      // Build context from triage state
      const contextNote = triageResponse
        ? `[Current triage context: risk score ${triageResponse.emergency_score}/100, ` +
          `level "${triageResponse.risk_level}", language "${triageResponse.language}", ` +
          `patient message: "${patientMessage}"]`
        : patientMessage
          ? `[Patient reported: "${patientMessage}"]`
          : "";

      const res = await fetch(`${API_URL}/copilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          history,
          context_note: contextNote,
          system_hint: SYSTEM_PROMPT_HINT,
        }),
      });

      stopThinking();

      if (!res.ok) throw new Error(`API ${res.status}`);

      // Streaming
      setStreaming(true);
      setStreamingId(aiId);
      setMessages(prev => [...prev, aiPlaceholder]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // SSE format: "data: <token>\n\n"
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const token = line.slice(6);
            if (token === "[DONE]") break;
            accumulated += token;
            setMessages(prev =>
              prev.map(m => m.id === aiId ? { ...m, text: accumulated } : m)
            );
          }
        }
      }
    } catch (err) {
      stopThinking();
      if (err.name === "AbortError") return;
      // Graceful fallback — show error as AI message
      const fallback = triageResponse
        ? `[OBSERVATION]\nThe live chat assistant is offline right now.\n\n[RISK SIGNALS]\n${triageResponse.clinical_summary}\n\n[RECOMMENDATION]\n${triageResponse.emergency_recommendation}\n\n[DISCLAIMER]\nIf symptoms feel severe or urgent, please seek medical help immediately.`
        : "[OBSERVATION]\nUnable to reach the live assistant right now.\n\n[RECOMMENDATION]\nPlease try again in a moment. If symptoms feel urgent, consult a healthcare professional or emergency service.\n\n[DISCLAIMER]\nThis tool provides guidance only and does not give a diagnosis.";
      setMessages(prev => {
        const hasPlaceholder = prev.some(m => m.id === aiId);
        const base = hasPlaceholder ? prev.filter(m => m.id !== aiId) : prev;
        return [...base, { id: aiId, sender: "ai", text: fallback, time: ts() }];
      });
    } finally {
      setStreaming(false);
      setStreamingId(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleQuickAction = (text) => sendMessage(text);

  const QUICK_ACTIONS = [
    "What should I do next?",
    "Do these symptoms sound urgent?",
    "What details should I mention?",
  ];

  /* ── RENDER ─────────────────────────────────── */
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#0A0B10", borderRadius: 12, border: "1px solid #1A1D24", overflow: "hidden",
    }}>
      <style>{`
        @keyframes cp-fadein { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        @keyframes cp-blink  { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes cp-dot    { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }
        .cp-scroll::-webkit-scrollbar { width:4px }
        .cp-scroll::-webkit-scrollbar-track { background:transparent }
        .cp-scroll::-webkit-scrollbar-thumb { background:#1A1D24; border-radius:2px }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid #1A1D24",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#10B981",
            boxShadow: "0 0 6px #10B98180", animation: "cp-dot 2s ease-in-out infinite",
          }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Patient Guidance Assistant
          </span>
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 9, color: "#10B981" }}>Private session</span>
      </div>

      {/* Messages */}
      <div className="cp-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {messages.map(m =>
          m.sender === "user"
            ? <UserMessage key={m.id} msg={m} />
            : <AIMessage key={m.id} msg={m} isStreaming={streaming && m.id === streamingId} />
        )}
        {thinking && <ThinkingIndicator step={thinkStep} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick actions */}
      {messages.length <= 2 && !thinking && (
        <div style={{ padding: "0 16px 8px", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {QUICK_ACTIONS.map(q => (
            <button key={q} onClick={() => handleQuickAction(q)} style={{
              padding: "4px 10px", borderRadius: 4, border: "1px solid #1A1D24",
              background: "transparent", color: "#8A8F98", fontSize: 10,
              fontFamily: "monospace", cursor: "pointer", transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.target.style.borderColor = "#06B6D4"; e.target.style.color = "#06B6D4"; }}
            onMouseLeave={e => { e.target.style.borderColor = "#1A1D24"; e.target.style.color = "#8A8F98"; }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "12px 16px", borderTop: "1px solid #1A1D24", flexShrink: 0,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ color: "#06B6D4", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>›</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about symptoms, next steps, or warning signs..."
          disabled={streaming}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontFamily: "monospace", fontSize: 11, color: "#fff",
            opacity: streaming ? 0.5 : 1,
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || streaming}
          style={{
            width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
            background: input.trim() && !streaming ? "#06B6D4" : "#1A1D24",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s", flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13" stroke={input.trim() && !streaming ? "#060609" : "#4B5563"} strokeWidth="2" strokeLinecap="round"/>
            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={input.trim() && !streaming ? "#060609" : "#4B5563"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
