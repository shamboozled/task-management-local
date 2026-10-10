import {
  test as base,
  _electron,
  type ElectronApplication,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
export const test = base.extend<{
  desktop: ElectronApplication;
  dataDir: string;
}>({
  dataDir: async ({}, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), "task-notebook-e2e-"));
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  desktop: async ({ dataDir }, use) => {
    const app = await _electron.launch({
      args: [
        "desktop/main.cjs",
        ...(process.platform === "linux"
          ? ["--no-sandbox", "--disable-gpu"]
          : []),
      ],
      env: { ...process.env, NOTEBOOK_TEST_DATA_DIR: dataDir },
      cwd: process.cwd(),
    });
    const childProcess = app.process();
    await use(app);
    if (childProcess.exitCode === null) await app.close();
  },
  page: async ({ desktop }, use) => {
    const page = await desktop.firstWindow();
    await page.waitForLoadState();
    await use(page);
  },
});
export { expect } from "@playwright/test";
