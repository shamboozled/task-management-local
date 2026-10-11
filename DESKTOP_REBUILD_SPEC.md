# Task Notebook: desktop app rebuild specification

This is a standalone specification for reproducing **Task Notebook**, a Windows desktop application for hierarchical notes and synchronized tasks. It records the implemented behavior, architecture, storage, packaging, and acceptance criteria. Another model should be able to work from this document without the original conversation.

Baseline reviewed: **October 11, 2026**, application version **1.0.0**.

Source repository: <https://github.com/shamboozled/task-management-local>

Reference implementation commit (before this documentation update): `224b1c4ae9c5c292115b4398e3fd1dcaa7753e65`.

The separate repository <https://github.com/shamboozled/task-management> contains the browser application. **Do not edit or push to that repository.** Desktop development belongs in `task-management-local` or an explicitly requested new repository.

## 1. Instructions to the model receiving this document

You can use the following as the accompanying prompt:

> Reproduce the Task Notebook desktop application described in this document. Target Windows 10/11, x64. Preserve its notes/task synchronization, historical snapshots, date-in-text scheduling, local SQLite storage, backups, rich outline editing, linked task placements, clipboard behavior, page search, and sidebar behavior. Use the reference repository and commit if available; otherwise implement the specification independently. Do not modify the browser application's repository. Do not add accounts, cloud storage, telemetry, or a required backend. Provide source code, a dependency lockfile, clear Windows executable build instructions, and evidence from appropriate tests. State any deviations and distinguish checks actually performed from checks still needing Windows validation. Ask about material unresolved requirements; do not silently change the documented behavior.

Two approaches are possible:

- **Rebuild the existing source:** check out the reference commit and use its lockfile. This is the most reliable way to reproduce the exact interface and implementation.
- **Reimplement the application:** treat the behavior and data contracts below as requirements. Internal code organization may change, but keep version-1 backup compatibility and the user-visible behavior unless a change is approved.

Reproducing the same source and dependencies does not promise a byte-for-byte identical executable across machines. This document is a behavior and build specification, not an embedded copy of the complete source or every CSS rule.

## 2. Product purpose and scope

The app combines OneNote-like pages with a consolidated task list. A person takes notes in nested information bullets, converts selected bullets to tasks, and manages those tasks in one place while retaining their source context.

There is one local notebook per Windows user profile, with multiple sections, subsections, pages, subpages, and task-list pages. Exactly one task-list page is current and editable. Older task-list pages preserve historical snapshots.

The app must run without an Internet connection, login, installed Node.js runtime, separate server, or installed browser. The executable bundles its desktop runtime. Internet access is needed initially to obtain source and build dependencies.

The application does not implement multi-user collaboration, server synchronization, account authentication, notebook encryption, or automatic updates. These are outside the baseline scope.

## 3. Desktop and interface structure

Use **Electron** for the desktop shell and **React + TypeScript + Vite** for its interface. Load bundled local files in the packaged application. The product/window name is **Task Notebook**.

The reference window opens at 1360 × 900 pixels, with a minimum size of 900 × 620. Use a calm off-white and muted-green interface: main background `#f8f9f6`, sidebar background `#f0f3ed`, dark readable text, green primary buttons, thin borders, and Lucide icons. The sidebar is approximately 264 pixels wide. A top bar contains breadcrumbs; the main area contains the page title and actions.

The sidebar contains:

1. App identity and a shortcut to the current task list with an unfinished-task count.
2. A **Search pages** button that opens a panel beside the current view.
3. A **Sections** heading with the **single plus button for adding a top-level section**.
4. A hierarchical section → subsection → page → subpage tree.
5. Task-list pages, newest first, with the current list distinguishable from archived lists.
6. Local-save status and controls for opening the data folder, exporting a backup, and restoring a backup.

Notes pages contain an editable title, Rename and Subpage actions, a formatting toolbar, and nested bullets. The toolbar supports bold, italic, hyperlinks, images, tables, table row/column changes, and displays `Calibri · 12 pt`.

Task-list pages contain an editable title, Rename and New task-list page actions, counts for open/scheduled/completed tasks, a search field, and two columns: **Unassigned** and **Priority list**. The priority column groups tasks by date, sorted earliest first. Cards show source context and a link back to the most recently edited source page, with a surviving-location fallback. The information/task toggle must not overlap this link. Task collapse chevrons align vertically with checkboxes and sit inside a dedicated gutter within the card border.

Remove these older interface strings from ordinary notes/current task-list headings:

- `Customer Notes`
- `Capture the conversation. Turn the next steps into tasks.`
- `Every customer. Every next step. One place to keep moving.`
- `Your next steps`

Historical task lists retain explanatory snapshot text. Use **Sections**, rather than **Customers**, in the sidebar and related visible controls.

Provide accessible labels for icon buttons and editors, and `aria-expanded` on collapsible headings. Do not require hover alone to understand essential controls.

## 4. Organization and navigation behavior

### Sections and subsections

- A top-level section may represent a customer, project, or another grouping.
- Each section can contain multiple subsections, typically used for call types.
- Creating a top-level section asks for its name, creates a `General calls` subsection and a notes page named with today's local date, and opens that page.
- Sections and subsections can be renamed and independently collapsed/expanded. Persist collapse state.
- The only top-level Add section control is the plus icon beside the Sections heading. Subsection/page plus buttons remain available at their corresponding levels.
- Drag a section by its grip onto another section to insert it before the target.
- Drag a subsection onto another subsection to insert it before the target. Dragging onto a section heading moves it into that section.
- Moving a subsection preserves its identity, all pages/subpages, bullet contents, and task links. Persist the new order and parent section.

Keep subsection labels close to their chevrons, using a compact fixed-width control layout rather than a large empty spacer. Long names may truncate; do not push the name toward the right edge of the sidebar.

