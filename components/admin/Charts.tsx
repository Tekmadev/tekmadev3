"use client";

import { useEffect, useId, useRef, useState } from "react";

/* Gold / neutral palette that reads well on both light and dark themes. */
const PALETTE = ["#a17a4f", "#c89c65", "#7a5b3a", "#dcc399", "#b79368", "#8a857a", "#56524b"];

export type DayPoint = { day: string; count: number };
export type Tally = { label: string; count: number };

/** Tracks a container's pixel width so the SVG can render crisply (no distortion). */
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow;
}

/** Catmull-Rom spline turned into a smooth cubic bezier path. */
function smoothPath(pts: { x: number; y: number }[], t = 0.18): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({ data, height = 240 }: { data: DayPoint[]; height?: number }) {
  const [ref, width] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");

  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const plotW = Math.max(width - padL - padR, 0);
  const plotH = height - padT - padB;

  const max = niceCeil(Math.max(1, ...data.map((d) => d.count)));
  const n = data.length;
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const xAt = (i: number) => padL + i * stepX;
  const yAt = (v: number) => padT + plotH - (v / max) * plotH;

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.count) }));
  const line = smoothPath(pts);
  const area =
    pts.length > 0
      ? `${line} L ${xAt(n - 1)} ${padT + plotH} L ${xAt(0)} ${padT + plotH} Z`
      : "";

  const grid = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (n === 0 || stepX === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - padL;
    const i = Math.min(n - 1, Math.max(0, Math.round(x / stepX)));
    setHover(i);
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="block"
        >
          <defs>
            <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {grid.map((g) => {
            const y = padT + plotH - g * plotH;
            return (
              <g key={g}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--color-line)" strokeWidth="1" />
                <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--color-ink-4)">
                  {Math.round(g * max)}
                </text>
              </g>
            );
          })}

          {area && <path d={area} fill={`url(#area-${gid})`} />}
          {line && <path d={line} fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeLinejoin="round" />}

          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text
                key={d.day}
                x={xAt(i)}
                y={height - 7}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-ink-4)"
              >
                {d.day.slice(5)}
              </text>
            ) : null,
          )}

          {hover !== null && pts[hover] && (
            <g>
              <line
                x1={pts[hover].x}
                y1={padT}
                x2={pts[hover].x}
                y2={padT + plotH}
                stroke="var(--color-ink-4)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle cx={pts[hover].x} cy={pts[hover].y} r="4" fill="var(--color-gold)" stroke="var(--color-surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {hover !== null && pts[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: pts[hover].x, top: pts[hover].y - 8 }}
        >
          <span className="font-medium text-ink">{data[hover].count}</span>
          <span className="text-ink-4"> · {data[hover].day.slice(5)}</span>
        </div>
      )}
    </div>
  );
}

export function Donut({ data, size = 168, label = "total" }: { data: Tally[]; size?: number; label?: string }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <Empty />;

  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const slices = data.slice(0, PALETTE.length).map((d, i) => {
    const frac = d.count / total;
    const seg = { d, color: PALETTE[i % PALETTE.length], frac, dash: frac * c, offset: -acc * c };
    acc += frac;
    return seg;
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} className="shrink-0" viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
          {slices.map((s) => (
            <circle
              key={s.d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </g>
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-ink)">
          {total.toLocaleString("en-US")}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" fontSize="10" fill="var(--color-ink-4)">
          {label}
        </text>
      </svg>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {slices.map((s) => (
          <li key={s.d.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2" title={s.d.label}>
              {s.d.label}
            </span>
            <span className="shrink-0 tabular-nums text-ink-3">{s.d.count}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-ink-4">{Math.round(s.frac * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ items }: { items: Tally[] }) {
  if (items.length === 0) return <Empty />;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-ink-2" title={it.label}>
            {it.label}
          </span>
          <span className="relative h-5 flex-1 overflow-hidden rounded bg-bg-3">
            <span
              className="absolute inset-y-0 left-0 rounded bg-gold/70"
              style={{ width: `${(it.count / max) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-sm tabular-nums text-ink-3">{it.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="text-sm text-ink-4">No data yet.</p>;
}
