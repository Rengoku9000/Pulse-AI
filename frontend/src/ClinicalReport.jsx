import * as React from "react";

/* ═══════════════════════════════════════════════════════════
   PULSEGUARD AI — Clinical Intelligence Report
   Full-screen overlay, dark-themed, print-ready dossier
═══════════════════════════════════════════════════════════ */

const C = {
  bg:        "#070B11",
  surface:   "#0D1117",
  surface2:  "#111720",
  border:    "#1C2333",
  border2:   "#243044",
  cyan:      "#00D1FF",
  cyanDim:   "#0891B2",
  emerald:   "#10B981",
  amber:     "#F59E0B",
  red:       "#EF4444",
  white:     "#F0F6FF",
  muted:     "#8B97AA",
  dimText:   "#4B5A6E",
};

/* ── Tiny helpers ───────────────────────────────────────── */
function now() {
  return new Date().toUTCString().replace("GMT", "UTC");
}
function caseId() {
  return "PG-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
const CASE_ID = caseId();

function riskColor(score) {
  if (score >= 70) return C.red;
  if (score >= 30) return C.amber;
  return C.emerald;
}
function riskLabel(score) {
  if (score >= 70) return "CRITICAL";
  if (score >= 30) return "ELEVATED";
  return "LOW RISK";
}

/* ── Mini sparkline SVG ─────────────────────────────────── */
function Spark({ data, color }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`
  ).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ width: 80, height: 28, display: "block" }}>
      <polyline fill="none" stroke={color} strokeWidth="6"
        strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.9" />
    </svg>
  );
}

/* ── Section label ──────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "monospace", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", color: C.cyan, textTransform: "uppercase",
      borderBottom: `1px solid ${C.border2}`, paddingBottom: 8, marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

/* ── Card ───────────────────────────────────────────────── */
function Card({ children, style = {}, accent = false }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${accent ? C.border2 : C.border}`,
      borderRadius: 12, padding: 20, ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Risk badge ─────────────────────────────────────────── */
function RiskBadge({ score }) {
  const color = riskColor(score);
  const label = riskLabel(score);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 4,
      border: `1px solid ${color}40`, background: `${color}12`,
      fontFamily: "monospace", fontSize: 10, fontWeight: 700,
      color, letterSpacing: "0.1em",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

/* ── Metric tile ────────────────────────────────────────── */
function MetricTile({ label, value, sub, spark, sparkColor }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 130 }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, color: C.muted,
        letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: C.white, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted }}>{sub}</div>}
      {spark && <Spark data={spark} color={sparkColor || C.cyan} />}
    </Card>
  );
}

