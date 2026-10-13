# Task-list creation and group moves: feature specification

Status: **implemented in the current working source**. This document records the interaction rules and storage changes for direct task creation and group moves, and complements [DESKTOP_REBUILD_SPEC.md](DESKTOP_REBUILD_SPEC.md). Windows packaging, signing, release upload, and GitHub Actions automation remain separate follow-up work.

## 1. Create tasks on the current task-list page

Add an **Add task** button beside the current list's actions. Clicking it immediately creates a new blank, incomplete task in **Unassigned** and focuses its text editor. There is no creation dialog, required source picker, or Inbox section/subsection/page. Historical lists remain read-only and do not offer this action.

Make creation one undoable notebook update:

1. Create a top-level task bullet with a fresh identity, empty HTML, `completed: false`, and `dueDate: null` in persistent notebook storage for tasks created on the task list.
2. Add its logical ID to the active task list exactly once and append its card to Unassigned.
3. Save through the existing SQLite pipeline, keep the current task list open, reveal the card, and focus its text editor. If the current task search would hide it, clear that search so creation has visible feedback.

A blank task is valid and survives blur/restart; users can delete it or undo creation. Typing, rich content, information children, date parsing on blur, scheduling controls, completion, and rollover behave as for existing task cards. **Add task** intentionally creates a task; ordinary outline creation and Enter in existing task cards continue to create information bullets.

### Source links after copying to a normal page

A task created on the task list initially has no source-page link. Omit that link entirely instead of displaying a disabled or artificial source. Copying the task's full bullet/subtree into a normal notes page creates a linked placement, preserving its logical identity and children. Its task-list card then links to the destination page. The list still contains one logical task, and edits from the card or any notes placement stay synchronized.

Partial-text copies remain ordinary text copies and do not establish a source relationship. Full copies to additional normal pages follow the existing latest-edited-source rule, with the new pasted placement becoming the preferred source. If that page is deleted, use another surviving notes placement; if none survives, omit the source link and retain the original task-list-created task. These changes do not rewrite historical snapshots.

### Storage and compatibility

The current implementation assumes all live task bullets belong to a normal page. Support source-less tasks explicitly; do not implement them as hidden pages or append live content to frozen list snapshots.

The model uses a notebook-level `taskListBullets` collection containing the same bullet/parent/shared-identity records as page bullets, plus nullable source-page references in live task projections and snapshots. This collection holds task-list-created tasks, children, and associated information independently of whichever task-list page is current. Continue using `taskIds` for active-list membership/order and frozen snapshots for historical lists. Completed tasks remain stored after rollover even when excluded from the current list.

Extend editing, hierarchy, clipboard, deletion, identity resolution, synchronization, completion guards, sanitization, and import validation to both storage locations. Page-search results continue to cover normal pages; a standalone task becomes searchable there after a linked placement is pasted into a page. Task-list search covers it from creation.

The notebook/backup document is version 2, with migration from existing version-1 notebooks and imports. Older applications reject the new format instead of silently dropping standalone tasks. The main-process save contract and renderer import/export support both incoming versions; current saves/exports use version 2. SQLite keeps its current JSON-document layout. Migration preserves existing version-1 data.

Acceptance checks: create/focus a blank Unassigned task in an empty notebook without adding navigation containers; retain it after blur/restart; edit, schedule, attach information, complete, and roll over; undo/redo creation; reveal it despite an active search; omit the source link initially; copy a full task/subtree into a page and establish its link without duplicating the logical task; synchronize both directions and across multiple placements; preserve partial-copy behavior; fall back/remove the link when pages are deleted; preserve archived snapshots; migrate version-1 data and round-trip version-2 exports including standalone content. Historical lists expose no task-creation action.

## 2. Select task cards

Add a **Select tasks** toggle beside Add task. Selection mode shows a separate selection checkbox on each task card, highlights selected cards, and displays **N selected**, **Move selected**, and **Clear selection**. Selection checkboxes must be clearly distinct from the existing completion checkboxes. Selecting a task never completes it.

Keep card selection separate from the existing rich-text/bullet selection:

