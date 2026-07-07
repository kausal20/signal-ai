// signal-onboarding-ui · steps/SuccessStep.tsx  (Final step)
// Premium success screen with animated tick, glow effects, and smooth entrance.
// Uses Framer Motion for polished draw-on tick and spring animations.
import { motion } from "framer-motion";
import type { Signal } from "../shared/peek";

interface Props {
  firstName?: string;
  /** Topics used to caption the reveal (e.g. the user's interests). */
  topics?: string[];
  /** The first mock/live signals to show (kept for API compat, not displayed). */
  signals?: Signal[];
  onEnter: () => void;
}

export function SuccessStep({ onEnter }: Props) {
  return (
    <div
      className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8 text-center"
      style={{ background: "#050505" }}
    >
      {/* Ambient radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(46, 229, 143, 0.07) 0%, transparent 70%)",
        }}
      />

      {/* Outer pulsing ring */}
      <motion.div
        className="pointer-events-none absolute"
        style={{
          width: "200px",
          height: "200px",
          borderRadius: "50%",
          border: "1px solid rgba(46, 229, 143, 0.12)",
          top: "50%",
          left: "50%",
          marginTop: "-160px",
          marginLeft: "-100px",
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.08, 0.3],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, scale: 0.88, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 16, delay: 0.1 }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* Tick icon container */}
        <div className="relative mb-10 flex h-[120px] w-[120px] items-center justify-center">
          {/* Background glow */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(46, 229, 143, 0.15) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />

          {/* Rotating dashed ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
            className="absolute inset-2 rounded-full"
            style={{ border: "1px dashed rgba(46, 229, 143, 0.15)" }}
          />

          {/* Inner circle */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.2 }}
            className="relative flex h-[88px] w-[88px] items-center justify-center rounded-full"
            style={{
              background: "linear-gradient(135deg, hsl(152, 72%, 54%), hsl(152, 72%, 42%))",
              border: "1px solid rgba(46, 229, 143, 0.35)",
              boxShadow:
                "0 20px 60px rgba(46, 229, 143, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
            }}
          >
            <svg viewBox="0 0 64 64" width="54" height="54" fill="none" aria-hidden>
              <motion.path
                d="M18 33.5 27.5 43 47 22"
                stroke="#050505"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.55, delay: 0.55, ease: "easeOut" }}
              />
            </svg>
          </motion.div>

          {/* Subtle floating shadow */}
          <motion.div
            animate={{ opacity: [0.15, 0.35, 0.15], y: [-1, 2, -1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -bottom-2 h-1 w-12 rounded-full"
            style={{ background: "rgba(46, 229, 143, 0.25)", filter: "blur(4px)" }}
          />
        </div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          style={{
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "rgba(255, 255, 255, 0.95)",
            marginBottom: "10px",
          }}
        >
          You're all set.
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.05 }}
          style={{
            fontSize: "15px",
            lineHeight: 1.5,
            color: "rgba(255, 255, 255, 0.4)",
            maxWidth: "260px",
          }}
        >
          Signal is now tailored to you.
        </motion.p>
      </motion.div>

      {/* CTA Button */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.3 }}
        className="absolute inset-x-0 bottom-0 z-20 px-7 pb-10 pt-6"
        style={{
          background: "linear-gradient(to top, #050505 60%, transparent)",
        }}
      >
        <motion.button
          type="button"
          onClick={onEnter}
          whileTap={{ scale: 0.97 }}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            borderRadius: "16px",
            background: "#2EE58F",
            padding: "17px 0",
            fontSize: "16px",
            fontWeight: 700,
            color: "#000",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 8px 30px rgba(46, 229, 143, 0.3)",
          }}
        >
          Start Exploring
        </motion.button>
      </motion.div>
    </div>
  );
}