### Pages and subpages

- Each subsection has multiple pages. A page can have nested subpages.
- New page and subpage creation dialogs prefill the title with the user's **local current date in `MM/DD/YYYY` format**. Titles are editable before creation and afterward.
- Each new page starts with one empty information bullet.
- A subpage retains the same subsection ID as its parent page.
- Display the complete breadcrumb: section → subsection → every ancestor page → current page. Ancestor page names are clickable.
- Sidebar page indentation must reflect subpage depth.
- Opening a source page from a task expands its containing section/subsection and reveals the source bullet.
- Duplicate date titles are valid; IDs, not names, identify pages.
- Pages/subpages have drag grips. Dropping onto another page inserts the moved page before that page at its sibling level; dropping onto a subsection moves it to that subsection as a top-level page. Move its entire descendant-page subtree, preserve IDs/content, and reject ancestry cycles.
- Sections, subsections, and pages have delete controls with confirmation. Delete their contained pages/subpages and bullet placements; preserve any linked task/content placements in other locations. Historical snapshots remain frozen. Navigation deletions can be undone.

The app initially opens the current task-list page when loading a notebook.

## 5. Bullets, editing, and rich content

### Bullet types and hierarchy

There are exactly two kinds: **information** and **task**. Every new bullet defaults to information. Do not create an ordinary/neutral third kind.

Each bullet has a unique placement ID, optional parent placement ID, and editable sanitized HTML. Linked placements also share a logical content identity (see section 6). Bullet nesting is independent of page/subpage nesting.

The following editing behavior applies in both normal pages and the current task list:

| Key/action                                                 | Behavior                                                                                                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enter at start of a nonempty bullet                        | Insert an information bullet immediately above it at the same indent.                                                                                          |
| Enter in the middle                                        | Keep text before the caret on the original bullet; move text after it onto a new information sibling. Transfer the original children to the new bullet.        |
| Enter at the end                                           | Create an information sibling after the original subtree and focus it.                                                                                         |
| Second consecutive Enter on the newly created blank bullet | Outdent one level if possible; if already at the top level, create a child beneath the first blank bullet. Other input resets this consecutive-Enter behavior. |
| Shift+Enter                                                | Insert a line break within the bullet.                                                                                                                         |
| Tab / Shift+Tab                                            | Indent under the previous source sibling / outdent one level, moving the subtree and retaining the caret.                                                      |
| Up / Down                                                  | At the first/last visual line, move to the previous/next visible bullet, retaining a useful text offset. Shift extends the selection.                          |
| Ctrl+T                                                     | Toggle information/task for the current bullet or each selected bullet; process each shared identity once.                                                     |
| Ctrl+A                                                     | First select the current bullet's text; the next invocation selects all visible bullets in the page/view.                                                      |
| Ctrl+Z                                                     | Undo typing and bullet creation, deletion, paste, hierarchy changes, and other notebook changes.                                                               |
| Ctrl+Shift+Z / Ctrl+Y                                      | Redo.                                                                                                                                                          |

Enter inside a table cell retains table-editing behavior. All newly created outline bullets are information, even when created from a task in the task list. Do not allow native contentEditable Enter to create an unstructured line without a bullet there.

Tab/Shift+Tab prevent normal focus traversal and preserve the selection/caret even when a row moves or remounts. Resolve hierarchy from the source page, rather than treating task cards as an independent outline. If indenting into a collapsed task would hide the active bullet, reveal its ancestors so typing can continue. When the same task is rendered more than once, preserve focus in the card being edited.

Support mouse and keyboard selections across multiple bullet editors. The reference uses a shared contentEditable host with protected, noneditable markers and controls. The cursor must not accept text before a task checkbox or in the bullet gutter. Repair selections outside text editors without interfering with page-search inputs or toolbar dialogs.

Converting between kinds preserves HTML, images, tables, and hierarchy. Conversion resets completion; information has no due date, and converting to a task derives its date from text. Ctrl+Shift+Enter is the obsolete shortcut; the current shortcut/help text must use **Ctrl+T**.

Deleting a bullet has **no confirmation popup**. Clearing its entire text, or Backspace/Delete on an empty bullet, removes the bullet, promotes its children to the deleted parent's indent level, and puts the caret on the previous visible line when available. Preserve an empty placeholder if the source page would otherwise have no bullets. Boundary Backspace/Delete can merge adjacent bullet text, preserving content and promoting the removed bullet's children. Cutting a complete subtree follows the clipboard rules below instead of promoting its children.

Undo must include structural changes, rather than relying solely on the browser's text undo. The reference retains up to 100 notebook snapshots with view/focus/caret restoration and groups typing within 700 ms. Search query input uses its own ordinary text undo and must not undo notebook edits. Undo history is session-local, not stored as a backup history.

### Clipboard and linked paste

- Ctrl+C / Ctrl+X support selections spanning bullets; Ctrl+X copies and removes the selected placements/subtrees. Other placements of shared content remain.
- Selecting **all text of a task bullet** includes its entire descendant subtree, whether selected with Ctrl+A, mouse dragging, or triple-clicking. Selecting only part of its text copies/cuts only that rich-text fragment. Do not use the selection gesture as the deciding factor; inspect the actual range boundaries.
- Full bullet selections preserve information/task type, completion, dates, hierarchy, HTML, images, and tables. Deduplicate overlapping selected ancestor/descendant subtrees.
- Pasting a task within the same notebook creates another linked placement of that task **and all its children**. It must not create a duplicate logical task in the task list. Ordinary information copied independently is a new record; information inside a linked task subtree stays linked.
- If the destination is an empty bullet at indent M and the copied root was at indent N, replace/use the empty destination at M and rebase children to M+1, M+2, etc. Do not import the source's absolute indent.
- Reject a paste that would make a task contain another placement of itself, including indirect shared-identity cycles.
- Same-notebook task pastes refresh from any surviving live placement, including children added since copying. A cut payload remains usable if its last source placement has been removed. Pasting into another notebook creates independent identities.
- Use the native OS clipboard. Export `text/html` as actual nested UL/LI elements and `text/plain` as indented bullet text, so pasting outside the application preserves a usable outline without exposing task/info controls.

