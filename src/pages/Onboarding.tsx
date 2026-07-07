import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleDollarSign,
  Code2,
  Cpu,
  FlaskConical,
  GraduationCap,
  KanbanSquare,
  type LucideIcon,
  Rocket,
  SearchCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { getClientId } from "@/lib/clientId";
import { track } from "@/lib/signals";
import { useOnboarding } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";
import signalLogo from "@/assets/signal-logo.png";
import {
  OnboardingShell, WelcomeStep, NameStep, RoleStep, GoalStep, InterestsStep,
  TimeStep, ExperienceStep, NotificationsStep, LoadingStep, SuccessStep, STEP_ORDER,
} from "@/signal-onboarding-ui";

// P5 migration flag — new ui onboarding. Old onboarding stays below until verified.
const USE_V2_ONBOARDING = true;

// The new Goal step uses id "discover"; the backend validates
// "discover_business_opportunities". Map at the UI boundary so the stored value
// stays backend-valid (and Settings-compatible). All other ids already match.
const GOAL_TO_BACKEND: Record<string, string> = { discover: "discover_business_opportunities" };
const GOAL_TO_UI: Record<string, string> = { discover_business_opportunities: "discover" };

const TOTAL_STEPS = 10;

// Ã¢â€â‚¬Ã¢â€â‚¬ Dot Progress Bar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const StepDots = ({ current }: { current: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5, delay: 0.2 }}
    className="flex justify-center gap-2.5 pt-10 pb-2"
  >
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
      <motion.div
        key={i}
        animate={{
          scale: i + 1 === current ? 1.4 : 1,
          backgroundColor: i + 1 === current 
            ? "hsl(152, 72%, 48%)" 
            : i + 1 < current 
              ? "hsl(152, 72%, 48%)" 
              : "hsl(0, 0%, 25%)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 20 }}
        className="w-[6px] h-[6px] rounded-full"
      />
    ))}
  </motion.div>
);

