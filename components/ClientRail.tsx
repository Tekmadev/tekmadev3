"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Client, ClientMark } from "@/config/clients";

/**
 * The client rail. Not a marquee.
 *
 * A marquee streams logos at a constant speed, so nothing on it can be read,
 * and a row of small-business logos means little to a stranger. This rail
 * steps: each business glides into a gold viewfinder, locks on, and holds
 * long enough to read what we did for it, with a link to check it is real.
 * Everyone else waits as a quiet silhouette, and only the business in the
 * viewfinder shows its real colours.
 *
 * The motion is a CSS transition on one transform; React only changes an
 * index every few seconds. The strip is the list repeated a few times so it
 * never runs out: after each glide it hops, invisibly, back into the middle
 * copy.
 *
 * It holds still while the pointer is over it, while a control has keyboard
 * focus, while it is off screen or the tab is hidden, and after Pause (moving
 * content needs a pause control, WCAG 2.2.2). It never moves on its own for
 * someone whose system asks for reduced motion. The strip is hidden from
 * screen readers; a plain list carries the same names and results, and that
 * list is also what search engines and AI assistants read.
 */

const GLIDE_MS = 700;
/** From the start of one glide to the start of the next. */
const HOLD_MS = 3400;
/** Slots that can be visible on either side of the viewfinder, with room to spare. */
const SIDE_SLOTS = 4;
const SWIPE_PX = 40;
const EASE = "cubic-bezier(0.65, 0, 0.35, 1)";

type State = {
  /** Slot index in the rendered strip that sits in (or is gliding into) the viewfinder. */
  pos: number;
  /** True for the one frame pair where the strip hops copies with transitions off. */
  instant: boolean;
  gliding: boolean;
  /** Where the last glide landed. The caption shows this business. */
  shown: number;
  /** Counts landings, to replay the lock-on and the caption reveal. */
  landed: number;
  /** Counts deliberate moves, to restart the hold timer. */
  tick: number;
  /** A move that arrived mid-hop, applied as soon as the hop has been painted. */
  queued: number;
};

type Action = { type: "move"; delta: number } | { type: "land" } | { type: "settle" };

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

function railReducer(n: number, base: number) {
  // Rapid clicks can run ahead of the landings; one spare copy each side covers it.
  const lo = base - n;
  const hi = base + 2 * n - 1;
  const glideTo = (s: State, delta: number): State => {
    const pos = s.pos + delta;
    if (delta === 0 || pos < lo || pos > hi) return s;
    return { ...s, pos, gliding: true, tick: s.tick + 1 };
  };
  return (s: State, a: Action): State => {
    switch (a.type) {
      case "move":
        // Mid-hop the new position has not been painted yet, and a glide
        // starting now would sweep across the whole strip. Hold the move.
        return s.instant ? { ...s, queued: s.queued + a.delta } : glideTo(s, a.delta);
      case "land": {
        if (!s.gliding) return s;
        const pos = base + mod(s.pos - base, n);
        return { ...s, pos, instant: pos !== s.pos, gliding: false, shown: pos, landed: s.landed + 1 };
      }
      case "settle": {
        if (!s.instant) return s;
        const settled = { ...s, instant: false, queued: 0 };
        return s.queued ? glideTo(settled, s.queued) : settled;
      }
    }
  };
}

