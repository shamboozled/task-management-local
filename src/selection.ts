export function editorAt(node: Node | null): HTMLDivElement | null {
  return (
    (node instanceof Element
      ? node
      : node?.parentElement
    )?.closest<HTMLDivElement>(".rich-editor") ?? null
  );
}
export function currentRange(): Range | null {
  const s = window.getSelection();
  return s?.rangeCount ? s.getRangeAt(0) : null;
}
export function caretOffset(el: HTMLElement, end = false): number {
  const r = currentRange();
  if (!r || !el.contains(end ? r.endContainer : r.startContainer)) return 0;
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(
    end ? r.endContainer : r.startContainer,
    end ? r.endOffset : r.startOffset,
  );
  return before.toString().length;
}
export function setCaret(
  el: HTMLElement,
  offset: number | "end" = "end",
  extend = false,
) {
  const anchor = window.getSelection()?.anchorNode;
  const anchorOffset = window.getSelection()?.anchorOffset ?? 0;
  el.focus();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n: Node | null,
    remaining = offset === "end" ? (el.textContent?.length ?? 0) : offset;
  let container: Node = el,
    at = el.childNodes.length;
  while ((n = walker.nextNode())) {
    const length = n.textContent?.length ?? 0;
    if (remaining <= length) {
      container = n;
      at = remaining;
      break;
    }
    remaining -= length;
  }
  const s = window.getSelection();
  if (extend && anchor)
    s?.setBaseAndExtent(anchor, anchorOffset, container, at);
  else {
    const range = document.createRange();
    range.setStart(container, at);
    range.collapse(true);
    s?.removeAllRanges();
    s?.addRange(range);
  }
}
export function selectedEditors(host: HTMLElement): HTMLDivElement[] {
  const range = currentRange();
  if (!range) return [];
  const editors = [
    ...host.querySelectorAll<HTMLDivElement>(".rich-editor"),
  ].filter((el) => el.getClientRects().length);
  if (range.collapsed)
    return editors.filter((el) => el.contains(range.startContainer));
  return editors.filter((el) => {
    if (
      el.contains(range.endContainer) &&
      caretOffset(el, true) === 0 &&
      el.textContent?.length
    )
      return false;
    if (
      el.contains(range.startContainer) &&
      caretOffset(el) === el.textContent?.length &&
      el.textContent?.length
    )
      return false;
    const contents = document.createRange();
    contents.selectNodeContents(el);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, contents) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, contents) > 0
    );
  });
}
export function wholeEditorSelected(el: HTMLElement): boolean {
  const r = currentRange();
  if (!r || r.collapsed) return false;
  const entire = document.createRange();
  entire.selectNodeContents(el);
  if (editorAt(r.startContainer) !== el || editorAt(r.endContainer) !== el)
    return false;
  const before = entire.cloneRange();
  before.setEnd(r.startContainer, r.startOffset);
  const after = entire.cloneRange();
  after.setStart(r.endContainer, r.endOffset);
  const empty = (part: DocumentFragment) =>
    !part.textContent?.length && !part.querySelector("img");
  return empty(before.cloneContents()) && empty(after.cloneContents());
}
export function splitHtml(el: HTMLElement): { before: string; after: string } {
  const selection = currentRange();
  if (
    !selection ||
    !el.contains(selection.startContainer) ||
    !el.contains(selection.endContainer)
  )
    return { before: el.innerHTML, after: "" };
  const a = document.createRange();
  a.selectNodeContents(el);
  a.setEnd(selection.startContainer, selection.startOffset);
  const b = document.createRange();
  b.selectNodeContents(el);
  b.setStart(selection.endContainer, selection.endOffset);
  const first = document.createElement("div"),
    second = document.createElement("div");
  first.append(a.cloneContents());
  second.append(b.cloneContents());
  return { before: first.innerHTML, after: second.innerHTML };
}
export function isBlank(html: string): boolean {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (
    !el.textContent?.replace(/\u200b/g, "").trim() &&
    !el.querySelector("img,table")
  );
}

export function insertHtml(
  el: HTMLElement,
  html: string,
  saved: Range | null = currentRange(),
) {
  el.focus();
  let range = saved;
  if (
    !range ||
    !el.contains(range.startContainer) ||
    !el.contains(range.endContainer)
  ) {
    range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
  }
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(range);
}