// Ã¢â€â‚¬Ã¢â€â‚¬ Page transition wrapper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const pageVariants = {
  enter: { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

const ScreenContainer = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <motion.div
    variants={pageVariants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    className={cn("absolute inset-0 flex h-full min-h-0 w-full flex-col", className)}
  >
    {children}
  </motion.div>
);

const PremiumNotificationIcon = () => (
  <div className="relative flex h-40 w-40 items-center justify-center">
    <div className="absolute inset-4 rounded-full bg-green/10 blur-2xl" />
    <motion.div
      animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.12, 0.35] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      className="absolute inset-8 rounded-full border border-green/25"
    />
    <motion.div
      animate={{ y: [-5, 5, -5] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-green/25 bg-[radial-gradient(circle_at_30%_20%,hsl(152_72%_66%/0.35),hsl(152_72%_48%/0.14)_34%,hsl(150_14%_8%/0.96)_72%)] shadow-[0_22px_70px_hsl(152_72%_48%/0.24),inset_0_1px_0_hsl(0_0%_100%/0.16)]"
    >
      <svg
        viewBox="0 0 96 96"
        aria-hidden="true"
        className="relative h-20 w-20 drop-shadow-[0_0_18px_hsl(152_72%_48%/0.35)]"
      >
        <defs>
          <linearGradient id="signal-bell-gradient" x1="23" x2="73" y1="18" y2="78" gradientUnits="userSpaceOnUse">
            <stop stopColor="hsl(152 72% 68%)" />
            <stop offset="1" stopColor="hsl(152 72% 44%)" />
          </linearGradient>
        </defs>
        <path
          d="M48 18c-10.8 0-19.2 8.5-19.2 19.7v9.1c0 5.3-2.1 10.4-5.8 14.2l-1.7 1.8c-2.2 2.3-.6 6.1 2.7 6.1h48c3.3 0 4.9-3.8 2.7-6.1L73 61c-3.7-3.8-5.8-8.9-5.8-14.2v-9.1C67.2 26.5 58.8 18 48 18Z"
          fill="url(#signal-bell-gradient)"
          fillOpacity="0.2"
          stroke="url(#signal-bell-gradient)"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path
          d="M40.3 75.5c1.5 3.5 4.2 5.4 7.7 5.4s6.2-1.9 7.7-5.4"
          fill="none"
          stroke="hsl(152 72% 58%)"
          strokeLinecap="round"
          strokeWidth="5"
        />
        <path
          d="M25 58h46"
          fill="none"
          stroke="hsl(152 72% 58%)"
          strokeLinecap="round"
          strokeWidth="3"
          opacity="0.65"
        />
      </svg>
    </motion.div>
  </div>
);

const PremiumSuccessIcon = () => (
  <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
    <div className="absolute inset-4 rounded-full bg-green/10 blur-2xl" />
    <motion.div
      animate={{ scale: [1, 1.1, 1], opacity: [0.35, 0.08, 0.35] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="absolute inset-8 rounded-full border border-green/25"
    />
    <motion.div
      initial={{ scale: 0.82, opacity: 0, y: 16 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }}
      className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] border border-green/25 bg-[radial-gradient(circle_at_30%_20%,hsl(152_72%_68%/0.42),hsl(152_72%_48%/0.18)_36%,hsl(150_14%_8%/0.96)_74%)] shadow-[0_22px_70px_hsl(152_72%_48%/0.24),inset_0_1px_0_hsl(0_0%_100%/0.16)]"
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        className="absolute inset-4 rounded-full border border-dashed border-green/20"
      />
      <svg
        viewBox="0 0 96 96"
        aria-hidden="true"
        className="relative h-20 w-20 drop-shadow-[0_0_18px_hsl(152_72%_48%/0.35)]"
      >
        <defs>
          <linearGradient id="signal-success-gradient" x1="22" x2="76" y1="20" y2="76" gradientUnits="userSpaceOnUse">
            <stop stopColor="hsl(152 72% 70%)" />
            <stop offset="1" stopColor="hsl(152 72% 44%)" />
          </linearGradient>
        </defs>
        <motion.circle
          cx="48"
          cy="48"
          r="27"
          fill="url(#signal-success-gradient)"
          fillOpacity="0.18"
          stroke="url(#signal-success-gradient)"
          strokeWidth="4"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.85, ease: "easeOut", delay: 0.25 }}
        />
        <motion.path
          d="M34 49.5 43.5 59 64 37"
          fill="none"
          stroke="hsl(152 72% 62%)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="7"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.65 }}
        />
      </svg>
      <motion.div
        animate={{ opacity: [0.15, 0.45, 0.15], y: [-2, 2, -2] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-6 h-1 w-10 rounded-full bg-green/30 blur-sm"
      />
    </motion.div>
  </div>
);

// Ã¢â€â‚¬Ã¢â€â‚¬ Bottom CTA Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const BottomCTA = ({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) => (
  <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-background via-background/90 to-transparent">
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileTap={!disabled ? { scale: 0.97 } : undefined}
      className={cn(
        "w-full py-4 rounded-full font-semibold text-base flex items-center justify-center gap-2 transition-all duration-300",
        !disabled
          ? "bg-green text-black shadow-[0_0_24px_hsl(152_72%_48%/0.25)] hover:shadow-[0_0_32px_hsl(152_72%_48%/0.35)]"
          : "bg-white/[0.06] text-white/20 cursor-not-allowed"
      )}
    >
      {label} {!disabled && <ChevronRight className="w-4 h-4" />}
    </motion.button>
  </div>
);

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SCREEN 1 Ã¢â‚¬â€ Welcome
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const WelcomeScreen = ({ onNext }: { onNext: () => void }) => (
  <ScreenContainer className="items-center justify-center px-6 py-8">
    <div className="flex w-full max-w-md flex-col items-center justify-center text-center">
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        className="w-20 h-20 bg-green/10 rounded-[1.5rem] border border-green/20 flex items-center justify-center mb-9 relative overflow-hidden"
      >
        <img
          src={signalLogo}
          alt="Signal"
          className="relative z-10 h-14 w-14 object-contain drop-shadow-[0_0_16px_hsl(152_72%_48%/0.4)]"
        />
        {/* Pulse ring */}
        <motion.div
          animate={{ scale: [1, 1.6], opacity: [0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          className="absolute inset-0 border border-green/30 rounded-[1.5rem]"
        />
      </motion.div>

      <motion.h1
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="text-[2rem] leading-[1.15] font-bold tracking-tight mb-4 text-foreground"
      >
        Stay Ahead.<br />Stay Smarter.
      </motion.h1>

      <motion.p
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed"
      >
        The AI world moves fast.
        <br /><br />
        Signal filters thousands of updates and delivers only what matters.
      </motion.p>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="mt-8 w-full px-1"
      >
        <button
          onClick={onNext}
          className="w-full bg-green text-black py-4 rounded-full font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-[0_0_24px_hsl(152_72%_48%/0.25)]"
        >
          Get Started <ChevronRight className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  </ScreenContainer>
);

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SCREEN 2 Ã¢â‚¬â€ Choose Interests
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const NameScreen = ({ name, setName, onNext }: { name: string; setName: React.Dispatch<React.SetStateAction<string>>; onNext: () => void }) => {
  const canContinue = name.trim().length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canContinue) {
      localStorage.setItem("signal:userName", name.trim());
      onNext();
    }
  };

  return (
    <ScreenContainer className="items-center justify-center px-6 py-8">
      <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col items-center justify-center text-center">
        <motion.div
          initial={{ scale: 0.86, opacity: 0, y: 14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 16 }}
          className="mb-8 flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.5rem] border border-green/20 bg-green/10 shadow-[0_18px_56px_hsl(152_72%_48%/0.14)]"
        >
          <img src={signalLogo} alt="Signal" className="h-14 w-14 object-contain" />
        </motion.div>

        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mb-3 text-3xl font-bold tracking-tight text-foreground"
        >
          What should we call you?
        </motion.h2>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="mb-8 max-w-[260px] text-sm leading-relaxed text-muted-foreground"
        >
          We will use this to make Signal feel personal.
        </motion.p>

        <motion.input
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="given-name"
          placeholder="Your name"
          className="mb-5 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-center text-lg font-semibold text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-green/50 focus:bg-green/[0.04] focus:shadow-[0_0_0_4px_hsl(152_72%_48%/0.08)]"
        />

        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          disabled={!canContinue}
          whileTap={canContinue ? { scale: 0.97 } : undefined}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-full py-4 text-base font-semibold transition-all duration-300",
            canContinue
              ? "bg-green text-black shadow-[0_0_24px_hsl(152_72%_48%/0.25)]"
              : "cursor-not-allowed bg-white/[0.06] text-white/20"
          )}
        >
          Continue {canContinue && <ChevronRight className="h-4 w-4" />}
        </motion.button>
      </form>
    </ScreenContainer>
  );
};

const INTERESTS = [
  "AI Coding", "Automation", "AI Agents", "Business", "Startups",
  "Marketing", "Design", "Video AI", "Voice AI", "Productivity",
  "Research", "Open Source", "Robotics", "Education", "Developer Tools",
  "MCP", "Memory", "Reasoning", "Coding Assistants", "Generative AI"
];

const InterestsScreen = ({ interests, setInterests, onNext }: { interests: string[]; setInterests: React.Dispatch<React.SetStateAction<string[]>>; onNext: () => void }) => {
  const toggle = (i: string) => {
    setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]);
  };
  const isValid = interests.length >= 3;

  return (
    <ScreenContainer className="px-5 pt-4">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
        <motion.h2
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="text-2xl font-bold mb-1 text-foreground"
        >
          What interests you?
        </motion.h2>
        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-xs text-muted-foreground mb-6"
        >
          Select at least 3 topics to personalize your feed.
        </motion.p>

        <div className="flex flex-wrap gap-2.5">
          {INTERESTS.map((interest, idx) => {
            const selected = interests.includes(interest);
            return (
              <motion.button
                key={interest}
                onClick={() => toggle(interest)}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * idx, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                whileTap={{ scale: 0.93 }}
                className={cn(
                  "px-4 py-2.5 rounded-full text-xs font-semibold transition-all duration-300 border",
                  selected
                    ? "bg-green text-black border-green shadow-[0_0_16px_hsl(152_72%_48%/0.3)]"
                    : "bg-white/[0.04] text-muted-foreground border-white/[0.06] hover:text-foreground hover:bg-white/[0.07]"
                )}
              >
                {interest}
              </motion.button>
            );
          })}
        </div>
      </div>

      <BottomCTA onClick={onNext} disabled={!isValid} label="Continue" />
    </ScreenContainer>
  );
};