| Gesture                                                            | Behavior                                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Click a selection checkbox                                         | Toggle that card without affecting completion or text.                                                                                     |
| Plain left-click a card's noninteractive surface in selection mode | Select only that card and establish the range anchor.                                                                                      |
| Ctrl + left-click a card's noninteractive surface                  | Add/remove that task independently; enter selection mode if necessary and establish the range anchor.                                      |
| Shift + left-click a card's noninteractive surface                 | Select the inclusive range between the anchor and clicked card, replacing the previous selection. Repeated Shift-clicks retain the anchor. |
| Ctrl + Shift + left-click                                          | Add the inclusive anchor-to-click range to the existing selection.                                                                         |
| Shift-click with no valid anchor                                   | Select just that card and establish an anchor.                                                                                             |
| Escape outside an active dialog, or Clear selection                | Clear card selection and its anchor.                                                                                                       |

The first selecting click establishes the initial anchor. A later explicit plain/Ctrl-click establishes a new anchor, following familiar desktop selection behavior. Task text, hyperlinks, completion controls, date inputs, and other buttons retain their usual behavior; click handlers must not intercept these interactive targets. Outside selection mode, plain clicks continue to edit normally.

Define range order explicitly: visible Unassigned cards from top to bottom, followed by Priority date groups from earliest to latest, with each group's visible cards from top to bottom. Select card roots only; nested appearances of child tasks within another card are not extra range positions. Deduplicate by `sharedId ?? id`.

Only visible cards are eligible. Clear selection and anchor when the task search changes, the list/page changes, the notebook is restored, or selection mode closes. Remove stale IDs when tasks are deleted, converted to information, or otherwise disappear. Selection is transient UI state; do not put it in SQLite backups. Keep it through successful group moves while those tasks remain visible.

Use native selection checkboxes and labeled controls so keyboard users can select cards with Space and use Move selected without dragging. Provide a clearly visible focus indicator, selected styling, and an accessible selected-count announcement.

## 3. Move selected tasks together

Here, **move** means change task-list order or scheduling between Unassigned/date groups. It does not move the underlying notes to another page or change bullet hierarchy.

- Drag the grip of a selected card to move the whole selection. Show the selected count in the drag feedback.
- Drag an unselected card to replace the selection with that card and perform the existing single-task move.
- Dropping before/after an unselected card inserts the selected cards as one contiguous block at that point and gives them the target card's date.
- Dropping on an Unassigned/date-group background appends the selected block to that group. Empty date groups remain valid drop targets.
- Preserve selected cards' relative order from the visible order captured at drag start, including when selection spans multiple date groups. Leave unselected cards in their existing relative order.
- Dropping onto a selected card is a no-op. Canceled or invalid drags leave notebook data unchanged.
- **Move selected** offers Unassigned, an existing/new date, Today, Tomorrow, and EOW. It applies the same block move as dropping on a group background and provides a keyboard-accessible alternative.

Flush pending text/date edits before applying the move, then resolve every logical task identity against the current notebook. Update dates with the existing `moveDate` operation and synchronize all linked placements. Unassign removes every recognized valid date token. Preserve rich text, attached information, completion values, source links, and source-page bullet order.

Children follow their parent visually inside its card. Only explicitly selected task identities change date: selecting a parent does not implicitly reschedule every child task. If both parent and child cards are selected, apply the operation once to each logical task. Never duplicate or detach the subtree.

Apply the entire batch in one model update, one undo step, and one save operation. Implement block reordering by removing selected IDs and reinserting them together in `activeList.taskIds`; repeated single-task reorders can reverse a block or produce multiple undo steps. Share this operation between drag/drop and Move selected. Treat malformed drag payloads and historical-list mutations as invalid.

Acceptance checks: Ctrl selection/deselection; inclusive forward/backward Shift ranges; Ctrl+Shift union; ranges across columns/date groups; search-filtered ranges; selected-block reordering; cross-group scheduling; appending to empty groups; no-op self drops; single unselected-card drag; rich text and linked-placement synchronization; selected parent/child deduplication; undo/redo of the full batch; persistence after restart; selection clearing/pruning; keyboard selection/moves; unchanged archived snapshots and text editing.

## 4. Implementation and validation

