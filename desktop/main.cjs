const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  session,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { NotebookDatabase } = require("./database.cjs");
const { pathToFileURL } = require("node:url");
let notebook,
  window,
  closing = false,
  rendererReady = false;
app.setName("Task Notebook");
app.setPath("userData", path.join(app.getPath("appData"), "Task Notebook"));
const testDataPath = process.env.NOTEBOOK_TEST_DATA_DIR;
if (testDataPath && !app.isPackaged) app.setPath("userData", testDataPath);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      try {
        notebook = new NotebookDatabase(app.getPath("userData"));
      } catch (error) {
        dialog.showErrorBox(
          "Could not open your notebook",
          String(error.message),
        );
        app.quit();
        return;
      }
      const index = pathToFileURL(
        path.join(__dirname, "../dist/index.html"),
      ).href;
      const devUrl = !app.isPackaged ? process.env.NOTEBOOK_DEV_URL : undefined;
      if (devUrl && devUrl !== "http://127.0.0.1:5173")
        throw Error("Unsupported development origin.");
      const trusted = (event) =>
        event.sender === window?.webContents &&
        event.senderFrame === window.webContents.mainFrame;
      const handle = (name, fn) =>
        ipcMain.handle(name, (event, ...args) => {
          if (!trusted(event)) throw Error("Untrusted window.");
          return fn(...args);
        });
      const external = async (url) => {
        if (typeof url !== "string" || url.length > 8192)
          throw Error("Invalid hyperlink.");
        const parsed = new URL(url);
        if (!["https:", "http:", "mailto:"].includes(parsed.protocol))
          throw Error("Unsupported hyperlink protocol.");
        await shell.openExternal(parsed.href);
      };
      handle("notebook:load", () => notebook.load());
      handle("notebook:save", (value) => {
        if (
          !value ||
          value.version !== 1 ||
          !Array.isArray(value.pages) ||
          !Array.isArray(value.taskLists) ||
          !Array.isArray(value.customers) ||
          !Array.isArray(value.sections) ||
          typeof value.activeListId !== "string"
        )
          throw Error("Invalid notebook.");
        notebook.save(value);
      });
      handle("notebook:backup", (reason) => {
        if (!["manual", "restore"].includes(reason))
          throw Error("Invalid backup request.");
        return notebook.backup(reason);
      });
      handle("notebook:export", async (value) => {
        const result = await dialog.showSaveDialog(window, {
          title: "Export notebook backup",
          defaultPath: path.join(
            app.getPath("documents"),
            `task-notebook-${new Date().toISOString().slice(0, 10)}.json`,
          ),
          filters: [{ name: "Notebook backup", extensions: ["json"] }],
          properties: ["showOverwriteConfirmation", "createDirectory"],
        });
        if (result.canceled || !result.filePath) return null;
        const temp = result.filePath + "." + randomUUID() + ".tmp";
        try {
          fs.writeFileSync(temp, JSON.stringify(value, null, 2), {
            flag: "wx",
          });
          fs.renameSync(temp, result.filePath);
        } finally {
          if (fs.existsSync(temp)) fs.unlinkSync(temp);
        }
        return result.filePath;
      });
      handle("notebook:location", () => ({
        database: notebook.file,
        backups: notebook.backupDirectory,
      }));
      handle("notebook:openDataFolder", async () => {
        const error = await shell.openPath(notebook.directory);
        if (error) throw Error(error);
      });
      handle("notebook:openLink", external);
      ipcMain.on("notebook:ready", (event) => {
        if (trusted(event)) rendererReady = true;
      });
      ipcMain.on("notebook:closeReady", (event) => {
        if (trusted(event)) {
          closing = true;
          window.close();
        }
      });
      // Packaged notebooks never fetch remote content. Hyperlinks open only in the user's default browser.
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const allowed =
          details.url.startsWith("file:") ||
          details.url.startsWith("data:") ||
          details.url.startsWith("blob:") ||
          (devUrl &&
            (details.url.startsWith(devUrl + "/") ||
              details.url.startsWith("ws://127.0.0.1:5173/")));
        callback({ cancel: !allowed });
      });
      window = new BrowserWindow({
        width: 1360,
        height: 900,
        minWidth: 900,
        minHeight: 620,
        title: "Task Notebook",
        backgroundColor: "#f8f9f6",
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          spellcheck: false,
        },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        external(url).catch((error) =>
          dialog.showErrorBox("Could not open link", error.message),
        );
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== (devUrl || index)) {
          event.preventDefault();
          external(url).catch(() => {});
        }
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      window.on("close", (event) => {
        if (!closing && rendererReady) {
          event.preventDefault();
          window.webContents.send("notebook:requestClose");
        }
      });
      window.on("closed", () => {
        window = null;
      });
      if (devUrl) await window.loadURL(devUrl);
      else await window.loadFile(path.join(__dirname, "../dist/index.html"));
    })
    .catch((error) => {
      dialog.showErrorBox(
        "Could not start Task Notebook",
        String(error.message),
      );
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => {
    try {
      notebook?.close();
    } catch {}
  });
}
