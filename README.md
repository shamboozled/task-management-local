# Task Notebook — local desktop app

A personal Windows desktop notebook with section/subsection/page organization, rich information bullets, and a synchronized task list. It runs offline and stores your notebook in a real SQLite file, independently of installed browsers and the location of the executable.

For a standalone document you can give another model to reproduce the app, use [the desktop rebuild specification](DESKTOP_REBUILD_SPEC.md). It includes the approved editing and search behavior, data contracts, Windows build instructions, and acceptance checks.

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

## Share the executable on GitHub

The simplest distribution method is to build on Windows with `npm ci` and `npm run dist:win`, then attach `release\Task-Notebook-1.0.0-Windows-x64.exe` to a **GitHub Release** in this repository. Use **Releases → Draft a new release**, tag the source commit you built, upload the executable, and publish after testing it. Keep generated binaries out of source history; `release/` is already ignored.

The portable executable bundles its runtime and targets **Windows 10/11 x64**. Users do not need Node.js, Git, or an installed browser. Compatibility with every x64 Windows machine is not guaranteed; older Windows versions and restrictive application policies can prevent it from running. The current executable is unsigned and may trigger SmartScreen. Build and test on Windows before claiming Windows support; Linux tests do not validate the Windows artifact.

For an automation follow-up, use a Windows GitHub Actions runner to build a downloadable artifact, then attach reviewed versioned builds to GitHub Releases. See [the distribution plan](TASK_LIST_CHANGE_PLAN.md#5-distribute-a-compiled-windows-executable-through-github).

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

This version saves and exports **version-2** notebook documents so tasks can exist without source pages. Existing version-1 browser/desktop notebooks and backups migrate when opened or restored. Older app versions cannot open the new format; export a backup before upgrading and keep a copy of your previous database if you need to return to an older build.

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
- New outline bullets default to information; **Add task** on the current task list explicitly creates a task. Use a bullet's toggle or **Ctrl+T** to make it a task. In notes pages and the task list, **Enter** creates an information bullet at the same indent, splitting text at the caret (or inserting above at the start). Information created beside a task in the task list remains visible on its card and source page. **Shift+Enter** inserts a line. A second Enter on the new blank bullet outdents it, or creates a child if already at the top level. In both views, **Tab / Shift+Tab** indent/outdent while preserving the caret. In the task list, indenting into a collapsed task reveals its children so you can keep typing. Up/down arrows move between bullets.
- Information bullets support images and editable tables. Use the toolbar, click a table cell to change rows/columns, or paste images. Images support PNG/JPEG/GIF/WebP up to 10 MB each.
- Pasting preserves safe hyperlinks and structure but normalizes fonts and sizes to **Calibri 12 pt**, with a fallback when Calibri is unavailable. Remote image references are omitted; insert the image itself to keep it locally.
- Paste a URL or type one and leave the bullet to make it clickable. The **Insert hyperlink** toolbar button can turn selected text into a link. Click a hyperlink to open it in your default browser.
- **Search pages** in the sidebar, or **Ctrl+F**, opens a search panel beside your notes. It defaults to the current page (excluding subpages), or all normal pages when opened from a task list. Choose **All pages** or **Selected sections/subsections** to expand the scope; section and subsection filters support multiple selections. Empty filters include all pages, and selected subsections narrow the selected sections. **Clear filters** resets both lists.
- Page search matches every unquoted word, in any order within one title or bullet; wrap the query in double quotes for an exact phrase. Matching ignores capitalization and includes completed tasks, table text, and hyperlink labels. It does not search text inside images or task-list snapshots. Results show full page paths and snippets; clicking one opens the page, reveals collapsed ancestors, and highlights matching text temporarily without changing the notes. The open panel keeps your query and filters while you browse. Ctrl+F refocuses it; Escape or its close button dismisses it. Search runs entirely on this device.
- Tasks across all sections appear in the current task-list page. Child tasks and information follow the parent into its task card. Child tasks also have their own entries; standalone information stays on its source page.
- Text, information, due dates, and completion sync between source notes and the current task list. Source links open the page where the task was most recently edited (or a surviving location). Historical task-list contents never sync.
- Tasks without dates appear in **Unassigned**; tasks with dates appear in the **Priority list**, grouped earliest first. The first valid `MM/DD` date uses the current year; `MM/DD/YYYY` supplies an explicit year. Past dates remain unchanged.
- Dates typed into task text regroup the task only after you leave the bullet. Drag a task to a date group, or use its date picker or Today/Tomorrow/EOW buttons, to append/change its free-text date in both views. Unassigning removes recognized date tokens so no remaining date immediately reschedules it.
- Select across bullets with the mouse or Shift + arrows. **Ctrl+A** selects the current bullet first, then the page. **Ctrl+C / Ctrl+X / Ctrl+V** preserve bullet types and nested formatting; **Ctrl+Z** undoes typing and structural changes (Ctrl+Shift+Z or Ctrl+Y redoes).
- Copying or cutting a task and pasting it into another notes page creates a linked placement, including all its children. Selecting the task's full text with Ctrl+A, mouse dragging, or triple-clicking includes its children; selecting only part copies just that text. Edits sync across placements and the task list shows one entry per task. Pasting into an empty indented bullet uses that bullet's indentation. Copies to other applications use ordinary nested HTML lists.
- Deleting a bullet has no confirmation popup. Clearing its line removes it and promotes its children to the deleted parent's level. Sections, subsections, and pages have delete controls; deleting a containing location preserves linked tasks in other locations. Page grips support reordering and moving between subsections.
- Collapse a task to hide its children while keeping its own text visible. A parent task cannot be completed while it has unfinished child tasks. Task-list grips also reorder tasks within a date group or the Unassigned column. EOW uses Friday, or next Friday after it has passed.
- Task-list titles also default to the current date and can be renamed, including historical page titles. Creating a new list freezes the old contents and carries forward unfinished tasks in both columns, with dates and information intact. Completed tasks stay in notes/history and are excluded from the new list. Reopening a source task returns it to the current list.

## Create and move tasks on the task list

Click **Add task** on the current task list to create a blank **Unassigned** task and start typing immediately. No section, subsection, or source page is created. Blank tasks persist until you delete them or undo creation. Standalone tasks have no source link; copying the full task into a normal notes page creates a linked placement, establishes that page as the source link, and keeps both views synchronized. Partial-text copies remain ordinary text.

Every current task card has an always-visible **Select** button, separate from its completion checkbox. Click Select to toggle that task; clicking its text or card surface does not select it. **Shift + left-click on Select** selects the inclusive range from the anchor to that task **within the same column**. All date groups belong to the Priority column. A Shift-click in the other column toggles only that task and starts a new anchor there. Ctrl-click has no card-selection behavior. You can scroll vertically while holding Shift to select ranges longer than the window.

Drag a selected card's grip to move the whole selection as an ordered block: into an existing date group, before/after another task, or back into **Unassigned**. Dragging an unselected task moves only that task. You can also right-click any selected task and choose **Assign date…** to open a calendar for the whole selection, or **Unassign selected tasks** to move them all back to Unassigned. **Move selected** in the toolbar offers the existing quick dates/date input. Each batch move is one undo step, synchronizes linked notes, and only reschedules explicitly selected child tasks.

Right-click a selected task and choose **Copy selected tasks**, use the toolbar's **Copy selected**, or press **Ctrl+C** outside an editor. Copies include complete task subtrees with the correct task/information bullet types; pasting into a normal page creates linked placements that stay synchronized. Selected child tasks already included in a selected parent's subtree are not pasted twice. **Ctrl+A** outside editors selects all visible task cards; inside text editors, the existing text-selection/copy shortcuts still apply.

**Clear selection**, Escape, clicking outside the tasks/actions, changing the search, or navigating clears the selection. Green focus feedback from clicking/dragging a task also clears when you click outside it. Select buttons support Space/Enter, and the right-click menu and calendar support keyboard navigation. Historical lists remain frozen and offer neither creation nor selection/move controls. See [the feature specification and implementation notes](TASK_LIST_CHANGE_PLAN.md).

## Development checks

```powershell
npm test
npm run test:storage
npm run test:e2e
npm run format:check
```

The model tests cover synchronization, dates, rollover, backups, navigation, and page-search matching. Storage tests use Node’s built-in SQLite. End-to-end tests launch the actual Electron app with temporary data directories; they cover rich content, backups, sidebar collapse/reordering, date titles and paths, hyperlinks, caret preservation, page search/filtering and result navigation, and persistence after closing/restarting. They never use your real notebook.

On headless Linux, use Xvfb (`xvfb-run -a npm run test:e2e`). The cloud setup may supply a workspace-local Xvfb binary instead. Linux tests disable the Chromium sandbox only for the isolated test process; normal executable startup retains the sandbox, context isolation, and disabled Node integration in the renderer.
