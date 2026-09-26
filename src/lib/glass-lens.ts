/** Convex rim refraction (air → glass, index 1.5), with a neutral center.
 * Optical construction: https://kube.io/blog/liquid-glass-css-svg/ */
export function lensDisplacement(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(1, Math.min(radius, width / 2, height / 2));
  const bevel = Math.min(18, Math.min(width, height) / 4);
  const dx = x - width / 2, dy = y - height / 2;
  const qx = Math.abs(dx) - (width / 2 - r), qy = Math.abs(dy) - (height / 2 - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  const length = Math.hypot(ox, oy);
  const distance = length + Math.min(Math.max(qx, qy), 0) - r;
  if (distance >= 0 || distance <= -bevel) return [0, 0] as const;
  const t = Math.min(.9999, -distance / bevel);
  const slope = (1 - t) / Math.sqrt(1 - (1 - t) ** 2);
  const incidence = Math.atan(slope);
  const refracted = Math.asin(Math.sin(incidence) / 1.5);
  // Fade the outside pixel to avoid a clipped seam; the inner rim flattens.
  const bend = Math.tan(incidence - refracted) * Math.min(1, -distance / 2);
  const nx = length ? ox / length : qx > qy ? 1 : 0;
  const ny = length ? oy / length : qy >= qx ? 1 : 0;
  return [dx && nx ? -Math.sign(dx) * nx * bend : 0, dy && ny ? -Math.sign(dy) * ny * bend : 0] as const;
}

// Geometry repeats across workspace mounts and preset previews. Keep a bounded
// cache of the small displacement images, never screenshots of the wallpaper.
const lensMaps = new Map<string, string>();

export function createLensMap(width: number, height: number, radius: number) {
  const key = `${width}:${height}:${radius}`;
  const cached = lensMaps.get(key);
  if (cached) return cached;
  const resolution = Math.min(1, 640 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * resolution));
  canvas.height = Math.max(1, Math.round(height * resolution));
  // These pixels are written and immediately read back for an SVG image. A
  // software canvas avoids starting a GPU surface and synchronously reading it.
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const [dx, dy] = lensDisplacement((x + .5) / resolution, (y + .5) / resolution, width, height, radius);
    const index = (y * canvas.width + x) * 4;
    pixels.data[index] = Math.round(127.5 + Math.max(-1, Math.min(1, dx)) * 127.5);
    pixels.data[index + 1] = Math.round(127.5 + Math.max(-1, Math.min(1, dy)) * 127.5);
    pixels.data[index + 2] = 128;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const result = canvas.toDataURL();
  if (lensMaps.size >= 24) lensMaps.delete(lensMaps.keys().next().value!);
  lensMaps.set(key, result);
  return result;
}
