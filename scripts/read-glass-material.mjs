// Serializable browser-side inspector. Read the executed paint rather than
// accepting an authored custom property as proof that the material rendered.
export function readGlassMaterial(element, pseudo = false) {
  const blurRadius = filter => Math.hypot(...Array.from(filter.matchAll(/blur\(([^)]+)/g), match => parseFloat(match[1])));
  const style = getComputedStyle(element, pseudo ? '::before' : null);
  if (style.display === 'none' || (pseudo && style.content === 'none')) {
    return { blur: 0, effectiveBlur: 0, sourceBlur: 0, saturation: 1, refraction: false, strength: 0, sampling: 'none' };
  }
  const source = document.querySelector('.app-shell .wallpaper-layer img');
  // The source image is the final background layer; the preceding overlay is
  // deliberately scroll-attached so it also covers the blur overscan.
  const wallpaper = pseudo && element.matches('.site-card, .add-site-card')
    && /url\(/.test(style.backgroundImage) && style.backgroundAttachment.split(',').at(-1)?.trim() === 'fixed';
  if (wallpaper && (!source?.complete || !source.naturalWidth || !style.backgroundImage.includes(source.currentSrc))) return null;
  const filter = wallpaper ? style.filter : style.backdropFilter;
  const lens = filter.match(/url\([^)]*#([^"')]+)/)?.[1];
  const graph = lens ? document.getElementById(lens) : null;
  if (lens && !graph?.querySelector('feImage')?.getAttribute('href')) return null;
  const strength = Number(graph?.querySelector('feDisplacementMap')?.getAttribute('scale') ?? 0);
  const effectiveBlur = blurRadius(filter);
  const sourceBlur = wallpaper ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wallpaper-source-blur')) : 0;
  const precision = .0001;
  if (!Number.isFinite(effectiveBlur) || !Number.isFinite(sourceBlur)) return null;
  if (wallpaper) {
    const sourcePaint = getComputedStyle(source.parentElement, '::before');
    if (sourcePaint.display === 'none' || sourcePaint.content === 'none' || !sourcePaint.backgroundImage.includes(source.currentSrc)
      || Math.abs(blurRadius(sourcePaint.filter) - sourceBlur) >= precision || effectiveBlur < sourceBlur - precision) return null;
  }
  const saturation = filter.match(/saturate\(([^)]+)/)?.[1] ?? '1';
  // Subtracting nearly equal variances magnifies CSS serialization rounding.
  // Only coalesce a <0.0001px total-radius difference; a real extra 1px blur
  // remains distinguishable. Retain unrounded effective/source diagnostics.
  const blur = Math.abs(effectiveBlur - sourceBlur) < precision ? 0
    : Math.round(Math.sqrt(Math.max(0, effectiveBlur ** 2 - sourceBlur ** 2)) * 1000) / 1000;
  return { blur, effectiveBlur, sourceBlur,
    saturation: parseFloat(saturation) / (saturation.includes('%') ? 100 : 1),
    refraction: strength > 0, strength, sampling: wallpaper ? 'wallpaper' : filter === 'none' ? 'none' : 'backdrop' };
}

export async function describeGlassMaterial(locator, pseudo = false) {
  const material = await locator.evaluate(readGlassMaterial, pseudo);
  if (!material) return 'missing material source';
  return [material.blur ? `blur(${material.blur}px)` : '',
    material.saturation !== 1 ? `saturate(${material.saturation})` : '',
    material.refraction ? `refract(${material.strength}px)` : ''].filter(Boolean).join(' ') || 'none';
}

// Keep optical styling fixed while comparing displacement on/off. Both the
// native lens and explicit-source graphs are controlled; preferences are not saved.
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
