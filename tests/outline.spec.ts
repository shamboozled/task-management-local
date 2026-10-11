import { test, expect } from "./desktop-fixture";
import { type Page as BrowserPage } from "@playwright/test";
import { emptyNotebook, newBullet, type Notebook } from "../src/model";

function fixture(tasks = false): Notebook {
  const db = emptyNotebook();
  db.customers = [
    { id: "section", name: "Projects" },
    { id: "other-section", name: "Other" },
  ];
  db.sections = [
    { id: "calls", customerId: "section", name: "Calls" },
    { id: "other-calls", customerId: "other-section", name: "Other calls" },
  ];
  db.pages = [
    {
      id: "a",
      title: "Notes A",
      sectionId: "calls",
      parentId: null,
      bullets: [
        {
          ...newBullet(),
          id: "root",
          html: tasks ? "Parent" : "Alpha beta",
          kind: tasks ? "task" : "information",
        },
        {
          ...newBullet("root"),
          id: "child",
          html: "Child",
          kind: tasks ? "task" : "information",
        },
        ...(tasks
          ? [{ ...newBullet("child"), id: "detail", html: "Details" }]
          : []),
        {
          ...newBullet(),
          id: "tail",
          html: "Tail",
          kind: tasks ? "task" : "information",
        },
      ],
    },
    {
      id: "b",
      title: "Notes B",
      sectionId: "calls",
      parentId: null,
      bullets: [
        { ...newBullet(), id: "heading", html: "Heading" },
        { ...newBullet("heading"), id: "blank", html: "" },
      ],
    },
    {
      id: "c",
      title: "Notes C",
      sectionId: "other-calls",
      parentId: null,
      bullets: [{ ...newBullet(), id: "blank-c" }],
    },
  ];
  if (tasks) db.taskLists[0].taskIds = ["root", "child", "tail"];
  return db;
}
async function seed(page: BrowserPage, state: Notebook) {
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.evaluate((state) => window.notebookDesktop!.save(state), state);
  await page.reload();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}
