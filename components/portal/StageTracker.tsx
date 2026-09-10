import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { STAGES, stageIndex, type OnboardingStage } from "@/lib/onboarding-data";
import { ProgressBar } from "@/components/portal/ui";

/**
 * The onboarding pipeline. On phones it is a compact "step X of 7" with a
 * progress bar and a scrollable row of steps; on wider screens the full row.
 */
export function StageTracker({ current, percent }: { current: OnboardingStage; percent: number }) {
  const idx = stageIndex(current);
  const steps = STAGES.filter((s) => s.key !== "complete");
  const label = STAGES[idx]?.label ?? "Onboarding";
  const stepNo = Math.min(idx + 1, steps.length);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-4">
            Step {stepNo} of {steps.length}
          </p>
          <p className="mt-0.5 font-display text-xl font-bold text-ink">{current === "complete" ? "Onboarding complete" : label}</p>
        </div>
        <p className="text-sm text-ink-3">{percent}% done</p>
      </div>
      <div className="mt-3">
        <ProgressBar percent={percent} />
      </div>

      <ol className="mt-5 -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-7 sm:gap-0 sm:overflow-visible">
        {steps.map((s, i) => {
          const done = current === "complete" || i < idx;
          const active = i === idx && current !== "complete";
          return (
            <li key={s.key} className="min-w-[7.5rem] shrink-0 snap-start sm:min-w-0">
              <div className="flex items-center sm:pr-2">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    done && "border-gold bg-gold text-bg",
                    active && "border-gold bg-gold/15 text-gold-deep",
                    !done && !active && "border-line-strong bg-surface text-ink-4",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn("ml-2 hidden h-px flex-1 sm:block", i < idx ? "bg-gold" : "bg-line-strong")} />
              </div>
              <p className={cn("mt-2 text-xs font-medium", active ? "text-ink" : done ? "text-ink-2" : "text-ink-4")}>{s.label}</p>
              <p className="text-[11px] text-ink-4">{s.days}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
