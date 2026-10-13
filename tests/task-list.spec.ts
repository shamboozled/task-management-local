import { test, expect } from "./desktop-fixture";
import { _electron, type Page, type Locator } from "@playwright/test";
import { emptyNotebook, newBullet } from "../src/model";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function saved(page: Page) {
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}
async function state(page: Page) {
  await saved(page);
  return page.evaluate(() => window.notebookDesktop!.load());
}
async function seed(page: Page) {
  let db = emptyNotebook();
  for (const [index, text] of [
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Epsilon",
  ].entries()) {
    const task = {
      ...newBullet(),
      id: `task-${index}`,
      kind: "task" as const,
      html: text,
    };
    db.taskListBullets!.push(task);
    db.taskLists[0].taskIds.push(task.id);
  }
  await saved(page);
  await page.evaluate((db) => window.notebookDesktop!.save(db), db);
  await page.reload();
  await saved(page);
}
const card = (page: Page, index: number) =>
  page.locator(`[data-task="task-${index}"]`);
async function select(
  page: Page,
  index: number,
  modifiers: ("Control" | "Shift")[] = [],
) {
  await card(page, index).click({ position: { x: 5, y: 5 }, modifiers });
}

// Begin the native drag before the destination scrolls into view. Real mouse
// motion crosses the drag threshold before traveling to a distant card.
async function dragGrip(page: Page, source: Locator, destination: Locator) {
  await source.hover();
  const box = (await source.boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 8, box.y + box.height / 2, {
    steps: 4,
  });
  await destination.hover({ position: { x: 8, y: 8 } });
  await destination.hover({ position: { x: 9, y: 9 } });
  await page.mouse.up();
}

test("Add task creates and focuses a blank Unassigned task without sidebar containers", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const task = page.getByRole("textbox", { name: "Task text", exact: true });
  await expect(task).toBeFocused();
  await expect(task).toHaveText("");
  await expect(page.locator(".task-source button")).toHaveCount(0);
  await expect(page.locator(".sidebar [data-section]")).toHaveCount(0);
  await page.getByLabel("Search tasks").click();
  await page.reload();
  await expect(task).toHaveText("");
  const blank = await state(page);
  expect(blank).toMatchObject({
    version: 2,
    pages: [],
    sections: [],
    customers: [],
  });
  expect(blank!.taskListBullets).toHaveLength(1);
  await task.fill("Call supplier");
  await task.press("Enter");
  const info = page.getByRole("textbox", { name: "Information text" });
  await expect(info).toBeFocused();
  await info.fill("Discuss pricing");
  await info.press("Tab");
  await expect(page.locator(".attached-info")).toContainText("Discuss pricing");
  await page.getByLabel("Task due date").fill("2027-02-03");
  await expect(task).toContainText("02/03/2027");
  await page.getByLabel("Search tasks").fill("no match");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByLabel("Search tasks")).toHaveValue("");
  await expect(
    page
      .locator(".task-column")
      .first()
      .getByRole("textbox", { name: "Task text", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("textbox", { name: "Task text" })).toHaveCount(1);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByRole("textbox", { name: "Task text" })).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("full task copy into notes establishes a synchronized source link and preserves children", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const task = page.getByRole("textbox", { name: "Task text", exact: true });
  await task.fill("Review contract");
  await task.press("Enter");
  const info = page.getByRole("textbox", { name: "Information text" });
  await info.fill("Check renewal terms");
  await info.press("Tab");
  await task.click();
  await task.press("Control+a");
  await task.press("Control+c");
  await page.getByRole("button", { name: "New section", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Contracts");
  await page.getByRole("button", { name: "Create / save" }).click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Contract notes");
  await page.getByRole("button", { name: "Create / save" }).click();
  await page
    .getByRole("textbox", { name: "Information text" })
    .press("Control+v");
  await expect(page.getByRole("textbox", { name: "Task text" })).toHaveText(
    "Review contract",
  );
  await expect(
    page.getByRole("textbox", { name: "Information text" }),
  ).toHaveText("Check renewal terms");
  await page
    .getByRole("textbox", { name: "Task text" })
    .fill("Review revised contract");
  await page.getByRole("button", { name: "Current task list" }).click();
  await expect(page.locator(".task-card")).toHaveCount(1);
  await expect(page.locator(".task-source button")).toHaveText(
    "Contract notes",
  );
  await expect(task).toHaveText("Review revised contract");
  await task.fill("Final contract");
  await page.locator(".task-source button").click();
  await expect(task).toHaveText("Final contract");
  page.on("dialog", (d) => {
    void d.accept();
  });
  await page
    .getByRole("button", { name: "Delete page Contract notes", exact: true })
    .click();
  await expect(page.locator(".task-source button")).toHaveCount(0);
  await expect(task).toHaveText("Final contract");
  await expect(
    page.getByRole("textbox", { name: "Information text" }),
  ).toHaveText("Check renewal terms");
});

test("Ctrl/Shift selection, keyboard checkboxes, filters, and Escape remain separate from completion", async ({
  page,
}) => {
  await seed(page);
  await select(page, 0, ["Control"]);
  await select(page, 3, ["Control"]);
  await expect(page.getByRole("status")).toHaveText("2 selected");
  await select(page, 1, ["Shift"]);
  await expect(page.locator(".task-card-selected")).toHaveCount(3);
  await expect(
    card(page, 0).getByLabel("Select task", { exact: true }),
  ).not.toBeChecked();
  await select(page, 4, ["Control", "Shift"]);
  await expect(page.locator(".task-card-selected")).toHaveCount(4);
  await select(page, 2, ["Control"]);
  await expect(page.locator(".task-card-selected")).toHaveCount(3);
  await select(page, 0);
  await expect(page.locator(".task-card-selected")).toHaveCount(1);
  const checkbox = card(page, 4).getByLabel("Select task", { exact: true });
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(page.locator(".task-card-selected")).toHaveCount(2);
  expect(
    await page
      .getByLabel("Complete task", { exact: true })
      .evaluateAll((inputs) =>
        inputs.every((el) => !(el as HTMLInputElement).checked),
      ),
  ).toBe(true);
  await page.getByLabel("Search tasks").fill("Alpha");
  await expect(page.getByRole("status")).toHaveText("0 selected");
  await select(page, 0, ["Shift"]);
  await expect(page.getByRole("status")).toHaveText("1 selected");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).toHaveText("0 selected");
});

test("group scheduling and Unassigned moves preserve order and undo as a single batch", async ({
  page,
}) => {
  await seed(page);
  await select(page, 0, ["Control"]);
  await select(page, 2, ["Control"]);
  await page
    .getByRole("button", { name: "Move selected", exact: true })
    .click();
  await page.getByLabel("Move selected to date").fill("2027-02-03");
  await expect(
    page.locator('[data-date="2027-02-03"] .task-card .rich-editor'),
  ).toHaveText(["Alpha 02/03/2027", "Gamma 02/03/2027"]);
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-date] .task-card")).toHaveCount(0);
  await expect(page.locator(".task-card .rich-editor")).toHaveText([
    "Alpha",
    "Beta",
    "Gamma",
    "Delta",
    "Epsilon",
  ]);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('[data-date="2027-02-03"] .task-card')).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Move selected", exact: true })
    .click();
  await page
    .getByRole("group", { name: "Move selected tasks" })
    .getByRole("button", { name: "Unassigned", exact: true })
    .click();
  await expect(page.locator(".task-card .rich-editor")).toHaveText([
    "Beta",
    "Delta",
    "Epsilon",
    "Alpha ",
    "Gamma ",
  ]);
  await page.reload();
  await expect(page.locator(".task-card .rich-editor")).toHaveText([
    "Beta",
    "Delta",
    "Epsilon",
    "Alpha ",
    "Gamma ",
  ]);
});

