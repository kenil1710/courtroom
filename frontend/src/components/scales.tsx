/**
 * The scales, at three sizes and three jobs.
 *
 * All three are pure SVG with CSS animation and no client JavaScript, so they
 * render in a server component, cost nothing to hydrate, and stop moving when
 * the system asks for reduced motion.
 *
 * TWO THINGS HERE ARE LOAD-BEARING AND BOTH FAIL SILENTLY IF CHANGED.
 *
 * 1. The gradients are defined ONCE, by `<ScalesDefs />` in the layout, and
 *    every mark references them by a fixed id. The first version generated an
 *    id per instance from a module-level counter — which produced different ids
 *    on the server and on the client and threw a hydration mismatch on every
 *    page. A `useId()` would fix the mismatch and break the server-component
 *    rendering; a fixed id per instance would emit duplicate ids into the
 *    document. One shared definition is the only option that is all three of
 *    valid, stable and server-renderable.
 *
 * 2. `gradientUnits="userSpaceOnUse"`. The default, objectBoundingBox, is
 *    degenerate on a shape with no area, so a horizontal rule like the beam has
 *    a zero-height box and DOES NOT PAINT AT ALL. The first version of the mark
 *    rendered as two floating pans and a dot, with no error anywhere.
 */

/** Rendered once per document, in the layout. Carries no visual output itself. */
export function ScalesDefs() {
  return (
    <svg width="0" height="0" aria-hidden focusable="false"
         style={{ position: "absolute", pointerEvents: "none" }}>
      <defs>
        <linearGradient id="cr-gold" gradientUnits="userSpaceOnUse" x1="32" y1="4" x2="32" y2="58">
          <stop offset="0" stopColor="#FFDD84" />
          <stop offset="0.55" stopColor="#F0C14B" />
          <stop offset="1" stopColor="#C9962C" />
        </linearGradient>
        <linearGradient id="cr-gold-hero" gradientUnits="userSpaceOnUse" x1="160" y1="20" x2="160" y2="280">
          <stop offset="0" stopColor="#FFDD84" />
          <stop offset="0.5" stopColor="#F0C14B" />
          <stop offset="1" stopColor="#A8873A" />
        </linearGradient>
        <radialGradient id="cr-glow" gradientUnits="userSpaceOnUse" cx="160" cy="70" r="150">
          <stop offset="0" stopColor="#F0C14B" stopOpacity="0.4" />
          <stop offset="1" stopColor="#F0C14B" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

/** The wordmark's mark, and the loading indicator. Level and still. */
export function ScalesMark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g stroke="url(#cr-gold)" fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 15v33" />
        <path d="M24 52h16" />
        <path d="M27.5 48h9" />
        <path d="M13 21h38" />
        <path d="M13 21v6" />
        <path d="M51 21v6" />
        <path d="M5.5 27.5h15a7.5 7.5 0 0 1-15 0Z" />
        <path d="M43.5 27.5h15a7.5 7.5 0 0 1-15 0Z" />
      </g>
      <circle cx="32" cy="12" r="3.6" fill="url(#cr-gold)" />
    </svg>
  );
}

/**
 * The hero scales: the beam tips slowly and the pans ride with it.
 *
 * This is the only thing on the site that moves without being asked, and it
 * earns that because it is the subject itself — a court still weighing
 * something. It is also why nothing else on the landing page animates on a loop.
 */
export function ScalesHero({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 300" className={className} aria-hidden focusable="false">
      <circle className="scales-glow" cx="160" cy="70" r="150" fill="url(#cr-glow)" />

      {/* the column and its base do not move */}
      <g stroke="url(#cr-gold-hero)" fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M160 58v186" />
        <path d="M118 262h84" />
        <path d="M136 244h48" />
      </g>
      <circle cx="160" cy="50" r="10" fill="url(#cr-gold-hero)" />

      {/* the beam tips about its centre; each pan rides the end it hangs from */}
      <g className="scales-beam">
        <path d="M44 74h232" stroke="url(#cr-gold-hero)" strokeWidth="5" strokeLinecap="round" fill="none" />
      </g>
      <g className="scales-pan-l">
        <g stroke="url(#cr-gold-hero)" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 76v34" />
          <path d="M8 110h76a38 38 0 0 1-76 0Z" />
        </g>
      </g>
      <g className="scales-pan-r">
        <g stroke="url(#cr-gold-hero)" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M274 76v34" />
          <path d="M236 110h76a38 38 0 0 1-76 0Z" />
        </g>
      </g>
    </svg>
  );
}

/** A full-panel loading state, used by every route's `loading.tsx`. */
export function LoadingPanel({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <ScalesDefs />
      <ScalesMark size={44} className="spin-scale" />
      <p className="text-[0.92rem] text-ivory-3" role="status" aria-live="polite">{what}</p>
    </div>
  );
}
