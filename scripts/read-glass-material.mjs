// Serializable browser-side inspector. Read the executed paint rather than
// accepting an authored custom property as proof that the material rendered.
export function readGlassMaterial(element, pseudo = false) {
  const blurRadius = filter => Math.hypot(...Array.from(filter.matchAll(/blur\(([^)]+)/g), match => parseFloat(match[1])));
  const style = getComputedStyle(element, pseudo ? '::before' : null);
  if (style.display === 'none' || (pseudo && style.content === 'none')) {
    return { blur: 0, effectiveBlur: 0, sourceBlur: 0, saturation: 1, refraction: false, strength: 0, sampling: 'none' };
  }
  const filter = style.backdropFilter;
  const lens = filter.match(/url\([^)]*#([^"')]+)/)?.[1];
  const graph = lens ? document.getElementById(lens) : null;
  if (lens && (!graph?.querySelector('feImage')?.getAttribute('href')
    || graph.querySelector('feDisplacementMap')?.getAttribute('in') !== 'SourceGraphic')) return null;
  const strength = Number(graph?.querySelector('feDisplacementMap')?.getAttribute('scale') ?? 0);
  const effectiveBlur = blurRadius(filter);
  if (!Number.isFinite(effectiveBlur)) return null;
  const saturation = filter.match(/saturate\(([^)]+)/)?.[1] ?? '1';
  // Wallpaper settings and foreground filters cannot prove a backdrop rendered.
  const blur = Math.round(effectiveBlur * 1000) / 1000;
  return { blur, effectiveBlur, sourceBlur: 0,
    saturation: parseFloat(saturation) / (saturation.includes('%') ? 100 : 1),
    refraction: strength > 0, strength, sampling: filter === 'none' ? 'none' : 'backdrop' };
}

export async function describeGlassMaterial(locator, pseudo = false) {
  const material = await locator.evaluate(readGlassMaterial, pseudo);
  if (!material) return 'missing material source';
  return [material.blur ? `blur(${material.blur}px)` : '',
    material.saturation !== 1 ? `saturate(${material.saturation})` : '',
    material.refraction ? `refract(${material.strength}px)` : ''].filter(Boolean).join(' ') || 'none';
}

// Keep optical styling fixed while comparing displacement on/off. Both the
// native lens maps are controlled; preferences are not saved.
export async function withoutGlassRefraction(page, capture) {
  await page.evaluate(() => {
    for (const map of document.querySelectorAll('feDisplacementMap')) {
      map.setAttribute('data-diagnostic-scale', map.getAttribute('scale') ?? '0');
      map.setAttribute('scale', '0');
    }
    window.dispatchEvent(new Event('resize'));
  });
  try {
    await page.waitForTimeout(100);
    return await capture();
  } finally {
    await page.evaluate(() => {
      for (const map of document.querySelectorAll('feDisplacementMap[data-diagnostic-scale]')) {
        map.setAttribute('scale', map.getAttribute('data-diagnostic-scale'));
        map.removeAttribute('data-diagnostic-scale');
      }
      window.dispatchEvent(new Event('resize'));
    });
  }
}
