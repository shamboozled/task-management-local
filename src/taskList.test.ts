import { describe, it, expect } from "vitest";
import {
  emptyNotebook,
  createTask,
  tasksOf,
  editPage,
  taskListContainerId,
  contentContainers,
  newBullet,
  updateBullet,
  identity,
  moveTasks,
  rollover,
  validateBackup,
  canComplete,
  removeNavigation,
  deleteBullets,
} from "./model";
import { copyBullets, pasteBullets } from "./clipboard";

function fixture() {
  let db = emptyNotebook();
  const ids: string[] = [];
  for (const title of ["Alpha", "Beta", "Gamma", "Delta"]) {
    const result = createTask(db);
    ids.push(result.task.id);
    db = updateBullet(result.db, result.task.id, (b) => ({
      ...b,
      html: title,
    }));
  }
  db.customers = [{ id: "c", name: "Projects" }];
  db.sections = [{ id: "s", customerId: "c", name: "Calls" }];
  db.pages = [
    {
      id: "p",
      sectionId: "s",
      parentId: null,
      title: "Notes",
      bullets: [{ ...newBullet(), id: "blank" }],
    },
    {
      id: "q",
      sectionId: "s",
      parentId: null,
      title: "Other",
      bullets: [{ ...newBullet(), id: "blank-q" }],
    },
  ];
  return { db, ids };
}
function link(
  db: ReturnType<typeof emptyNotebook>,
  id: string,
  pageId = "p",
  target = "blank",
) {
  const source = contentContainers(db).find((p) =>
    p.bullets.some((b) => b.id === id),
  )!;
  return pasteBullets(db, pageId, target, copyBullets(db, source, [id]));
}

describe("tasks created on the task list", () => {
  it("creates a persistent blank unassigned task without navigation containers", () => {
    const { db, task } = createTask(emptyNotebook());
    expect(db.pages).toEqual([]);
    expect(db.customers).toEqual([]);
    expect(db.sections).toEqual([]);
    expect(task).toMatchObject({
      html: "",
      completed: false,
      dueDate: null,
      kind: "task",
    });
    expect(
      tasksOf(validateBackup(JSON.parse(JSON.stringify(db))))[0],
    ).toMatchObject({ pageId: null, bullet: task });
  });
  it("links pasted subtrees to notes and synchronizes text and structural edits in both directions", () => {
    let { db, ids } = fixture();
    db = editPage(db, taskListContainerId, (p) => ({
      ...p,
      bullets: [
        ...p.bullets,
        { ...newBullet(ids[0]), id: "detail", html: "Original detail" },
      ],
    }));
    const pasted = link(db, ids[0]);
    db = pasted.db;
    expect(
      tasksOf(db).filter((t) => identity(t.bullet) === ids[0]),
    ).toHaveLength(1);
    expect(tasksOf(db)[0].pageId).toBe("p");
    db = updateBullet(db, ids[0], (b) => ({ ...b, html: "Edited on card" }));
    expect(db.pages[0].bullets[0].html).toBe("Edited on card");
    db = updateBullet(
      db,
      pasted.focus,
      (b) => ({ ...b, html: "Edited in notes" }),
      "p",
    );
    expect(db.taskListBullets![0].html).toBe("Edited in notes");
    db = editPage(db, "p", (p) => ({
      ...p,
      bullets: [
        ...p.bullets,
        { ...newBullet(pasted.focus), id: "new-child", html: "Added in notes" },
      ],
    }));
    expect(tasksOf(db)[0].information.map((i) => i.bullet.html)).toEqual([
      "Original detail",
      "Added in notes",
    ]);
    expect(db.taskListBullets!.some((b) => b.html === "Added in notes")).toBe(
      true,
    );
  });
  it("tracks the newest linked page and retains the standalone task after deleting source pages", () => {
    let { db, ids } = fixture();
    db = link(db, ids[0]).db;
    db = link(db, ids[0], "q", "blank-q").db;
    expect(tasksOf(db)[0].pageId).toBe("q");
    db = removeNavigation(db, "page", "q");
    expect(tasksOf(db)[0].pageId).toBe("p");
    db = removeNavigation(db, "page", "p");
    expect(tasksOf(db)[0].pageId).toBeNull();
    expect(tasksOf(db)[0].bullet.html).toBe("Alpha");
  });
  it("retains completed standalone content and immutable snapshots on rollover", () => {
    let { db, ids } = fixture();
    db = updateBullet(db, ids[0], (b) => ({ ...b, completed: true }));
    const old = db.activeListId;
    db = rollover(db, "Next");
    expect(tasksOf(db).map((t) => identity(t.bullet))).toEqual(ids.slice(1));
    db = updateBullet(db, ids[0], (b) => ({
      ...b,
      html: "Changed",
      completed: false,
    }));
    expect(tasksOf(db)).toHaveLength(4);
    expect(db.taskLists.find((l) => l.id === old)!.snapshot![0]).toMatchObject({
      pageId: null,
      bullet: { html: "Alpha", completed: true },
    });
    expect(validateBackup(db)).toEqual(db);
  });
  it("supports hierarchy, completion guards, and deletion in standalone content", () => {
    let { db, ids } = fixture();
    db = editPage(db, taskListContainerId, (p) => ({
      ...p,
      bullets: p.bullets.map((b) =>
        b.id === ids[1] ? { ...b, parentId: ids[0] } : b,
      ),
    }));
    expect(canComplete(db, db.taskListBullets![0])).toBe(false);
    db = updateBullet(db, ids[1], (b) => ({ ...b, completed: true }));
    expect(canComplete(db, db.taskListBullets![0])).toBe(true);
    db = deleteBullets(db, taskListContainerId, [ids[0]]);
    expect(tasksOf(db).map((t) => identity(t.bullet))).toEqual(ids.slice(1));
    expect(db.taskListBullets![0].parentId).toBeNull();
  });
  it("migrates version-1 data without modifying the imported object", () => {
    const legacy = emptyNotebook();
    legacy.version = 1;
    delete legacy.taskListBullets;
    const migrated = validateBackup(legacy);
    expect(migrated.version).toBe(2);
    expect(migrated.taskListBullets).toEqual([]);
    expect(legacy.version).toBe(1);
    expect(legacy.taskListBullets).toBeUndefined();
  });
  it("rejects damaged standalone data, duplicate identifiers, cycles, and missing v2 storage", () => {
    const { db, ids } = fixture();
    const malformed = structuredClone(db);
    delete malformed.taskListBullets;
    expect(() => validateBackup(malformed)).toThrow("Unsupported");
    const duplicate = structuredClone(db);
    duplicate.taskListBullets![1].id = ids[0];
    expect(() => validateBackup(duplicate)).toThrow("duplicate");
    const cyclic = structuredClone(db);
    cyclic.taskListBullets![0].parentId = ids[1];
    cyclic.taskListBullets![1].parentId = ids[0];
    expect(() => validateBackup(cyclic)).toThrow("Cyclic");
  });
});