The reference additionally writes `application/x-task-notebook-bullets` and an HTML fallback containing URI-encoded JSON in `data-task-notebook`. Its payload is `{ format: "task-notebook/bullets", version: 1, notebookId?, entries: [{ bullet, depth, linked }] }`. Depth is relative to selected roots. Validate and sanitize payloads before using them; do not trust arbitrary pasted metadata. Clearing `taskListContextId` on new placements keeps task-card context local to its origin.

### Font and paste rules

Use **Calibri 12 pt**, equivalent to **16 CSS pixels**, for bullet content. Supply Carlito/Segoe UI or suitable sans-serif fallbacks if Calibri is unavailable.

Pasting HTML preserves safe hyperlinks and meaningful structure, including supported tables and semantic bold/italic formatting. Strip pasted font names, font sizes, arbitrary styles, event handlers, and unwanted attributes so content inherits the app's font and size.

Pasting plain text escapes HTML, preserves line breaks, and creates links for supported URL text. Typed URLs become clickable when the bullet loses focus. Avoid double-linking existing anchors and exclude trailing punctuation where appropriate.

### Hyperlinks

Support `http:`, `https:`, and `mailto:` hyperlinks. Pasted linked text retains its label and destination. The Insert hyperlink toolbar action applies a URL to selected text, or uses the URL as the label when nothing is selected. A bare domain entered in that dialog defaults to HTTPS.

Preserve editor selection while opening/closing the link dialog. Clicking a link delegates to Electron's main process and opens the operating system's default browser or protocol handler. It must not replace the notebook window or alter the note. Reject executable and unsupported URL schemes.

### Images and tables

- Support inserted/pasted PNG, JPEG, GIF, and WebP files, up to 10 MiB each.
- Embed image bytes as base64 data URLs in the bullet HTML. Include them in the database and JSON exports; do not depend on external URLs or original file paths.
- Discard remote image references from pasted HTML.
- Insert an editable 3 × 3 table by default.
- Provide add/remove row and column actions based on the selected table cell. Removing the last row/column removes the table.
- Enter within a table cell must remain a table-editing operation instead of creating a separate notebook bullet.

Information bullets must support these features. Conversion to a task must not discard previously inserted rich content.

### HTML sanitization contract

The baseline allowlist is:

```text
A B STRONG I EM U S BR P DIV UL OL LI
TABLE THEAD TBODY TR TH TD IMG BLOCKQUOTE
```

Remove script/style/iframe/object/SVG/MathML/form/input/button/meta/link elements and their dangerous contents. Unwrap other unsupported formatting elements. Remove attributes, then restore only safe link destinations and embedded image sources/alt text. Links use `target="_blank"` and `rel="noopener noreferrer"`.

Sanitize pasted content, content displayed in editors, and imported backup HTML, including historical snapshot HTML. A restored backup must not introduce scripts, external resource loads, or pasted font overrides.

## 6. Shared notes and task-list behavior

The current task list is a projection of live notes, not an independently editable copy. A task may have multiple placements across normal pages while remaining **one logical task**.

Each placement has its own `id` and `parentId`. Define logical identity as `sharedId ?? id`. Task-list membership, synchronization, ordering, and collapse state use this logical identity. Clipboard paste creates fresh placement IDs and retains shared identities for the task and its descendant content. Never use a page placement ID as the only identity of a shared task.

- Tasks created anywhere appear in the current list, subject to rollover membership rules.
- Editing text, completion, type, or dates in any placement or current task card updates all placements of that identity.
- Structural edits to a linked task subtree (adding, removing, indenting, or splitting children) mirror to its other placements. Preserve existing target placement IDs where possible and translate parents to the target placement IDs. Prevent physical and logical ancestry cycles.
- Source links prefer the page where the task was most recently edited. Child-content edits update the containing task's source context too. If that location was deleted, use a surviving placement. Clicking the link opens/reveals the corresponding bullet.
- Deleting an entire page/location removes only its placements; linked instances elsewhere survive. Bullet deletion/promotion within a linked subtree is a structural edit and is mirrored accordingly.
- Information attached to a shared task is synchronized across its placements and the current task-list view. Independently created, unrelated information bullets are not a global linked-information system.

Each task card contains **all descendants**, including child tasks and their information. Every child task also has its own independent task-list entry. Its independent card includes its descendants, without pulling in its parent or siblings. Deduplicate logical identities in the flat task list, not the intended nested appearances within parent cards.

Example:

```text
Task: Send proposal 10/15
  Information: Include the revised pricing table
  Task: Confirm billing address
    Information: Ask the finance team
Information: General conversation notes
```

The proposal card shows all three descendants. The billing-address card also appears separately and shows “Ask the finance team.” General conversation notes stay on the notes page.

Enter/splitting on a task card can also create an information **sibling** beside its root. Persist that sibling on the source page and keep it visible before/after the appropriate card root using optional `taskListContextId` metadata. Do not silently turn it into a child just to display it. Such context siblings are not copied as children of the root task. Collapsing a task hides its actual children, while keeping its own text and independent context siblings visible.

Tasks and subtasks are collapsible in notes and task cards; persist collapse by logical identity. Completion strikes through text in all live instances. **A parent task cannot be completed while any descendant task is incomplete.** Reopening a child, or adding an incomplete child beneath a completed ancestor, reopens affected completed ancestors. Information children do not themselves block completion.

