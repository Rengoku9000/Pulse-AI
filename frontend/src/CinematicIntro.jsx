import * as React from "react";

/* ─────────────────────────────────────────────
   CinematicIntro
   Phase 0 – boot (0 → 0.5s): black silence
   Phase 1 – human (0.5 → 5s): girl turns / "Every second matters."
   Phase 2 – eye zoom (5 → 11s): HUD overlays build
   Phase 3 – AI activation (11 → 16s): PulseGuard reveal
   Phase 4 – dissolve (16 → 20s): app emerges from the iris
   onComplete fires when the app is fully visible
────────────────────────────────────────────── */
export default function CinematicIntro({ onComplete }) {
  const videoRef = React.useRef(null);
  const [phase, setPhase] = React.useState(0);     // 0‥4
  const [elapsed, setElapsed] = React.useState(0); // seconds since play started
  const [skip, setSkip] = React.useState(false);   // graceful skip

  // ── video-native fade state ───────────────────────────────
  // Driven by real video currentTime, not the wall-clock timer.
  // This is the ONLY correct way to avoid frozen-last-frame.
  const [videoOpacity, setVideoOpacity] = React.useState(1);
  const FADE_LEAD = 1.4; // seconds before video end to begin fade

  // ── timing boundaries (seconds) ──────────────────────────
  const T1_START  = 0.5;   // "Every second matters." appears
  const T2_START  = 5.0;   // HUD overlays begin
  const T3_START  = 11.0;  // AI name reveal
  const T4_START  = 16.0;  // app dissolve
  const T_DONE    = 20.0;  // fire onComplete

  // ── tick elapsed time (drives overlay phases only) ──────────
  React.useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setElapsed(t);
      if (t < T_DONE) {
        raf = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);  // eslint-disable-line

  // ── VIDEO-NATIVE fade — attached to actual playback time ──────
  // This fires on every browser decode frame, giving frame-perfect
  // opacity regardless of what the wall-clock timer is doing.
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const { currentTime, duration } = video;
      if (!duration || !isFinite(duration)) return;
      const remaining = duration - currentTime;       // seconds left
      if (remaining <= FADE_LEAD) {
        // Linear 1 → 0 over the last FADE_LEAD seconds
        const opacity = Math.max(0, remaining / FADE_LEAD);
        setVideoOpacity(opacity);
      } else {
        setVideoOpacity(1);
      }
    };

    const handleEnded = () => {
      // Guarantee fully hidden when the browser fires ended
      setVideoOpacity(0);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [FADE_LEAD]);

  // ── derive phase from elapsed ─────────────────────────────
  React.useEffect(() => {
    if      (elapsed >= T4_START)  setPhase(4);
    else if (elapsed >= T3_START)  setPhase(3);
    else if (elapsed >= T2_START)  setPhase(2);
    else if (elapsed >= T1_START)  setPhase(1);
    else                            setPhase(0);
  }, [elapsed]);

  // ── skip handler ──────────────────────────────────────────
  const handleSkip = () => {
    setSkip(true);
    setTimeout(() => onComplete?.(), 800);
  };

  // ── helpers ───────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

  // Phase-local 0→1 progress
  const phaseProgress = (start, end) =>
    Math.min(1, Math.max(0, (elapsed - start) / (end - start)));

  const p1 = phaseProgress(T1_START, T2_START);
  const p2 = phaseProgress(T2_START, T3_START);
  const p3 = phaseProgress(T3_START, T4_START);
  const p4 = phaseProgress(T4_START, T_DONE);

  // ── scanline particles (static positions) ─────────────────
  const particles = React.useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 2 + 1,
        delay: Math.random() * 2,
        duration: Math.random() * 3 + 2,
      })),
    []
  );

  // ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        overflow: "hidden",
        opacity: skip ? 0 : 1,
        transition: skip ? "opacity 0.8s ease" : "none",
        pointerEvents: skip ? "none" : "all",
      }}
    >
      {/* ── CSS keyframes injected inline ───────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700&display=swap');

        @keyframes ci-fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes ci-fadeDown { from{opacity:0;transform:translateY(-12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ci-scanMove { from{top:-2px} to{top:100%} }
        @keyframes ci-ripple   {
          0%   { transform:scale(0.6); opacity:0.8 }
          100% { transform:scale(2.4); opacity:0   }
        }
        @keyframes ci-pulse    {
          0%,100% { opacity:0.4 }
          50%     { opacity:1   }
        }
        @keyframes ci-particle {
          0%,100% { opacity:0; transform:scale(0.6) }
          50%     { opacity:1; transform:scale(1.2) }
        }
        @keyframes ci-gridIn   { from{opacity:0} to{opacity:1} }
        @keyframes ci-blurIn   {
          from { opacity:0; filter:blur(24px) }
          to   { opacity:1; filter:blur(0px)  }
        }
        @keyframes ci-waveform {
          0%   { height:4px  }
          50%  { height:22px }
          100% { height:4px  }
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════
          VIDEO LAYER
          Opacity is driven EXCLUSIVELY by videoOpacity state
          which is set from real video currentTime events.
          The wall-clock timer no longer touches this element.
      ═══════════════════════════════════════════════════ */}
      <video
        ref={videoRef}
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          willChange: "opacity, transform",
          transform: "translateZ(0)",
          // Video-native fade: smooth linear driven by actual playback position
          opacity: videoOpacity,
          transition: "opacity 0.08s linear",
          // subtle scale-in to simulate camera push during eye-zoom phase
          scale: phase >= 2 ? `${lerp(1, 1.08, p2)}` : "1",
        }}
      />

      {/* ═══════════════════════════════════════════════════
          GRADIENT VIGNETTE (always present)
      ═══════════════════════════════════════════════════ */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.72) 100%)" +
            ",linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 25%, transparent 70%, rgba(0,0,0,0.80) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* ═══════════════════════════════════════════════════
          NOISE GRAIN (phase 1+)
      ═══════════════════════════════════════════════════ */}
      {phase >= 1 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
            opacity: 0.18,
            mixBlendMode: "overlay",
            pointerEvents: "none",
            animation: "ci-fadeIn 2s ease forwards",
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════
          SCANLINE TEXTURE (phase 2+)
      ═══════════════════════════════════════════════════ */}
      {phase >= 2 && (
        <>
          {/* horizontal scanlines */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "repeating-linear-gradient(to bottom, transparent 0px, transparent 3px, rgba(6,182,212,0.025) 4px)",
              pointerEvents: "none",
              opacity: lerp(0, 1, p2),
            }}
          />
          {/* moving scan beam */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: "2px",
              background:
                "linear-gradient(to right, transparent, rgba(6,182,212,0.6), transparent)",
              animation: "ci-scanMove 3.2s linear infinite",
              pointerEvents: "none",
              opacity: lerp(0, 0.6, p2),
            }}
          />
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          MEDICAL CYAN AMBIENT BLOOM
      ═══════════════════════════════════════════════════ */}
      {phase >= 2 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 60% at 50% 45%, rgba(6,182,212,0.10) 0%, transparent 70%)",
            opacity: lerp(0, 1, p2),
            pointerEvents: "none",
            mixBlendMode: "screen",
            transition: "opacity 0.6s ease",
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════
          FLOATING TELEMETRY PARTICLES (phase 2+)
      ═══════════════════════════════════════════════════ */}
      {phase >= 2 &&
        particles.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: "50%",
              background: "rgba(6,182,212,0.8)",
              boxShadow: "0 0 6px rgba(6,182,212,0.8)",
              opacity: 0,
              animation: `ci-particle ${p.duration}s ${p.delay}s ease-in-out infinite`,
              pointerEvents: "none",
            }}
          />
        ))}

      {/* ═══════════════════════════════════════════════════
          RADIAL HUD RINGS (phase 2+)
      ═══════════════════════════════════════════════════ */}
      {phase >= 2 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {[200, 320, 460].map((size, i) => (
            <div
              key={size}
              style={{
                position: "absolute",
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: "50%",
                border: `1px solid rgba(6,182,212,${lerp(0, 0.25, p2) - i * 0.06})`,
                boxShadow: `0 0 ${8 + i * 6}px rgba(6,182,212,${lerp(0, 0.12, p2)})`,
                opacity: lerp(0, 1, p2),
                transition: "opacity 1s ease",
                animation: `ci-pulse ${3 + i * 0.7}s ${i * 0.4}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          NEURAL RIPPLE (phase 3)
      ═══════════════════════════════════════════════════ */}
      {phase >= 3 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          {[0, 0.6, 1.2].map((delay, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                width: "520px",
                height: "520px",
                borderRadius: "50%",
                border: "1px solid rgba(6,182,212,0.5)",
                opacity: 0,
                animation: `ci-ripple 2.4s ${delay}s ease-out infinite`,
              }}
            />
          ))}
          {/* Cyan illumination sweep */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse 40% 40% at 50% 45%, rgba(6,182,212,0.18) 0%, transparent 70%)",
              opacity: lerp(0, 1, p3),
              mixBlendMode: "screen",
              transition: "opacity 0.4s ease",
            }}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          PHASE 4: OPERATIONAL GRID EMERGENCE
      ═══════════════════════════════════════════════════ */}
      {phase >= 4 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to right, rgba(255,255,255,0.012) 1px, transparent 1px)," +
              "linear-gradient(to bottom, rgba(255,255,255,0.012) 1px, transparent 1px)",
            backgroundSize: "2.5rem 2.5rem",
            opacity: lerp(0, 1, p4),
            pointerEvents: "none",
            animation: "ci-gridIn 1s ease forwards",
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════
          PHASE 1 — HUMAN TEXT
      ═══════════════════════════════════════════════════ */}
      {phase >= 1 && phase < 3 && (
        <div
          style={{
            position: "absolute",
            bottom: "18%",
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            pointerEvents: "none",
            opacity: phase === 2 ? lerp(1, 0, p2 * 1.5) : lerp(0, 1, p1 * 2),
            transition: "opacity 1s ease",
          }}
        >
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "clamp(16px, 2.2vw, 26px)",
              fontWeight: 300,
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.90)",
              textTransform: "uppercase",
              margin: 0,
              textShadow: "0 2px 24px rgba(0,0,0,0.8)",
            }}
          >
            Care starts with listening.
          </p>
          {/* subtle waveform beneath */}
          <div
            style={{
              marginTop: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              opacity: lerp(0, 0.6, p1 * 3),
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: "2px",
                  height: "4px",
                  borderRadius: "2px",
                  background: "rgba(6,182,212,0.8)",
                  animation: `ci-waveform ${0.8 + i * 0.1}s ${i * 0.07}s ease-in-out infinite`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          PHASE 2 — HUD corner elements
      ═══════════════════════════════════════════════════ */}
      {phase >= 2 && phase < 4 && (
        <>
          {/* Top-left bracket */}
          <div
            style={{
              position: "absolute",
              top: "10%",
              left: "8%",
              opacity: lerp(0, 0.7, p2),
              pointerEvents: "none",
              transition: "opacity 1s ease",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderTop: "1px solid rgba(6,182,212,0.6)",
                borderLeft: "1px solid rgba(6,182,212,0.6)",
              }}
            />
            <p
              style={{
                fontFamily: "'Inter', monospace",
                fontSize: "9px",
                color: "rgba(6,182,212,0.7)",
                letterSpacing: "0.12em",
                marginTop: "6px",
                textTransform: "uppercase",
              }}
            >
              LISTENING
            </p>
          </div>
          {/* Top-right bracket */}
          <div
            style={{
              position: "absolute",
              top: "10%",
              right: "8%",
              opacity: lerp(0, 0.7, p2),
              pointerEvents: "none",
              transition: "opacity 1s ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderTop: "1px solid rgba(6,182,212,0.6)",
                borderRight: "1px solid rgba(6,182,212,0.6)",
              }}
            />
            <p
              style={{
                fontFamily: "'Inter', monospace",
                fontSize: "9px",
                color: "rgba(6,182,212,0.7)",
                letterSpacing: "0.12em",
                marginTop: "6px",
                textTransform: "uppercase",
              }}
            >
              CARE READY
            </p>
          </div>
          {/* bottom telemetry bar */}
          <div
            style={{
              position: "absolute",
              bottom: "12%",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: "24px",
              opacity: lerp(0, 0.65, p2),
              pointerEvents: "none",
              transition: "opacity 0.8s ease",
            }}
          >
            {["SpO2 98%", "Heart rate 72", "Guidance ready"].map((label) => (
              <span
                key={label}
                style={{
                  fontFamily: "'Inter', monospace",
                  fontSize: "9px",
                  letterSpacing: "0.14em",
                  color: "rgba(6,182,212,0.8)",
                  textTransform: "uppercase",
                  animation: "ci-pulse 2s ease-in-out infinite",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════
          PHASE 3 — AI SYSTEM ACTIVATION TEXT
      ═══════════════════════════════════════════════════ */}
      {phase >= 3 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            opacity: phase >= 4 ? lerp(1, 0, p4 * 1.8) : lerp(0, 1, p3 * 1.5),
            transition: "opacity 0.6s ease",
          }}
        >
          {/* Main name */}
          <h1
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "clamp(36px, 6vw, 80px)",
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "#fff",
              margin: 0,
              textShadow:
                "0 0 40px rgba(6,182,212,0.6), 0 2px 48px rgba(0,0,0,0.9)",
              animation: "ci-blurIn 1.2s ease forwards",
            }}
          >
            Pulse<span style={{ color: "#06B6D4" }}>Guard</span>{" "}
            <span style={{ color: "#06B6D4" }}>AI</span>
          </h1>
          {/* Subtitle */}
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "clamp(10px, 1.2vw, 14px)",
              fontWeight: 400,
              letterSpacing: "0.22em",
              color: "rgba(6,182,212,0.85)",
              textTransform: "uppercase",
              marginTop: "16px",
              textShadow: "0 0 20px rgba(6,182,212,0.4)",
              opacity: lerp(0, 1, p3 * 2),
              transition: "opacity 0.8s ease",
            }}
          >
            Patient-friendly AI symptom guidance
          </p>
          {/* activation bar */}
          <div
            style={{
              marginTop: "32px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              opacity: lerp(0, 0.9, p3 * 2.5),
              transition: "opacity 0.8s ease",
            }}
          >
            <div
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#06B6D4",
                boxShadow: "0 0 8px #06B6D4",
                animation: "ci-pulse 1s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "'Inter', monospace",
                fontSize: "9px",
                letterSpacing: "0.2em",
                color: "rgba(6,182,212,0.7)",
                textTransform: "uppercase",
              }}
            >
              READY TO HELP - SAFE GUIDANCE ACTIVE
            </span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          PHASE 4 — WHITE BLOOM THEN CLEAR
      ═══════════════════════════════════════════════════ */}
      {phase >= 4 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(6,182,212,0.06)",
            opacity: lerp(0.8, 0, p4),
            pointerEvents: "none",
            transition: "opacity 0.3s ease",
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════
          SKIP BUTTON (always visible, bottom-right)
      ═══════════════════════════════════════════════════ */}
      <button
        onClick={handleSkip}
        style={{
          position: "absolute",
          bottom: "28px",
          right: "32px",
          background: "rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: "4px",
          color: "rgba(255,255,255,0.55)",
          fontFamily: "'Inter', sans-serif",
          fontSize: "11px",
          letterSpacing: "0.1em",
          padding: "6px 14px",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          zIndex: 10000,
          transition: "all 0.2s ease",
          textTransform: "uppercase",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.borderColor = "rgba(6,182,212,0.5)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.55)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
        }}
      >
        Skip intro
      </button>
    </div>
  );
}
