# Task Notebook — local desktop app

A personal Windows desktop notebook with section/subsection/page organization, rich information bullets, and a synchronized task list. It runs offline and stores your notebook in a real SQLite file, independently of installed browsers and the location of the executable.

## Build a Windows executable

Do these steps **on Windows 10 or 11, 64-bit**:

1. Install [Node.js 24 LTS](https://nodejs.org/) and [Git](https://git-scm.com/downloads). Restart PowerShell after installation.
2. Open PowerShell and run:

   ```powershell
   git clone https://github.com/shamboozled/task-management-local.git
   cd task-management-local
   npm ci
   npm run dist:win
   ```

3. Your executable will be:

   ```text
   release\Task-Notebook-1.0.0-Windows-x64.exe
   ```

4. Double-click that file. You can move it to a convenient folder and create a shortcut. Node.js and Git are needed to build it, but are **not** required to run the resulting executable. No terminal, local web server, account, or Internet connection is needed to use it.

This produces an unsigned, portable `.exe`; Windows may show a SmartScreen prompt because it has no signing certificate. The portable executable stores data in the stable app data folder below, rather than beside the `.exe`. Download dependencies once with Internet access before building. Rebuild after changing source code with `npm run dist:win`. The version in `package.json` controls the filename.

Alternatively, download the repository using GitHub’s **Code → Download ZIP**, extract it, open PowerShell in the extracted folder, and run `npm ci` followed by `npm run dist:win`.

**Validation:** the interface build, SQLite tests, and actual Electron desktop workflows are tested in Linux in this cloud workspace. A Windows executable has not been built or run here. The Windows command and electron-builder configuration above are provided for compiling on Windows; no native SQLite dependency or C++ build toolchain is required.

## Run from source

```powershell
npm ci
npm start
```

This builds the interface and opens the desktop window. After source changes, close and restart it. `npm run dev` does the same. A browser cannot open this version as a functional notebook: it requires the desktop file-storage bridge and deliberately does not fall back to browser storage.

## Where your notes are saved

On Windows, the app always uses:

```text
%APPDATA%\Task Notebook\notebook.sqlite
%APPDATA%\Task Notebook\backups\
```

Press **Win+R**, enter `%APPDATA%\Task Notebook`, and press Enter to open that folder. You can also click the **Open data folder** icon at the bottom of the sidebar. Hover over the bottom app footer to see the exact database and backup paths.

- Edits save automatically to SQLite with atomic transactions and full synchronization. The save indicator reports errors rather than claiming a failed write succeeded.
- Closing the window waits for the latest notebook state to save.
- On the first write each day, the previous saved notebook is copied to a standalone SQLite backup. The app also makes a safety backup before importing a notebook. It keeps the newest **30** backup copies.
- Renaming or moving the `.exe`, changing its version, or clearing browser data does not remove these files. Opening a second instance brings the existing window forward.
- Your notes, task history, tables, and embedded images are all stored in the database. Keep your own copies somewhere separate from the computer if you need protection against disk loss.
- The data is local and not encrypted. The desktop window uses Electron/Chromium, but does not use the storage, accounts, extensions, or sync of your installed browser. The packaged app blocks remote requests and has no telemetry; links you click open in your default browser.

For Linux development, the equivalent folder is `$XDG_CONFIG_HOME/Task Notebook` (normally `~/.config/Task Notebook`).

## Backups and migration from the browser version

Use **Export backup** in the sidebar to choose a location for a `.json` file containing the complete notebook. **Restore backup** selects a JSON backup, validates it, asks before replacing your notebook, and creates a safety copy first. Existing browser-version exports are supported; no changes to the browser repository are needed.

To move existing notes: open the original browser app, export a backup, then open this desktop app and restore that file. The legacy `customers` and `sections` keys remain in the backup schema for compatibility; the desktop interface displays them as **Sections** and **Subsections**.

If you need to restore an automatic SQLite backup:

1. Close Task Notebook.
2. Copy the current `notebook.sqlite` somewhere safe before replacing it.
3. Copy the chosen file from `backups` into the app data folder and name the copy `notebook.sqlite`.
4. Reopen the app. Corrupt database files are reported and preserved, never silently replaced by an empty notebook.

## Notes, navigation, and tasks

- The **Sections** header has the single plus button for creating a top-level section. Each new section starts with a `General calls` subsection and a notes page.
- Click section and subsection names to collapse/expand them. Collapse state and ordering are saved. Pencil icons rename items; plus icons add subsections and pages.
- Drag a section by its grip onto another section to place it before that section. Drag a subsection onto another subsection to place it before that item, or onto a section heading to move it to that section. Its pages/subpages move with it.
- Page and subpage names default to the local current date in `MM/DD/YYYY` format. Names are editable. The breadcrumb shows the section, subsection, and the entire page/subpage path; ancestor page names are clickable.
- Every bullet defaults to information. Use its toggle or **Ctrl+T** to make it a task. **Enter** splits a bullet at the caret (or inserts above at the start); **Shift+Enter** inserts a line. A second Enter on the new blank bullet outdents it, or creates a child if already at the top level. **Tab / Shift+Tab** indent/outdent while preserving the caret. Up/down arrows move between bullets.
- Information bullets support images and editable tables. Use the toolbar, click a table cell to change rows/columns, or paste images. Images support PNG/JPEG/GIF/WebP up to 10 MB each.
- Pasting preserves safe hyperlinks and structure but normalizes fonts and sizes to **Calibri 12 pt**, with a fallback when Calibri is unavailable. Remote image references are omitted; insert the image itself to keep it locally.
- Paste a URL or type one and leave the bullet to make it clickable. The **Insert hyperlink** toolbar button can turn selected text into a link. Click a hyperlink to open it in your default browser.
- Tasks across all sections appear in the current task-list page. Child tasks and information follow the parent into its task card. Child tasks also have their own entries; standalone information stays on its source page.
- Text, information, due dates, and completion sync between source notes and the current task list. Source links open the page where the task was most recently edited (or a surviving location). Historical task-list contents never sync.
- Tasks without dates appear in **Unassigned**; tasks with dates appear in the **Priority list**, grouped earliest first. The first valid `MM/DD` date uses the current year; `MM/DD/YYYY` supplies an explicit year. Past dates remain unchanged.
- Dates typed into task text regroup the task only after you leave the bullet. Drag a task to a date group, or use its date picker or Today/Tomorrow/EOW buttons, to append/change its free-text date in both views. Unassigning removes recognized date tokens so no remaining date immediately reschedules it.
- Select across bullets with the mouse or Shift + arrows. **Ctrl+A** selects the current bullet first, then the page. **Ctrl+C / Ctrl+X / Ctrl+V** preserve bullet types and nested formatting; **Ctrl+Z** undoes typing and structural changes (Ctrl+Shift+Z or Ctrl+Y redoes).
- Copying or cutting a task and pasting it into another notes page creates a linked placement, including all its children. Edits sync across placements and the task list shows one entry per task. Pasting into an empty indented bullet uses that bullet's indentation. Copies to other applications use ordinary nested HTML lists.
- Deleting a bullet has no confirmation popup. Clearing its line removes it and promotes its children to the deleted parent's level. Sections, subsections, and pages have delete controls; deleting a containing location preserves linked tasks in other locations. Page grips support reordering and moving between subsections.
- Collapse a task to hide its children while keeping its own text visible. A parent task cannot be completed while it has unfinished child tasks. Task-list grips also reorder tasks within a date group or the Unassigned column. EOW uses Friday, or next Friday after it has passed.
- Task-list titles also default to the current date and can be renamed, including historical page titles. Creating a new list freezes the old contents and carries forward unfinished tasks in both columns, with dates and information intact. Completed tasks stay in notes/history and are excluded from the new list. Reopening a source task returns it to the current list.

## Development checks

```powershell
npm test
npm run test:storage
npm run test:e2e
npm run format:check
```

The model tests cover synchronization, dates, rollover, backups, and navigation. Storage tests use Node’s built-in SQLite. End-to-end tests launch the actual Electron app with temporary data directories; they cover rich content, backups, sidebar collapse/reordering, date titles and paths, hyperlinks, caret preservation, and persistence after closing/restarting. They never use your real notebook.

On headless Linux, use Xvfb (`xvfb-run -a npm run test:e2e`). The cloud setup may supply a workspace-local Xvfb binary instead. Linux tests disable the Chromium sandbox only for the isolated test process; normal executable startup retains the sandbox, context isolation, and disabled Node integration in the renderer.
