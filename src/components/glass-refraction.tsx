import { useMemo } from "react";

// Parsing url() is not evidence of backdrop displacement support in WebKit or
// Gecko. Keep their ordinary blur until those engines implement the pipeline.
export const supportsGlassRefraction = typeof navigator !== "undefined"
  && /Chrom(?:e|ium)\//.test(navigator.userAgent);

/** A static, shared rounded lens map: neutral center, curved rim. No animation,
 * per-card observers or transforms; only the backdrop passes through the filter. */
function createLensMap() {
  const width = 256;
  const height = 192;
  const radius = 24;
  const bevel = 18;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  const pixels = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x + .5 - width / 2;
      const dy = y + .5 - height / 2;
      const qx = Math.abs(dx) - (width / 2 - radius);
      const qy = Math.abs(dy) - (height / 2 - radius);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
      const bend = distance > -bevel && distance < 0 ? Math.sin(-distance / bevel * Math.PI) : 0;
      const nx = length ? ox / length : qx > qy ? 1 : 0;
      const ny = length ? oy / length : qy >= qx ? 1 : 0;
      const index = (y * width + x) * 4;
      pixels.data[index] = 128 + Math.sign(dx) * nx * bend * 127;
      pixels.data[index + 1] = 128 + Math.sign(dy) * ny * bend * 127;
      pixels.data[index + 2] = 128;
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

export function GlassRefraction({ strength }: { strength: number }) {
  const map = useMemo(createLensMap, []);
  if (!map) return null;
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", pointerEvents: "none" }}>
    <defs>
      <filter id="wallpaper-glass-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="lens" />
        <feDisplacementMap in="SourceGraphic" in2="lens" scale={strength} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg>;
}