describe("moving logical tasks together", () => {
  it("preserves requested block order and unselected order while synchronizing linked dates", () => {
    let { db, ids } = fixture();
    db = link(db, ids[0]).db;
    const next = moveTasks(db, [ids[2], ids[0], ids[0]], "2027-02-03", ids[1]);
    expect(next.taskLists[0].taskIds).toEqual([ids[2], ids[0], ids[1], ids[3]]);
    expect(next.pages[0].bullets[0].html).toContain("02/03/2027");
    expect(next.taskListBullets!.find((b) => b.id === ids[0])!.dueDate).toBe(
      "2027-02-03",
    );
    expect(db.taskLists[0].taskIds).toEqual(ids);
  });
  it("appends to destination groups and removes every valid text date when unassigning", () => {
    let { db, ids } = fixture();
    db = moveTasks(db, [ids[1]], "2027-02-03");
    db = moveTasks(db, [ids[2], ids[0]], "2027-02-03");
    expect(
      tasksOf(db)
        .filter((t) => t.bullet.dueDate)
        .map((t) => identity(t.bullet)),
    ).toEqual([ids[1], ids[2], ids[0]]);
    db = updateBullet(db, ids[0], (b) => ({
      ...b,
      html: b.html + " 03/04/2027",
    }));
    db = moveTasks(db, [ids[0], ids[2]], null);
    expect(
      tasksOf(db)
        .filter((t) => !t.bullet.dueDate)
        .map((t) => identity(t.bullet)),
    ).toEqual([ids[3], ids[0], ids[2]]);
    expect(
      tasksOf(db).find((t) => identity(t.bullet) === ids[0])!.bullet.html,
    ).toBe("Alpha  ");
  });
  it("ignores stale IDs and self drops and does not reschedule unselected child tasks", () => {
    let { db, ids } = fixture();
    expect(moveTasks(db, ["stale"], null)).toBe(db);
    expect(moveTasks(db, [ids[0], ids[1]], null, ids[1])).toBe(db);
    db = editPage(db, taskListContainerId, (p) => ({
      ...p,
      bullets: p.bullets.map((b) =>
        b.id === ids[1] ? { ...b, parentId: ids[0] } : b,
      ),
    }));
    db = moveTasks(db, [ids[0]], "2027-02-03");
    expect(
      db.taskListBullets!.find((b) => b.id === ids[1])!.dueDate,
    ).toBeNull();
    expect(
      tasksOf(db).find((t) => identity(t.bullet) === ids[0])!.information[0]
        .bullet.parentId,
    ).toBe(ids[0]);
  });
});