function pad(v: number) {
  return String(v).padStart(2, "0");
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ClientRail({ clients, title }: { clients: Client[]; title: string }) {
  const n = clients.length;
  const half = 1 + Math.ceil(SIDE_SLOTS / n);
  const copies = 2 * half + 1;
  const base = half * n;
  const reducer = useMemo(() => railReducer(n, base), [n, base]);
  const [s, dispatch] = useReducer(reducer, {
    pos: base,
    instant: false,
    gliding: false,
    shown: base,
    landed: 0,
    tick: 0,
    queued: 0,
  });

  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const still = reduced;
  const playing = n > 1 && !userPaused && !hovering && !keyboardFocus && inView && pageVisible && !still;

  // Land when the browser says the glide has finished, not on a timer: a busy
  // or throttled page can start a transition late, and hopping copies before it
  // ends shows up as a skip. The timer is only a backstop.
  useEffect(() => {
    if (!s.gliding) return;
    let cancelled = false;
    const land = () => {
      if (!cancelled) dispatch({ type: "land" });
    };
    const track = trackRef.current;
    if (still || !track) {
      land();
      return () => {
        cancelled = true;
      };
    }
    void getComputedStyle(track).transform; // flush styles so the transition exists
    const glide =
      typeof CSSTransition === "undefined" || typeof track.getAnimations !== "function"
        ? undefined
        : track.getAnimations().find((a) => a instanceof CSSTransition && a.transitionProperty === "transform");
    // An interrupted glide rejects; the move that interrupted it lands instead.
    if (glide) glide.finished.then(land, () => {});
    const backstop = window.setTimeout(land, glide ? GLIDE_MS * 4 : GLIDE_MS + 50);
    return () => {
      cancelled = true;
      window.clearTimeout(backstop);
    };
  }, [s.tick, s.gliding, still]);

  // Turn transitions back on after the hop has been painted.
  useEffect(() => {
    if (!s.instant) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => dispatch({ type: "settle" }));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [s.instant]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => dispatch({ type: "move", delta: 1 }), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [playing, s.tick]);

  const shown = clients[mod(s.shown - base, n)];
  const index = mod(s.pos - base, n);
  const motionOff = s.instant || still;
  const strip = Array.from({ length: copies * n }, (_, i) => clients[i % n]);

  const trackStyle = {
    transform: `translate3d(calc(${-(s.pos + 0.5)} * var(--rail-slot)), 0, 0)`,
    transition: motionOff ? "none" : `transform ${GLIDE_MS}ms ${EASE}`,
    "--rail-dur": motionOff ? "0ms" : `${GLIDE_MS}ms`,
  } as React.CSSProperties;

  const edgeFade = "linear-gradient(to right, transparent, #000 18%, #000 82%, transparent)";
  const link = shown.caseStudy ?? shown.url;
  const counter = (
    <span aria-hidden className="number-tabular px-1 font-mono text-[11px] tracking-[0.18em] text-ink-4">
      {pad(index + 1)} / {pad(n)}
    </span>
  );
  const prev = (
    <ControlButton label="Previous business" onClick={() => dispatch({ type: "move", delta: -1 })}>
      <ChevronLeft className="h-4 w-4" />
    </ControlButton>
  );
  const next = (
    <ControlButton label="Next business" onClick={() => dispatch({ type: "move", delta: 1 })}>
      <ChevronRight className="h-4 w-4" />
    </ControlButton>
  );
  const pause = still ? null : (
    <ControlButton
      label={userPaused ? "Play the business rail" : "Pause the business rail"}
      onClick={() => setUserPaused((p) => !p)}
    >
      {userPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
    </ControlButton>
  );

  return (
    <div
      ref={rootRef}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovering(true);
      }}
      onPointerLeave={() => setHovering(false)}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches?.(":focus-visible")) setKeyboardFocus(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboardFocus(false);
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex min-w-0 items-center gap-3">
          <span aria-hidden className="h-px w-8 shrink-0 bg-ink-4" />
          <h2 className="eyebrow">{title}</h2>
        </div>
        {/* Phones get the same controls under the caption, where the thumb is. */}
        <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
          <span className="mr-1">{counter}</span>
          {prev}
          {next}
          {pause}
        </div>
      </div>

      <div
        aria-hidden
        className="relative mt-6 h-20 select-none overflow-hidden [--rail-slot:168px] [touch-action:pan-y] sm:mt-8 sm:h-24 sm:[--rail-slot:216px] lg:[--rail-slot:232px]"
        style={{ maskImage: edgeFade, WebkitMaskImage: edgeFade }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
          swiped.current = false;
        }}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || start.id !== e.pointerId) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
            swiped.current = true;
            dispatch({ type: "move", delta: dx < 0 ? 1 : -1 });
          }
        }}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        <div ref={trackRef} className="absolute inset-y-0 left-1/2 flex" style={trackStyle}>
          {strip.map((client, i) => (
            <Slot
              key={i}
              client={client}
              active={i === s.pos}
              onSelect={() => {
                if (swiped.current) return;
                dispatch({ type: "move", delta: i - s.pos });
              }}
            />
          ))}
        </div>
        <Viewfinder key={s.landed} lock={s.landed > 0 && !still} />
      </div>

      <div className="mt-4 flex min-h-[5.5rem] items-start justify-center sm:mt-5 sm:min-h-8">
        <p
          key={s.landed}
          className={cn(
            "flex max-w-full flex-col items-center gap-1.5 text-center transition-opacity duration-150 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-3 sm:gap-y-1",
            s.gliding && !still ? "opacity-0" : "opacity-100",
            s.landed > 0 && !still && "animate-[rail-caption_360ms_ease-out]",
          )}
        >
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-4">{shown.industry}</span>
          <span aria-hidden className="hidden text-ink-5 sm:inline">
            ·
          </span>
          <span className="text-sm text-ink-2">{shown.result}</span>
          {link && (
            <>
              <span aria-hidden className="hidden text-ink-5 sm:inline">
                ·
              </span>
              <a
                href={link}
                {...(shown.caseStudy ? {} : { target: "_blank", rel: "noopener" })}
                aria-label={shown.caseStudy ? `Read the ${shown.name} case study` : `Visit ${shown.name}'s website`}
                className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-gold underline decoration-gold/30 underline-offset-4 transition-colors hover:decoration-gold"
              >
                {shown.caseStudy ? "Case study" : hostOf(link)}
                <ArrowUpRight aria-hidden className="h-3 w-3" />
              </a>
            </>
          )}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-center gap-0.5 sm:hidden">
        {prev}
        {counter}
        {next}
        {pause}
      </div>

      {/* The same facts as the strip, for screen readers, search engines and AI assistants. */}
      <ul className="sr-only">
        {clients.map((c) => (
          <li key={c.id}>
            {c.name}, {c.industry}: {c.result.replace("→", "to")}.
          </li>
        ))}
      </ul>
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      {children}
    </button>
  );
}

