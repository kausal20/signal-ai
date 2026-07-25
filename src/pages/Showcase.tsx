// Showcase — Apple-quality cinematic motion reveal for Signal AI.
// ---------------------------------------------------------------------------
// 38-second looping animation sequence (each scene ~5-6s for readability):
//    0-6s   Black → green pulse → logo fade in + hold
//   6-9.5s  "SIGNAL · AI INTELLIGENCE" character-by-character reveal
//  9.5-14s  Headline "Every breakthrough. None of the noise." word cascade
//   14-18s  Subtitle fade up + green line sweep
//   18-21s  Phone mockup enters from bottom with spring physics
//   21-26s  Liquid Glass nav animates in, cards stagger in, search types itself
//          (phone content auto-scrolls so all cards are visible)
//   28-31s  Feature badges fly in (staggered)
//   31-35s  "Signal" wordmark + tagline final frame (no CTA bar)
//   35-38s  Fade to black → restart
// ---------------------------------------------------------------------------

import { useEffect, useState, useRef, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import {
  Home, Search, Compass, Bookmark, SlidersHorizontal,
  Zap, Brain, Newspaper, TrendingUp, Shield,
} from "lucide-react";

// ── Timing constants (ms) ────────────────────────────────────────────────
// Slowed down so each scene stays ~5-6s for readability.
const T = {
  logoIn: 600,
  logoHold: 5400,        // logo holds for ~6s total
  eyebrowStart: 6000,    // eyebrow types out (0-7.4s)
  headlineStart: 9500,   // headline cascade (9.5-13s)
  subStart: 14000,       // subtitle + line sweep (14-18s)
  phoneEnter: 18000,     // phone enters (18-20s)
  navAnimate: 21000,     // nav + cards (21-26s)
  cardsStagger: 22000,
  featuresStart: 28000,  // feature badges (28-30s)
  finalStart: 31000,     // final frame (31-35s)
  fadeOut: 35000,        // fade to black (35-38s)
  loopAt: 38000,         // restart at 38s
};

// ── Spring configs (Apple-spec) ───────────────────────────────────────────
const SPRING_SNAPPY = { type: "spring" as const, stiffness: 420, damping: 28, mass: 0.6 };
const SPRING_GENTLE = { type: "spring" as const, stiffness: 180, damping: 22, mass: 0.8 };
const SPRING_BOUNCE = { type: "spring" as const, stiffness: 300, damping: 15, mass: 0.7 };

// ── Helper: stagger delay generator ───────────────────────────────────────
function stagger(index: number, base: number, gap: number) {
  return base + index * gap;
}

// ── Phase gate: which phase are we in? ───────────────────────────────────
function usePhase(elapsed: number) {
  return {
    logo: elapsed >= 0 && elapsed < T.logoHold + T.logoIn,
    eyebrow: elapsed >= T.eyebrowStart,
    headline: elapsed >= T.headlineStart,
    sub: elapsed >= T.subStart,
    phone: elapsed >= T.phoneEnter,
    nav: elapsed >= T.navAnimate,
    cards: elapsed >= T.cardsStagger,
    features: elapsed >= T.featuresStart,
    final: elapsed >= T.finalStart,
    fadeOut: elapsed >= T.fadeOut,
  };
}

// ── Typewriter text simulation ────────────────────────────────────────────
function useTypewriter(text: string, startMs: number, elapsed: number, speed = 55) {
  if (elapsed < startMs) return "";
  const chars = Math.min(text.length, Math.floor((elapsed - startMs) / speed));
  return text.slice(0, chars);
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function Showcase() {
  const [elapsed, setElapsed] = useState(0);
  const [key, setKey] = useState(0);
  const rafRef = useRef(0);
  const startRef = useRef(performance.now());

  // Timer loop
  const tick = useCallback(() => {
    const now = performance.now();
    const e = now - startRef.current;
    setElapsed(e);
    if (e >= T.loopAt) {
      // Reset for loop
      startRef.current = now;
      setKey((k) => k + 1);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    startRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick, key]);

  const phase = usePhase(elapsed);
  const searchQuery = useTypewriter("Anthropic", T.cardsStagger + 400, elapsed, 80);

  // Scroll-linked parallax for the phone (simulated with time)
  const phoneY = useMotionValue(100);
  const phoneRotate = useTransform(phoneY, [100, 0], [8, 0]);
  const phoneScale = useTransform(phoneY, [100, 0], [0.85, 1]);

  useEffect(() => {
    if (phase.phone) {
      animate(phoneY, 0, { ...SPRING_BOUNCE, duration: 1.2 });
    } else {
      phoneY.set(100);
    }
  }, [phase.phone, phoneY, key]);

  return (
    <div
      key={key}
      className="showcase-root relative flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#050505]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Background layers ──────────────────────────────────────────── */}
      <ShowcaseBackground phase={phase} elapsed={elapsed} />

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="showcase-content relative z-10 flex flex-col items-center justify-center gap-0 px-6">
        <AnimatePresence mode="wait">
          {/* Phase 1: Logo + Branding (0-10s) */}
          {elapsed < T.phoneEnter && (
            <motion.div
              key="brand"
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
            >
              {/* Logo mark */}
              <LogoMark phase={phase} elapsed={elapsed} />

              {/* Eyebrow: SIGNAL · AI INTELLIGENCE */}
              <Eyebrow elapsed={elapsed} />

              {/* Headline */}
              <Headline elapsed={elapsed} />

              {/* Subtitle */}
              <Subtitle elapsed={elapsed} />
            </motion.div>
          )}

          {/* Phase 2: App Demo (10-18s) */}
          {elapsed >= T.phoneEnter && elapsed < T.finalStart && (
            <motion.div
              key="demo"
              className="flex flex-col items-center gap-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9, filter: "blur(12px)" }}
              transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
            >
              {/* Phone mockup with animated UI */}
              <PhoneMockup
                phase={phase}
                elapsed={elapsed}
                searchQuery={searchQuery}
                phoneY={phoneY}
                phoneRotate={phoneRotate}
                phoneScale={phoneScale}
              />

              {/* Feature badges below phone */}
              <FeatureBadges elapsed={elapsed} />
            </motion.div>
          )}

          {/* Phase 3: Final frame (18-22s) */}
          {elapsed >= T.finalStart && <FinalFrame elapsed={elapsed} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// BACKGROUND
// ══════════════════════════════════════════════════════════════════════════
function ShowcaseBackground({
  phase,
  elapsed,
}: {
  phase: ReturnType<typeof usePhase>;
  elapsed: number;
}) {
  // Radial green glow that pulses
  const glowOpacity = useMotionValue(0);
  const glowScale = useMotionValue(0.5);

  useEffect(() => {
    if (phase.logo) {
      animate(glowOpacity, [0, 0.3, 0.15], { duration: 3, ease: "easeOut" });
      animate(glowScale, [0.3, 1.2, 1], { duration: 3, ease: "easeOut" });
    } else if (phase.phone) {
      animate(glowOpacity, 0.08, { duration: 1 });
      animate(glowScale, 1.5, { duration: 1.5 });
    } else if (phase.final) {
      animate(glowOpacity, [0.08, 0.25], { duration: 0.8 });
      animate(glowScale, [1.5, 1], { duration: 0.8 });
    } else if (phase.fadeOut) {
      animate(glowOpacity, 0, { duration: 1.5 });
    }
  }, [phase, glowOpacity, glowScale]);

  // Floating particles
  const particles = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 8,
      duration: Math.random() * 12 + 10,
    })),
  ).current;

  return (
    <>
      {/* Central green glow */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: 800,
          height: 800,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, hsla(152 72% 48% / var(--o, 0)) 0%, hsla(152 72% 48% / calc(var(--o, 0) * 0.3)) 40%, transparent 70%)",
          scaleX: glowScale,
          scaleY: glowScale,
          "--o": glowOpacity,
        }}
      />

      {/* Secondary teal glow (offset) */}
      <motion.div
        className="pointer-events-none absolute left-[30%] top-[40%]"
        style={{
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, hsla(170 60% 40% / 0.04) 0%, transparent 60%)",
          opacity: phase.phone ? 0.8 : phase.fadeOut ? 0 : 0.4,
        }}
      />

      {/* Particles */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: "hsl(152 72% 48%)",
            boxShadow: "0 0 6px hsla(152 72% 48%, 0.4)",
          }}
          animate={{
            y: [0, -120, -240],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Scan line (passes during phone phase) */}
      <AnimatePresence>
        {elapsed >= T.phoneEnter + 500 && elapsed < T.phoneEnter + 1500 && (
          <motion.div
            key="scan"
            className="absolute inset-x-0 h-[1px]"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, hsla(152 72% 48% / 0.6) 30%, hsla(152 72% 48% / 0.8) 50%, hsla(152 72% 48% / 0.6) 70%, transparent 100%)",
            }}
            initial={{ top: "0%" }}
            animate={{ top: "100%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: [0.2, 0, 0, 1] }}
          />
        )}
      </AnimatePresence>

      {/* Fade to black overlay */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-black"
        animate={{ opacity: phase.fadeOut ? Math.min(1, (elapsed - T.fadeOut) / 1500) : 0 }}
      />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// LOGO MARK
// ══════════════════════════════════════════════════════════════════════════
function LogoMark({ phase, elapsed }: { phase: ReturnType<typeof usePhase>; elapsed: number }) {
  const logoPulse = useMotionValue(0);
  useEffect(() => {
    if (phase.logo) {
      animate(logoPulse, [0, 1, 0.85, 1], { duration: 2, ease: "easeInOut" });
    }
  }, [phase.logo, logoPulse]);

  return (
    <motion.div
      className="relative mb-8 flex h-20 w-20 items-center justify-center"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: phase.logo ? 1 : 0, scale: phase.logo ? 1 : 0.8 }}
      transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }}
    >
      {/* Glow ring */}
      <motion.div
        className="absolute inset-0 rounded-3xl"
        style={{
          background:
            "conic-gradient(from 0deg, hsla(152 72% 48% / 0.4), transparent 60%, hsla(152 72% 48% / 0.2) 100%)",
          scale: logoPulse,
          filter: "blur(8px)",
        }}
      />

      {/* Inner mark */}
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl">
        <img
          src="/signal-mark.png"
          alt=""
          className="h-8 w-8"
          style={{ filter: "drop-shadow(0 0 12px hsla(152 72% 48% / 0.6))" }}
        />
      </div>

      {/* Radar rings */}
      {[1, 2, 3].map((ring) => (
        <motion.div
          key={ring}
          className="absolute inset-0 rounded-3xl border border-[hsl(152_72%_48%)]"
          initial={{ opacity: 0, scale: 1 }}
          animate={{
            opacity: [0, 0.3, 0],
            scale: [1, 1 + ring * 0.5],
          }}
          transition={{
            duration: 2.5,
            delay: ring * 0.3,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// EYEBROW TEXT
// ══════════════════════════════════════════════════════════════════════════
function Eyebrow({ elapsed }: { elapsed: number }) {
  const text = "SIGNAL · AI INTELLIGENCE";
  const visibleChars = Math.min(
    text.length,
    Math.max(0, Math.floor((elapsed - T.eyebrowStart) / 40)),
  );

  return (
    <motion.p
      className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em]"
      style={{ color: "hsl(152 72% 48%)" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: visibleChars > 0 ? 1 : 0, y: visibleChars > 0 ? 0 : 10 }}
      transition={{ duration: 0.4 }}
    >
      {/* Green dot */}
      <motion.span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "hsl(152 72% 48%)", boxShadow: "0 0 8px hsla(152 72% 48%, 0.6)" }}
        animate={{
          scale: [1, 1.4, 1],
          opacity: [1, 0.6, 1],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <span className="font-mono">
        {text.slice(0, visibleChars)}
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
          className="ml-0.5 inline-block w-[2px]"
          style={{ background: "hsl(152 72% 48%)", height: "0.9em", verticalAlign: "middle" }}
        />
      </span>
    </motion.p>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// HEADLINE
// ══════════════════════════════════════════════════════════════════════════
function Headline({ elapsed }: { elapsed: number }) {
  const words = ["Every", "breakthrough.", "None", "of", "the", "noise."];
  const baseDelay = T.headlineStart;

  return (
    <h1 className="mb-5 flex flex-wrap items-baseline justify-center gap-x-3 text-center text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl">
      {words.map((word, i) => {
        const wordDelay = stagger(i, baseDelay, 280);
        const show = elapsed >= wordDelay;
        const isGreen = word === "breakthrough." || word === "noise.";
        return (
          <motion.span
            key={i}
            style={{ color: isGreen ? "hsl(152 72% 48%)" : "hsl(140 5% 94%)" }}
            initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
            animate={
              show
                ? { opacity: 1, y: 0, filter: "blur(0px)" }
                : { opacity: 0, y: 30, filter: "blur(8px)" }
            }
            transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
          >
            {word}
          </motion.span>
        );
      })}
    </h1>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SUBTITLE
// ══════════════════════════════════════════════════════════════════════════
function Subtitle({ elapsed }: { elapsed: number }) {
  const show = elapsed >= T.subStart;

  return (
    <motion.div
      className="flex flex-col items-center gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={show ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.2, 0, 0, 1], delay: 0.2 }}
    >
      {/* Green divider line */}
      <motion.div
        className="h-[1px] w-0"
        style={{ background: "linear-gradient(90deg, transparent, hsl(152 72% 48%), transparent)" }}
        animate={show ? { width: 120 } : { width: 0 }}
        transition={{ duration: 1, ease: [0.2, 0, 0, 1], delay: 0.1 }}
      />

      <p
        className="max-w-md text-center text-sm leading-relaxed sm:text-base"
        style={{ color: "hsl(140 5% 55%)" }}
      >
        Signal scans thousands of sources and surfaces only the AI moves
        that matter to you.
      </p>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PHONE MOCKUP
// ══════════════════════════════════════════════════════════════════════════
function PhoneMockup({
  phase,
  elapsed,
  searchQuery,
  phoneY,
  phoneRotate,
  phoneScale,
}: {
  phase: ReturnType<typeof usePhase>;
  elapsed: number;
  searchQuery: string;
  phoneY: ReturnType<typeof useMotionValue>;
  phoneRotate: ReturnType<typeof useTransform<number, number>>;
  phoneScale: ReturnType<typeof useTransform<number, number>>;
}) {
  return (
    <motion.div
      className="relative"
      style={{
        y: phoneY,
        rotate: phoneRotate,
        scale: phoneScale,
        perspective: 1000,
      }}
    >
      {/* Phone frame */}
      <div
        className="relative overflow-hidden rounded-[3rem] border-[8px] border-zinc-900 bg-zinc-950 shadow-2xl"
        style={{
          width: 280,
          height: 600,
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.05), 0 40px 100px -20px rgba(0,0,0,0.8), 0 0 120px -20px hsla(152 72% 48% / 0.15)",
        }}
      >
        {/* Dynamic Island */}
        <div
          className="absolute left-1/2 top-2.5 z-30 flex -translate-x-1/2 items-center justify-center rounded-full bg-black px-6 py-1.5"
          style={{ width: 100 }}
        >
          <div className="absolute left-[22%] top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-zinc-800/80" />
          <div className="absolute left-[38%] top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-zinc-800/60" />
        </div>

        {/* Screen content */}
        <PhoneScreen phase={phase} elapsed={elapsed} searchQuery={searchQuery} />

        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 h-[4px] w-[30%] -translate-x-1/2 rounded-full bg-white/20" />
      </div>

      {/* Phone glow reflection */}
      <motion.div
        className="pointer-events-none absolute -inset-8 rounded-[4rem]"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, hsla(152 72% 48% / 0.08) 0%, transparent 60%)",
        }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PHONE SCREEN CONTENT (animated mock UI)
// ══════════════════════════════════════════════════════════════════════════
function PhoneScreen({
  phase,
  elapsed,
  searchQuery,
}: {
  phase: ReturnType<typeof usePhase>;
  elapsed: number;
  searchQuery: string;
}) {
  const cardData = [
    { title: "Anthropic Launches Claude Sonnet 5", score: 92, tag: "News" },
    { title: "Groq Reaches 1M Requests/Sec", score: 87, tag: "Tool" },
    { title: "Mistral AI Raises $2B Series C", score: 84, tag: "News" },
    { title: "Cursor 1.0 Ships AI-first IDE", score: 81, tag: "Tool" },
  ];

  const isSearch = elapsed >= T.cardsStagger + 300;

  // Auto-scroll the feed: once cards have staggered in, ease the content up
  // so the cards below the fold become visible. Only in the home (non-search)
  // view, before feature badges appear.
  const scrollStart = T.cardsStagger + cardData.length * 200 + 600;
  const scrollEnd = Math.min(T.featuresStart, T.cardsStagger + 5000);
  const scrollProgress =
    elapsed < scrollStart
      ? 0
      : elapsed > scrollEnd
        ? 1
        : (elapsed - scrollStart) / (scrollEnd - scrollStart);
  // ease-in-out for a natural, smooth pan
  const eased = scrollProgress < 0.5
    ? 2 * scrollProgress * scrollProgress
    : 1 - Math.pow(-2 * scrollProgress + 2, 2) / 2;
  const feedY = -eased * 110;

  return (
    <div className="relative flex h-full flex-col bg-[#080808]">
      {/* Status bar */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-10 pb-1">
        <span className="text-[10px] font-semibold" style={{ color: "hsl(140 5% 94%)" }}>
          9:41
        </span>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm border border-white/40" />
          <div className="h-1.5 w-5 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Header */}
      <AnimatePresence mode="wait">
        {!isSearch ? (
          <motion.div
            key="home-header"
            className="px-5 pt-3 pb-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={SPRING_SNAPPY}
          >
            <div className="flex items-center gap-2">
              <motion.div
                className="h-2 w-2 rounded-full"
                style={{ background: "hsl(152 72% 48%)" }}
                animate={{ scale: [1, 1.5, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px]" style={{ color: "hsl(140 5% 55%)" }}>
                Updated 2m ago
              </span>
            </div>
            <h2 className="mt-1 text-base font-extrabold" style={{ color: "hsl(140 5% 94%)" }}>
              <span style={{ color: "hsl(152 72% 48%)" }}>Welcome back</span> Kaushal
            </h2>
            <p className="text-[10px]" style={{ color: "hsl(140 5% 45%)" }}>
              Today's AI Intelligence Briefing
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="search-header"
            className="px-5 pt-3 pb-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={SPRING_SNAPPY}
          >
            <h2 className="text-base font-extrabold" style={{ color: "hsl(152 72% 48%)" }}>
              Search
            </h2>
            {/* Search bar with typewriter */}
            <div
              className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2"
              style={{
                boxShadow:
                  searchQuery.length > 0
                    ? "0 0 0 1px hsla(152 72% 48% / 0.3), 0 0 20px -4px hsla(152 72% 48% / 0.15)"
                    : "none",
              }}
            >
              <Search size={11} style={{ color: "hsl(152 72% 48%)" }} />
              <span className="text-[11px] font-medium" style={{ color: "hsl(140 5% 94%)" }}>
                {searchQuery}
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse" }}
                  className="inline-block h-3 w-[1px] align-middle"
                  style={{ background: "hsl(152 72% 48%)" }}
                />
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards area */}
      <div className="flex-1 overflow-hidden px-4 pt-2">
        {!isSearch ? (
          <motion.div
            className="flex flex-col gap-2.5"
            style={{ y: feedY }}
          >
            {cardData.map((card, i) => (
              <PhoneCard
                key={i}
                card={card}
                delay={stagger(i, T.cardsStagger, 200)}
                elapsed={elapsed}
                visible={phase.cards}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <SearchResultCard elapsed={elapsed} delay={T.cardsStagger + 800} title="Anthropic Introduces Claude Sonnet 5" publisher="Anthropic" official />
            <SearchResultCard elapsed={elapsed} delay={T.cardsStagger + 1000} title="Anthropic Claude Sonnet 5 vs GPT-5.6 Comparison" publisher="TechCrunch" />
            <SearchResultCard elapsed={elapsed} delay={T.cardsStagger + 1200} title="Inside the Making of Claude Code" publisher="MIT Technology Review" />
          </motion.div>
        )}
      </div>

      {/* Bottom nav (liquid glass) */}
      <PhoneBottomNav elapsed={elapsed} phase={phase} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PHONE CARD
// ══════════════════════════════════════════════════════════════════════════
function PhoneCard({
  card,
  delay,
  elapsed,
  visible,
}: {
  card: { title: string; score: number; tag: string };
  delay: number;
  elapsed: number;
  visible: boolean;
}) {
  const show = visible && elapsed >= delay;

  return (
    <motion.div
      className="overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.03] p-3"
      initial={{ opacity: 0, x: 30, filter: "blur(4px)" }}
      animate={
        show
          ? { opacity: 1, x: 0, filter: "blur(0px)" }
          : { opacity: 0, x: 30 }
      }
      transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold leading-snug" style={{ color: "hsl(140 5% 94%)" }}>
            {card.title}
          </p>
          <p className="mt-1 text-[8px]" style={{ color: "hsl(140 5% 40%)" }}>
            3 min read
          </p>
        </div>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: card.score >= 90 ? "hsla(152 72% 48% / 0.12)" : "hsla(140 5% 12% / 1)",
          }}
        >
          <span
            className="text-[10px] font-extrabold"
            style={{
              color: card.score >= 90 ? "hsl(152 72% 48%)" : "hsl(140 5% 60%)",
            }}
          >
            {card.score}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 text-[7px] font-bold uppercase"
          style={{
            background: "hsla(152 72% 48% / 0.1)",
            color: "hsl(152 72% 48%)",
          }}
        >
          {card.tag}
        </span>
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SEARCH RESULT CARD
// ══════════════════════════════════════════════════════════════════════════
function SearchResultCard({
  elapsed,
  delay,
  title,
  publisher,
  official = false,
}: {
  elapsed: number;
  delay: number;
  title: string;
  publisher: string;
  official?: boolean;
}) {
  const show = elapsed >= delay;

  return (
    <motion.div
      className="overflow-hidden rounded-xl border p-3"
      style={{
        borderColor: official
          ? "hsla(152 72% 48% / 0.2)"
          : "rgba(255,255,255,0.04)",
        background: official
          ? "hsla(152 72% 48% / 0.04)"
          : "rgba(255,255,255,0.02)",
      }}
      initial={{ opacity: 0, y: 15, filter: "blur(3px)" }}
      animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
    >
      {official && (
        <span
          className="mb-1.5 inline-block rounded-full px-1.5 py-0.5 text-[7px] font-bold uppercase"
          style={{
            background: "hsla(152 72% 48% / 0.15)",
            color: "hsl(152 72% 48%)",
          }}
        >
          Official
        </span>
      )}
      <p className="text-[10px] font-bold leading-snug" style={{ color: "hsl(140 5% 90%)" }}>
        {title}
      </p>
      <p className="mt-1 text-[8px]" style={{ color: official ? "hsl(152 72% 48%)" : "hsl(140 5% 40%)" }}>
        {publisher}
      </p>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PHONE BOTTOM NAV (mini liquid glass)
// ══════════════════════════════════════════════════════════════════════════
function PhoneBottomNav({
  elapsed,
  phase,
}: {
  elapsed: number;
  phase: ReturnType<typeof usePhase>;
}) {
  const tabs = [
    { icon: <Home size={13} />, label: "Home" },
    { icon: <Search size={13} />, label: "Search" },
    { icon: <Compass size={13} />, label: "Advisor" },
    { icon: <Bookmark size={13} />, label: "Saved" },
    { icon: <SlidersHorizontal size={13} />, label: "Settings" },
  ];
  const [activeIdx, setActiveIdx] = useState(0);

  // Auto-rotate active tab during showcase
  useEffect(() => {
    if (!phase.nav) return;
    const interval = setInterval(() => {
      setActiveIdx((i) => (i + 1) % tabs.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [phase.nav, tabs.length]);

  const pillLeft = (activeIdx / tabs.length) * 100;
  const pillWidth = 100 / tabs.length;

  return (
    <motion.div
      className="relative mx-2 mb-1.5 flex items-center justify-center overflow-hidden rounded-2xl border border-white/[0.06] pb-0.5"
      style={{
        height: 52,
        background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
      initial={{ opacity: 0, y: 40 }}
      animate={phase.nav ? { opacity: 1, y: 0 } : {}}
      transition={{ ...SPRING_GENTLE, delay: 0.3 }}
    >
      {/* Liquid pill indicator */}
      <motion.div
        className="pointer-events-none absolute z-0 rounded-full"
        style={{
          width: `${pillWidth - 4}%`,
          left: `${pillLeft + 2}%`,
          top: 4,
          bottom: 4,
          background:
            "linear-gradient(145deg, hsla(152 72% 48% / 0.25) 0%, hsla(152 60% 40% / 0.15) 50%, hsla(152 72% 48% / 0.2) 100%)",
          boxShadow:
            "0 0 16px -2px hsla(152 72% 48% / 0.3), inset 0 1px 0 0 rgba(255,255,255,0.15)",
        }}
        layout
        transition={SPRING_SNAPPY}
      />

      {/* Top sheen */}
      <div
        className="pointer-events-none absolute left-[10%] right-[10%] top-0 z-20 h-[1px]"
        style={{
          background:
            "linear-gradient(90deg, transparent, hsla(0 0% 100% / 0.3) 50%, transparent)",
        }}
      />

      {/* Tabs */}
      <div className="relative z-10 grid w-full grid-cols-5">
        {tabs.map((tab, i) => (
          <motion.button
            key={i}
            className="flex flex-col items-center justify-center gap-0.5"
            animate={{
              scale: i === activeIdx ? 1.1 : 1,
            }}
            transition={SPRING_SNAPPY}
          >
            <span
              className="transition-colors duration-200"
              style={{
                color:
                  i === activeIdx
                    ? "hsl(152 72% 48%)"
                    : "hsl(140 5% 35%)",
                filter:
                  i === activeIdx
                    ? "drop-shadow(0 0 6px hsla(152 72% 48% / 0.5))"
                    : "none",
              }}
            >
              {tab.icon}
            </span>
            <span
              className="text-[7px] font-semibold"
              style={{
                color:
                  i === activeIdx
                    ? "hsl(152 72% 48%)"
                    : "hsl(140 5% 35%)",
              }}
            >
              {tab.label}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// FEATURE BADGES
// ══════════════════════════════════════════════════════════════════════════
function FeatureBadges({ elapsed }: { elapsed: number }) {
  const features = [
    { icon: <Zap size={14} />, label: "Real-time Intelligence" },
    { icon: <Brain size={14} />, label: "AI-Powered Curation" },
    { icon: <Newspaper size={14} />, label: "500+ Sources" },
    { icon: <TrendingUp size={14} />, label: "Signal Scoring" },
    { icon: <Shield size={14} />, label: "Official Sources First" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {features.map((f, i) => {
        const delay = stagger(i, T.featuresStart, 150);
        const show = elapsed >= delay;
        return (
          <motion.div
            key={i}
            className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={
              show
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: 20, scale: 0.9 }
            }
            transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
          >
            <span style={{ color: "hsl(152 72% 48%)" }}>{f.icon}</span>
            <span className="text-xs font-medium" style={{ color: "hsl(140 5% 80%)" }}>
              {f.label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// FINAL FRAME
// ══════════════════════════════════════════════════════════════════════════
function FinalFrame({ elapsed }: { elapsed: number }) {
  const show = elapsed >= T.finalStart;

  return (
    <motion.div
      className="flex flex-col items-center text-center"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={show ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }}
    >
      {/* Logo */}
      <motion.div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03]"
        initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ ...SPRING_BOUNCE, delay: 0.1 }}
        style={{ boxShadow: "0 0 40px hsla(152 72% 48% / 0.2)" }}
      >
        <img
          src="/signal-mark.png"
          alt=""
          className="h-9 w-9"
          style={{ filter: "drop-shadow(0 0 10px hsla(152 72% 48% / 0.5))" }}
        />
      </motion.div>

      {/* Wordmark */}
      <motion.h1
        className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl"
        style={{ color: "hsl(140 5% 94%)" }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0, 0, 1], delay: 0.2 }}
      >
        <span style={{ color: "hsl(152 72% 48%)" }}>Signal</span>
      </motion.h1>

      {/* Tagline */}
      <motion.p
        className="mt-3 max-w-sm text-sm leading-relaxed sm:text-base"
        style={{ color: "hsl(140 5% 55%)" }}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.2, 0, 0, 1], delay: 0.5 }}
      >
        High-signal AI intelligence. No noise.
      </motion.p>
    </motion.div>
  );
}