Reorder task cards by dragging their grips within Unassigned or a date group. Persist logical task ordering separately from source bullet ordering. Dropping between dates/columns also applies the scheduling operation below. Keep controls and source links separately positioned and inside the card bounds.

### Current list and historical lists

Task-list titles default to the local current date in `MM/DD/YYYY` and are editable. Historical titles may also be renamed; their task contents stay frozen.

Creating a new task-list page must perform one model update:

1. Deep-copy the previous current list's displayed task records, completion values, source names, and attached information into its snapshot.
2. Make that older page read-only for task content.
3. Create a new current list containing the IDs of all unfinished tasks from the previous current list, preserving dates and information.
4. Make the new list active.

Completed tasks remain in source notes and historical snapshots, but are excluded from the new current list. Reopening a completed source task adds it back to the current list. New task conversions also add their IDs to the current list.

Maintain explicit logical task ID membership so an excluded completed task is not accidentally reintroduced just because source pages still contain it. Resolve missing/deleted source bullets by omitting them from the live projection, without mutating old snapshots.

Historical snapshots must use a deep copy, not shared object references. Later source edits, completion changes, renames, subsection moves, and deletions must not rewrite historical task contents/source labels. Historical source navigation can work where the original still exists.

## 7. Dates and priority scheduling

Tasks have both HTML text and a normalized `dueDate` field. The free-text date is the user-visible scheduling input; changing either through app controls must keep both consistent.

- Scan rendered text, not HTML tag names or link attributes.
- Recognize month/day tokens such as `10/15`; the parser also accepts one-digit components.
- Accept `MM/DD/YYYY` for an explicit year.
- A token without a year uses the local current calendar year **when parsed**.
- Use the **first valid calendar date** in the task text. Skip impossible dates such as `02/30`; validate leap years.
- Avoid matching a fragment embedded in a larger numeric/slash sequence.
- Store dates as `YYYY-MM-DD` without converting them through UTC day offsets.
- Group/sort dated tasks chronologically and display full `MM/DD/YYYY` group headings.
- Past dates stay on their actual dates; do not automatically push overdue tasks forward.

Moving an undated task to a date group appends the formatted date to its HTML text. Moving between date groups replaces the governing text date while preserving surrounding content/formatting. Date tokens split across formatted text nodes must still be replaceable.

For a target in the current year, write `MM/DD`; for another year, write `MM/DD/YYYY`. Moving a task back to Unassigned removes **all recognized valid date tokens**, so a second date cannot immediately assign it again. Preserve unrelated text and rich content.

While typing task text, synchronize its HTML but keep its existing date-group position. Parse and apply the new date only on blur/leaving the bullet, including when final edits are flushed before export or window close. For example, typing `10/13` must not move the task after the intermediate `10/1`.

Provide **Today**, **Tomorrow**, and **EOW** quick buttons. EOW means Friday of the current local week, including today if Friday; use next Friday if that Friday has passed. Use local calendar arithmetic. Quick buttons, date picker, and drag/drop update text and grouping immediately.

Provide drag/drop onto date groups and Unassigned, plus a date-picker control. Allow adding an empty date group as a temporary drop target. Date-picker scheduling and drag/drop use the same model operation.

Example, with current year 2026:

```text
Undated:     Send proposal
Drop 10/15:  Send proposal 10/15           dueDate = 2026-10-15
Drop 10/18:  Send proposal 10/18           dueDate = 2026-10-18
Drop 2027:   Send proposal 01/05/2027      dueDate = 2027-01-05
Unassign:    Send proposal                dueDate = null
```

The baseline persists normalized dates. Editing/reparsing a yearless token in a later year uses that year's context; there is no automatic year rollover scheduling feature.

## 8. Search across normal pages

Keep the existing task-list search separate. Add **Search pages** in the sidebar and **Ctrl+F** to open a closable panel beside the current page/view and focus its search input. Opening it from a normal page defaults to **Current page**, excluding its subpages. Opening it from a task-list page defaults to **All pages** (normal notes pages only).

### Scope and filters

Offer **Current page**, **All pages**, and **Selected sections/subsections**. In selected scope, allow multiple section and subsection checkboxes:

- Selected sections form a union; selected subsections narrow that union (intersection between filter levels).
- No section selection means every section; no subsection selection means every subsection in the allowed sections. Both filters empty means all normal pages.
- Group subsection choices by section name to distinguish duplicated names. Choosing sections narrows available subsection choices and clears selections outside them. Remove stale selections after navigation items are deleted or moved.
- **Clear filters** empties both filter lists.

Ctrl+F while open refocuses/selects the existing query and preserves scope/filters. Navigation keeps the panel and query/filters open; Current page scope follows the newly opened normal page. Escape within the panel or its close button dismisses it. Reopening starts a fresh query and the appropriate default scope. Search input is not part of the bullet editor's selection/undo behavior.

### Matching

- Case-insensitive literal substring matching; no regex, wildcards, stemming, or semantic search.
- An unquoted query requires **every word in any order within one page title or one bullet**. Words found only across different bullets do not constitute a match.
- A query entirely wrapped in straight double quotes matches one contiguous exact phrase, ignoring case and normalizing whitespace. For example, `contract renewal` can match “renewal of the contract”; `"contract renewal"` requires that phrase.
- Search each normal page and subpage's own title, information/task text (including completed tasks), table cell text, and visible hyperlink labels.
- Ignore HTML markup, link destination attributes alone, image bytes/alt text/OCR, and current/historical task-list pages.
- Treat block boundaries, line breaks, and table cells as spaces; inline bold/italic formatting must not break a word. Collapse repeated whitespace.
- An empty/whitespace-only query has no results. Shared content can appear once in each matching page placement; do not globally deduplicate its locations.

### Results and implementation

