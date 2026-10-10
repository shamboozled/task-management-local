import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Page } from "@playwright/test";
import { test, expect } from "./desktop-fixture";
async function createCustomer(page: Page) {
  await page.getByRole("button", { name: "New section", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Acme");
  await page.getByRole("button", { name: "Create / save" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /\d{2}\/\d{2}\/\d{4}/,
  );
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("First call");
  await page.getByRole("button", { name: "Create / save" }).click();
}
test("notes, task editing, dates, rollover, history and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createCustomer(page);
  const info = page.getByRole("textbox", { name: "Information text" });
  await info.fill("Send proposal 10/10");
  await info.press("Control+Shift+Enter");
  const task = page.getByRole("textbox", { name: "Task text" });
  await expect(task).toContainText("Send proposal 10/10");
  await task.press("Enter");
  const child = page.getByRole("textbox", { name: "Information text" });
  await child.fill("Include revised pricing");
  await child.press("Tab");
  await page.getByRole("button", { name: "Current task list" }).click();
  await expect(page.getByRole("textbox", { name: "Task text" })).toContainText(
    "Send proposal 10/10",
  );
  await expect(
    page.getByRole("textbox", { name: "Information text" }),
  ).toContainText("Include revised pricing");
  await page.getByLabel("Task due date").fill("2027-01-05");
  await expect(page.getByRole("textbox", { name: "Task text" })).toContainText(
    "01/05/2027",
  );
  await page
    .getByRole("button", { name: "First call", exact: true })
    .first()
    .click();
  await expect(page.getByRole("textbox", { name: "Task text" })).toContainText(
    "01/05/2027",
  );
  await page.getByRole("textbox", { name: "Task text" }).press("Enter");
  const other = page.getByRole("textbox", { name: "Information text" }).last();
  await other.fill("Follow up");
  await other.press("Control+Shift+Enter");
  await page.getByRole("button", { name: "Current task list" }).click();
  await page
    .getByRole("textbox", { name: "Task text" })
    .filter({ hasText: "Follow up" })
    .fill("Follow up tomorrow");
  await page.getByRole("button", { name: "New task-list page" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Task list 2");
  await page.getByRole("button", { name: "Create / save" }).click();
  await expect(page.getByRole("textbox", { name: "Task text" })).toHaveCount(2);
  await page
    .locator("[data-task]")
    .filter({ hasText: "Follow up tomorrow" })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "New task-list page" }).click();
  await page.getByRole("button", { name: "Create / save" }).click();
  await expect(page.getByRole("textbox", { name: "Task text" })).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Task text" })
    .fill("New wording 01/06/2027");
  await page.getByRole("button", { name: "Task list 2", exact: true }).click();
  await expect(
    page.getByText("Follow up tomorrow", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Send proposal 01/05/2027", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Current task list" }).click();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Task text" })).toContainText(
    "New wording 01/06/2027",
  );
  expect(errors).toEqual([]);
});
test("rich paste, image, tables, subpages, backup restore and drag scheduling", async ({
  page,
  desktop,
  dataDir,
}) => {
  await createCustomer(page);
  const info = page.getByRole("textbox", { name: "Information text" });
  await info.focus();
  await info.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      '<span style="font-size:40px;font-family:Arial"><a href="https://example.com">Reference</a></span>',
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(info.locator("a")).toHaveAttribute(
    "href",
    "https://example.com",
  );
  expect(await info.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    "16px",
  );
  await expect(info.locator("[style]")).toHaveCount(0);
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await expect(info.locator("table td")).toHaveCount(9);
  await info.locator("td").first().click();
  await page
    .getByRole("button", { name: "Add table row", exact: true })
    .click();
  await expect(info.locator("table tr")).toHaveCount(4);
  await info.locator("td").first().click();
  await page
    .getByRole("button", { name: "Add table column", exact: true })
    .click();
  await expect(info.locator("table td")).toHaveCount(16);
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "pixel.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1xkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(info.locator("img")).toHaveCount(1);
  await page.getByRole("button", { name: "Subpage", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Follow-up call");
  await page.getByRole("button", { name: "Create / save" }).click();
  await page
    .getByRole("textbox", { name: "Information text" })
    .fill("Send report");
  await page
    .getByRole("textbox", { name: "Information text" })
    .press("Control+Shift+Enter");
  await page.getByRole("button", { name: "Current task list" }).click();
  await page.getByLabel("Add date group").fill("2026-10-12");
  await page
    .locator(".drag-handle")
    .dragTo(page.locator('[data-date="2026-10-12"]'));
  await expect(page.getByRole("textbox", { name: "Task text" })).toContainText(
    "10/12",
  );
  const exported = path.join(dataDir, "export.json");
  await desktop.evaluate(({ dialog }, filename) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: filename,
    });
  }, exported);
  await page.getByRole("button", { name: "Export backup" }).click();
  await expect
    .poll(async () => {
      try {
        return JSON.parse(await readFile(exported, "utf8")).pages.length;
      } catch {
        return 0;
      }
    })
    .toBe(2);
  await page
    .getByRole("textbox", { name: "Task text" })
    .fill("Changed after backup");
  page.on("dialog", (d) => d.accept());
  await page.locator("input[type=file]").last().setInputFiles(exported);
  await expect(page.getByRole("textbox", { name: "Task text" })).toContainText(
    "Send report 10/12",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "First call", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Information text" }).locator("img"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("textbox", { name: "Information text" }).locator("table td"),
  ).toHaveCount(16);
});
