import type { TransitionEvent } from "react";

/** Keep a surface's material fallback until its own transform has settled.
 * Child/pseudo transitions are unrelated. A canceled transition may already
 * have a replacement, so its terminal event must not clear the new one's mark. */
export function trackTransformTransition(event: TransitionEvent<HTMLElement>) {
  const element = event.currentTarget;
  // React 19.1 exposes run/cancel as generic synthetic events even though its
  // types promise transition fields. The native event carries them in all cases.
  const transition = event.nativeEvent;
  if (event.target !== element || transition.propertyName !== "transform" || transition.pseudoElement) return;
  const running = transition.type === "transitionrun" || element.getAnimations?.().some(animation => {
    const effect = animation.effect as KeyframeEffect | null;
    return "transitionProperty" in animation && animation.transitionProperty === "transform"
      && effect?.target === element && !effect.pseudoElement
      && (animation.pending || (animation.playState !== "finished" && animation.playState !== "idle"));
  });
  if (running) element.dataset.transformTransition = "true";
  else delete element.dataset.transformTransition;
}
