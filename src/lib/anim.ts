import type { Transition } from "framer-motion";

/** "Poof": gentle scale-in on appear, scale-up + fade + blur on disappear. */
export const POOF_INITIAL = { opacity: 0, scale: 0.85 };
export const POOF_ANIMATE = { opacity: 1, scale: 1, filter: "blur(0px)" };
export const POOF_EXIT = { opacity: 0, scale: 1.3, filter: "blur(3px)" };
export const POOF_TRANSITION: Transition = { duration: 0.22, ease: "easeOut" };