function Slot({ client, active, onSelect }: { client: Client; active: boolean; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex h-full w-[var(--rail-slot)] shrink-0 items-center justify-center gap-2.5 px-3 transition-[opacity,scale] ease-out [transition-duration:var(--rail-dur)]",
        active ? "scale-100 opacity-100" : "scale-[0.94] cursor-pointer opacity-55 hover:opacity-90",
      )}
    >
      {client.mark && <Mark mark={client.mark} active={active} />}
      <span
        className={cn(
          "line-clamp-2 font-display text-[15px] font-medium leading-tight tracking-tight transition-colors [transition-duration:var(--rail-dur)] sm:text-lg",
          active ? "text-ink" : "text-ink-4",
        )}
      >
        {client.name}
      </span>
    </div>
  );
}

function Mark({ mark, active }: { mark: ClientMark; active: boolean }) {
  const shape = `url(${mark.src})`;
  const showColour = mark.tint === "brand" && active;
  return (
    <span className="relative block h-6 shrink-0 sm:h-7" style={{ aspectRatio: mark.aspect }}>
      <span
        className={cn(
          "absolute inset-0 transition-[opacity,background-color] [transition-duration:var(--rail-dur)]",
          active ? "bg-ink" : "bg-ink-4",
          showColour ? "opacity-0" : "opacity-100",
        )}
        style={{
          maskImage: shape,
          WebkitMaskImage: shape,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
          maskPosition: "center",
          WebkitMaskPosition: "center",
        }}
      />
      {mark.tint === "brand" && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mark.src}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition-opacity [transition-duration:var(--rail-dur)]",
              mark.darkSrc && "dark:hidden",
              showColour ? "opacity-100" : "opacity-0",
            )}
          />
          {mark.darkSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mark.darkSrc}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              className={cn(
                "absolute inset-0 hidden h-full w-full object-contain transition-opacity [transition-duration:var(--rail-dur)] dark:block",
                showColour ? "opacity-100" : "opacity-0",
              )}
            />
          )}
        </>
      )}
    </span>
  );
}

function Viewfinder({ lock }: { lock: boolean }) {
  const corner = "absolute h-3 w-3 border-gold";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-y-2 left-1/2 w-[var(--rail-slot)] -translate-x-1/2",
        lock && "animate-[rail-lock_440ms_cubic-bezier(0.22,0.61,0.36,1)]",
      )}
    >
      <span className={cn(corner, "left-0 top-0 border-l border-t")} />
      <span className={cn(corner, "right-0 top-0 border-r border-t")} />
      <span className={cn(corner, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(corner, "bottom-0 right-0 border-b border-r")} />
    </div>
  );
}
