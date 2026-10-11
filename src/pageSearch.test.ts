import { describe, expect, it } from "vitest";
import { emptyNotebook, newBullet, type Notebook } from "./model";
import {
  highlightRanges,
  pageSearchIndex,
  searchPages,
  searchTerms,
  searchText,
  searchSnippet,
  matchIntervals,
  type SearchOptions,
} from "./pageSearch";

function fixture(): Notebook {
  const db = emptyNotebook();
  db.customers = [
    { id: "north", name: "North" },
    { id: "south", name: "South" },
  ];
  db.sections = [
    { id: "calls", customerId: "north", name: "Calls" },
    { id: "visits", customerId: "north", name: "Visits" },
    { id: "south-calls", customerId: "south", name: "Calls" },
  ];
  db.pages = [
    {
      id: "a",
      sectionId: "calls",
      parentId: null,
      title: "Meeting notes",
      bullets: [
        { ...newBullet(), id: "info", html: "<b>Renewal</b> of the contract" },
        {
          ...newBullet(),
          id: "done",
          kind: "task",
          completed: true,
          html: "Completed contract <em>renewal</em>",
        },
        {
          ...newBullet(),
          id: "table",
          html: "<table><tr><td>Contract</td><td>renewal date</td></tr></table>",
        },
        {
          ...newBullet(),
          id: "link",
          html: '<a href="https://example.test/hidden-address">Renewal portal</a>',
        },
        {
          ...newBullet(),
          id: "image",
          html: '<img src="data:image/png;base64,AA==" alt="Secret image text">',
        },
      ],
    },
    {
      id: "child",
      sectionId: "calls",
      parentId: "a",
      title: "Child page",
      bullets: [{ ...newBullet(), html: "Contract subpage renewal" }],
    },
    {
      id: "visit",
      sectionId: "visits",
      parentId: null,
      title: "Visit",
      bullets: [{ ...newBullet(), html: "renewal contract" }],
    },
    {
      id: "b",
      sectionId: "south-calls",
      parentId: null,
      title: "Contract renewal",
      bullets: [
        {
          ...newBullet(),
          id: "copy",
          sharedId: "done",
          kind: "task",
          completed: true,
          html: "Completed contract renewal",
        },
      ],
    },
    {
      id: "split",
      sectionId: "south-calls",
      parentId: null,
      title: "Separate bullets",
      bullets: [
        { ...newBullet(), html: "contract" },
        { ...newBullet(), html: "renewal" },
      ],
    },
  ];
  db.taskLists.push({
    id: "history",
    title: "Historical needle",
    createdAt: new Date().toISOString(),
    taskIds: [],
    snapshot: [
      {
        bullet: { ...newBullet(), kind: "task", html: "Historical needle" },
        pageId: "a",
        pageTitle: "Meeting notes",
        customerName: "North",
        information: [],
      },
    ],
  });
  return db;
}
const all: SearchOptions = {
  scope: "all",
  currentPageId: "a",
  sectionIds: [],
  subsectionIds: [],
};
describe("local normal-page search", () => {
  it("requires all unquoted words in one title or bullet and matches quoted phrases case-insensitively", () => {
    const index = pageSearchIndex(fixture());
    expect(
      searchPages(index, "CONTRACT renewal", all).map((p) => p.pageId),
    ).toEqual(["a", "child", "visit", "b"]);
    const phrase = searchPages(index, '"Contract renewal"', all);
    expect(phrase.map((p) => p.pageId)).toEqual(["a", "b"]);
    expect(phrase[0].matches.map((m) => m.bulletId)).toEqual(["done", "table"]);
    expect(searchTerms(' "" ')).toEqual([]);
    expect(searchPages(index, "   ", all)).toEqual([]);
  });
  it("searches only the current page, excludes its subpages, and returns no current-page results on a task list", () => {
    const index = pageSearchIndex(fixture());
    expect(
      searchPages(index, "renewal", { ...all, scope: "current" }).map(
        (p) => p.pageId,
      ),
    ).toEqual(["a"]);
    expect(
      searchPages(index, "renewal", {
        ...all,
        scope: "current",
        currentPageId: null,
      }),
    ).toEqual([]);
    expect(index.find((p) => p.pageId === "child")!.path).toEqual([
      "North",
      "Calls",
      "Meeting notes",
      "Child page",
    ]);
  });
  it("combines sections with OR, intersects subsection choices, and treats empty selected filters as all pages", () => {
    const index = pageSearchIndex(fixture());
    const options = { ...all, scope: "selected" as const };
    expect(
      searchPages(index, "contract renewal", options).map((p) => p.pageId),
    ).toEqual(["a", "child", "visit", "b"]);
    expect(
      searchPages(index, "contract renewal", {
        ...options,
        sectionIds: ["north"],
      }).map((p) => p.pageId),
    ).toEqual(["a", "child", "visit"]);
    expect(
      searchPages(index, "contract renewal", {
        ...options,
        sectionIds: ["north", "south"],
        subsectionIds: ["calls", "south-calls"],
      }).map((p) => p.pageId),
    ).toEqual(["a", "child", "b"]);
    expect(
      searchPages(index, "contract renewal", {
        ...options,
        sectionIds: ["north"],
        subsectionIds: ["south-calls"],
      }),
    ).toEqual([]);
  });
  it("includes completed and linked task placements, visible table/link text, but excludes HTML, URLs, image text and task-list snapshots", () => {
    const index = pageSearchIndex(fixture());
    expect(searchPages(index, "completed", all).map((p) => p.pageId)).toEqual([
      "a",
      "b",
    ]);
    expect(
      searchPages(index, "renewal portal", all)[0].matches[0].bulletId,
    ).toBe("link");
    for (const query of [
      "hidden-address",
      "Secret image",
      "Historical needle",
      "<em>",
    ])
      expect(searchPages(index, query, all)).toEqual([]);
    expect(
      searchText(
        "Con<strong>tract</strong><br>renewal<table><tr><td>Owner</td><td>Alex</td></tr></table>",
      ),
    ).toBe("Contract renewal Owner Alex");
  });
  it("refreshes cached text after edits and removes deleted placements", () => {
    const db = fixture();
    const cache = new Map();
    pageSearchIndex(db, cache);
    db.pages[0].bullets[0].html = "Changed information";
    db.pages[0].bullets = db.pages[0].bullets.filter((b) => b.id !== "done");
    const index = pageSearchIndex(db, cache);
    expect(searchPages(index, "changed", all)[0].matches[0].bulletId).toBe(
      "info",
    );
    expect(cache.has("done")).toBe(false);
  });
  it("highlights matches across inline formatting and table cells without modifying stored HTML", () => {
    const el = document.createElement("div");
    el.innerHTML =
      "<p>Con<strong>tract</strong> renewal</p><table><tr><td>Contract</td><td>renewal</td></tr></table>";
    const html = el.innerHTML;
    const ranges = highlightRanges(el, ["contract renewal"]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].toString()).toBe("Contract renewal");
    expect(ranges[1].startContainer.textContent).toBe("Contract");
    expect(ranges[1].endContainer.textContent).toBe("renewal");
    expect(el.innerHTML).toBe(html);
  });
  it("merges overlapping matches and keeps the matched phrase visible in long snippets", () => {
    expect(matchIntervals("contract", ["contract", "tract"])).toEqual([
      { start: 0, end: 8 },
    ]);
    const text =
      "Before ".repeat(80) + "contract renewal" + " After".repeat(80);
    const snippet = searchSnippet(text, ["contract renewal"]);
    expect(snippet).toContain("contract renewal");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(matchIntervals("İstanbul contract", ["contract"])).toEqual([
      { start: 9, end: 17 },
    ]);
  });
});
