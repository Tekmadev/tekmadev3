"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Panel } from "@/components/admin/ui";
import { BlackHole } from "@/components/BlackHole";
import { PendingSubmit } from "@/components/PendingSubmit";
import { LOADER_DEFAULTS, LOADER_LIMITS, loaderCssVars, type LoaderSettings } from "@/config/loader";

const KEYS = Object.keys(LOADER_LIMITS) as (keyof LoaderSettings)[];

function display(key: keyof LoaderSettings, v: number): string {
  const l = LOADER_LIMITS[key];
  return l.unit === "%" ? `${Math.round(v * 100)}%` : `${(v / 1000).toFixed(2)}s`;
}

/**
 * Sliders with a live preview. The preview reads the same CSS variables the
 * site does (config/loader.ts), scoped to this panel, so what you see here is
 * exactly what visitors get after you save. Nothing changes on the site until
 * Save.
 */
export function LoaderSettingsForm({
  initial,
  action,
}: {
  initial: LoaderSettings;
  action: (formData: FormData) => Promise<void>;
}) {
  const [s, setS] = useState<LoaderSettings>(initial);
  const [replay, setReplay] = useState(0);
  const changed = KEYS.some((k) => s[k] !== initial[k]);
  const isDefault = KEYS.every((k) => s[k] === LOADER_DEFAULTS[k]);

  return (
    <form action={action} className="flex flex-col gap-6">
      {KEYS.map((k) => (
        <input key={k} type="hidden" name={k} value={String(s[k])} />
      ))}

      <div style={loaderCssVars(s) as React.CSSProperties}>
        <Panel title="Preview">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-bg-2 p-6">
              <BlackHole size={96} variant="page" className="text-gold" />
              <p className="text-xs text-ink-3">Page loader</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-bg-2 p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg">
                <BlackHole />
                Booking…
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-1.5 text-xs text-ink-2">
                <BlackHole />
                Saving
              </span>
              <p className="text-xs text-ink-3">Buttons</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-line bg-bg-2 p-6">
              <div className="flex h-[72px] items-center justify-center">
                {/* Remounted on each replay so the delay plays from zero. */}
                <div key={replay} className="bh-appear">
                  <BlackHole size={56} variant="page" className="text-gold" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplay((n) => n + 1)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs text-ink-2 transition-colors hover:border-gold hover:text-gold"
              >
                <RotateCcw className="h-3 w-3" />
                Replay the delay
              </button>
              <p className="text-center text-xs text-ink-3">Appears after {display("showAfterMs", s.showAfterMs)}</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Settings">
        <div className="flex flex-col gap-6">
          {KEYS.map((k) => {
            const l = LOADER_LIMITS[k];
            const id = `loader-${k}`;
            return (
              <div key={k}>
                <div className="flex items-baseline justify-between gap-4">
                  <label htmlFor={id} className="text-sm font-medium text-ink">
                    {l.label}
                  </label>
                  <span className="number-tabular text-sm text-ink-2">{display(k, s[k])}</span>
                </div>
                <input
                  id={id}
                  type="range"
                  min={l.min}
                  max={l.max}
                  step={l.step}
                  value={s[k]}
                  onChange={(e) => setS((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                  className="mt-2 w-full accent-gold"
                />
                <p className="mt-1 text-xs text-ink-3">{l.help}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <PendingSubmit
          disabled={!changed}
          pendingLabel="Saving"
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2 disabled:opacity-50"
        >
          Save for the whole site
        </PendingSubmit>
        {changed && (
          <button
            type="button"
            onClick={() => setS(initial)}
            className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold"
          >
            Undo changes
          </button>
        )}
        {!isDefault && (
          <PendingSubmit
            name="reset"
            value="1"
            confirm="Put the loader back to the original settings on every page?"
            pendingLabel="Resetting"
            className="rounded-full border border-line-strong px-4 py-2 text-sm text-ink-2 transition-colors hover:border-gold hover:text-gold"
          >
            Reset to original
          </PendingSubmit>
        )}
      </div>
    </form>
  );
}
