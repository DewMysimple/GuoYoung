export type MaterialInvalidation = 'none' | 'measure' | 'discover';

/** Fixed-size favicon contents cannot move their surrounding glass surfaces.
 * Keep changes to the frame itself observable: size classes may affect layout. */
function isIconContentChange(record: MutationRecord) {
  const target = record.target;
  if (!(target instanceof Element)) return false;
  const frame = target.closest('.favicon-frame');
  if (!frame) return false;
  if (record.type === 'childList') return true;
  return target !== frame && record.attributeName === 'class';
}

export function classifyMaterialMutation(
  record: MutationRecord,
  root: HTMLElement,
  definitions: SVGElement,
): MaterialInvalidation {
  if (definitions.contains(record.target) || isIconContentChange(record)) return 'none';
  if (record.type === 'childList' || record.attributeName === 'class'
    || record.target === root || record.target === root.ownerDocument.documentElement) return 'discover';
  return 'measure';
}

/** Document scrolling moves the sampling windows; a Portal outside the root
 * cannot move these surfaces. A nested scroller only affects its descendants. */
export function scrollMovesMaterial(
  target: EventTarget | null,
  root: HTMLElement,
  candidates: readonly HTMLElement[],
) {
  const document = root.ownerDocument;
  if (target === document || target === document.documentElement || target === document.body) return true;
  return target instanceof Element && root.contains(target)
    && candidates.some(candidate => candidate !== target && target.contains(candidate));
}