Group results by page with the full section → subsection → ancestor page → page path. Show title/bullet snippets with matched words highlighted. Clicking a hit opens the page, expands collapsed navigation and task ancestors, scrolls to the **actual matched text**, and temporarily highlights it. A title hit highlights the title. Keep the panel's query, scope, and filters while browsing results.

Highlighting must not modify saved HTML or create an undo step. The reference uses DOM Ranges and the CSS Custom Highlight API (`page-search-match`), clearing the highlight after eight seconds, on typing, query change, closing the panel, or view changes. Map normalized/case-folded text back to original DOM offsets, including Unicode characters whose lowercase form changes length. Snippets render escaped text with React mark elements, not unsanitized HTML.

Run search locally in memory over the current notebook. Cache extracted text per bullet/HTML and invalidate changed/deleted entries. Do not introduce a server, external search provider, persistent search database, or backup-format migration. The reference right panel is 340 px wide, reduced to 300 px at narrower window widths; keep the page usable at the 900 × 620 minimum window size without horizontal overflow.

## 9. Version-1 notebook data contract

The JSON document stored in SQLite and exported as a backup has this TypeScript shape:

```typescript
type Bullet = {
  id: string;
  parentId: string | null;
  kind: "information" | "task";
  html: string;
  completed: boolean;
  dueDate: string | null; // YYYY-MM-DD
  sharedId?: string; // Logical content identity across placements
  lastEditedPageId?: string; // Preferred current source-link location
  taskListContextId?: string; // Information sibling shown on a task card
};

type Page = {
  id: string;
  sectionId: string; // ID of the subsection, using legacy terminology
  parentId: string | null; // Parent page in the same subsection
  title: string;
  bullets: Bullet[]; // Ordered records; nesting is represented by parentId
};

type Customer = { id: string; name: string }; // UI: Section
type Section = {
  id: string;
  customerId: string; // Parent top-level section
  name: string;
}; // UI: Subsection

type Task = {
  bullet: Bullet;
  pageId: string;
  pageTitle: string;
  customerName: string; // Top-level section name
  information: {
    bullet: Bullet;
    depth: number; // 0 = direct descendant, despite the legacy field name
    sibling?: "before" | "after"; // Task-card context rather than a child
  }[];
};

type TaskList = {
  id: string;
  title: string;
  createdAt: string; // ISO timestamp
  snapshot: Task[] | null; // null = current/live; array = historical/frozen
  taskIds: string[]; // Ordered logical task identities
};

type Notebook = {
  version: 1;
  customers: Customer[];
  sections: Section[];
  pages: Page[];
  taskLists: TaskList[];
  activeListId: string;
  notebookId?: string; // Stable identity for same-notebook clipboard linking
  ui?: {
    collapsedSections: string[];
    collapsedSubsections: string[];
    collapsedBullets?: string[]; // Logical bullet identities
  };
};
```

Retain the legacy `customers`, `sections`, `customerId`, and `sectionId` field meanings for compatibility with existing browser-version exports. They are not the labels shown to the user. Use stable UUIDs for new records. Array order determines sidebar/sibling ordering.

An empty notebook has empty section/subsection/page arrays and one current task list, named today, with `snapshot: null` and `taskIds: []`. Missing optional `ui` means all headings/bullets are expanded. All added metadata remains optional so older version-1 browser/desktop backups are accepted. Assign a notebook identity when needed and treat an absent sharedId as the bullet ID. New logical tasks and task-list membership use `sharedId ?? id`; placements remain uniquely identified by id.

Validate imported data before replacing state: supported version, required arrays and strings, unique entity/bullet IDs, supported bullet kinds, completion and date fields, valid parent references, no page/bullet ancestry cycles (including cycles through shared identities), and exactly one live task list matching `activeListId`. Snapshot bullet IDs intentionally repeat source IDs and must not be treated as duplicate live entities. Page ancestors must be in the same subsection. Reject unsupported/damaged backups with a visible error.

## 10. Local persistence, saving, and recovery

### SQLite file and schema

Use Node's built-in **`node:sqlite` / `DatabaseSync`** in the Electron main process. Do not require a separate database service, native SQLite npm addon, or a C++ compiler to package the app.

Set the stable application data path independently of the executable's filename/location/version:

```text
Windows database: %APPDATA%\Task Notebook\notebook.sqlite
Windows backups:  %APPDATA%\Task Notebook\backups\
Linux development: $XDG_CONFIG_HOME/Task Notebook
                   (normally ~/.config/Task Notebook)
```

The reference database stores the entire notebook as JSON in **one row**; it is not a normalized relational table per task/page:

