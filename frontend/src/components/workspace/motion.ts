/**
 * Workspace motion vocabulary.
 *
 * The Landing page (`pages/Landing.tsx`) is the canonical source of Obligo's motion
 * language; this module restates its exact values so every workspace surface
 * *inherits* that language instead of inventing a competing one (Engineering
 * Constitution §48, Reference §11/§27-35). Landing remains the source of truth —
 * if a value changes there, change it here too.
 *
 * Nothing in here is page-specific. Pages and components consume these variants;
 * they never hardcode their own easing, duration or spring.
 */
import { useReducedMotion, type Transition, type Variants } from 'framer-motion';

/**
 * The single easing curve used across the entire product (Landing.tsx). Every
 * transition — micro, standard and large — eases with this. Never introduce a
 * second curve.
 */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Durations (seconds), mirrored from Landing's entrance + interaction timing. */
export const DURATION = {
  /** Hover / tap / toggle — matches Landing's 220ms CSS interaction transitions. */
  micro: 0.22,
  /** Route change — understated page transition (Reference §53). */
  page: 0.3,
  /** Content reveal — mirrors Landing's FadeInText / fadeUpChild (1.4s). */
  content: 1.4,
} as const;

/**
 * Shared-layout spring for the active navigation indicator as it glides between
 * destinations (Landing `activeNavBubble`, Reference §9/§19). The workspace
 * sidebar pill inherits exactly this so both navigations feel identical.
 */
export const SPRING_PILL: Transition = { type: 'spring', bounce: 0.25, duration: 0.6 };

/**
 * Content entrance — mirrors Landing's `fadeUpChild` / `FadeInText`. Used as
 * the child variant inside `WorkspacePage`'s own page-root stagger so major
 * content groups rise in as a page settles. `hidden`/`show` names match the
 * container's states. Reached through {@link useReveal}, never directly.
 */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.content, ease: EASE } },
};

/** Reduced-motion counterpart: same rhythm, no travel (Constitution §150). */
export const fadeUpReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.3, ease: EASE } },
};

/**
 * Understated route transition (Reference §53). Navigation should feel like
 * moving through one workspace, so the canvas content settles with the shared
 * ease rather than a hard cut. Kept quick — responsiveness wins over decoration
 * (Constitution §68).
 */
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.page, ease: EASE } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.18, ease: EASE } },
} as const;

/** Reduced-motion route transition: crossfade only. */
export const pageTransitionReduced = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, ease: EASE } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE } },
} as const;

/** Returns the content-reveal variant honoring the user's reduced-motion setting. */
export function useReveal(): Variants {
  return useReducedMotion() ? fadeUpReduced : fadeUp;
}

/** Returns the route-transition props honoring the user's reduced-motion setting. */
export function usePageTransition() {
  return useReducedMotion() ? pageTransitionReduced : pageTransition;
}
