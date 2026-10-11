import { describe, expect, it } from "vitest";
import {
  emptyNotebook,
  newBullet,
  toggleBullet,
  updateBullet,
  tasksOf,
  identity,
  editPage,
  deleteBullets,
  canComplete,
  removeNavigation,
  movePage,
  reorderTask,
  quickDate,
  validateBackup,
  type Notebook,
} from "./model";
import {
  copyBullets,
  pasteBullets,
  clipboardHtml,
  readBulletClipboard,
} from "./clipboard";
import { selectedEditors } from "./selection";

function fixture(): Notebook {
  const db = emptyNotebook();
  db.customers = [{ id: "c", name: "Section" }];
  db.sections = [{ id: "s", customerId: "c", name: "Calls" }];
  db.pages = [
    {
      id: "a",
      title: "A",
      sectionId: "s",
      parentId: null,
      bullets: [
        { ...toggleBullet(newBullet()), id: "t", html: "Parent" },
        { ...toggleBullet(newBullet("t")), id: "child", html: "Child" },
        { ...newBullet("child"), id: "detail", html: "Details" },
      ],
    },
    {
      id: "b",
      title: "B",
      sectionId: "s",
      parentId: null,
      bullets: [
        { ...newBullet(), id: "heading", html: "Heading" },
        { ...newBullet("heading"), id: "empty" },
      ],
    },
  ];
  db.taskLists[0].taskIds = ["t", "child"];
  return db;
}
function linked() {
  const db = fixture();
  return pasteBullets(db, "b", "empty", copyBullets(db, db.pages[0], ["t"])).db;
}
describe("linked task placements", () => {
  it("preserves target indentation, child levels and one entry per task", () => {
    const db = linked();
    const bullets = db.pages[1].bullets;
    expect(bullets[1].parentId).toBe("heading");
    expect(bullets[2].parentId).toBe(bullets[1].id);
    expect(bullets[3].parentId).toBe(bullets[2].id);
    expect(tasksOf(db).map((t) => identity(t.bullet))).toEqual(["t", "child"]);
    expect(tasksOf(db)[0].information.map((i) => i.bullet.kind)).toEqual([
      "task",
      "information",
    ]);
    expect(validateBackup(JSON.parse(JSON.stringify(db)))).toEqual(db);
  });
  it("synchronizes content and points at the most recently edited page", () => {
    let db = linked();
    const id = db.pages[1].bullets[1].id;
    db = updateBullet(db, id, (b) => ({ ...b, html: "Changed" }), "b");
    expect(db.pages[0].bullets[0].html).toBe("Changed");
    expect(tasksOf(db)[0].pageId).toBe("b");
    db = updateBullet(db, "t", (b) => ({ ...b, html: "Changed again" }), "a");
    expect(db.pages[1].bullets[1].html).toBe("Changed again");
    expect(tasksOf(db)[0].pageId).toBe("a");
  });
  it("mirrors additions, deletions and promoted children without losing placement IDs", () => {
    let db = linked();
    const copyId = db.pages[1].bullets[1].id;
    db = editPage(db, "a", (p) => ({
      ...p,
      bullets: [
        ...p.bullets,
        { ...newBullet("t"), id: "added", html: "New info" },
      ],
    }));
    expect(
      db.pages[1].bullets.find((b) => identity(b) === "added")?.parentId,
    ).toBe(copyId);
    db = deleteBullets(db, "a", ["child"]);
    expect(db.pages[0].bullets.find((b) => b.id === "detail")?.parentId).toBe(
      "t",
    );
    expect(
      db.pages[1].bullets.find((b) => identity(b) === "detail")?.parentId,
    ).toBe(copyId);
    expect(db.pages[1].bullets.some((b) => identity(b) === "child")).toBe(
      false,
    );
  });
  it("deduplicates multiple placements on the same page", () => {
    let db = fixture();
    const payload = copyBullets(db, db.pages[0], ["t"]);
    db = pasteBullets(db, "a", "t", payload).db;
    expect(tasksOf(db)).toHaveLength(2);
    db = editPage(db, "a", (p) => ({
      ...p,
      bullets: [
        ...p.bullets,
        { ...newBullet("t"), id: "same-page-child", html: "Added" },
      ],
    }));
    expect(
      db.pages[0].bullets.filter((b) => identity(b) === "same-page-child"),
    ).toHaveLength(2);
    db = deleteBullets(db, "a", ["child"]);
    expect(
      db.pages[0].bullets.filter((b) => identity(b) === "child"),
    ).toHaveLength(0);
    expect(
      db.pages[0].bullets.filter((b) => identity(b) === "detail"),
    ).toHaveLength(2);
  });
  it("refreshes copied task children from current content and rejects recursive paste", () => {
    let db = fixture();
    const payload = copyBullets(db, db.pages[0], ["t"]);
    db = editPage(db, "a", (p) => ({
      ...p,
      bullets: [...p.bullets, { ...newBullet("t"), id: "new", html: "Latest" }],
    }));
    expect(
      pasteBullets(db, "b", "empty", payload).db.pages[1].bullets.some(
        (b) => b.html === "Latest",
      ),
    ).toBe(true);
    expect(() => pasteBullets(db, "a", "detail", payload)).toThrow(
      "inside itself",
    );
  });
  it("rejects indenting a linked placement inside another placement of itself", () => {
    let db = fixture();
    const payload = copyBullets(db, db.pages[0], ["t"]);
    db = pasteBullets(db, "a", "t", payload).db;
    const copy = db.pages[0].bullets.find((b) => b.sharedId === "t")!;
    expect(() =>
      editPage(db, "a", (p) => ({
        ...p,
        bullets: p.bullets.map((b) =>
          b.id === copy.id ? { ...b, parentId: "t" } : b,
        ),
      })),
    ).toThrow("inside themselves");
  });
  it("deleting a containing location preserves other placements and source navigation", () => {
    let db = linked();
    db = removeNavigation(db, "page", "b");
    expect(tasksOf(db)).toHaveLength(2);
    expect(tasksOf(db)[0].pageId).toBe("a");
    db = removeNavigation(db, "page", "a");
    expect(tasksOf(db)).toHaveLength(0);
  });
  it("cut and paste recovers task identity when the last placement was removed", () => {
    let db = fixture();
    const payload = copyBullets(db, db.pages[0], ["t"]);
    db = deleteBullets(db, "a", ["t"], true);
    expect(tasksOf(db)).toHaveLength(0);
    db = pasteBullets(db, "b", "empty", payload).db;
    expect(tasksOf(db).map((t) => identity(t.bullet))).toEqual(["t", "child"]);
  });
  it("treats another notebook's pasted tasks as new records", () => {
    const db = fixture();
    const payload = copyBullets(db, db.pages[0], ["t"]);
    payload.notebookId = "another";
    const pasted = pasteBullets(db, "b", "empty", payload).db;
    expect(tasksOf(pasted)).toHaveLength(4);
    expect(pasted.pages[1].bullets[1].sharedId).toBeUndefined();
  });
  it("blocks parent completion until all child tasks finish, then reopens ancestors when needed", () => {
    let db = linked();
    expect(canComplete(db, db.pages[0].bullets[0])).toBe(false);
    db = updateBullet(db, "t", (b) => ({ ...b, completed: true }), "a");
    expect(db.pages[0].bullets[0].completed).toBe(false);
    db = updateBullet(db, "child", (b) => ({ ...b, completed: true }), "a");
    db = updateBullet(db, "t", (b) => ({ ...b, completed: true }), "a");
    expect(db.pages[0].bullets[0].completed).toBe(true);
    db = updateBullet(db, "child", (b) => ({ ...b, completed: false }), "a");
    expect(db.pages[0].bullets[0].completed).toBe(false);
    expect(db.pages[1].bullets[1].completed).toBe(false);
  });
});
describe("navigation, scheduling and clipboard", () => {
  it("moves pages and all descendant pages between subsections and prevents cycles", () => {
    let db = fixture();
    db.sections.push({ id: "other", customerId: "c", name: "Other" });
    db.pages.push({ ...db.pages[0], id: "sub", parentId: "a", bullets: [] });
    expect(movePage(db, "a", "s", "sub")).toBe(db);
    db = movePage(db, "a", "other", null);
    expect(db.pages.find((p) => p.id === "sub")?.sectionId).toBe("other");
    expect(
      removeNavigation(db, "subsection", "other").pages.map((p) => p.id),
    ).toEqual(["b"]);
  });
  it("reorders tasks independently of page order", () => {
    const db = reorderTask(fixture(), "child", "t");
    expect(tasksOf(db).map((t) => identity(t.bullet))).toEqual(["child", "t"]);
    expect(db.pages[0].bullets[0].id).toBe("t");
  });
  it("uses local days for Today/Tomorrow/Friday, including weekends and year boundaries", () => {
    expect(quickDate("today", new Date(2026, 11, 31))).toBe("2026-12-31");
    expect(quickDate("tomorrow", new Date(2026, 11, 31))).toBe("2027-01-01");
    expect(quickDate("eow", new Date(2026, 9, 9))).toBe("2026-10-09");
    expect(quickDate("eow", new Date(2026, 9, 10))).toBe("2026-10-16");
  });
  it("exports real nested HTML bullets and reads its private metadata fallback", () => {
    const db = fixture(),
      payload = copyBullets(db, db.pages[0], ["t"]);
    const html = clipboardHtml(payload);
    const dom = new DOMParser().parseFromString(html, "text/html");
    expect(dom.querySelectorAll("li")).toHaveLength(3);
    expect(dom.querySelector("ul > li > ul > li")?.textContent).toContain(
      "Child",
    );
    const data = {
      getData: (type: string) => (type === "text/html" ? html : ""),
    } as DataTransfer;
    expect(readBulletClipboard(data)).toEqual(payload);
  });
  it("selects only intersected editor content, excluding an end boundary at the next line start", () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="rich-editor">One</div><div class="rich-editor">Two</div><div class="rich-editor">Three</div>';
    document.body.append(host);
    const editors = [...host.querySelectorAll<HTMLDivElement>(".rich-editor")];
    editors.forEach(
      (el) =>
        (el.getClientRects = () => [new DOMRect()] as unknown as DOMRectList),
    );
    const range = document.createRange();
    range.setStart(editors[0].firstChild!, 0);
    range.setEnd(editors[1].firstChild!, 0);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(selectedEditors(host)).toEqual([editors[0]]);
    host.remove();
  });
});