```sql
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS notebook (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  contents TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Serialize the notebook before modifying the database. Save with a prepared one-statement `INSERT ... ON CONFLICT(id) DO UPDATE` at ID 1. This commits the complete notebook atomically. `updated_at` is an ISO timestamp.

Run `PRAGMA quick_check` on open. Report database opening/integrity/JSON loading errors and preserve existing files. Never silently replace a corrupt notebook with an empty one.

### Save queue and shutdown

Every notebook change, including sidebar preferences/order, triggers a save through a serialized renderer-side promise queue. Permit a later save attempt after an earlier failure. Show **Saving…**, **Saved locally**, or **Save failed** accurately, with a visible error when needed.

The renderer keeps a reference to the latest complete state. On normal window close, the main process prevents closing and sends a close request. The renderer resolves pending date edits and saves that latest state after queued writes, then acknowledges that closing is safe. If saving fails, leave the window open and show the error. Close the SQLite connection during app shutdown.

Acquire Electron's single-instance lock. Starting a second instance restores/focuses the existing window instead of opening competing notebooks.

The renderer must fail clearly if the desktop storage bridge is unavailable. **Do not fall back to IndexedDB, localStorage, or installed-browser storage.** Opening the static interface in a browser is not a supported notebook mode.

### SQLite backups

- Before the first write of a local calendar day, make a standalone SQLite backup of the **previous saved state**, if a notebook already exists.
- Use `VACUUM INTO` to produce a consistent independent backup file.
- Make a safety backup before replacing a notebook through import.
- Keep the newest **30** recognized backup files, ordered by modification time.
- The reference naming scheme is `YYYY-MM-DD-reason-timestamp-UUID.sqlite`, where reason is `daily`, `manual`, or `restore`.
- Do not delete arbitrary user files while applying retention.

An empty database has nothing to back up. Automatic backups protect against some accidental changes, but share the same disk; they do not protect against loss of that disk.

### JSON export, import, and browser migration

Export the complete version-1 notebook as readable JSON through a native save dialog. Include all pages, bullets, embedded images, historical snapshots, titles, and sidebar preferences. Flush pending saves first. Write to an adjacent unique temporary file and rename it to the chosen destination; handle cancellation without modifying notes.

Restore selects a JSON file, rejects files over 100 MiB, validates the structure, sanitizes all live and snapshot HTML, and asks before replacing the notebook. Flush prior writes, create the SQLite safety backup, persist the imported notebook, then show its current task list. Report failures without announcing success.

To migrate the browser version: export JSON from the browser app and restore it into this desktop app. No changes to the browser repository are necessary.

To restore an automatic SQLite backup manually: close the app, copy the current database somewhere safe, copy the desired backup into the data folder as `notebook.sqlite`, and reopen. Never copy over the database while the app is running.

## 11. Electron security and offline behavior

Use these BrowserWindow preferences:

```javascript
{
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  preload: /* absolute path to desktop/preload.cjs */
}
```

Expose only a narrow `window.notebookDesktop` bridge through `contextBridge`. Do not expose unrestricted IPC, filesystem, shell, or Node APIs to the renderer.

The reference bridge provides:

```typescript
load(): Promise<Notebook | null>;
save(state: Notebook): Promise<void>;
backup(reason: "manual" | "restore"): Promise<string | null>;
export(state: Notebook): Promise<string | null>;
location(): Promise<{ database: string; backups: string }>;
openDataFolder(): Promise<void>;
openLink(url: string): Promise<void>;
onClose(callback: () => void): () => void; // Returns unsubscribe
closeReady(): void;
```

Main-process handlers verify that requests originate from the intended window's main frame. Validate incoming operation arguments; the baseline save handler checks the top-level notebook shape, while full backup validation is performed in the model/renderer. Restrict external links to HTTP, HTTPS, and mailto, and reject non-string/overlong inputs (reference limit: 8192 characters).

Block new notebook windows and embedded webviews. Prevent navigation away from the bundled application; safe clicked links open externally. In packaged mode, Electron's request filter allows local `file:`, `data:`, and `blob:` resources and rejects remote requests.

Use a restrictive Content Security Policy: local scripts, local/data images, no objects, frames, or remote base URLs. The reference development configuration permits only the optional loopback Vite origin `http://127.0.0.1:5173` and its WebSocket; packaged mode must not permit that development override. Normal `npm start` builds and loads local files, without running a server.

**Describe privacy precisely:** notebook content lives locally, and there is no app telemetry or cloud synchronization. The desktop window does not use the storage/accounts/extensions/sync of the user's installed browser. Electron nevertheless uses a Chromium engine and Node-capable main process; application-level request restrictions are not an operating-system guarantee that the executable can never access the Internet. A Windows outbound firewall rule is separate enforcement. Clicking a hyperlink opens an external browser/email handler, which can use the Internet. Exporting to a OneDrive/Dropbox or otherwise synced folder may cause that service to upload the export. Notebook files and backups are **not encrypted**.

## 12. Source layout and build configuration

The reference implementation uses this layout:

```text
desktop/
  main.cjs               Electron lifecycle, IPC, dialogs, request restrictions
  preload.cjs            Restricted renderer bridge
  database.cjs           SQLite storage and backup retention
  database.test.cjs      Node storage tests
src/
  App.tsx                Notebook state, views, actions, task cards, editor toolbar
  SidebarTree.tsx        Collapsible navigation; section/subsection/page moves/deletes
  Editor.tsx             Rich contentEditable bullet editor
  model.ts               Types, task projection, dates, rollover, validation
  model.test.ts          Base model tests
  outline.test.ts        Shared placement, outline, clipboard model tests
  clipboard.ts           Structured native clipboard and linked paste
  selection.ts           Cross-bullet ranges, caret, split/selection helpers
  PageSearchPanel.tsx     Search UI, scopes, filters, result navigation
  pageSearch.ts          Local text indexing, matching, snippets, DOM ranges
  pageSearch.test.ts     Search matching and text-range tests
  rich.ts                Sanitization, links, image/table HTML helpers
  storage.ts             Bridge loading and serialized save queue
  links.ts               External-link helper
  desktop.d.ts           Bridge TypeScript declaration
  style.css              Interface styles
  main.tsx               React entry point
tests/
  desktop-fixture.ts     Actual Electron launch with isolated temporary data
  workflow.spec.ts       Main desktop workflows
  regressions.spec.ts    Sidebar, titles, links, caret, close/restart regressions
  outline.spec.ts        Keyboard, selection, clipboard, linked task workflows
  page-search.spec.ts    Search scopes, filters, highlights, navigation, layout
index.html
package.json
package-lock.json
vite.config.ts
playwright.config.ts
tsconfig.json
.nvmrc
README.md
DESKTOP_REBUILD_SPEC.md
```

Use CommonJS `.cjs` files for the Electron main/preload/database modules even though `package.json` has `"type": "module"`. Set `"main": "desktop/main.cjs"`. Configure Vite with **`base: "./"`**, so bundled assets work when loaded using `file:` paths.

Reference dependency declarations are below. Use the reference **`package-lock.json` with `npm ci`** to reproduce resolved versions; installing fresh caret ranges can resolve newer packages.

