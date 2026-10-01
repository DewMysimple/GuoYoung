/** Saved settings and gesture previews use the same transform, including the
 * neutral state. No class toggle or extra crop factor may delay/jump the zoom. */
export function wallpaperImageTransform(zoom: number): string {
  return zoom === 100 ? "none" : `scale(${zoom / 100})`;
}
