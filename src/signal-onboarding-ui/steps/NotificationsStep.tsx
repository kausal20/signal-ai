// signal-onboarding-ui · steps/NotificationsStep.tsx  (Step 8 of 9)
// Real permission ask + a sample push preview. The parent decides what
// "enable" does (calls the OS API); this only reports the choice.
import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import signalLogo from "@/assets/signal-logo.png";

interface Props {
  /** Called with the user's choice. Production performs the actual OS request. */
  onChoose: (enabled: boolean) => void;
}

export function NotificationsStep({ onChoose }: Props) {
  return (
    <div className="flex h-full flex-col px-7 pb-7 pt-[110px]">
      {/* Sample push */}
      <div className="animate-slide-down">
        <div className="rounded-[20px] border border-white/10 bg-[hsl(0_0%_11%/0.92)] p-3.5 shadow-[0_18px_50px_hsl(0_0%_0%/0.5)] backdrop-blur">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] border border-green/30 bg-green/[0.18] overflow-hidden">
              <img src={signalLogo} alt="Signal" className="h-[14px] w-[14px] object-contain" />
            </div>
            <span className="text-xs font-bold text-foreground/90">Signal</span>
            <span className="text-[11px] text-muted-foreground">now</span>
            <span className="ml-auto font-mono-tight text-[11px] text-green">98 score</span>
          </div>
          <div className="text-[13.5px] font-semibold leading-snug text-foreground/95">
            OpenAI just shipped GPT-5 reasoning to all users — the highest-signal drop this week.
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {/* Animated bell icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 15, delay: 0.15 }}
          className="relative mb-[26px] flex h-[120px] w-[120px] items-center justify-center"
        >
          {/* Outer pulsing ring */}
          <motion.div
            animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0, 0.3] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-[14px] rounded-full border border-green/25"
          />
          {/* Second subtle ring (offset timing) */}
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.2, 0, 0.2] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut", delay: 1.4 }}
            className="absolute inset-[20px] rounded-full border border-green/15"
          />

          {/* Icon container with gentle float */}
          <motion.div
            animate={{ y: [-3, 3, -3] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[26px] border border-green/[0.28] bg-[radial-gradient(circle_at_32%_24%,hsl(152_72%_64%/0.4),hsl(152_72%_48%/0.14)_40%,hsl(150_12%_5%/0.95)_74%)] shadow-[0_20px_60px_hsl(152_72%_48%/0.22)]"
          >
            {/* Bell icon with ring animation */}
            <motion.div
              animate={{
                rotate: [0, 8, -8, 6, -4, 0],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                repeatDelay: 3,
                ease: "easeInOut",
                delay: 1,
              }}
              style={{ transformOrigin: "top center" }}
            >
              <Bell className="h-[46px] w-[46px] text-green" strokeWidth={1.6} />
            </motion.div>

            {/* Tiny notification dot */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.7 }}
              className="absolute right-[14px] top-[14px] flex h-[14px] w-[14px] items-center justify-center rounded-full bg-green shadow-[0_0_10px_hsl(152_72%_48%/0.5)]"
            >
              <span className="text-[7px] font-extrabold text-black">1</span>
            </motion.div>
          </motion.div>

          {/* Floating shadow beneath */}
          <motion.div
            animate={{ opacity: [0.12, 0.3, 0.12], scaleX: [0.9, 1, 0.9] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -bottom-1 h-1 w-12 rounded-full bg-green/25 blur-[3px]"
          />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="mb-3 text-[25px] font-extrabold tracking-[-0.02em] text-foreground"
        >
          Catch the big ones live.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="max-w-[280px] text-sm leading-relaxed text-muted-foreground"
        >
          We only ping you for top-score signals — a few times a week, never spam.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="flex flex-col gap-2.5"
      >
        <button
          type="button"
          onClick={() => onChoose(true)}
          className="w-full rounded-2xl bg-green py-[17px] text-base font-bold text-black shadow-[0_8px_30px_hsl(152_72%_48%/0.3)] transition-transform active:scale-[0.98]"
        >
          Turn on notifications
        </button>
        <button
          type="button"
          onClick={() => onChoose(false)}
          className="w-full py-3 text-sm font-semibold text-muted-foreground transition-transform active:scale-[0.98]"
        >
          Not now
        </button>
      </motion.div>
    </div>
  );
}
