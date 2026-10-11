import { test, expect } from "./desktop-fixture";
import { emptyNotebook, newBullet, type Notebook } from "../src/model";
import type { Page } from "@playwright/test";

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
  const bullets = [
    { ...newBullet(), id: "root", kind: "task" as const, html: "Parent" },
    { ...newBullet("root"), id: "child", kind: "task" as const, html: "Child" },
    {
      ...newBullet("child"),
      id: "detail",
      html: "<strong>Contract</strong> renewal",
    },
    {
      ...newBullet(),
      id: "table",
      html: "<table><tr><td>Alpha</td><td>renewal contract</td></tr></table>",
    },
    {
      ...newBullet(),
      id: "link",
      html: '<a href="https://example.test/hidden-address">Policy portal</a>',
    },
    { ...newBullet(), id: "editable", html: "Editable text" },
  ];
  db.pages = [
    { id: "a", sectionId: "calls", parentId: null, title: "Notes A", bullets },
    {
      id: "a-child",
      sectionId: "calls",
      parentId: "a",
      title: "Child notes",
      bullets: [
        {
          ...newBullet(),
          id: "subpage-info",
          html: "Contract renewal in child",
        },
      ],
    },
    {
      id: "c",
      sectionId: "visits",
      parentId: null,
      title: "Notes C",
      bullets: [
        {
          ...newBullet(),
          id: "visit-info",
          html: "Renewal contract scheduling",
        },
      ],
    },
    {
      id: "b",
      sectionId: "south-calls",
      parentId: null,
      title: "Notes B",
      bullets: bullets.map((b) => ({
        ...b,
        id: "copy-" + b.id,
        sharedId: b.id,
        parentId: b.parentId ? "copy-" + b.parentId : null,
      })),
    },
    {
      id: "title",
      sectionId: "south-calls",
      parentId: null,
      title: "Contract renewal",
      bullets: [
        { ...newBullet(), id: "title-info", html: "No matching content" },
      ],
    },
  ];
  db.taskLists[0].taskIds = ["root", "child"];
  return db;
}
async function seed(page: Page, db = fixture()) {
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  await page.evaluate((db) => window.notebookDesktop!.save(db), db);
  await page.reload();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
}
const panel = (page: Page) =>
  page.getByRole("complementary", { name: "Page search" });
const input = (page: Page) =>
  panel(page).getByRole("searchbox", { name: "Search page text" });
const scope = (page: Page) => panel(page).getByLabel("Page search scope");
const results = (page: Page) => panel(page).locator(".page-search-result");
async function open(page: Page, title: string) {
  await page.locator(".sidebar .page-link").filter({ hasText: title }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
}

test("Ctrl+F defaults to the current page, excludes subpages, and keeps an open query and scope", async ({
  page,
}) => {
  await seed(page);
  await open(page, "Notes A");
  await page.keyboard.press("Control+f");
  await expect(input(page)).toBeFocused();
  await expect(scope(page)).toHaveValue("current");
  await input(page).fill("renewal contract");
  await expect(results(page)).toHaveCount(1);
  await expect(panel(page).getByRole("status")).toHaveText(
    "2 matches in 1 page",
  );
  await input(page).fill('"CONTRACT renewal"');
  await expect(panel(page).getByRole("status")).toHaveText("1 match in 1 page");
  await scope(page).selectOption("all");
  await expect(results(page)).toHaveCount(4);
  await expect(
    panel(page).locator('[data-search-page="a-child"] .page-search-path'),
  ).toHaveText("North › Calls › Notes A › Child notes");
  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("Control+f");
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue('"CONTRACT renewal"');
  await expect(scope(page)).toHaveValue("all");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Search pages", exact: true }).click();
  await expect(scope(page)).toHaveValue("current");
  const box = await panel(page).boundingBox();
  const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
  expect(heading!.x + heading!.width).toBeLessThanOrEqual(box!.x);
});

test("page search launches from task lists with all-page scope and leaves task search independent", async ({
  page,
}) => {
  await seed(page);
  await page.getByLabel("Search tasks").fill("Parent");
  await page.keyboard.press("Control+f");
  await expect(scope(page)).toHaveValue("all");
  await input(page).fill("contract renewal");
  await expect(results(page)).toHaveCount(5);
  await expect(panel(page).getByRole("status")).toHaveText(
    "7 matches in 5 pages",
  );
  await expect(page.getByLabel("Search tasks")).toHaveValue("Parent");
  await input(page).fill("Policy portal");
  await expect(results(page)).toHaveCount(2);
  await input(page).fill("hidden-address");
  await expect(results(page)).toHaveCount(0);
  await expect(panel(page).getByRole("status")).toHaveText(
    "0 matches in 0 pages",
  );
  await panel(page).getByRole("button", { name: "Close page search" }).click();
  await expect(page.getByLabel("Search tasks")).toHaveValue("Parent");
});

test("multi-section and subsection filters combine correctly and incompatible choices are cleared", async ({
  page,
}) => {
  await seed(page);
  await page.keyboard.press("Control+f");
  await input(page).fill("contract renewal");
  await scope(page).selectOption("selected");
  const search = panel(page);
  await search.getByRole("checkbox", { name: "North", exact: true }).check();
  await expect(results(page)).toHaveCount(3);
  await search.getByRole("checkbox", { name: "South", exact: true }).check();
  await search
    .getByRole("checkbox", { name: "Calls — North", exact: true })
    .check();
  await search
    .getByRole("checkbox", { name: "Calls — South", exact: true })
    .check();
  await expect(results(page)).toHaveCount(4);
  await search.getByRole("checkbox", { name: "North", exact: true }).uncheck();
  await expect(results(page)).toHaveCount(2);
  await expect(
    search.getByRole("checkbox", { name: "Calls — North", exact: true }),
  ).toHaveCount(0);
  await search.getByRole("button", { name: "Clear filters" }).click();
  await expect(results(page)).toHaveCount(5);
  await expect(search.getByRole("checkbox", { checked: true })).toHaveCount(0);
  // Subsection-only filters work across sections with identical subsection names.
  await search
    .getByRole("checkbox", { name: "Visits — North", exact: true })
    .check();
  await expect(results(page)).toHaveCount(1);
  await expect(results(page)).toHaveAttribute("data-search-page", "c");
});

test("result navigation reveals collapsed ancestors, highlights formatted text without changing notes, and retains filters", async ({
  page,
}) => {
  const state = fixture();
  state.ui = {
    collapsedSections: ["north"],
    collapsedSubsections: ["calls"],
    collapsedBullets: ["root", "child"],
  };
  await seed(page, state);
  await page.keyboard.press("Control+f");
  await input(page).fill('"contract renewal"');
  await scope(page).selectOption("selected");
  await panel(page)
    .getByRole("checkbox", { name: "North", exact: true })
    .check();
  await panel(page)
    .locator('[data-search-page="a"] [data-search-bullet="detail"]')
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notes A");
  await expect(
    page.locator('[data-bullet="detail"] .rich-editor'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Collapse task children" }),
  ).toHaveCount(2);
  await expect(input(page)).toHaveValue('"contract renewal"');
  await expect(scope(page)).toHaveValue("selected");
  expect(
    await page.evaluate(() => CSS.highlights.get("page-search-match")?.size),
  ).toBe(1);
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.notebookDesktop!.load());
  expect(saved!.pages).toEqual(state.pages);
  await panel(page)
    .locator('[data-search-page="a-child"] .page-search-hit')
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Child notes",
  );
  await expect(scope(page)).toHaveValue("selected");
  await expect(
    panel(page).getByRole("checkbox", { name: "North", exact: true }),
  ).toBeChecked();
  await panel(page).getByRole("button", { name: "Close page search" }).click();
  expect(
    await page.evaluate(() => CSS.highlights.has("page-search-match")),
  ).toBe(false);
});

