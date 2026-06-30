import React from "react";
import { cn } from "@/lib/utils";

export const PhoneFrame = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-background sm:bg-zinc-900 flex items-center justify-center p-0 sm:p-8 relative">
      <div className="w-full h-[100dvh] sm:h-[844px] sm:w-[390px] sm:rounded-[3rem] sm:border-[12px] sm:border-black sm:shadow-2xl relative sm:flex-none bg-background flex flex-col overflow-hidden isolate transform-gpu">
        {/* Safe Area Top Padding Mock (for desktop only, mobile respects actual safe areas) */}
        <div className="hidden sm:block h-12 w-full shrink-0 z-50 pointer-events-none absolute top-0" />
        
        {/* Dynamic Island / Notch Mockup */}
        <div className="hidden sm:flex absolute top-0 inset-x-0 h-8 w-[120px] bg-black mx-auto rounded-b-[18px] z-[60] items-center justify-between px-3">
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-800/80"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-800/80"></div>
        </div>
        
        {/* App Content */}
        <div className="flex-1 w-full h-full relative overflow-y-auto overflow-x-hidden no-scrollbar">
          {children}
        </div>

        {/* Home Indicator Mockup */}
        <div className="hidden sm:block absolute bottom-1 inset-x-0 h-1 w-1/3 bg-zinc-500/50 mx-auto rounded-full z-[60] pointer-events-none"></div>
      </div>
    </div>
  );
};
