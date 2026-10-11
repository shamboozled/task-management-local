import { type Notebook, pagePath } from "./model";

export type SearchScope = "current" | "all" | "selected";
export type SearchOptions = {
  scope: SearchScope;
  currentPageId: string | null;
  sectionIds: string[];
  subsectionIds: string[];
};
export type SearchMatch = { bulletId: string | null; text: string };
export type SearchPage = {
  pageId: string;
  sectionId: string;
  subsectionId: string;
  title: string;
  path: string[];
  matches: SearchMatch[];
};
export type TextCache = Map<string, { html: string; text: string }>;
type Point = { node: Text; offset: number };

// Block boundaries and table cells separate words; inline formatting does not.
const blocks = new Set([
  "BR",
  "P",
  "DIV",
  "LI",
  "UL",
  "OL",
  "TABLE",
  "TR",
  "TD",
  "TH",
  "BLOCKQUOTE",
]);
function searchableText(root: Node) {
  let text = "";
  const points: (Point | null)[] = [];
  const space = (point: Point | null = null) => {
    if (text.length && !text.endsWith(" ")) {
      text += " ";
      points.push(point);
    }
  };
  const walk = (node: Node) => {
    if (node instanceof Text) {
      for (let offset = 0; offset < node.data.length; offset++) {
        const char = node.data[offset];
        if (/\s/.test(char)) space({ node, offset });
        else {
          text += char;
          points.push({ node, offset });
        }
      }
      return;
    }
    if (node instanceof Element && node.tagName === "IMG") return;
    const block = node instanceof Element && blocks.has(node.tagName);
    if (block) space();
    node.childNodes.forEach(walk);
    if (block) space();
  };
  walk(root);
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    points.pop();
  }
  return { text, points };
}
export function searchText(html: string): string {
  return searchableText(new DOMParser().parseFromString(html, "text/html").body)
    .text;
}
export function searchTerms(query: string): string[] {
  const text = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    const phrase = text.slice(1, -1).trim();
    return phrase ? [phrase] : [];
  }
  return text ? [...new Set(text.split(" "))] : [];
}
export function pageSearchIndex(
  db: Notebook,
  cache: TextCache = new Map(),
): SearchPage[] {
  const live = new Set<string>();
  const index = db.pages.map((page) => {
    const subsection = db.sections.find((s) => s.id === page.sectionId)!;
    const section = db.customers.find((s) => s.id === subsection.customerId)!;
    const matches: SearchMatch[] = [
      { bulletId: null, text: page.title.replace(/\s+/g, " ").trim() },
    ];
    for (const bullet of page.bullets) {
      live.add(bullet.id);
      let entry = cache.get(bullet.id);
      if (!entry || entry.html !== bullet.html) {
        entry = { html: bullet.html, text: searchText(bullet.html) };
        cache.set(bullet.id, entry);
      }
      matches.push({ bulletId: bullet.id, text: entry.text });
    }
    return {
      pageId: page.id,
      sectionId: section.id,
      subsectionId: subsection.id,
      title: page.title,
      path: [
        section.name,
        subsection.name,
        ...pagePath(db, page).map((p) => p.title),
      ],
      matches,
    };
  });
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
  return index;
}
export function searchPages(
  index: SearchPage[],
  query: string,
  options: SearchOptions,
): SearchPage[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  return index
    .filter((page) => {
      if (options.scope === "current")
        return page.pageId === options.currentPageId;
      if (options.scope === "all") return true;
      return (
        (!options.sectionIds.length ||
          options.sectionIds.includes(page.sectionId)) &&
        (!options.subsectionIds.length ||
          options.subsectionIds.includes(page.subsectionId))
      );
    })
    .map((page) => ({
      ...page,
      matches: page.matches.filter((match) =>
        terms.every((term) => match.text.toLowerCase().includes(term)),
      ),
    }))
    .filter((page) => page.matches.length);
}
export function matchIntervals(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  let lower = "",
    offset = 0;
  const starts: number[] = [],
    ends: number[] = [];
  for (const char of text) {
    const folded = char.toLowerCase();
    lower += folded;
    for (let n = 0; n < folded.length; n++) {
      starts.push(offset);
      ends.push(offset + char.length);
    }
    offset += char.length;
  }
  const found: { start: number; end: number }[] = [];
  for (const term of terms) {
    if (!term) continue;
    let start = lower.indexOf(term);
    while (start >= 0) {
      found.push({ start: starts[start], end: ends[start + term.length - 1] });
      start = lower.indexOf(term, start + 1);
    }
  }
  found.sort((a, b) => a.start - b.start);
  const merged: typeof found = [];
  for (const match of found) {
    const prior = merged.at(-1);
    if (prior && prior.end >= match.start)
      prior.end = Math.max(prior.end, match.end);
    else merged.push({ ...match });
  }
  return merged;
}
export function searchSnippet(text: string, terms: string[]): string {
  const firstMatch = matchIntervals(text, terms)[0];
  const first = firstMatch?.start ?? 0;
  const start = Math.max(0, first - 45);
  const end = Math.min(
    text.length,
    Math.max(start + 160, firstMatch?.end ?? 0),
  );
  return (
    (start ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "")
  );
}
export function highlightRanges(
  element: HTMLElement,
  terms: string[],
): Range[] {
  const { text, points } = searchableText(element);
  return matchIntervals(text, terms).flatMap(({ start, end }) => {
    const first = points[start],
      last = points[end - 1];
    if (!first || !last) return [];
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    return [range];
  });
}