type SelectOption = {
  id: string;
  label: string;
  icon?: LucideIcon;
  wide?: boolean;
};

const ROLE_OPTIONS: SelectOption[] = [
  { id: "founder", label: "Founder", icon: Rocket },
  { id: "developer", label: "Developer", icon: Code2 },
  { id: "student", label: "Student", icon: GraduationCap },
  { id: "ai_engineer", label: "AI Engineer", icon: Cpu },
  { id: "freelancer", label: "Freelancer", icon: BriefcaseBusiness },
  { id: "marketer", label: "Marketer", icon: ChartNoAxesCombined },
  { id: "researcher", label: "Researcher", icon: FlaskConical },
  { id: "investor", label: "Investor", icon: CircleDollarSign },
  { id: "product_manager", label: "Product Manager", icon: KanbanSquare },
  { id: "other", label: "Other", icon: SearchCheck },
];

const PRIMARY_GOAL_OPTIONS: SelectOption[] = [
  { id: "build_ai_startup", label: "Build an AI Startup", icon: Rocket },
  { id: "grow_business", label: "Grow My Business", icon: Building2 },
  { id: "automate_work", label: "Automate My Work", icon: Workflow },
  { id: "become_ai_developer", label: "Become an AI Developer", icon: Code2 },
  { id: "learn_ai", label: "Learn AI", icon: BookOpen },
  { id: "discover_business_opportunities", label: "Find AI Business Opportunities", icon: CircleDollarSign },
  { id: "stay_updated", label: "Stay Updated with AI", icon: SearchCheck },
  { id: "ai_research", label: "AI Research", icon: FlaskConical },
];

