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

Every editable task card has an always-visible **Select** button with a pressed state; there is no Select tasks mode/toggle. This control is separate from task completion. Only the Select button toggles pointer-based card selection. Card surfaces, text editors, completion controls, source links, and date inputs retain their normal behavior and cannot select a card.

| Gesture                                                      | Behavior                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Left-click Select                                            | Toggle that task and establish the range anchor. Other selected tasks remain selected.                                                                             |
| Shift + left-click Select in the anchor's column             | Select the inclusive range within that column, replacing its prior range while preserving selections in the other column. Repeated Shift-clicks retain the anchor. |
| Shift-click Select in the other column, or without an anchor | Toggle just that task and establish a new anchor there.                                                                                                            |
| Ctrl-click a card surface                                    | No card-selection behavior.                                                                                                                                        |
| Space/Enter on Select                                        | Toggle that task using the keyboard.                                                                                                                               |
| Ctrl+A outside text editors                                  | Select all visible task cards.                                                                                                                                     |
| Ctrl+C outside text editors                                  | Copy selected task subtrees to the native clipboard.                                                                                                               |
| Escape, Clear selection, or clicking outside tasks/actions   | Clear card selection and its anchor.                                                                                                                               |

Ranges never cross between Unassigned and Priority. Within Unassigned, order runs top to bottom. Within Priority, order runs through date groups chronologically, with cards top to bottom inside each group. Select card roots only; nested appearances of child tasks inside another card are not extra range positions. Resolve identities with `sharedId ?? id`.

Keep vertical wheel scrolling available while Shift is held, including platforms that report Shift-wheel as a horizontal delta. Scrolling must retain selection and its anchor so long ranges remain usable.

Only visible cards are eligible. Search changes, navigation, notebook restore, and disappearing/deleted/converted tasks clear or prune the selection. Selection is transient and is not stored in backups. Successful group moves retain the selected tasks while they remain visible. Clicking/dragging an unselected task can show transient green focus feedback without selecting it; clicking outside the task clears that feedback. Task action controls preserve the batch they operate on.

Display **N selected**, **Copy selected**, **Move selected**, and **Clear selection** in the task toolbar as appropriate. Provide visible keyboard focus, pressed states, selected styling, and an accessible selected-count announcement. Text editors keep their existing Ctrl+A/Ctrl+C behavior.

## 3. Move selected tasks together

Here, **move** means change task-list order or scheduling between Unassigned/date groups. It does not move the underlying notes to another page or change bullet hierarchy.

- Drag the grip of a selected card to move the whole selection. Show the selected count in the drag feedback.
- Drag an unselected card to move only that task, without implicitly selecting it.
- Dropping before/after an unselected card inserts the selected cards as one contiguous block at that point and gives them the target card's date.
- Dropping on an Unassigned/date-group background appends the selected block to that group. Empty date groups remain valid drop targets.
- Preserve selected cards' relative order from the visible order captured at drag start, including when selection spans multiple date groups. Leave unselected cards in their existing relative order.
- Dropping onto a selected card is a no-op. Canceled or invalid drags leave notebook data unchanged.
- **Move selected** offers Unassigned, an existing/new date, Today, Tomorrow, and EOW. It applies the same block move as dropping on a group background and provides a keyboard-accessible alternative.

Flush pending text/date edits before applying the move, then resolve every logical task identity against the current notebook. Update dates with the existing `moveDate` operation and synchronize all linked placements. Unassign removes every recognized valid date token. Preserve rich text, attached information, completion values, source links, and source-page bullet order.

Children follow their parent visually inside its card. Only explicitly selected task identities change date: selecting a parent does not implicitly reschedule every child task. If both parent and child cards are selected, apply the operation once to each logical task. Never duplicate or detach the subtree.

Apply the entire batch in one model update, one undo step, and one save operation. Implement block reordering by removing selected IDs and reinserting them together in `activeList.taskIds`; repeated single-task reorders can reverse a block or produce multiple undo steps. Share this operation between drag/drop, Move selected, and right-click scheduling. Treat malformed drag payloads and historical-list mutations as invalid.

### Right-click scheduling and copying

Right-click any selected task to open a menu for the entire selection. Offer **Assign date…**, **Unassign selected tasks**, and **Copy selected tasks**. Right-clicking unselected task text retains its ordinary context behavior. Assign date opens an accessible calendar dialog with month navigation, a date input, and clickable days; selecting a day or submitting the date applies it to the full selection. Unassign moves the selection to Unassigned and removes recognized text dates using the existing model operation.

Copy selected tasks in visible order using the existing structured bullet clipboard format, with HTML metadata and plain text on the native OS clipboard. Include task/information kinds, rich content, hierarchy, and linked identities. If a selected task is already within another selected task's subtree, include it there only. Pasting into notes creates linked placements and establishes those source links without duplicating logical task-list membership. Partial-text copy from an editor retains its existing fragment behavior. Support the menu, Copy selected toolbar action, and Ctrl+C; Ctrl+A outside an editor selects all visible cards.

Acceptance checks: control-only toggles and same-column forward/backward Shift ranges; Priority ranges across multiple dates; cross-column Shift clicks without an intervening range; search-filtered ranges; Shift scrolling on long columns; selected-block reordering and drag scheduling in both directions; right-click calendar/Unassign and single-step undo; native clipboard copies/pastes with correct kinds, ordering, subtree deduplication, and synchronization; Ctrl+A/Ctrl+C in card and text contexts; outside-click clearing of drag/focus feedback; preserved archived snapshots, persistence, and rich editing.

## 4. Implementation and validation

- `src/model.ts` stores standalone bullets in `taskListBullets`, resolves optional source links, migrates/validates documents, shares outline/synchronization operations, and moves logical tasks as one ordered block. A transient container adapter lets the existing outline operations work with standalone content; it is never stored in `pages` or shown in navigation.
- `src/App.tsx` provides immediate blank-task creation/focus, control-only selection, same-column ranges, Shift scrolling, native drag feedback/drop handling, and selected-task actions. `src/TaskActions.tsx` implements the right-click menu and calendar dialog. `src/clipboard.ts` constructs deduplicated selected task trees and establishes the preferred notes source when linked tasks are pasted.
- `desktop/main.cjs` accepts the version-2 save contract and exposes a trusted, size-limited native clipboard write through the narrow preload bridge. It uses Electron 44's asynchronous ClipboardItem API. SQLite keeps its original JSON-document layout.
- `src/taskList.test.ts` covers creation, linking and subtree synchronization, source fallback, rollover, completion guards, migration/validation, block order, and scheduling.
- `tests/task-list.spec.ts` exercises the actual Electron UI: blank creation, editing/information children, linked copies, Select-button/keyboard selection, same-column ranges and Shift scrolling, context scheduling/copying, group moves/undo, archived isolation, SQLite restart, and export/restore.

The creation behavior follows the requested immediate blank Unassigned task flow. Always-visible selection controls, same-column ranges, right-click actions, and outside-click feedback follow the updated selection requirements. Only explicitly selected children are rescheduled. Full-task copy establishes a source relationship; partial-text copy does not.

Current-source validation in Linux: **51 model/search tests, 6 SQLite storage tests, and 44 actual Electron desktop workflows passed**, with no skipped tests. The TypeScript/Vite build, formatting check, and diff whitespace check passed. These checks include same-column selection, Shift scrolling, native bulk clipboard/paste/synchronization, right-click calendar/Unassign, bidirectional drag moves, and outside-click feedback clearing. A Windows executable has not been built, signed, or run for these changes.

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
