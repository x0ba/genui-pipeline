// One motion vocabulary for the shell, built-in and generated components, so
// every moving piece in a view speaks with the same timing.
import type { TargetAndTransition, Transition } from "motion/react";

/** Strong ease-out: moves immediately, then settles. For anything entering or leaving. */
export const easeOut: [number, number, number, number] = [0.23, 1, 0.32, 1];

/**
 * Pieces moving to a new place. Critically damped, so nothing overshoots, and
 * springs keep their velocity when a new change interrupts them. The app's
 * MotionConfig makes this the default, so `layout` elements need no transition.
 */
export const move: Transition = { type: "spring", duration: 0.4, bounce: 0 };

/** Selection indicators (tab underlines, segmented thumbs): small, frequent, so quicker. */
export const indicator: Transition = { type: "spring", duration: 0.3, bounce: 0 };

/** Something arriving. */
export const enter: Transition = { duration: 0.22, ease: easeOut };

/** Something leaving: quicker than arriving, because the user has already moved on. */
export const exit: Transition = { duration: 0.14, ease: easeOut };

/** No animation, for changes the user makes by typing. */
export const instant: Transition = { duration: 0 };

/**
 * Height reveal for rows and callouts inside AnimatePresence: `<motion.li {...collapse}>`.
 * The animated element must have no vertical padding, border or gap of its own,
 * or it cannot reach zero height. Put those on a child instead. It clips only
 * while moving, so focus rings are not cut off at rest. Opacity trails the height
 * on the way in and leads it on the way out, so text never shows half-clipped.
 */
export const collapse: { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition } = {
  initial: { height: 0, opacity: 0, overflow: "hidden" },
  animate: {
    height: "auto",
    opacity: 1,
    transition: { height: move, opacity: { ...enter, delay: 0.06 } },
    transitionEnd: { overflow: "visible" },
  },
  exit: { height: 0, opacity: 0, overflow: "hidden", transition: { height: { ...move, delay: 0.04 }, opacity: exit } },
};