test("search-field undo stays separate from notebook undo; title navigation uses temporary highlights", async ({
  page,
}) => {
  await seed(page);
  await open(page, "Notes A");
  await page
    .locator('[data-bullet="editable"] .rich-editor')
    .fill("Changed text");
  await page.keyboard.press("Control+f");
  await page.keyboard.type("renewal");
  await page.keyboard.press("Control+z");
  await expect(
    page.locator('[data-bullet="editable"] .rich-editor'),
  ).toHaveText("Changed text");
  await scope(page).selectOption("all");
  await input(page).fill('"contract renewal"');
  await panel(page)
    .locator('[data-search-page="title"] [data-search-bullet="title"]')
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Contract renewal",
  );
  expect(
    await page.evaluate(() => CSS.highlights.get("page-search-match")?.size),
  ).toBe(1);
  await input(page).fill("missing phrase");
  expect(
    await page.evaluate(() => CSS.highlights.has("page-search-match")),
  ).toBe(false);
  await panel(page).getByRole("button", { name: "Close page search" }).click();
  await open(page, "Notes A");
  await page.locator('[data-bullet="editable"] .rich-editor').click();
  await page.keyboard.press("Control+z");
  await expect(
    page.locator('[data-bullet="editable"] .rich-editor'),
  ).toHaveText("Editable text");
});

test("result navigation scrolls to the matched words inside a long bullet", async ({
  page,
}) => {
  const state = fixture();
  state.pages[0].bullets = [
    {
      ...newBullet(),
      id: "long",
      html:
        "<p>" +
        "Earlier content<br>".repeat(180) +
        "<strong>Find this needle</strong><br>" +
        "Later content<br>".repeat(20) +
        "</p>",
    },
  ];
  await seed(page, state);
  await page.keyboard.press("Control+f");
  await input(page).fill('"find this needle"');
  await panel(page).locator('[data-search-page="a"] .page-search-hit').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Notes A");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const highlight = CSS.highlights.get("page-search-match");
        const range = highlight ? ([...highlight][0] as Range) : null;
        const rect = range?.getBoundingClientRect();
        return !!rect && rect.top > 0 && rect.bottom < window.innerHeight;
      }),
    )
    .toBe(true);
  await expect(input(page)).toBeVisible();
  await expect(page.getByText("Saved locally", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => window.notebookDesktop!.load());
  expect(saved!.pages).toEqual(state.pages);
});