- `src/model.ts` stores standalone bullets in `taskListBullets`, resolves optional source links, migrates/validates documents, shares outline/synchronization operations, and moves logical tasks as one ordered block. A transient container adapter lets the existing outline operations work with standalone content; it is never stored in `pages` or shown in navigation.
- `src/App.tsx` provides immediate blank-task creation/focus, card selection, native drag feedback/drop handling, and Move selected controls. `src/clipboard.ts` establishes the preferred notes source when a linked task is pasted.
- `desktop/main.cjs` accepts the version-2 save contract. SQLite keeps its original JSON-document layout.
- `src/taskList.test.ts` covers creation, linking and subtree synchronization, source fallback, rollover, completion guards, migration/validation, block order, and scheduling.
- `tests/task-list.spec.ts` exercises the actual Electron UI: blank creation, editing/information children, linked copies, modifier/keyboard selection, group moves/undo, cross-column ranges, archived isolation, SQLite restart, and export/restore.

The creation behavior follows the requested immediate blank Unassigned task flow. Separate selection mode, visible range order, and explicitly selected child scheduling implement the defaults documented during planning. Full-task copy establishes a source relationship; partial-text copy does not.

Current-source validation in the Linux cloud workspace: **49 model/search tests, 6 SQLite storage tests, and 39 actual Electron desktop tests passed**, with no skipped tests. The TypeScript/Vite build, formatting check, and diff whitespace check passed. A Windows executable has not been built, signed, or run for these changes.

## 5. Distribute a compiled Windows executable through GitHub

The easiest first release is a manual Windows build followed by a **GitHub Release asset** upload:

1. On Windows 10/11 x64, check out the intended release commit and install Node 24. Run `npm ci` and `npm run dist:win`.
2. Smoke-test `release\Task-Notebook-1.0.0-Windows-x64.exe` (or the filename for the current package version): launch, create/edit notes, close/reopen, move/rename the executable, and verify offline operation and the stable data folder.
3. On the repository's GitHub page, open **Releases → Draft a new release**, choose a version tag for that commit, attach the `.exe`, add release notes, and publish when ready. Do not publish the tag or release until its source changes and binary have been reviewed.
4. Users download the attached `.exe` and run it. Retain the source/lockfile and release tag for reproducible future builds.

GitHub Releases associate the binary with the repository without committing generated executables into source history. `release/` is already ignored; leave it that way. Increment `package.json`'s version for subsequent releases as part of the release implementation, not this documentation-only planning change.

For repeat releases, add a GitHub Actions workflow on `windows-latest` with Node 24, `npm ci`, model/storage/desktop checks, and `npm run dist:win`. Initially upload the executable as a workflow artifact for review. Later, a version-tag workflow can attach it to a draft GitHub Release with scoped `contents: write` permission. This automation is a proposed follow-up; no workflow or release is created by this plan.

The executable bundles Electron/Node and targets **Windows 10/11 x64**. Users do not need Node, Git, an installed browser, or a separate server. It cannot be promised to run on every x64 Windows installation: older Windows versions, restricted executable policies, missing OS updates, and environment differences can prevent startup. It is an unsigned portable executable, so Windows may show a SmartScreen warning. Signing is a separate distribution improvement.

Windows packaging and compatibility remain **unverified** until the generated artifact is built and exercised on Windows. Passing Linux development tests does not establish Windows compatibility. Test Windows 10 and 11 separately, preferably including a clean machine without development tools, before claiming support for both.

### Signing and SmartScreen

Unsigned means the executable lacks an Authenticode code signature establishing a publisher identity and detecting changes to the signed file. It does not mean the application is malicious. SmartScreen uses downloaded-file and publisher reputation; a new or uncommon executable can trigger a warning even when it has a valid signature.

For distribution, sign the final Windows build with a trusted code-signing certificate and a trusted timestamp before uploading it. The current build configuration disables executable signing/editing; signing must be explicitly added through supported electron-builder configuration or a post-build signing step. Verify the final signature and smoke-test the signed portable executable.

Signing on a receiving computer can give that copy a valid signature if a suitable certificate/private key is available, but does not guarantee that SmartScreen will allow it. A self-signed or organization-internal certificate is not automatically trusted on other machines, and certificate trust alone does not establish SmartScreen reputation. Organization-managed application policies may require an IT-approved publisher rule. Sign before distribution where possible; do not disable Windows protections as a release strategy.
