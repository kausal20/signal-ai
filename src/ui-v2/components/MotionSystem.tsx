// signal-ui-v2 · components/MotionSystem.tsx
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { sectionVariants, viewportOnce } from "../animations/motion";

const PARTICLES = [
  { left: "11%", top: "18%", size: 2, delay: "0s", duration: "12s" },
  { left: "78%", top: "14%", size: 1.5, delay: "1.6s", duration: "15s" },
  { left: "88%", top: "37%", size: 2.5, delay: "3.2s", duration: "16s" },
  { left: "19%", top: "46%", size: 1.5, delay: "2.4s", duration: "14s" },
  { left: "64%", top: "67%", size: 2, delay: "4s", duration: "18s" },
  { left: "35%", top: "82%", size: 1.5, delay: "5.2s", duration: "17s" },
] as const;

interface AmbientFieldProps {
  className?: string;
  quiet?: boolean;
}

export function AmbientField({ className, quiet = false }: AmbientFieldProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={cn("signal-ambient-field", quiet && "opacity-60", className)} aria-hidden>
      <div className="signal-aurora" />
      {!reduceMotion && (
        <>
          <div className="signal-radar-sweep" />
          <div className="signal-particle-field">
            {PARTICLES.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.top}-${index}`}
                className="signal-particle"
                style={{
                  left: particle.left,
                  top: particle.top,
                  width: particle.size,
                  height: particle.size,
                  animationDelay: particle.delay,
                  animationDuration: particle.duration,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface MotionSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function MotionSection({ children, className, delay = 0 }: MotionSectionProps) {
  return (
    <fm.section
      variants={sectionVariants}
      initial="initial"
      whileInView="animate"
      viewport={viewportOnce}
      transition={{ delay }}
      className={className}
    >
      {children}
    </fm.section>
  );
}