test("dragging selected cards moves a block, handles cross-column ranges, and preserves archived snapshots", async ({
  page,
}) => {
  await seed(page);
  await select(page, 0, ["Control"]);
  await select(page, 2, ["Control"]);
  await dragGrip(page, card(page, 0).locator(".drag-handle"), card(page, 4));
  await expect(page.locator(".task-card .rich-editor")).toHaveText([
    "Beta",
    "Delta",
    "Alpha",
    "Gamma",
    "Epsilon",
  ]);
  await page.getByLabel("Add date group").fill("2027-02-03");
  await dragGrip(
    page,
    card(page, 0).locator(".drag-handle"),
    page.locator('[data-date="2027-02-03"] h3'),
  );
  await expect(page.locator('[data-date="2027-02-03"] .task-card')).toHaveCount(
    2,
  );
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await select(page, 1, ["Control"]);
  await select(page, 2, ["Shift"]);
  await expect(page.getByRole("status")).toHaveText("5 selected");
  await page.getByRole("button", { name: "New task-list page" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Next list");
  await page.getByRole("button", { name: "Create / save" }).click();
  await card(page, 0)
    .getByRole("textbox", { name: "Task text", exact: true })
    .fill("Later edit");
  await page.locator(".history-list .page-link").nth(1).click();
  await expect(
    page.getByRole("button", { name: "Add task", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Select tasks", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".task-card .rich-editor")).toHaveText([
    "Beta",
    "Delta",
    "Epsilon",
    "Alpha 02/03/2027",
    "Gamma 02/03/2027",
  ]);
});

test("standalone tasks survive real close/restart and backup export/restore", async ({
  page,
  desktop,
  dataDir,
}) => {
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Task text" })
    .fill("Persistent standalone task");
  const exported = path.join(dataDir, "standalone-backup.json");
  await desktop.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, exported);
  await page.getByRole("button", { name: "Export backup" }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(exported, "utf8")).taskListBullets?.[0]
          ?.html;
      } catch {
        return null;
      }
    })
    .toBe("Persistent standalone task");
  await page.getByRole("textbox", { name: "Task text" }).fill("After backup");
  page.on("dialog", (d) => {
    void d.accept();
  });
  await page.locator("input[type=file]").last().setInputFiles(exported);
  await expect(page.getByRole("textbox", { name: "Task text" })).toHaveText(
    "Persistent standalone task",
  );
  await page
    .getByRole("textbox", { name: "Task text" })
    .fill("Final standalone edit 02/04/2027");
  const childProcess = desktop.process();
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].close(),
  );
  await expect.poll(() => childProcess.exitCode).not.toBeNull();
  const reopened = await _electron.launch({
    args: [
      "desktop/main.cjs",
      ...(process.platform === "linux"
        ? ["--no-sandbox", "--disable-gpu"]
        : []),
    ],
    cwd: globalThis.process.cwd(),
    env: { ...globalThis.process.env, NOTEBOOK_TEST_DATA_DIR: dataDir },
  });
  try {
    const win = await reopened.firstWindow();
    await expect(win.getByRole("textbox", { name: "Task text" })).toHaveText(
      "Final standalone edit 02/04/2027",
    );
    expect((await state(win))!.taskListBullets![0].dueDate).toBe("2027-02-04");
  } finally {
    await reopened.close();
  }
});
