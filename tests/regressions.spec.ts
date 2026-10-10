import { test, expect } from "./desktop-fixture";
import { _electron } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
const date = () => {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
};
async function submit(page: any, value?: string) {
  if (value) await page.getByRole("dialog").getByRole("textbox").fill(value);
  await page.getByRole("button", { name: "Create / save" }).click();
}
async function section(page: any, name: string) {
  await page.getByRole("button", { name: "New section", exact: true }).click();
  await submit(page, name);
}
test("sections and subsections collapse, reorder, move between sections and retain their pages", async ({
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "New section", exact: true }),
  ).toHaveCount(1);
  await section(page, "Alpha");
  await section(page, "Beta");
  const sidebar = page.locator(".sidebar");
  const beta = sidebar
    .locator("[data-section]")
    .filter({ has: page.getByRole("button", { name: "Beta", exact: true }) });
  await beta.getByRole("button", { name: "Beta", exact: true }).click();
  await expect(beta.locator("[data-subsection]")).toHaveCount(0);
  await beta.getByRole("button", { name: "Beta", exact: true }).click();
  await beta
    .getByRole("button", { name: "General calls", exact: true })
    .click();
  await expect(beta.locator(".page-link")).toHaveCount(0);
  await beta
    .getByRole("button", { name: "General calls", exact: true })
    .click();
  await expect(beta.locator(".page-link")).toHaveCount(1);
  await sidebar
    .getByRole("button", { name: "Drag section Beta", exact: true })
    .dragTo(
      sidebar.locator(".customer-name").filter({
        has: page.getByRole("button", { name: "Alpha", exact: true }),
      }),
    );
  await expect(
    sidebar.locator("[data-section] .customer-name .tree-label"),
  ).toHaveText(["Beta", "Alpha"]);
  await beta.getByRole("button", { name: "New subsection for Beta" }).click();
  await submit(page, "Planning");
  await beta.getByRole("button", { name: "New page in Planning" }).click();
  await submit(page, "Planning notes");
  await beta
    .getByRole("button", { name: "Drag subsection Planning", exact: true })
    .dragTo(
      beta.locator(".section-name").filter({
        has: page.getByRole("button", { name: "General calls", exact: true }),
      }),
    );
  await expect(beta.locator(".section-name .tree-label")).toHaveText([
    "Planning",
    "General calls",
  ]);
  await beta
    .getByRole("button", { name: "Drag subsection Planning", exact: true })
    .dragTo(
      sidebar.locator(".customer-name").filter({
        has: page.getByRole("button", { name: "Alpha", exact: true }),
      }),
    );
  const alpha = sidebar
    .locator("[data-section]")
    .filter({ has: page.getByRole("button", { name: "Alpha", exact: true }) });
  await expect(
    alpha.getByRole("button", { name: "Planning notes", exact: true }),
  ).toBeVisible();
  await alpha
    .getByRole("button", { name: "Planning notes", exact: true })
    .click();
  await expect(page.locator(".breadcrumb")).toContainText("Alpha");
  await expect(page.locator(".breadcrumb")).toContainText("Planning");
  await alpha.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    sidebar.getByRole("button", { name: "Alpha", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
});
test("date defaults, editable names, full breadcrumbs and minimal headings", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(date());
  await expect(page.getByText("YOUR NEXT STEPS", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(
      "Every customer. Every next step. One place to keep moving.",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await submit(page, "Today’s work");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Today’s work",
  );
  await page.getByRole("button", { name: "New task-list page" }).click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue(
    date(),
  );
  await submit(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(date());
  await section(page, "Acme");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(date());
  await expect(page.locator(".breadcrumb")).toContainText(date());
  await expect(page.getByText("CUSTOMER NOTES", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Capture the conversation. Turn the next steps into tasks."),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await submit(page, "Parent notes");
  await page.getByRole("button", { name: "Subpage", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue(
    date(),
  );
  await submit(page, "Child notes");
  await expect(page.locator(".breadcrumb")).toContainText("Parent notes");
  await expect(page.locator(".breadcrumb")).toContainText("Child notes");
  await page
    .locator(".breadcrumb")
    .getByRole("button", { name: "Parent notes" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Parent notes",
  );
  await page.getByRole("button", { name: "New page in General calls" }).click();
  await expect(page.getByRole("dialog").getByRole("textbox")).toHaveValue(
    date(),
  );
  await submit(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(date());
});
test("Tab and Shift+Tab preserve the focused line and caret for further typing", async ({
  page,
}) => {
  await section(page, "Acme");
  const first = page.getByRole("textbox", { name: "Information text" }).first();
  await first.fill("Parent");
  await first.press("End");
  await first.press("Enter");
  const line = page.getByRole("textbox", { name: "Information text" }).last();
  await line.fill("Child");
  await line.press("End");
  await line.press("Tab");
  await expect(line).toBeFocused();
  await page.keyboard.type(" nested");
  await expect(line).toHaveText("Child nested");
  await line.press("Home");
  await line.press("Shift+Tab");
  await expect(line).toBeFocused();
  await page.keyboard.type("Prefix ");
  await expect(line).toHaveText("Prefix Child nested");
  await expect(
    page.getByRole("textbox", { name: "Information text" }),
  ).toHaveCount(2);
  await expect(first).toHaveText("Parent");
});
test("typed, pasted and inserted hyperlinks open externally without changing notes", async ({
  page,
  desktop,
}) => {
  await desktop.evaluate(({ shell }) => {
    (globalThis as any).openedLinks = [];
    shell.openExternal = async (url: string) => {
      (globalThis as any).openedLinks.push(url);
    };
  });
  await section(page, "Acme");
  const info = page.getByRole("textbox", { name: "Information text" });
  await info.fill("See https://example.com/reference");
  await page.getByRole("heading", { level: 1 }).click();
  await expect(info.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/reference",
  );
  await info.locator("a").click();
  await expect
    .poll(() => desktop.evaluate(() => (globalThis as any).openedLinks))
    .toEqual(["https://example.com/reference"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(date());
  await info.fill("Proposal");
  await info.press("Control+a");
  await page.getByRole("button", { name: "Insert hyperlink" }).click();
  await submit(page, "https://example.com/proposal");
  await expect(info.locator("a")).toHaveText("Proposal");
  await expect(info.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/proposal",
  );
  await info.press("End");
  await info.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", " https://example.com/pasted");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(
    info.locator('a[href="https://example.com/pasted"]'),
  ).toHaveCount(1);
  await info.locator('a[href="https://example.com/pasted"]').click();
  await expect
    .poll(() => desktop.evaluate(() => (globalThis as any).openedLinks))
    .toEqual(["https://example.com/reference", "https://example.com/pasted"]);
});
test("last edit survives a normal desktop close and restart in the same data folder", async ({
  page,
  desktop,
  dataDir,
}) => {
  await section(page, "Persistent section");
  await page
    .getByRole("textbox", { name: "Information text" })
    .fill("Final edit before closing");
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
    env: { ...process.env, NOTEBOOK_TEST_DATA_DIR: dataDir },
    cwd: process.cwd(),
  });
  try {
    const win = await reopened.firstWindow();
    await win
      .locator(".sidebar")
      .getByRole("button", { name: date(), exact: true })
      .first()
      .click();
    await expect(
      win.getByRole("textbox", { name: "Information text" }),
    ).toHaveText("Final edit before closing");
    const location = await win.evaluate(() =>
      window.notebookDesktop!.location(),
    );
    expect(location.database).toBe(path.join(dataDir, "notebook.sqlite"));
    expect((await readFile(location.database)).subarray(0, 16).toString()).toBe(
      "SQLite format 3\0",
    );
  } finally {
    await reopened.close();
  }
});
