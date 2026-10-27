import type { TextAnchor } from "@/lib/listening/content";

/** UTF-16 offsets into immutable text runs, including selections across marks/gaps. */
export function selectedAnchors(
  root: HTMLElement,
  selection: Selection | null,
): TextAnchor[] {
  if (!selection?.rangeCount || selection.isCollapsed) return [];
  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return [];
  const anchors: TextAnchor[] = [];
  for (const element of root.querySelectorAll<HTMLElement>("[data-text-id]")) {
    if (!range.intersectsNode(element)) continue;
    const full = document.createRange();
    full.selectNodeContents(element);
    const overlap = full.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, full) > 0)
      overlap.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, full) < 0)
      overlap.setEnd(range.endContainer, range.endOffset);
    if (overlap.collapsed) continue;
    const prefix = full.cloneRange();
    prefix.setEnd(overlap.startContainer, overlap.startOffset);
    const start = prefix.toString().length;
    const end = start + overlap.toString().length;
    if (end > start)
      anchors.push({ textId: element.dataset.textId!, start, end });
  }
  return anchors;
}