const TIME_BUDGET_OPTIONS: SelectOption[] = [
  { id: "lt_2h", label: "Less than 2 hours" },
  { id: "2_5h", label: "2-5 hours" },
  { id: "5_10h", label: "5-10 hours" },
  { id: "10_20h", label: "10-20 hours" },
  { id: "20h_plus", label: "20+ hours" },
];

const EXPERIENCE_OPTIONS: SelectOption[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "expert", label: "Expert" },
];

const SingleSelectScreen = ({
  title,
  options,
  value,
  setValue,
  onNext,
  columns = 2,
}: {
  title: string;
  options: SelectOption[];
  value: string | null;
  setValue: React.Dispatch<React.SetStateAction<string | null>>;
  onNext: () => void;
  columns?: 1 | 2;
}) => (
  <ScreenContainer className="px-5 pt-4 flex flex-col h-full">
    <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
      <motion.h2
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-2xl font-bold mb-6 text-foreground"
      >
        {title}
      </motion.h2>

      <div className={columns === 2 ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
        {options.map((option, idx) => {
          const selected = value === option.id;
          const Icon = option.icon;
          return (
            <motion.button
              key={option.id}
              onClick={() => setValue(option.id)}
              initial={{ opacity: 0, scale: columns === 2 ? 0.9 : 1, y: columns === 1 ? 12 : 0 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.06 * idx, duration: 0.4 }}
              whileTap={{ scale: columns === 2 ? 0.95 : 0.98 }}
              className={cn(
                "glass-card p-4 text-left transition-all duration-300",
                columns === 2 ? "flex min-h-[104px] flex-col justify-between" : "relative",
                selected && "!border-green/40 !bg-green/[0.06] shadow-[0_0_20px_hsl(152_72%_48%/0.08)]",
                option.wide && columns === 2 ? "col-span-2" : "col-span-1"
              )}
            >
              {columns === 2 ? (
                <>
                  <span
                    className={cn(
                      "mb-3 flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-300",
                      selected ? "border-green/30 bg-green/15 text-green" : "border-white/[0.08] bg-white/[0.035] text-green/70"
                    )}
                  >
                    {Icon && <Icon className="h-5 w-5" strokeWidth={1.9} />}
                  </span>
                  <span className={cn("font-medium text-xs leading-tight transition-colors duration-300", selected ? "text-foreground" : "text-foreground/70")}>
                    {option.label}
                  </span>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("font-semibold text-sm", selected ? "text-foreground" : "text-foreground/80")}>{option.label}</span>
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                      selected ? "border-green bg-green" : "border-white/15"
                    )}
                  >
                    {selected && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
                        <Check className="w-3 h-3 text-black" />
                      </motion.div>
                    )}
                  </div>
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>

    <BottomCTA onClick={onNext} disabled={!value} label="Continue" />
  </ScreenContainer>
);

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SCREEN 5 Ã¢â‚¬â€ Enable Notifications
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const EnableNotificationsScreen = ({ onNext }: { onNext: () => void }) => (
  <ScreenContainer className="items-center justify-center overflow-hidden px-6 py-8">
    {/* Background depth glow */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[350px] h-[350px] bg-green/[0.04] rounded-full blur-[80px] pointer-events-none" />

    <div className="relative z-10 flex w-full max-w-sm flex-col items-center justify-center text-center">
      
      {/* Branded notification icon */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 14 }}
        className="mb-6"
      >
        <PremiumNotificationIcon />
      </motion.div>

      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-2xl font-bold tracking-tight mb-3 text-foreground"
      >
        Never Miss an AI Breakthrough.
      </motion.h2>
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-sm text-muted-foreground mb-10"
      >
        Signal only sends important updates.
      </motion.p>

      {/* Centered Actions */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="w-full max-w-md mx-auto flex flex-col gap-3"
      >
        <button
          onClick={onNext}
          className="w-full bg-green text-black py-4 rounded-full font-semibold text-base active:scale-[0.97] transition-transform shadow-[0_0_24px_hsl(152_72%_48%/0.25)]"
        >
          Allow Notifications
        </button>
        <button
          onClick={onNext}
          className="w-full bg-transparent text-muted-foreground py-3 rounded-full font-medium text-sm active:scale-[0.97] transition-all hover:text-foreground"
        >
          Maybe Later
        </button>
      </motion.div>
    </div>
  </ScreenContainer>
);

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SCREEN 6 Ã¢â‚¬â€ Loading
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const LOADING_MESSAGES = [
  "Scanning AI ecosystemÃ¢â‚¬Â¦",
  "Preparing your feedÃ¢â‚¬Â¦",
  "Finding hidden AI gemsÃ¢â‚¬Â¦",
  "Learning your interestsÃ¢â‚¬Â¦",
  "Almost readyÃ¢â‚¬Â¦"
];

const LoadingScreen = ({ onNext }: { onNext: () => void }) => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const stableOnNext = useCallback(onNext, []);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(progressInterval);
          setTimeout(stableOnNext, 500);
          return 100;
        }
        return p + Math.max(0.4, (100 - p) / 18);
      });
    }, 50);

    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev < LOADING_MESSAGES.length - 1 ? prev + 1 : prev));
    }, 1300);

    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
    };
  }, [stableOnNext]);

  return (
    <ScreenContainer className="justify-center items-center px-8">
      <div className="w-full max-w-sm mx-auto flex flex-col items-center">
        {/* Spinner */}
        <div className="relative w-16 h-16 mb-10 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 border-t-2 border-l-2 border-green/30 rounded-full"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-2 border-b-2 border-r-2 border-green/50 rounded-full"
          />
          <Sparkles className="w-6 h-6 text-green animate-pulse" />
        </div>

        {/* Rotating messages */}
        <div className="h-6 mb-8 relative w-full flex justify-center items-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={messageIndex}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-sm font-medium text-muted-foreground absolute text-center whitespace-nowrap"
            >
              {LOADING_MESSAGES[messageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-green rounded-full shadow-[0_0_8px_hsl(152_72%_48%/0.4)]"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>
    </ScreenContainer>
  );
};

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// SCREEN 7 Ã¢â‚¬â€ Success
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const SuccessScreen = ({ onFinish }: { onFinish: () => void }) => (
  <ScreenContainer className="items-center justify-center overflow-hidden px-6 py-8">
    {/* Ã¢â€â‚¬Ã¢â€â‚¬ Depth layers Ã¢â€â‚¬Ã¢â€â‚¬ */}
    {/* Large background radial glow */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-green/[0.05] rounded-full blur-[100px] pointer-events-none" />
    {/* Secondary smaller warm glow */}
    <div className="absolute top-[40%] left-[55%] -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-green/[0.08] rounded-full blur-[60px] pointer-events-none" />
    {/* Subtle grid pattern overlay for texture */}
    <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, hsl(152,72%,48%) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

    {/* Expanding celebration rings */}
    <motion.div
      animate={{ scale: [0.5, 2.5], opacity: [0.15, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 0.8 }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-green/30 rounded-full pointer-events-none"
    />
    <motion.div
      animate={{ scale: [0.5, 2.2], opacity: [0.1, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 1.5 }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-green/20 rounded-full pointer-events-none"
    />

    {/* Ã¢â€â‚¬Ã¢â€â‚¬ Centered content Ã¢â€â‚¬Ã¢â€â‚¬ */}
    <div className="relative z-10 flex w-full max-w-sm flex-col items-center justify-center text-center">
      <PremiumSuccessIcon />

      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-3xl font-bold tracking-tight mb-3 text-foreground"
      >
        You're All Set!
      </motion.h2>

      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="text-sm text-muted-foreground mb-10"
      >
        Signal is now ready to personalize your AI intelligence and daily recommendations.
      </motion.p>

      {/* Button placed right after text, inside the centered column */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="w-full"
      >
        <button
          onClick={onFinish}
          className="w-full bg-green text-black py-4 rounded-full font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-[0_0_24px_hsl(152_72%_48%/0.25)] relative overflow-hidden"
        >
          {/* Button inner shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] animate-[shimmer_3s_infinite]" />
          <span className="relative z-10 flex items-center gap-2">Enter Signal <ChevronRight className="w-4 h-4" /></span>
        </button>
      </motion.div>
    </div>
  </ScreenContainer>
);



// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// MAIN ONBOARDING CONTAINER
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
export default function Onboarding() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const { completeOnboarding } = useOnboarding();

  const [name, setName] = useState("");
  const [primaryRole, setPrimaryRole] = useState<string | null>(null);
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [weeklyTimeBudget, setWeeklyTimeBudget] = useState<string | null>(null);
  const [experienceLevel, setExperienceLevel] = useState<string | null>(null);

  // UI-only navigation state for the v2 flow (answers stay in the model above).
  const [vIndex, setVIndex] = useState(0);
  const vNext = useCallback(() => setVIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1)), []);
  const advTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advTimer.current) clearTimeout(advTimer.current); }, []);
  const advance = () => { if (advTimer.current) clearTimeout(advTimer.current); advTimer.current = setTimeout(vNext, 320); };
  const toggleInterest = useCallback(
    (label: string) =>
      setInterests((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label])),
    [],
  );

  const nextStep = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const finishOnboarding = async () => {
    track('onboarding_completed', {
      meta: {
        primary_role: primaryRole,
        primary_goal: primaryGoal,
        interests_count: interests.length,
      },
    });

    await completeOnboarding({
      name: name.trim(),
      primary_role: primaryRole!,
      primary_goal: primaryGoal!,
      interests,
      weekly_time_budget: weeklyTimeBudget!,
      experience_level: experienceLevel!,
    });

    navigate("/");
  };


  // ── P5: ui onboarding (presentation only) ─────────────────────────────────
  // Answers use the EXISTING state model above (single source of truth); vIndex
  // is UI-only. Role/Goal auto-advance. Goal id is mapped to the backend-valid
  // value on select so the stored profile + Settings stay consistent. Success
  // calls the SAME finishOnboarding (track + completeOnboarding → localStorage +
  // save-onboarding-profile with retry). Old flow below is unchanged.
  if (USE_V2_ONBOARDING) {
    const key = STEP_ORDER[vIndex];
    const showBack = key !== "welcome" && key !== "success" && key !== "loading";
    const hideDots = key === "welcome" || key === "loading" || key === "success";
    return (
      <OnboardingShell
        step={vIndex + 1}
        total={STEP_ORDER.length}
        showBack={showBack}
        hideDots={hideDots}
        onBack={() => setVIndex((i) => Math.max(i - 1, 0))}
      >
        {key === "welcome" && <WelcomeStep onGetStarted={vNext} />}
        {key === "name" && <NameStep value={name} onChange={setName} onContinue={vNext} />}
        {key === "role" && (
          <RoleStep value={primaryRole} onSelect={(id) => { setPrimaryRole(id); advance(); }} />
        )}
        {key === "goal" && (
          <GoalStep
            value={primaryGoal ? (GOAL_TO_UI[primaryGoal] ?? primaryGoal) : null}
            onSelect={(id) => { setPrimaryGoal(GOAL_TO_BACKEND[id] ?? id); advance(); }}
          />
        )}
        {key === "interests" && (
          <InterestsStep selected={interests} onToggle={toggleInterest} onContinue={vNext} />
        )}
        {key === "time" && (
          <TimeStep value={weeklyTimeBudget} onSelect={setWeeklyTimeBudget} onContinue={vNext} />
        )}
        {key === "experience" && (
          <ExperienceStep value={experienceLevel} onSelect={setExperienceLevel} onContinue={vNext} />
        )}
        {key === "notifications" && (
          <NotificationsStep
            onChoose={(enabled) => {
              try { localStorage.setItem("signal:notificationsEnabled", String(enabled)); } catch { /* quota */ }
              vNext();
            }}
          />
        )}
        {key === "loading" && <LoadingStep onComplete={vNext} />}
        {key === "success" && (
          <SuccessStep
            firstName={name.trim().split(" ")[0] || undefined}
            topics={interests}
            onEnter={finishOnboarding}
          />
        )}
      </OnboardingShell>
    );
  }


  return (
    <div className="bg-background text-foreground h-full min-h-[100dvh] sm:min-h-full w-full overflow-hidden flex flex-col font-sans select-none pb-safe relative">
      {/* Progress dots */}
      <StepDots current={step} />

      {/* Screens */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {step === 1 && <WelcomeScreen key="s1" onNext={nextStep} />}
          {step === 2 && <NameScreen key="s2" name={name} setName={setName} onNext={nextStep} />}
          {step === 3 && <SingleSelectScreen key="s3" title="What describes you best?" options={ROLE_OPTIONS} value={primaryRole} setValue={setPrimaryRole} onNext={nextStep} />}
          {step === 4 && <SingleSelectScreen key="s4" title="What is your biggest goal?" options={PRIMARY_GOAL_OPTIONS} value={primaryGoal} setValue={setPrimaryGoal} onNext={nextStep} />}
          {step === 5 && <InterestsScreen key="s5" interests={interests} setInterests={setInterests} onNext={nextStep} />}
          {step === 6 && <SingleSelectScreen key="s6" title="How much time can you invest in AI each week?" options={TIME_BUDGET_OPTIONS} value={weeklyTimeBudget} setValue={setWeeklyTimeBudget} onNext={nextStep} columns={1} />}
          {step === 7 && <SingleSelectScreen key="s7" title="What's your AI experience?" options={EXPERIENCE_OPTIONS} value={experienceLevel} setValue={setExperienceLevel} onNext={nextStep} columns={1} />}
          {step === 8 && <EnableNotificationsScreen key="s8" onNext={nextStep} />}
          {step === 9 && <LoadingScreen key="s9" onNext={nextStep} />}
          {step === 10 && <SuccessScreen key="s10" onFinish={finishOnboarding} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
