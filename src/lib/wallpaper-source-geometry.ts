export interface WallpaperSourceInput {
  /** The image element's already-transformed viewport box, in CSS pixels. */
  box: { left: number; top: number; width: number; height: number };
  naturalWidth: number;
  naturalHeight: number;
  fit: "cover" | "contain";
  positionX: number;
  positionY: number;
  transformScale: number;
  wallpaperBlur: number;
  glassBlur: number;
  pixelRatio: number;
}

/** Browser rasterization supplies DPR. Preserve fractional CSS coordinates;
 * never round the shared source to the device pixels of an individual card. */
export function wallpaperSourceGeometry(input: WallpaperSourceInput) {
  const { box, naturalWidth, naturalHeight, fit, positionX, positionY,
    transformScale, wallpaperBlur, glassBlur, pixelRatio } = input;
  if (![box.left, box.top, box.width, box.height, naturalWidth, naturalHeight,
    positionX, positionY, transformScale, wallpaperBlur, glassBlur, pixelRatio].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0 || naturalWidth <= 0 || naturalHeight <= 0
    || transformScale <= 0 || wallpaperBlur < 0 || glassBlur < 0 || pixelRatio <= 0) return null;
  const fitScale = (fit === "contain" ? Math.min : Math.max)(
    box.width / naturalWidth, box.height / naturalHeight);
  const width = naturalWidth * fitScale, height = naturalHeight * fitScale;
  const blur = wallpaperBlur * transformScale;
  // Successive Gaussian blurs compose by variance, not by adding their radii.
  const cardBlur = Math.hypot(blur, glassBlur);
  // Rasterize the image before the broad pass can downsample its sharp edges.
  // Keep the source passes identical on the wallpaper and cards. Additional
  // glass frost is a separate pass, with the same total Gaussian variance.
  const sourcePreBlur = Math.min(blur / Math.SQRT2, 2 / pixelRatio);
  const sourceRemainder = Math.sqrt(Math.max(0, blur ** 2 - sourcePreBlur ** 2));
  const passes = [sourcePreBlur, sourceRemainder].filter(value => value > 0)
    .map(value => `blur(${value}px)`);
  const sourceFilter = passes.join(" ") || "none";
  const cardFilter = [...passes, ...(glassBlur > 0 ? [`blur(${glassBlur}px)`] : [])]
    .join(" ") || "none";
  return {
    left: box.left + (box.width - width) * positionX,
    top: box.top + (box.height - height) * positionY,
    width, height, blur, cardBlur, spread: 3 * cardBlur, sourceFilter, cardFilter,
  };
}