/* ── AI reasoning block ─────────────────────────────────── */
function ReasonBlock({ label, children, color = C.cyan }) {
  return (
    <div style={{
      background: `${color}0C`, border: `1px solid ${color}25`,
      borderLeft: `3px solid ${color}`, borderRadius: 8,
      padding: "10px 14px", marginBottom: 10,
    }}>
      <div style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700,
        color, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        [{label}]
      </div>
      <div style={{ fontSize: 12, color: C.white, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Timeline row ───────────────────────────────────────── */
function TimelineRow({ time, tag, text, color }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "90px 110px 1fr",
      alignItems: "start", padding: "8px 0",
      borderBottom: `1px solid ${C.border}`, fontFamily: "monospace", fontSize: 11,
    }}>
      <span style={{ color: C.muted }}>{time}</span>
      <span style={{ color, fontWeight: 700, fontSize: 10 }}>[{tag}]</span>
      <span style={{ color: C.white }}>{text}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
export default function ClinicalReport({ triageResponse, patientMessage, metrics, onClose }) {
  const score         = triageResponse?.emergency_score ?? 0;
  const risk          = riskColor(score);
  const generatedAt   = React.useMemo(() => now(), []);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handlePrint = () => window.print();
  const handleClose = () => { setVisible(false); setTimeout(onClose, 320); };

  const insights = triageResponse?.operational_insights || [];
  const actions  = triageResponse?.safety_actions || [];
  const context  = triageResponse?.retrieved_context || [];
  const guidance = triageResponse?.guidance || "No AI guidance generated yet.";

  return (
    <>
      {/* Print-optimised CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        @keyframes rpt-up { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        .rpt-animate { animation: rpt-up 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
        @media print {
          body * { visibility: hidden !important; }
          #pulseguard-report, #pulseguard-report * { visibility: visible !important; }
          #pulseguard-report {
            position: fixed !important; inset: 0 !important;
            width: 100vw !important; height: auto !important;
            overflow: visible !important; z-index: 99999 !important;
            background: #070B11 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .rpt-no-print { display: none !important; }
          .rpt-page-break { page-break-before: always; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
          backdropFilter: "blur(6px)", zIndex: 900,
          opacity: visible ? 1 : 0, transition: "opacity 0.3s ease",
        }}
      />

      {/* Report Panel */}
      <div
        id="pulseguard-report"
        style={{
          position: "fixed", inset: "0 0 0 0", zIndex: 901,
          overflowY: "auto", background: C.bg,
          opacity: visible ? 1 : 0, transition: "opacity 0.32s ease",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Ambient gradient top */}
        <div style={{
          position: "sticky", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${C.cyan}, ${C.emerald}, ${C.cyan})`,
          zIndex: 10,
        }} />

        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 28px 80px" }}>

          {/* ── HEADER ──────────────────────────────────────────────── */}
          <div className="rpt-animate" style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            marginBottom: 32, paddingBottom: 24,
            borderBottom: `1px solid ${C.border2}`,
          }}>
            {/* Left: branding */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                {/* Logo mark */}
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `linear-gradient(135deg, ${C.cyan}22, ${C.cyanDim}44)`,
                  border: `1px solid ${C.cyan}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke={C.cyan} strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M2 17l10 5 10-5" stroke={C.cyan} strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M2 12l10 5 10-5" stroke={C.cyan} strokeWidth="1.5" strokeLinejoin="round" opacity="0.6"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.white, letterSpacing: "-0.02em" }}>
                    PulseGuard AI
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: C.cyan,
                    letterSpacing: "0.18em", textTransform: "uppercase" }}>
                    Clinical Operations Core
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: C.muted, marginTop: 4 }}>
                Clinical Intelligence Report · Case {CASE_ID}
              </div>
            </div>

            {/* Right: metadata + actions */}
            <div style={{ textAlign: "right" }}>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 12 }}>
                <button className="rpt-no-print" onClick={handlePrint} style={{
                  padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.cyan}`,
                  background: `${C.cyan}18`, color: C.cyan, fontSize: 11,
                  fontFamily: "monospace", fontWeight: 700, cursor: "pointer",
                  letterSpacing: "0.06em",
                }}>
                  Export PDF ↓
                </button>
                <button className="rpt-no-print" onClick={handleClose} style={{
                  padding: "8px 16px", borderRadius: 6, border: `1px solid ${C.border2}`,
                  background: "transparent", color: C.muted, fontSize: 11,
                  fontFamily: "monospace", cursor: "pointer",
                }}>
                  ✕ Close
                </button>
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: C.dimText, lineHeight: 1.8 }}>
                <div>Generated: {generatedAt}</div>
                <div>Language: {triageResponse?.language || "English"}</div>
                <div>Provider: {triageResponse?.telemetry?.provider_used || "PulseGuard AI"}</div>
                <div>RAG Chunks: {triageResponse?.telemetry?.rag_context_chunks ?? 0}</div>
              </div>
            </div>
          </div>

          {/* ── STATUS RIBBON ──────────────────────────────────────── */}
          <div className="rpt-animate" style={{
            display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap",
          }}>
            {[
              { label: "Case Status", value: "ACTIVE", color: C.emerald },
              { label: "Risk Level",  value: riskLabel(score), color: risk },
              { label: "AI Analysis", value: triageResponse ? "COMPLETE" : "PENDING", color: C.cyan },
              { label: "Escalation",  value: triageResponse?.topology_stage || "Awaiting", color: C.amber },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                padding: "10px 18px", borderRadius: 8,
                background: `${color}0E`, border: `1px solid ${color}30`,
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                <span style={{ fontFamily: "monospace", fontSize: 8, color: C.muted,
                  textTransform: "uppercase", letterSpacing: "0.14em" }}>{label}</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* ── TELEMETRY METRICS ──────────────────────────────────── */}
          <SectionLabel>01 — Patient Telemetry Snapshot</SectionLabel>
          <div className="rpt-animate" style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12, marginBottom: 32,
          }}>
            <MetricTile
              label="SpO2 Saturation" value={metrics?.spo2 || "98%"}
              sub={metrics?.spo2Trend ? `Trend ${metrics.spo2Trend}` : "Stable"}
              spark={metrics?.spo2Spark} sparkColor={score >= 70 ? C.red : C.emerald}
            />
            <MetricTile
              label="Heart Rate" value={`${metrics?.bpm || "72"} BPM`}
              sub={metrics?.bpmTrend ? `Trend ${metrics.bpmTrend}` : "Nominal"}
              spark={metrics?.bpmSpark} sparkColor={score >= 70 ? C.amber : C.emerald}
            />
            <MetricTile
              label="Respiratory" value={`${metrics?.resp || "16"}/min`}
              sub={metrics?.respTrend ? `Trend ${metrics.respTrend}` : "Normal range"}
              spark={metrics?.respSpark} sparkColor={score >= 30 ? C.amber : C.emerald}
            />
            <MetricTile label="Risk Score" value={`${score}/100`}
              sub={riskLabel(score)} sparkColor={risk} />
          </div>

          {/* ── PATIENT INTAKE SUMMARY ─────────────────────────────── */}
          <SectionLabel>02 — Patient Intake Summary</SectionLabel>
          <Card style={{ marginBottom: 28 }} accent>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>
                Patient ID: PT-7422 · Ward: ICU-EAST · Age: 64 · Status: Admitting
              </div>
              <RiskBadge score={score} />
            </div>
            <div style={{
              background: C.surface2, borderRadius: 8, padding: "14px 16px",
              border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: C.cyan,
                letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
                Reported Symptoms
              </div>
              <p style={{ fontSize: 13, color: C.white, lineHeight: 1.7, margin: 0 }}>
                {patientMessage || "No patient message recorded."}
              </p>
            </div>
          </Card>

          {/* ── RISK ASSESSMENT ────────────────────────────────────── */}
          <SectionLabel>03 — Risk Assessment</SectionLabel>
          <div className="rpt-animate" style={{ marginBottom: 28 }}>
            {/* Score bar */}
            <Card accent style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>
                  AI Emergency Risk Score
                </span>
                <span style={{ fontSize: 28, fontWeight: 700, color: risk, fontFamily: "monospace" }}>
                  {score}<span style={{ fontSize: 14, color: C.muted }}>/100</span>
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, background: C.border2, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${score}%`,
                  background: `linear-gradient(90deg, ${C.emerald}, ${risk})`,
                  borderRadius: 3, transition: "width 1s ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between",
                fontFamily: "monospace", fontSize: 8, color: C.dimText, marginTop: 6 }}>
                <span>LOW RISK · 0</span><span>ELEVATED · 30</span><span>CRITICAL · 70</span>
              </div>
            </Card>

            {/* Risk tier cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {[
                { tier: "LOW", range: "0–29", color: C.emerald, active: score < 30 },
                { tier: "ELEVATED", range: "30–69", color: C.amber, active: score >= 30 && score < 70 },
                { tier: "CRITICAL", range: "70–100", color: C.red, active: score >= 70 },
              ].map(({ tier, range, color, active }) => (
                <div key={tier} style={{
                  padding: 16, borderRadius: 10,
                  background: active ? `${color}12` : C.surface,
                  border: `1px solid ${active ? color + "40" : C.border}`,
                  opacity: active ? 1 : 0.4,
                }}>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: active ? color : C.muted,
                    letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>{tier}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: active ? color : C.muted,
                    fontWeight: 700 }}>{range}</div>
                  {active && (
                    <div style={{ marginTop: 8, width: 8, height: 8, borderRadius: "50%",
                      background: color, boxShadow: `0 0 8px ${color}` }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── AI REASONING ───────────────────────────────────────── */}
          <SectionLabel>04 — AI Reasoning &amp; Clinical Guidance</SectionLabel>
          <div className="rpt-animate" style={{ marginBottom: 28 }}>
            <ReasonBlock label="Observation" color={C.cyan}>
              {triageResponse?.clinical_summary || "Submit patient symptoms to generate AI clinical assessment."}
            </ReasonBlock>
            <ReasonBlock label="AI Guidance" color={C.emerald}>
              {guidance}
            </ReasonBlock>
            {insights.length > 0 && (
              <ReasonBlock label="Operational Insights" color={C.amber}>
                {insights.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}
              </ReasonBlock>
            )}
            {actions.length > 0 && (
              <ReasonBlock label="Safety Actions" color={C.red}>
                {actions.map((a, idx) => `${idx + 1}. ${a}`).join("\n")}
              </ReasonBlock>
            )}
            <ReasonBlock label="Escalation Recommendation" color={risk}>
              {triageResponse?.emergency_recommendation || "No escalation recommendation generated yet."}
            </ReasonBlock>
          </div>

          {/* ── MEDICAL CONTEXT (RAG) ───────────────────────────────── */}
          {context.length > 0 && (
            <>
              <SectionLabel>05 — Retrieved Medical Context (MedQuAD RAG)</SectionLabel>
              <div className="rpt-animate" style={{ marginBottom: 28, display: "flex", flexDirection: "column", gap: 10 }}>
                {context.map((c, i) => (
                  <Card key={i} style={{ borderLeft: `3px solid ${C.cyanDim}` }}>
                    <div style={{ fontFamily: "monospace", fontSize: 8, color: C.cyan,
                      letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      Context Fragment {i + 1}
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.65, margin: 0 }}>{c}</p>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ── ESCALATION TIMELINE ─────────────────────────────────── */}
          <SectionLabel>{context.length > 0 ? "06" : "05"} — Escalation Audit Trail</SectionLabel>
          <Card style={{ marginBottom: 32 }} accent>
            {[
              { time: "T+00:00 UTC", tag: "INTAKE",    color: C.cyan,    text: `Patient message submitted · Language: ${triageResponse?.language || "English"}` },
              { time: "T+00:02 UTC", tag: "AI ENGINE", color: C.cyan,    text: `Risk scoring initiated · RAG retrieval activated` },
              { time: "T+00:04 UTC", tag: score >= 70 ? "CRITICAL" : score >= 30 ? "ELEVATED" : "LOW",
                color: risk, text: `Risk score computed: ${score}/100 · Level: ${riskLabel(score)}` },
              { time: "T+00:06 UTC", tag: "SYNTHESIS", color: C.emerald, text: `Clinical summary generated · Safety actions queued` },
              { time: "T+00:08 UTC", tag: "DISPATCH",  color: C.emerald, text: triageResponse?.emergency_recommendation || "Awaiting escalation decision" },
            ].map((row, i) => <TimelineRow key={i} {...row} />)}
          </Card>

          {/* ── DISCLAIMER ──────────────────────────────────────────── */}
          <div style={{
            padding: "16px 20px", borderRadius: 8,
            background: C.surface, border: `1px solid ${C.border}`,
            fontFamily: "monospace", fontSize: 10, color: C.dimText, lineHeight: 1.7,
          }}>
            <span style={{ color: C.muted, fontWeight: 700 }}>⚠ Medical Disclaimer: </span>
            This report is generated by PulseGuard AI for triage support purposes only. It does not constitute a medical diagnosis, treatment recommendation, or clinical prescription. All risk assessments are probabilistic and require validation by a licensed healthcare professional. For life-threatening emergencies, contact emergency services immediately.
          </div>

          {/* Bottom brand bar */}
          <div style={{
            marginTop: 32, paddingTop: 20, borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontFamily: "monospace", fontSize: 9, color: C.dimText,
          }}>
            <span>PulseGuard AI · Clinical Operations Core · {CASE_ID}</span>
            <span>CONFIDENTIAL — TRIAGE SUPPORT ONLY</span>
          </div>
        </div>
      </div>
    </>
  );
}
