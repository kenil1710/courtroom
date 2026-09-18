"use client";

import {
  AnimatePresence, MotionConfig, motion, useReducedMotion,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The motion in this interface, in one file.
 *
 * Two mechanisms, chosen per job rather than by preference:
 *
 *   SCROLL REVEALS use CSS plus an IntersectionObserver that only ever ADDS a
 *   class. On framer-motion 13 an `initial` prop is serialised into the
 *   server's HTML, so a component whose animate step never arrives renders at
 *   `opacity: 0` — content stranded invisible with no error anywhere. A CSS
 *   reveal whose base state is VISIBLE cannot fail that way.
 *
 *   EVERYTHING ELSE uses framer-motion, because it is all mounted in response
 *   to something a person did, and a failure would be obvious immediately
 *   rather than silent and below the fold.
 *
 * `MotionConfig reducedMotion="user"` makes the whole tree honour the system
 * setting, and the CSS half honours it too.
 */

export function Motion({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/* --- scroll reveal -------------------------------------------------------- */

/**
 * Fade-and-rise once, when the element first comes into view.
 *
 * The observer only adds `is-in`. It never removes it, so a section cannot
 * fade back out when it leaves the viewport, and it never removes the element
 * from the flow.
 */
export function Reveal({
  children, delay = 0, className = "", as: As = "div",
}: {
  children: React.ReactNode;
  delay?: 0 | 1 | 2 | 3;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    /*
     * THRESHOLD ZERO, not a fraction.
     *
     * A threshold is a fraction of the ELEMENT that must be visible, and
     * `intersectionRatio` for an element taller than the viewport tops out at
     * viewportHeight / elementHeight. A section twelve screens tall can
     * therefore never reach 0.08, and stays hidden for ever. Zero fires as soon
     * as any part of it crosses the line, whatever its height.
     */
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -60px 0px", threshold: 0 },
    );
    io.observe(el);

    // Anything already on screen at mount is revealed immediately rather than
    // waiting for a scroll that may never come on a short page.
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      el.classList.add("is-in");
      io.unobserve(el);
    }

    /*
     * And a backstop, because the cost of this going wrong is not a missing
     * animation — it is a page of invisible text.
     *
     * Whatever happens to the observer, every reveal is shown after three
     * seconds. A reader who never scrolls, a browser that throttles the
     * callback, a layout that moves the element out from under it: none of them
     * can leave content hidden. The animation is an embellishment and this is
     * what makes it behave like one.
     */
    const failsafe = window.setTimeout(() => {
      el.classList.add("is-in");
      io.unobserve(el);
    }, 3000);

    return () => {
      window.clearTimeout(failsafe);
      io.disconnect();
    };
  }, []);

  const cls = `reveal${delay ? ` d${delay}` : ""}${className ? ` ${className}` : ""}`;
  return (
    <As ref={ref as never} className={cls}>
      {children}
    </As>
  );
}

/* --- page transition ------------------------------------------------------ */

/**
 * A page slides in from the right.
 *
 * IT NEVER ANIMATES OPACITY. That is not a style choice — it is the fix for a
 * real bug. With `initial={{ opacity: 0 }}` this wrapper renders every page at
 * zero opacity until its animate step runs, and the not-found boundary is
 * rendered by React outside the normal flow: its animate step never arrived, so
 * `/case/999` served a completely blank page. Sliding from a visible start
 * reads the same and cannot hide anything.
 *
 * `mode="wait"` is deliberately NOT used either: it holds the outgoing page
 * until its exit finishes, which on a route that reads from a testnet RPC means
 * staring at the old page for a second with nothing saying why.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={pathname}
        initial={{ x: 26 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* --- count up ------------------------------------------------------------- */

/**
 * A statistic counts up to its value, once.
 *
 * The final value is rendered on the server and is what a reader sees if the
 * script never runs — the count is an embellishment on top of a correct number,
 * never the thing that produces it. `decimals` keeps a GEN figure from
 * flickering through a different number of digits on the way up.
 */
export function CountUp({
  value, decimals = 0, suffix = "", prefix = "", duration = 1100,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (reduced || !Number.isFinite(value)) return;
    const el = ref.current;
    if (!el) return;
    const run = () => {
      if (started.current) return;
      started.current = true;
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        // easeOutCubic: fast at first, settling rather than braking hard.
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(value * eased);
        if (p < 1) requestAnimationFrame(step);
        else setShown(value);
      };
      setShown(0);
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, reduced]);

  const text = shown.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span ref={ref} className="tnum">{prefix}{text}{suffix}</span>;
}

/* --- the verdict reveal --------------------------------------------------- */

/**
 * The verdict turns over, like a sealed envelope being opened.
 *
 * It runs once, on mount, and only on a case that has actually been decided.
 * `backfaceVisibility` matters: without it the reverse of the card shows
 * through mid-rotation as mirrored text.
 */
export function VerdictReveal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ rotateX: -84, opacity: 0, y: -12 }}
      animate={{ rotateX: 0, opacity: 1, y: 0 }}
      transition={{ duration: 0.78, ease: [0.19, 1, 0.22, 1], delay: 0.12 }}
      style={{ transformPerspective: 1400, transformOrigin: "top center", backfaceVisibility: "hidden" }}
    >
      {children}
    </motion.div>
  );
}

/** The gavel falls, twice, and settles — on a page where a verdict landed. */
export function GavelKnock({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.span
      className="inline-flex"
      initial={{ rotate: -34, y: -6 }}
      animate={{ rotate: [-34, 6, -14, 2, 0], y: [-6, 0, -2, 0, 0] }}
      transition={{ duration: 1.05, times: [0, 0.32, 0.55, 0.8, 1], ease: "easeOut", delay: 0.5 }}
      style={{ transformOrigin: "80% 80%" }}
    >
      {children}
    </motion.span>
  );
}

/** A panel that expands when a person opens it. */
export function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** A result or error appearing under a form. */
export function Appear({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
