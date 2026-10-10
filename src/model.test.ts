import { describe, it, expect } from "vitest";
import {
  emptyNotebook,
  newBullet,
  editBullet,
  toggleBullet,
  updateBullet,
  tasksOf,
  rollover,
  dateMatch,
  moveDate,
  validateBackup,
  textOf,
  todayTitle,
  pagePath,
  reorderSections,
  moveSubsection,
} from "./model";
import { sanitize } from "./rich";
function fixture() {
  const db = emptyNotebook();
  db.customers = [{ id: "c", name: "Acme" }];
  db.sections = [{ id: "s", customerId: "c", name: "Discovery" }];
  db.pages = [
    {
      id: "p",
      sectionId: "s",
      parentId: null,
      title: "Call",
      bullets: [
        { ...newBullet(), id: "t", html: "Send proposal 10/10" },
        { ...newBullet("t"), id: "i", html: "Include pricing" },
        { ...newBullet(), id: "standalone", html: "Private note" },
        { ...newBullet(), id: "u", html: "Follow up" },
      ],
    },
  ];
  return updateBullet(updateBullet(db, "t", toggleBullet), "u", toggleBullet);
}
describe("shared notes and task lists", () => {
  it("defaults to information and pulls only information under tasks", () => {
    expect(newBullet().kind).toBe("information");
    const tasks = tasksOf(fixture());
    expect(tasks).toHaveLength(2);
    expect(tasks[0].information.map((i) => i.bullet.id)).toEqual(["i"]);
  });
  it("edits the source and task view through one record", () => {
    const db = updateBullet(fixture(), "t", (b) =>
      editBullet(b, "Changed 11/12"),
    );
    expect(tasksOf(db)[0].bullet.html).toBe("Changed 11/12");
    expect(db.pages[0].bullets[0].html).toBe("Changed 11/12");
  });
  it("carries both columns and freezes wording, attachments, and completion", () => {
    let db = fixture();
    db = updateBullet(db, "t", (b) => ({ ...b, completed: true }));
    const oldId = db.activeListId;
    db = rollover(db, "Next");
    expect(tasksOf(db).map((t) => t.bullet.id)).toEqual(["u"]);
    db = updateBullet(db, "i", (b) => editBullet(b, "New pricing"));
    db = updateBullet(db, "t", (b) => ({ ...b, completed: false }));
    expect(tasksOf(db)).toHaveLength(2);
    const old = db.taskLists.find((l) => l.id === oldId)!.snapshot!;
    expect(old[0].bullet.completed).toBe(true);
    expect(old[0].information[0].bullet.html).toBe("Include pricing");
  });
  it("preserves assigned dates and unassigned tasks across rollover", () => {
    const db = rollover(fixture(), "Next");
    expect(tasksOf(db)[0].bullet.dueDate).toMatch(/-10-10$/);
    expect(tasksOf(db)[1].bullet.dueDate).toBeNull();
  });
  it("assigns information to nearest task parent", () => {
    let db = fixture();
    db.pages[0].bullets.push(
      { ...newBullet("t"), id: "child", html: "Nested task" },
      { ...newBullet("child"), id: "nestedinfo", html: "Nested detail" },
    );
    db = updateBullet(db, "child", toggleBullet);
    expect(
      tasksOf(db)
        .find((t) => t.bullet.id === "t")!
        .information.map((i) => i.bullet.id),
    ).toEqual(["i"]);
    expect(
      tasksOf(db).find((t) => t.bullet.id === "child")!.information[0].bullet
        .id,
    ).toBe("nestedinfo");
  });
  it("conversion to information removes the current task", () => {
    const db = updateBullet(fixture(), "t", toggleBullet);
    expect(tasksOf(db).map((t) => t.bullet.id)).toEqual(["u"]);
  });
});
describe("dates", () => {
  it("uses current or explicit year and rejects invalid dates", () => {
    expect(dateMatch("Due 01/05", 2026)?.date).toBe("2026-01-05");
    expect(dateMatch("Due 01/05/2027", 2026)?.date).toBe("2027-01-05");
    expect(dateMatch("02/29", 2026)).toBeNull();
    expect(dateMatch("02/29/2028", 2026)?.date).toBe("2028-02-29");
    expect(dateMatch("13/40 and 10/11", 2026)?.date).toBe("2026-10-11");
  });
  it("appends and changes dates while retaining links and rich content", () => {
    const b = toggleBullet({
      ...newBullet(),
      html: '<a href="https://example.com">Send</a> proposal',
    });
    const assigned = moveDate(b, "2026-10-10", 2026);
    expect(textOf(assigned.html)).toBe("Send proposal 10/10");
    const moved = moveDate(assigned, "2027-01-02", 2026);
    expect(textOf(moved.html)).toBe("Send proposal 01/02/2027");
    expect(moved.html).toContain('href="https://example.com"');
    expect(moveDate(moved, null, 2026).dueDate).toBeNull();
    expect(textOf(moveDate(moved, null, 2026).html)).not.toContain("01/02");
  });
  it("replaces a date spanning formatting nodes", () => {
    const b = toggleBullet({
      ...newBullet(),
      html: "Due <strong>10/</strong>10",
    });
    expect(textOf(moveDate(b, "2026-11-12", 2026).html)).toBe("Due 11/12");
  });
});
describe("backups and clipboard", () => {
  it("round trips all notebook data including historical lists", () => {
    const db = rollover(fixture(), "Next");
    expect(validateBackup(JSON.parse(JSON.stringify(db)))).toEqual(db);
  });
  it("rejects broken hierarchy and duplicate ids", () => {
    const db = fixture();
    db.pages[0].bullets[0].parentId = "i";
    expect(() => validateBackup(db)).toThrow("Cyclic");
    const other = fixture();
    other.pages[0].bullets[1].id = "t";
    expect(() => validateBackup(other)).toThrow("duplicate");
  });
  it("preserves hyperlinks, images and tables while stripping fonts and unsafe HTML", () => {
    const clean = sanitize(
      '<p style="font:30px Arial"><a href="https://example.com" onclick="evil()">Link</a><table><tr><td>Cell</td></tr></table><img src="data:image/png;base64,AA=="><script>evil()</script></p>',
    );
    expect(clean).toContain("https://example.com");
    expect(clean).toContain("<table>");
    expect(clean).toContain("data:image/png");
    expect(clean).not.toContain("style=");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("<script");
    expect(
      sanitize(
        '<a href="javascript:evil()">Bad</a><img src="https://tracker.example/img">',
      ),
    ).not.toMatch(/javascript:|tracker/);
  });
});

describe("desktop navigation", () => {
  it("uses a local-calendar date as the default task-list title", () => {
    expect(emptyNotebook().taskLists[0].title).toBe(todayTitle());
    expect(todayTitle(new Date(2026, 0, 5))).toBe("01/05/2026");
  });
  it("moves subsections with source pages intact and reflects new parent in task sources", () => {
    let db = fixture();
    db.customers.push({ id: "other", name: "Other" });
    db = moveSubsection(db, "s", "other");
    expect(db.pages[0].sectionId).toBe("s");
    expect(tasksOf(db)[0].customerName).toBe("Other");
    expect(
      reorderSections(db, "other", "c").customers.map((c) => c.id),
    ).toEqual(["other", "c"]);
  });
  it("includes all page and subpage ancestors in the path", () => {
    const db = fixture();
    const child = {
      ...db.pages[0],
      id: "child",
      parentId: "p",
      title: "Subpage",
      bullets: [],
    };
    db.pages.push(child);
    expect(pagePath(db, child).map((p) => p.id)).toEqual(["p", "child"]);
  });
});
