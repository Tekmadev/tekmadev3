/**
 * The "black hole" loader: the logo's four pieces, the inner hooks turning
 * clockwise a full turn while the outer arcs turn a half turn the other way,
 * all pulled toward the centre at the peak of each beat. The logo looks the
 * same after a half turn, so every beat lands back on the exact logo and the
 * loop never shows a seam. Chosen by the owner on 2026-09-30.
 *
 * The motion itself is CSS (app/globals.css, `.bh`). These numbers only feed
 * the CSS variables it reads, so the owner can tune it from Admin, Loader
 * without a deploy. Stored in `site_settings` under `loader`.
 */

export type LoaderSettings = {
  /** One beat of the page loader, in milliseconds. */
  beatMs: number;
  /** One beat of the small spinner inside buttons, in milliseconds. */
  buttonBeatMs: number;
  /** How small the inner hooks shrink at the peak of the pull (1 = no pull). */
  innerPull: number;
  /** How small the outer arcs shrink at the peak of the pull (1 = no pull). */
  outerPull: number;
  /** How visible the inner hooks stay at the peak (1 = fully solid). */
  innerFade: number;
  /**
   * How long a page may take before the full loader shows. Fast pages never
   * flash it; the thin top bar still shows from the first moment.
   */
  showAfterMs: number;
};

export const LOADER_DEFAULTS: LoaderSettings = {
  beatMs: 1600,
  buttonBeatMs: 1100,
  innerPull: 0.72,
  outerPull: 0.9,
  innerFade: 0.7,
  showAfterMs: 300,
};

type Limit = { min: number; max: number; step: number; label: string; help: string; unit: "ms" | "%" };

/** The slider ranges in the admin, and the clamp every stored value goes through. */
export const LOADER_LIMITS: Record<keyof LoaderSettings, Limit> = {
  beatMs: { min: 800, max: 3000, step: 50, unit: "ms", label: "Page loader speed", help: "One beat of the full-page loader. Lower is faster." },
  buttonBeatMs: { min: 600, max: 2000, step: 50, unit: "ms", label: "Button spinner speed", help: "One beat of the small spinner inside buttons." },
  innerPull: { min: 0.5, max: 1, step: 0.01, unit: "%", label: "Inner pull", help: "How far the inner hooks get sucked toward the centre. Lower is a stronger pull." },
  outerPull: { min: 0.75, max: 1, step: 0.01, unit: "%", label: "Outer pull", help: "How far the outer arcs get pulled in. Lower is a stronger pull." },
  innerFade: { min: 0.2, max: 1, step: 0.01, unit: "%", label: "Inner fade", help: "How solid the inner hooks stay at the peak. Lower fades them into the centre." },
  showAfterMs: { min: 0, max: 1500, step: 50, unit: "ms", label: "Show the full loader after", help: "Pages faster than this never flash the loader. The top bar still shows at once." },
};

const clamp = (v: unknown, l: Limit, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(l.max, Math.max(l.min, n));
};

/** Anything stored or submitted becomes a valid, in-range setting. Never throws. */
export function normalizeLoader(raw: unknown): LoaderSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...LOADER_DEFAULTS };
  for (const key of Object.keys(LOADER_LIMITS) as (keyof LoaderSettings)[]) {
    out[key] = clamp(r[key], LOADER_LIMITS[key], LOADER_DEFAULTS[key]);
  }
  return out;
}

/** The CSS variables `.bh` reads, for an inline `style` on <html> or a preview. */
export function loaderCssVars(s: LoaderSettings): Record<string, string> {
  return {
    "--bh-beat": `${Math.round(s.beatMs)}ms`,
    "--bh-btn-beat": `${Math.round(s.buttonBeatMs)}ms`,
    "--bh-in-scale": String(s.innerPull),
    "--bh-out-scale": String(s.outerPull),
    "--bh-in-fade": String(s.innerFade),
    "--bh-delay": `${Math.round(s.showAfterMs)}ms`,
  };
}
