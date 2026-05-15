import * as React from "react";

/**
 * AmbientBackground
 * ─────────────────
 * LAYER 1: <video>  — background.mp4, looping, GPU-composited
 * LAYER 2: Dark graphite base transparency
 * LAYER 3: Chapter-reactive ambient gradient (cyan → amber)
 * LAYER 4: Vignette edges
 * LAYER 5: Subtle diagnostic grid
 * LAYER 6: Noise grain
 *
 * The video is mounted once and NEVER remounted, ensuring
 * zero flicker and zero restart across all scroll chapters.
 *
 * Props:
 *   chapter  {1‥6}  — current scroll chapter for overlay blending
 *   riskTone {"low"|"medium"|"high"}
 */
export default function AmbientBackground({ chapter = 1, riskTone = "low" }) {
  const videoRef = React.useRef(null);

  // Ensure autoplay even if browser deferred it
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    if (v.readyState >= 2) {
      tryPlay();
    } else {
      v.addEventListener("canplay", tryPlay, { once: true });
    }
  }, []);

  // ── Chapter colour tokens ──────────────────────────────────
  // Returns { grad, intensity } per chapter narrative state
  const getChapterStyle = () => {
    switch (chapter) {
      case 1: // Calm intake — cool cyan / emerald
        return {
          grad: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(6,182,212,0.07) 0%, rgba(16,185,129,0.04) 50%, transparent 80%)",
          intensity: 0.22,
        };
      case 2: // Symptom escalation — amber introduction
        return {
          grad: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(217,119,6,0.06) 0%, rgba(6,182,212,0.04) 60%, transparent 85%)",
          intensity: 0.24,
        };
      case 3: // AI triage activation — deep cyan glow
        return {
          grad: "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(6,182,212,0.10) 0%, rgba(6,182,212,0.04) 55%, transparent 80%)",
          intensity: 0.26,
        };
      case 4: // High-risk escalation — controlled amber
        return {
          grad: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(217,119,6,0.09) 0%, rgba(180,83,9,0.04) 55%, transparent 80%)",
          intensity: 0.28,
        };
      case 5: // Physician dispatch — neutral tension
        return {
          grad: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(6,182,212,0.06) 0%, rgba(217,119,6,0.05) 60%, transparent 85%)",
          intensity: 0.26,
        };
      case 6: // ICU command — balanced cyan / emerald calm
        return {
          grad: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(16,185,129,0.07) 0%, rgba(6,182,212,0.05) 55%, transparent 80%)",
          intensity: 0.22,
        };
      default:
        return {
          grad: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(6,182,212,0.06) 0%, transparent 80%)",
          intensity: 0.22,
        };
    }
  };

  const { grad, intensity } = getChapterStyle();

  return (
    <>
      {/* ── Keyframes ──────────────────────────────────────── */}
      <style>{`
        @keyframes amb-grain {
          0%,100% { transform: translate(0,0) }
          10%      { transform: translate(-1%,-1%) }
          30%      { transform: translate(1%,-2%) }
          50%      { transform: translate(-2%,1%) }
          70%      { transform: translate(2%,2%) }
          90%      { transform: translate(-1%,1%) }
        }
      `}</style>

      {/* ════════════════════════════════════════════════════
          LAYER 1 — VIDEO
          fixed + object-cover + GPU compositing layer
          z-index deliberately below the app shell (z-0)
      ════════════════════════════════════════════════════ */}
      <video
        ref={videoRef}
        src="/background.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // Restrained opacity — UI always dominates
          opacity: intensity,
          // GPU compositing: promote to own layer
          willChange: "transform",
          transform: "translateZ(0)",
          zIndex: 0,
          pointerEvents: "none",
          // Slight desaturation via CSS filter for extra restraint
          filter: "saturate(0.7) brightness(0.85)",
        }}
      />

      {/* ════════════════════════════════════════════════════
          LAYER 2 — Deep graphite base (locks dark bg)
      ════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(6,6,9,0.72)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* ════════════════════════════════════════════════════
          LAYER 3 — Chapter-reactive ambient gradient
          Uses CSS transition for smooth chapter blending
      ════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: grad,
          zIndex: 2,
          pointerEvents: "none",
          transition: "background 2s cubic-bezier(0.16, 1, 0.3, 1)",
          mixBlendMode: "screen",
        }}
      />

      {/* ════════════════════════════════════════════════════
          LAYER 4 — Vignette edges (always)
      ════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.65) 100%)",
          zIndex: 3,
          pointerEvents: "none",
        }}
      />

      {/* ════════════════════════════════════════════════════
          LAYER 5 — Subtle diagnostic grid
          Ultra-low opacity so it reads as depth, not pattern
      ════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.018) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(255,255,255,0.018) 1px, transparent 1px)",
          backgroundSize: "2.5rem 2.5rem",
          zIndex: 4,
          pointerEvents: "none",
        }}
      />

      {/* ════════════════════════════════════════════════════
          LAYER 6 — Noise grain (subtle film texture)
          Drifts slowly via animation to feel organic
      ════════════════════════════════════════════════════ */}
      <div
        style={{
          position: "fixed",
          inset: "-10%",           // oversized so drift stays seamless
          width: "120%",
          height: "120%",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='0.055'/%3E%3C/svg%3E\")",
          opacity: 0.22,
          mixBlendMode: "overlay",
          animation: "amb-grain 8s steps(1) infinite",
          zIndex: 5,
          pointerEvents: "none",
        }}
      />
    </>
  );
}