| Component                          | Declared version/range       |
| ---------------------------------- | ---------------------------- |
| Node.js                            | `>=24 <25`; `.nvmrc` is `24` |
| React / React DOM                  | `^19.3.0`                    |
| TypeScript                         | `^7.0.2`                     |
| Vite                               | `^8.3.4`                     |
| Vite React plugin                  | `^6.1.2`                     |
| Electron                           | `^44.7.0`                    |
| electron-builder                   | `^26.15.3`                   |
| lucide-react                       | `^1.55.0`                    |
| Vitest                             | `^5.0.3`                     |
| jsdom                              | `^30.1.2`                    |
| Playwright test                    | `^1.64.0`                    |
| Prettier                           | `^3.9.10`                    |
| React / React DOM type definitions | `^19.3.0`                    |

Important scripts:

```json
{
  "postinstall": "install-electron",
  "build": "tsc -b && vite build",
  "start": "npm run build && electron .",
  "dev": "npm run build && electron .",
  "test": "vitest run",
  "test:storage": "node --test desktop/database.test.cjs",
  "test:e2e": "npm run build && playwright test",
  "test:desktop": "npm run test:e2e",
  "format:check": "prettier --check .",
  "dist:win": "npm run build && electron-builder --win portable --x64",
  "pack": "npm run build && electron-builder --dir"
}
```

Keep `postinstall: install-electron` for this reference Electron dependency's binary installation. Use verified downloads; do not disable package/binary integrity checking to solve an environment issue.

Reference electron-builder settings:

```json
{
  "appId": "com.shamboozled.tasknotebooklocal",
  "productName": "Task Notebook",
  "directories": { "output": "release" },
  "files": [
    "dist/**/*",
    "desktop/main.cjs",
    "desktop/preload.cjs",
    "desktop/database.cjs",
    "package.json"
  ],
  "win": {
    "target": [{ "target": "portable", "arch": ["x64"] }],
    "artifactName": "Task-Notebook-${version}-Windows-${arch}.${ext}",
    "signAndEditExecutable": false
  },
  "linux": { "target": "dir" },
  "asar": true
}
```

The app version is `1.0.0`. This configuration produces an **unsigned portable Windows executable**, with data in the stable app-data folder rather than beside the executable. Do not describe it as an installer or promise a signed distribution. Windows may display SmartScreen warnings for unsigned software.

## 13. Rebuild and run instructions for Windows

On **64-bit Windows 10 or 11**, install Node.js 24 LTS and Git, then reopen PowerShell:

```powershell
git clone https://github.com/shamboozled/task-management-local.git
cd task-management-local

# Use this commit to reproduce the documented baseline.
git checkout 224b1c4ae9c5c292115b4398e3fd1dcaa7753e65

npm ci
npm run dist:win
```

Output:

```text
release\Task-Notebook-1.0.0-Windows-x64.exe
```

Double-click the executable. Node.js and Git are build prerequisites, not runtime prerequisites. The executable can be moved or renamed without changing the notebook's data directory. Build again after modifying source. The filename follows the version in `package.json`.

For a source run:

```powershell
npm ci
npm start
```

There is no required backend or web server. `npm run dev` behaves like `npm start` in this baseline: rebuild and open Electron. Close/restart after source changes. A static browser preview does not have the desktop storage bridge and must not be treated as a working notebook.

A GitHub source ZIP is an alternative to cloning; extract it, open PowerShell in its folder, run `npm ci`, then `npm run dist:win`. A ZIP from the default branch may contain later changes; use the reference commit when exact baseline reproduction matters.

Cloud workspace setup/publishing is not required to build or run this Windows app. Codex environment setup configuration only prepares a development workspace; it does not publish this executable or upload notes from the user's PC.

## 14. Verification and acceptance criteria

Run the reference checks:

```powershell
npm test
npm run test:storage
npm run test:e2e
npm run format:check
```

End-to-end tests must launch **actual Electron**, not only a browser approximation. Give each test an isolated temporary notebook directory. The reference supports `NOTEBOOK_TEST_DATA_DIR` only when the app is not packaged. Never run tests against the user's real database. For headless Linux, use Xvfb; a normal Windows desktop session does not need it.