async function open(page: BrowserPage, title: string) {
  await page.locator(".sidebar .page-link").filter({ hasText: title }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}
async function position(page: BrowserPage, id: string, offset: number) {
  await page
    .locator(`[data-bullet="${id}"] .rich-editor`)
    .evaluate((el, offset) => {
      (el as HTMLElement).focus();
      const range = document.createRange();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node: Node | null,
        left = offset;
      while ((node = walker.nextNode())) {
        const length = node.textContent?.length ?? 0;
        if (left <= length) {
          range.setStart(node, left);
          break;
        }
        left -= length;
      }
      if (!node) {
        range.selectNodeContents(el);
        range.collapse(false);
      } else range.collapse(true);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
    }, offset);
}
const lines = (page: BrowserPage) => page.locator(".notes-sheet .rich-editor");

test("Enter splits at the caret, transfers children, inserts above, outdents and supports undo", async ({
  page,
}) => {
  await seed(page, fixture());
  await open(page, "Notes A");
  await position(page, "root", 0);
  await page.keyboard.press("Enter");
  await expect(lines(page)).toHaveCount(4);
  await expect(lines(page).first()).toHaveText("");
  await page.keyboard.press("Control+z");
  await expect(lines(page)).toHaveCount(3);
  await position(page, "root", 6);
  await page.keyboard.press("Enter");
  await expect(lines(page)).toHaveText(["Alpha ", "beta", "Child", "Tail"]);
  await expect(page.locator('[data-bullet="child"]').locator("..")).toHaveCSS(
    "margin-left",
    "24px",
  );
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const state = await page.evaluate(() => window.notebookDesktop!.load());
  const bullets = state!.pages.find((p) => p.id === "a")!.bullets;
  expect(bullets.find((b) => b.id === "child")!.parentId).toBe(
    bullets.find((b) => b.html === "beta")!.id,
  );
  await page.keyboard.press("Control+z");
  await expect(lines(page)).toHaveText(["Alpha beta", "Child", "Tail"]);
  await position(page, "child", 5);
  await page.keyboard.press("Enter");
  await expect(lines(page)).toHaveCount(4);
  const blank = lines(page).nth(2);
  await expect(blank.locator("../..")).toHaveCSS("margin-left", "24px");
  await page.keyboard.press("Enter");
  await expect(lines(page)).toHaveCount(4);
  await expect(blank.locator("../..")).toHaveCSS("margin-left", "0px");
  await page.keyboard.press("Enter");
  await expect(lines(page)).toHaveCount(5);
  await expect(lines(page).nth(3).locator("../..")).toHaveCSS(
    "margin-left",
    "24px",
  );
});

test("arrow navigation and keyboard selection span bullets; Ctrl+A selects line then page", async ({
  page,
}) => {
  await seed(page, fixture());
  await open(page, "Notes A");
  await position(page, "root", 0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("X");
  await expect(lines(page).nth(1)).toHaveText("XChild");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowDown");
  expect(
    await page.evaluate(() => window.getSelection()?.toString()),
  ).toContain("XChild");
  await page.keyboard.press("Control+t");
  await expect(page.locator('[data-bullet="child"] .task-check')).toHaveCount(
    1,
  );
  await position(page, "tail", 0);
  await page.keyboard.press("Control+a");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "Tail",
  );
  await page.keyboard.press("Control+a");
  expect(
    await page.evaluate(() => window.getSelection()?.toString()),
  ).toContain("Alpha beta");
  await page.keyboard.press("Control+t");
  await expect(page.locator('[data-bullet="root"] .task-check')).toHaveCount(1);
  await expect(page.locator('[data-bullet="tail"] .task-check')).toHaveCount(1);
  await expect(page.locator('[data-bullet="child"] .task-check')).toHaveCount(
    0,
  );
});

test("whole-line and final-character deletion remove the bullet, promote children and have no dialog", async ({
  page,
}) => {
  await seed(page, fixture());
  await open(page, "Notes A");
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs++;
    void dialog.dismiss();
  });
  await position(page, "root", 0);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await expect(lines(page)).toHaveText(["Child", "Tail"]);
  await expect(page.locator('[data-bullet="child"]').locator("..")).toHaveCSS(
    "margin-left",
    "0px",
  );
  await page.keyboard.press("Control+z");
  await expect(lines(page)).toHaveCount(3);
  await page.locator('[data-bullet="tail"] .rich-editor').fill("Q");
  await page.keyboard.press("Home");
  await page.keyboard.press("Delete");
  await expect(lines(page)).toHaveText(["Alpha beta", "Child"]);
  expect(dialogs).toBe(0);
});

test("native multi-bullet copy/cut/paste preserves hierarchy and kinds, exports HTML lists and is undoable", async ({
  page,
  desktop,
}) => {
  await seed(page, fixture());
  await open(page, "Notes A");
  await position(page, "root", 0);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+t");
  await page.keyboard.press("Control+c");
  const html = await desktop.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read();
    const blob = await items[0].getType("text/html");
    return blob.text();
  });
  expect(html).toContain("<ul>");
  expect(html.match(/<li>/g)).toHaveLength(3);
  await page.keyboard.press("Control+x");
  await expect(lines(page)).toHaveCount(1);
  await expect(lines(page).first()).toHaveText("");
  await page.keyboard.press("Control+v");
  await expect(lines(page)).toHaveText(["Alpha beta", "Child", "Tail"]);
  await expect(page.locator(".notes-sheet .task-check")).toHaveCount(3);
  await expect(lines(page).nth(1).locator("../..")).toHaveCSS(
    "margin-left",
    "24px",
  );
  await page.keyboard.press("Control+z");
  await expect(lines(page)).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(lines(page)).toHaveCount(3);
});

