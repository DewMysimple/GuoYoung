import type { Locator, Page } from "@playwright/test";
import { expect } from "./fixtures";

type Point = { x: number; y: number };
type SweepObservation = { states: boolean[]; changes: boolean[][]; observer: MutationObserver };

/** Exercise the same physical gesture at different event densities. */
export async function assertHeldRoundTrips(page: Page, items: Locator, {
  steps,
  selected,
  boundaries = false,
}: { steps: number; selected: "class" | "aria"; boundaries?: boolean }) {
  // Hover waits for stable geometry, including the manager opening animation.
  await items.first().hover();
  const boxes = await items.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(boxes).toHaveLength(4);
  const centers = boxes.map(box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 }));
  const horizontal = Math.abs(centers[3].x - centers[0].x) > Math.abs(centers[3].y - centers[0].y);
  expect(centers.every(point => Math.abs(horizontal ? point.y - centers[0].y : point.x - centers[0].x) < 1), "Four targets share one straight sweep path").toBe(true);

  // Observe public selection feedback throughout the move, including the
  // pointer events emitted inside mouse.move({ steps }), not only its endpoint.
  const initial = await items.evaluateAll((elements, selected) => {
    const read = (element: Element) => selected === "class" ? element.classList.contains("is-selected") : element.getAttribute("aria-pressed") === "true";
    const states = elements.map(read);
    const observation: SweepObservation = { states: [...states], changes: elements.map(() => []), observer: null! };
    observation.observer = new MutationObserver(() => {
      elements.forEach((element, i) => {
        const state = read(element);
        if (state === observation.states[i]) return;
        observation.states[i] = state;
        observation.changes[i].push(state);
      });
    });
    for (const element of elements) observation.observer.observe(element, { attributes: true, attributeFilter: [selected === "class" ? "class" : "aria-pressed"] });
    (window as Window & { sweepObservation?: SweepObservation }).sweepObservation = observation;
    return states;
  }, selected);

  async function assertStates(states: boolean[]) {
    await expect.poll(() => items.evaluateAll((elements, selected) => elements.map(element => selected === "class" ? element.classList.contains("is-selected") : element.getAttribute("aria-pressed") === "true"), selected)).toEqual(states);
  }
  async function move(point: Point) {
    await page.mouse.move(point.x, point.y, { steps });
  }
  await move(centers[0]);
  await page.mouse.down();
  let held = true;
  try {
    for (const forward of [true, false, true]) {
      if (boundaries) {
        // Splitting a straight sweep at item edges and gaps must not turn one
        // crossing into two visits or miss intermediate B/C targets.
        const order = forward ? [0, 1, 2, 3] : [3, 2, 1, 0];
        for (let i = 0; i < order.length - 1; i++) {
          const from = boxes[order[i]], to = boxes[order[i + 1]];
          const edge = horizontal
            ? { x: forward ? from.x + from.width : from.x, y: centers[0].y }
            : { x: centers[0].x, y: forward ? from.y + from.height : from.y };
          const entry = horizontal
            ? { x: forward ? to.x : to.x + to.width, y: centers[0].y }
            : { x: centers[0].x, y: forward ? to.y : to.y + to.height };
          await move(edge);
          await move({ x: (edge.x + entry.x) / 2, y: (edge.y + entry.y) / 2 });
          await move(entry);
          await move(centers[order[i + 1]]);
        }
      } else {
        await move(centers[forward ? 3 : 0]);
      }
      await assertStates(initial.map(state => state !== forward));
      // Stop on the endpoint itself, then reverse without leaving it first.
      await page.waitForTimeout(40);
      await assertStates(initial.map(state => state !== forward));
    }
    await page.mouse.up();
    held = false;
    await assertStates(initial.map(state => !state));
    const changes = await page.evaluate(() => {
      const observation = (window as Window & { sweepObservation?: SweepObservation }).sweepObservation!;
      observation.observer.disconnect();
      delete (window as Window & { sweepObservation?: SweepObservation }).sweepObservation;
      return observation.changes;
    });
    expect(changes, "Each item toggles exactly once on each directional pass").toEqual(initial.map(state => [!state, state, !state]));
  } finally {
    if (held) await page.mouse.up();
    await page.evaluate(() => {
      const observation = (window as Window & { sweepObservation?: SweepObservation }).sweepObservation;
      observation?.observer.disconnect();
      delete (window as Window & { sweepObservation?: SweepObservation }).sweepObservation;
    });
  }
}