| Area                 | Required result                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Initial state        | One current date-named task list; no third bullet kind or browser-storage fallback                                         |
| Hierarchy            | Sections/subsections/pages/subpages create correctly; full breadcrumbs update immediately                                  |
| Sidebar              | Collapse state persists; one top-level add button; section/subsection/page drag order persists; compact subsection labels  |
| Subsection move      | Moving between sections retains pages, subpages, bullets, and working source links                                         |
| Titles               | Page/subpage/task-list defaults use the local date and remain editable                                                     |
| Keyboard editing     | Tab/Shift+Tab changes depth and subsequent typing stays in the same line at the caret                                      |
| Enter/split          | Start/middle/end cases preserve text and the documented child ownership; task cards create information bullets too         |
| Consecutive Enter    | Second Enter outdents a new blank bullet or creates a child at the top level                                               |
| Protected controls   | No text can be inserted before checkboxes; collapse chevrons are centered and remain inside card borders                   |
| Selection            | Mouse/Shift selection spans bullets; Ctrl+A selects a line then the page; Ctrl+T toggles the selected identities           |
| Clipboard            | Full task text selected by Ctrl+A, mouse, or triple-click copies/cuts its subtree; partial text remains a fragment         |
| Paste indentation    | Empty destination indentation wins; relative child depth and task/info kinds survive                                       |
| Linked placements    | Copy/cut between pages retains one logical task; content and structural edits update every linked placement                |
| Deletion/undo        | Bullet deletion has no popup, promotes children, and restores the caret; Ctrl+Z restores bullet creation/deletion          |
| Location deletion    | Delete section/subsection/page descendants without removing shared placements in other locations; undo restores them       |
| Rich paste           | Hyperlinks and safe structure survive; pasted fonts/sizes do not                                                           |
| Hyperlinks           | Typed, pasted, and toolbar-created links open externally without navigating the notebook                                   |
| Images/tables        | Embedded images and editable table contents survive save, restart, export, and restore                                     |
| Live synchronization | Editing task text, attached information, dates, or completion in either view updates the source record                     |
| Task descendants     | Parent cards include all child tasks/info; child tasks also appear independently without their parents/siblings            |
| Task-card context    | Information siblings created with Enter stay visible on the card and source page without becoming children                 |
| Completion guard     | Parent cannot complete with incomplete descendant tasks; reopening/adding an incomplete child reopens completed ancestors  |
| Task collapse/order  | Collapsed tasks retain text and hide descendants; card reordering persists without changing note ordering                  |
| Latest source link   | Editing another placement changes the task's source link; deleted locations fall back to a surviving placement             |
| Date parsing         | First valid date controls; invalid dates are skipped; leap years and explicit years work                                   |
| Scheduling           | Drag/picker append or replace text dates; unassign clears all recognized valid date tokens                                 |
| Deferred regrouping  | Typing 10/13 does not jump at 10/1; leaving the bullet applies the final valid date                                        |
| Quick dates          | Today/Tomorrow use local dates; EOW is this Friday or next Friday after it has passed                                      |
| Search launch/scope  | Sidebar/Ctrl+F opens beside the page; default current page excludes subpages; task-list launch searches all notes          |
| Search filters       | Multiple section/subsection choices use the documented union/intersection; empty filters and Clear filters work            |
| Search matching      | All unquoted words match within one title/bullet; quoted phrases match contiguously; rich/table text is normalized         |
| Search navigation    | Hits show full paths, reveal collapsed ancestors, and scroll to actual words; temporary highlighting changes no saved HTML |
| Search state/privacy | Query/filters survive navigation; live edits/deletions update results; no provider/network/storage fallback is used        |
| Rollover             | Old contents freeze; only unfinished tasks carry forward; reopening a source task restores current membership              |
| Snapshot isolation   | Later source edits, moves, completion changes, and deletions do not alter historical contents                              |
| Save durability      | Data survives normal close/reopen, including the final edit just before closing                                            |
| Save failure         | Errors are visible; failed serialization preserves prior saved data; failed final save prevents normal close               |
| Backups              | Daily backup has the previous state; restore makes a safety copy; newest 30 recognized backups retained                    |
| Corruption           | Damaged database is reported and preserved, never silently reset                                                           |
| Export/import        | Native export, validation, sanitization, confirmation, and full replacement work                                           |
| Packaged startup     | Built artifact opens local assets and writes to the stable data folder independently of exe location                       |
| Offline operation    | Creating/editing/reopening notes works disconnected; no remote content loads or telemetry                                  |

Tests for external links should mock/record the main-process external-open call rather than visiting the Internet. Backup dialog tests may supply a temporary output path. Test invalid backup input and hierarchy cycles as well as successful imports.

A useful combined regression scenario is to create a task with one information child and one incomplete child task on page A, copy its fully selected text to an empty indented bullet on page B, and verify relative indentation and shared content. There must be two distinct logical task-list entries (parent and child), even though the child also appears inside the parent's card. Edit a child on B, check A and both card appearances, and verify the parent's source link now opens B. Reject completing the parent until the child is completed. Cut a placement without deleting its other locations, undo, then delete page B and confirm A survives. Search for the edited child text across both locations before deletion and only A afterward; verify the search does not alter backup HTML. Finally roll over the task list and confirm the archived content remains unchanged by subsequent source edits.

**Reference verification already performed:** 39 model/search tests, 6 SQLite storage tests, and 33 actual Electron end-to-end workflows passed in the Linux cloud workspace. The interface build and formatting passed, and an earlier packaged Linux directory app was smoke-tested with SQLite persistence. The latest changes were checked through actual Electron workflows; that earlier packaged-app check is not a new Windows packaging check. **A Windows executable was not built or run in that workspace.** A reproducing model must not turn those results into a claim of Windows execution validation; report its own checks separately.

For a Windows release check, compile on Windows, start the executable, create a task with an image/table, close/reopen, move/rename the executable, verify the same notebook remains, and repeat basic editing with the network disconnected. These checks are recommended completion criteria, not claims about tests already performed.

## 15. Suggested implementation sequence and handoff

If rebuilding without source, implement in this order:

1. Define the compatible version-1 model, placement versus shared identities, synchronized subtree operations, task projection/order, dates, completion guards, validation, and snapshot rollover.
2. Implement the main-process SQLite database and backups, restricted preload bridge, serialized saving, and close handshake.
3. Build section/subsection navigation, date-named pages/subpages, complete breadcrumbs, collapse persistence, and sidebar dragging and location deletion.
4. Build the shared outline editor: cross-bullet selection, caret-preserving indent, split/Enter/deletion behavior, custom undo, Ctrl+T, structured clipboard with linked subtree paste, images, tables, and hyperlinks.
5. Build the two-column task list using logical task IDs, nested descendants and context siblings, collapse/completion guards, deferred text-date regrouping, quick dates, drag reorder/scheduling, latest-edited source navigation, and frozen history.
6. Add local page search, keyboard launch, scopes/multiple filters, safe snippets, and nonmutating highlight navigation.
7. Add JSON export/restore and test migration from version-1 browser backups.
8. Package the Windows portable executable and document actual verification results and remaining platform limitations.

The final handoff should include complete source and lockfile, a README with Windows build/run/data/recovery instructions, the tests used, the generated executable if built, and any departures from this specification. Preserve the documented local-storage and privacy guarantees without describing app-level network filtering as an absolute firewall.
