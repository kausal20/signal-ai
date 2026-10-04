import { Bell } from "lucide-react";
import { PrimaryButton } from "../components/PrimaryButton";
import { SignalGlyph } from "@/ui-editorial/components/SignalMark";

interface Props {
  onChoose: (enabled: boolean) => void;
}

export function NotificationsStep({ onChoose }: Props) {
  return (
    <div className="flex h-full flex-col px-7 pb-7 pt-[100px]">
      <div className="rounded-2xl border border-ed-border bg-ed-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-ed-text-2">
          <SignalGlyph className="h-4 w-4 text-ed-accent" />
          <span className="font-semibold text-ed-text">Signal</span>
          <span className="ml-auto">Notification preview</span>
        </div>
        <p className="text-sm font-medium text-ed-text">Your AI briefing is ready.</p>
        <p className="mt-1 text-xs text-ed-text-2">Catch up on the updates that matter to you.</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-2xl border border-ed-border bg-ed-accent-soft">
          <Bell className="h-9 w-9 text-ed-accent-ink" strokeWidth={1.6} />
        </div>
        <h2 className="ed-serif mb-3 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-ed-text">Stay in the loop.</h2>
        <p className="max-w-[280px] text-sm leading-relaxed text-ed-text-2">We only ping you for top-score signals — a few times a week, never spam.</p>
      </div>
      <div className="flex flex-col gap-2">
        <PrimaryButton onClick={() => onChoose(true)} withArrow={false}>Turn on notifications</PrimaryButton>
        <button type="button" onClick={() => onChoose(false)} className="min-h-11 w-full rounded-lg py-3 text-sm font-semibold text-ed-text-2 hover:bg-ed-sunken">Not now</button>
      </div>
    </div>
  );
}