test("linked task copy/paste adopts target indent, includes children and synchronizes all pages and the task list", async ({
  page,
}) => {
  await seed(page, fixture(true));
  await open(page, "Notes A");
  await position(page, "root", 0);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await open(page, "Notes B");
  await page.locator('[data-bullet="blank"] .rich-editor').click();
  await page.keyboard.press("Control+v");
  await expect(lines(page)).toHaveText([
    "Heading",
    "Parent",
    "Child",
    "Details",
  ]);
  await expect(lines(page).nth(1).locator("../..")).toHaveCSS(
    "margin-left",
    "24px",
  );
  await expect(lines(page).nth(2).locator("../..")).toHaveCSS(
    "margin-left",
    "48px",
  );
  await lines(page).nth(1).fill("Edited in B");
  await lines(page).nth(3).fill("Shared details");
  await open(page, "Notes A");
  await expect(lines(page).first()).toHaveText("Edited in B");
  await expect(lines(page).nth(2)).toHaveText("Shared details");
  await page.getByRole("button", { name: "Current task list" }).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
  const parent = page.locator(".task-card").filter({ hasText: "Edited in B" });
  await expect(
    parent.getByRole("button", { name: "Notes B", exact: true }),
  ).toBeVisible();
  await expect(parent.getByRole("checkbox").first()).toBeDisabled();
  await parent.getByRole("checkbox").nth(1).check();
  await parent.getByRole("checkbox").first().check();
  await open(page, "Notes B");
  await expect(page.locator(".notes-sheet .task-check").first()).toBeChecked();
  await lines(page).nth(1).press("Control+a");
  await page.keyboard.press("Control+x");
  await expect(lines(page)).toHaveText(["Heading"]);
  await open(page, "Notes C");
  await lines(page).first().click();
  await page.keyboard.press("Control+v");
  await expect(lines(page)).toHaveText([
    "Edited in B",
    "Child",
    "Shared details",
  ]);
  await page.getByRole("button", { name: "Current task list" }).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
});

test("task dates regroup only after blur; quick dates, collapse and drag reordering work", async ({
  page,
}) => {
  await seed(page, fixture(true));
  const parent = page.locator('[data-task="root"]');
  await parent.locator(".rich-editor").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" 10/13", { delay: 50 });
  await expect(parent.locator(".rich-editor").first()).toHaveText(
    "Parent 10/13",
  );
  await expect(parent.locator("..")).toHaveClass("task-column");
  await expect(page.locator('[data-date$="-10-13"]')).toHaveCount(0);
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.locator('[data-date$="-10-13"]')).toHaveCount(1);
  await parent.getByRole("button", { name: "Today", exact: true }).click();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await expect(parent.getByLabel("Task due date")).toHaveValue(today);
  await parent.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(parent.getByLabel("Task due date")).not.toHaveValue(today);
  await parent.getByRole("button", { name: "EOW", exact: true }).click();
  expect(
    new Date(
      (await parent.getByLabel("Task due date").inputValue()) + "T12:00:00",
    ).getDay(),
  ).toBe(5);
  await parent
    .getByRole("button", { name: "Collapse task children" })
    .first()
    .click();
  await expect(parent.locator(".attached-info")).toHaveCount(0);
  await expect(parent.locator(".rich-editor").first()).toContainText("Parent");
  await parent.getByRole("button", { name: "Expand task children" }).click();
  await expect(parent.locator(".attached-info")).toHaveCount(1);
  await parent.getByRole("button", { name: "Unassign", exact: true }).click();
  await page
    .locator('[data-task="tail"] .drag-handle')
    .dragTo(page.locator('[data-task="child"]'), {
      targetPosition: { x: 20, y: 5 },
    });
  await expect
    .poll(() =>
      page
        .locator(".task-card")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-task"))),
    )
    .toEqual(["root", "tail", "child"]);
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".task-card")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-task"))),
    )
    .toEqual(["root", "tail", "child"]);
});

