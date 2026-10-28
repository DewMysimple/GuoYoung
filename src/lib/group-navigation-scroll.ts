/** Keep each viewport readable, including when a target is many groups away. */
export function createGroupNavigationScroll() {
  let frame = 0;
  let generation = 0;
  const cancel = () => {
    generation += 1;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  return {
    cancel,
    to(top: number, reducedMotion: boolean) {
      cancel();
      const request = generation;
      const from = window.scrollY;
      const distance = Math.abs(top - from);
      if (reducedMotion || distance <= 1) {
        window.scrollTo({ top, behavior: "instant" });
        return;
      }
      // A 1.8 viewport/second ceiling avoids the browser's nearly fixed native
      // duration compressing a long journey into a fast jump. Ramp at both ends.
      const speed = window.innerHeight * 1.8 / 1000;
      const duration = Math.max(320, distance / speed + 240);
      const ramp = Math.min(240, duration / 2);
      let previous: number | undefined;
      let elapsed = 0;
      const advance = (time: number) => {
        if (request !== generation) return;
        frame = 0;
        // A busy or backgrounded frame must not skip whole groups on return.
        elapsed += previous === undefined ? 0 : Math.min(50, Math.max(0, time - previous));
        previous = time;
        const remaining = duration - elapsed;
        const progress = elapsed >= duration ? 1
          : elapsed < ramp ? elapsed * elapsed / (2 * ramp * (duration - ramp))
          : remaining < ramp ? 1 - remaining * remaining / (2 * ramp * (duration - ramp))
          : (elapsed - ramp / 2) / (duration - ramp);
        window.scrollTo({ top: from + (top - from) * progress, behavior: "instant" });
        if (progress < 1) frame = requestAnimationFrame(advance);
      };
      frame = requestAnimationFrame(advance);
    },
  };
}
