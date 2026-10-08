/** Fixed elements share the root's stable scrollbar gutter on Chromium.
 * Read the root rather than subtracting a moving element's inline position:
 * its new inline style and its painted rectangle can belong to different frames.
 */
export function fixedViewportOriginX(): number {
  return document.documentElement.getBoundingClientRect().left;
}