test("task-list copy and cut preserve whole task trees when pasted into a notes page", async ({
  page,
}) => {
  await seed(page, fixture(true));
  const root = page.locator('[data-task="root"] .rich-editor').first();
  await root.press("Control+a");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+x");
  await expect(page.locator(".task-card")).toHaveCount(0);
  await open(page, "Notes B");
  await page.locator('[data-bullet="blank"] .rich-editor').click();
  await page.keyboard.press("Control+v");
  await expect(lines(page)).toHaveText([
    "Heading",
    "Parent",
    "Child",
    "Details",
    "Tail",
  ]);
  await page.getByRole("button", { name: "Current task list" }).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
});

test("page dragging and navigation deletion work with undo and preserve shared tasks elsewhere", async ({
  page,
}) => {
  const state = fixture(true);
  state.pages[1].bullets = state.pages[0].bullets.map((b) => ({
    ...b,
    id: "copy-" + b.id,
    sharedId: b.id,
    parentId: b.parentId ? "copy-" + b.parentId : null,
  }));
  await seed(page, state);
  page.on("dialog", (dialog) => {
    void dialog.accept();
  });
  await page
    .getByRole("button", { name: "Drag page Notes B" })
    .dragTo(page.locator('[data-page="a"] .page-tree-row'));
  expect(
    await page
      .locator('[data-subsection="calls"] [data-page]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.page)),
  ).toEqual(["b", "a"]);
  await page
    .getByRole("button", { name: "Drag page Notes B" })
    .dragTo(page.locator('[data-subsection="other-calls"] .section-name'));
  await expect(
    page.locator('[data-subsection="other-calls"] [data-page="b"]'),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete section Other", exact: true })
    .click();
  await expect(page.locator('[data-section="other-section"]')).toHaveCount(0);
  await expect(page.locator(".task-card")).toHaveCount(3);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-section="other-section"]')).toBeVisible();
  await page.getByRole("button", { name: "Delete page Notes B" }).click();
  await expect(page.locator('[data-page="b"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete subsection Calls", exact: true })
    .click();
  await expect(page.locator('[data-subsection="calls"]')).toHaveCount(0);
});

test("historical task trees survive deleting their source page and cannot navigate to a deleted page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, fixture(true));
  await page.getByRole("button", { name: "New task-list page" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Next list");
  await page.getByRole("button", { name: "Create / save" }).click();
  page.on("dialog", (d) => {
    void d.accept();
  });
  await page.getByRole("button", { name: "Delete page Notes A" }).click();
  await page.locator(".history-list .page-link").nth(1).click();
  await expect(page.locator(".task-card")).toHaveCount(3);
  const parent = page.locator('[data-task="root"]');
  await expect(
    parent.getByRole("button", { name: "Notes A", exact: true }),
  ).toBeDisabled();
  await parent
    .getByRole("button", { name: "Collapse task children" })
    .first()
    .click();
  await expect(parent.locator(".attached-info")).toHaveCount(0);
  await parent.getByRole("button", { name: "Expand task children" }).click();
  await expect(parent.locator(".attached-info")).toContainText("Child");
  expect(errors).toEqual([]);
});

test("mouse selection can cross bullet editors and replacement leaves a valid outline", async ({
  page,
}) => {
  await seed(page, fixture());
  await open(page, "Notes A");
  const first = await lines(page).first().boundingBox(),
    last = await lines(page).last().boundingBox();
  await page.mouse.move(first!.x + 1, first!.y + 12);
  await page.mouse.down();
  await page.mouse.move(last!.x + 25, last!.y + 12, { steps: 12 });
  await page.mouse.up();
  const selection = await page.evaluate(() =>
    window.getSelection()?.toString(),
  );
  expect(selection).toContain("Child");
  expect(selection).toContain("Alpha");
  await page.keyboard.press("Backspace");
  await expect(lines(page)).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(lines(page)).toHaveCount(3);
  await position(page, "root", 0);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Replacement");
  await expect(lines(page)).toHaveText(["Replacement"]);
});
