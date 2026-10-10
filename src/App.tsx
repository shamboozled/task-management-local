import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckSquare,
  ChevronRight,
  Download,
  ImagePlus,
  Info,
  ListTodo,
  Plus,
  Table2,
  Upload,
  ArrowUpRight,
  IndentIncrease,
  IndentDecrease,
  Trash2,
  GripVertical,
  Search,
  Archive,
  PanelLeftClose,
  Link,
  FolderOpen,
} from "lucide-react";
import {
  type Notebook,
  type Bullet,
  type Task,
  uid,
  newBullet,
  tasksOf,
  updateBullet,
  editBullet,
  toggleBullet,
  moveDate,
  rollover,
  validateBackup,
  todayTitle,
  orderedBullets,
  pagePath,
} from "./model";
import { load, save, flush } from "./storage";
import { sanitize, tableHtml, imageHtml } from "./rich";
import Editor from "./Editor";
import SidebarTree from "./SidebarTree";
const fullDate = (s: string) =>
  `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}`;
function Tool({
  label,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export default function App() {
  const [db, setDb] = useState<Notebook | null>(null),
    [view, setView] = useState<{ type: "page" | "tasks"; id: string } | null>(
      null,
    ),
    [status, setStatus] = useState("Loading…"),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [sidebar, setSidebar] = useState(true),
    [extraDates, setExtraDates] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{
    title: string;
    label: string;
    value: string;
    submit: (value: string) => void;
  } | null>(null);
  const editor = useRef<HTMLDivElement | null>(null),
    focusedId = useRef<string | null>(null),
    selection = useRef<Range | null>(null),
    imageInput = useRef<HTMLInputElement>(null),
    backupInput = useRef<HTMLInputElement>(null);
  const latest = useRef<Notebook | null>(null);
  latest.current = db;
  const [dataLocation, setDataLocation] = useState<{
    database: string;
    backups: string;
  } | null>(null);
  useEffect(() => {
    window.notebookDesktop
      ?.location()
      .then(setDataLocation)
      .catch(() => {});
    return window.notebookDesktop?.onClose(() => {
      const state = latest.current;
      Promise.resolve(state ? save(state) : flush())
        .then(() => window.notebookDesktop?.closeReady())
        .catch((e) => {
          setError(
            "Could not finish saving. The notebook remains open: " + e.message,
          );
        });
    });
  }, []);
  useEffect(() => {
    load()
      .then((data) => {
        setDb(data);
        setView({ type: "tasks", id: data.activeListId });
      })
      .catch((e) => {
        setError("Local storage could not be opened: " + e.message);
        setStatus("Storage unavailable");
      });
  }, []);
  useEffect(() => {
    if (!db) return;
    let live = true;
    setStatus("Saving…");
    save(db)
      .then(() => {
        if (live) setStatus("Saved locally");
      })
      .catch((e) => {
        if (live) {
          setStatus("Save failed");
          setError("Could not save locally. Export a backup now. " + e.message);
        }
      });
    return () => {
      live = false;
    };
  }, [db]);
  useEffect(() => {
    const capture = () => {
      const s = window.getSelection();
      if (s?.rangeCount && editor.current?.contains(s.anchorNode))
        selection.current = s.getRangeAt(0).cloneRange();
    };
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, []);
  const change = (fn: (d: Notebook) => Notebook) =>
    setDb((d) => (d ? fn(d) : d));
  const patch = (id: string, fn: (b: Bullet) => Bullet) =>
    change((d) => updateBullet(d, id, fn));
  const ask = (
    title: string,
    label: string,
    value: string,
    submit: (s: string) => void,
  ) => setDialog({ title, label, value, submit });
  const createCustomer = () =>
    ask("New section", "Section name", "", (name) => {
      const customerId = uid(),
        sectionId = uid(),
        pageId = uid();
      change((d) => ({
        ...d,
        customers: [...d.customers, { id: customerId, name }],
        sections: [
          ...d.sections,
          { id: sectionId, customerId, name: "General calls" },
        ],
        pages: [
          ...d.pages,
          {
            id: pageId,
            sectionId,
            parentId: null,
            title: todayTitle(),
            bullets: [newBullet()],
          },
        ],
      }));
      setView({ type: "page", id: pageId });
    });
  const createPage = (sectionId: string, parentId: string | null = null) =>
    ask(
      parentId ? "New subpage" : "New notes page",
      "Page title",
      todayTitle(),
      (title) => {
        const id = uid();
        change((d) => ({
          ...d,
          pages: [
            ...d.pages,
            { id, sectionId, parentId, title, bullets: [newBullet()] },
          ],
        }));
        setView({ type: "page", id });
      },
    );
  const addBullet = (pageId: string, after?: Bullet) => {
    const bullet = newBullet(after?.parentId ?? null);
    change((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== pageId) return p;
        const bullets = [...p.bullets];
        let index = after
          ? bullets.findIndex((b) => b.id === after.id) + 1
          : bullets.length;
        const descendants = new Set(after ? [after.id] : []);
        while (
          index < bullets.length &&
          descendants.has(bullets[index].parentId ?? "")
        ) {
          descendants.add(bullets[index].id);
          index++;
        }
        bullets.splice(index, 0, bullet);
        return { ...p, bullets };
      }),
    }));
    setTimeout(
      () =>
        document
          .querySelector<HTMLElement>(
            `[data-bullet="${bullet.id}"] .rich-editor`,
          )
          ?.focus(),
      0,
    );
  };
  const indent = (pageId: string, b: Bullet, out = false) => {
    const el = document.querySelector<HTMLElement>(
      `[data-bullet="${b.id}"] .rich-editor`,
    );
    const selected = window.getSelection();
    const range =
      el && selected?.rangeCount && el.contains(selected.anchorNode)
        ? selected.getRangeAt(0).cloneRange()
        : null;
    change((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== pageId) return p;
        let parentId = b.parentId;
        if (out)
          parentId =
            p.bullets.find((x) => x.id === b.parentId)?.parentId ?? null;
        else {
          const siblings = p.bullets.filter((x) => x.parentId === b.parentId);
          const index = siblings.findIndex((x) => x.id === b.id);
          if (index > 0) parentId = siblings[index - 1].id;
        }
        return {
          ...p,
          bullets: p.bullets.map((x) =>
            x.id === b.id ? { ...x, parentId } : x,
          ),
        };
      }),
    }));
    requestAnimationFrame(() => {
      if (!el?.isConnected) return;
      el.focus();
      const current = window.getSelection();
      if (range && el.contains(range.commonAncestorContainer)) {
        current?.removeAllRanges();
        current?.addRange(range);
      } else {
        const caret = document.createRange();
        caret.selectNodeContents(el);
        caret.collapse(false);
        current?.removeAllRanges();
        current?.addRange(caret);
      }
    });
  };
  const remove = (pageId: string, b: Bullet) => {
    if (
      !confirm(
        "Delete this bullet and its nested bullets? Historical snapshots will be kept.",
      )
    )
      return;
    change((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== pageId) return p;
        const removed = new Set([b.id]);
        let previous = 0;
        while (previous !== removed.size) {
          previous = removed.size;
          p.bullets.forEach((x) => {
            if (x.parentId && removed.has(x.parentId)) removed.add(x.id);
          });
        }
        return { ...p, bullets: p.bullets.filter((x) => !removed.has(x.id)) };
      }),
    }));
  };
  const focusEditor = (id: string, el: HTMLDivElement) => {
    focusedId.current = id;
    editor.current = el;
  };
  const insert = (html: string) => {
    if (!editor.current || !focusedId.current) {
      setError("Click inside a bullet first.");
      return;
    }
    editor.current.focus();
    if (
      selection.current &&
      editor.current.contains(selection.current.commonAncestorContainer)
    ) {
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(selection.current);
    }
    document.execCommand("insertHTML", false, html);
    patch(focusedId.current, (b) => editBullet(b, editor.current!.innerHTML));
  };
  const tableAction = (
    action: "row" | "column" | "removeRow" | "removeColumn",
  ) => {
    const anchor = window.getSelection()?.anchorNode;
    const cell = (
      anchor instanceof Element ? anchor : anchor?.parentElement
    )?.closest("td,th") as HTMLTableCellElement | null;
    if (!cell || !editor.current?.contains(cell)) {
      setError("Click inside a table cell first.");
      return;
    }
    const table = cell.closest("table")!,
      row = cell.parentElement as HTMLTableRowElement;
    const index = cell.cellIndex;
    if (action === "row") {
      const next = table.insertRow(row.rowIndex + 1);
      for (let i = 0; i < row.cells.length; i++)
        next.insertCell().innerHTML = "<br>";
    }
    if (action === "column")
      Array.from(table.rows).forEach((r) => {
        r.insertCell(index + 1).innerHTML = "<br>";
      });
    if (action === "removeRow") {
      if (table.rows.length === 1) table.remove();
      else row.remove();
    }
    if (action === "removeColumn") {
      if (row.cells.length === 1) table.remove();
      else Array.from(table.rows).forEach((r) => r.cells[index]?.remove());
    }
    if (focusedId.current)
      patch(focusedId.current, (b) => editBullet(b, editor.current!.innerHTML));
  };
  const exportBackup = async () => {
    if (!db) return;
    try {
      await flush();
      await window.notebookDesktop?.export(db);
    } catch (e) {
      setError("Could not export backup: " + (e as Error).message);
    }
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 100 * 1024 * 1024) throw Error("Backup exceeds 100 MB.");
      const data = validateBackup(JSON.parse(await file.text()));
      data.pages.forEach((p) =>
        p.bullets.forEach((b) => {
          b.html = sanitize(b.html);
        }),
      );
      data.taskLists.forEach((l) =>
        l.snapshot?.forEach((t) => {
          t.bullet.html = sanitize(t.bullet.html);
          t.information.forEach((i) => {
            i.bullet.html = sanitize(i.bullet.html);
          });
        }),
      );
      if (
        !confirm(
          "Restore this backup? It replaces the current notebook. A local safety backup will be saved first.",
        )
      )
        return;
      await flush();
      await window.notebookDesktop?.backup("restore");
      await save(data);
      setDb(data);
      setView({ type: "tasks", id: data.activeListId });
      setError("");
    } catch (e) {
      setError("Backup could not be restored: " + (e as Error).message);
    }
  };
  if (!db || !view)
    return (
      <div className="loading">
        <BookOpen size={36} />
        <h1>Task Notebook</h1>
        <p>{error || "Opening your notebook…"}</p>
      </div>
    );
  const page =
    view.type === "page" ? db.pages.find((p) => p.id === view.id) : undefined;
  const list =
    view.type === "tasks"
      ? db.taskLists.find((l) => l.id === view.id)
      : undefined;
  const readOnly = !!list?.snapshot;
  const allTasks = list?.snapshot ?? tasksOf(db);
  const filtered = allTasks.filter(
    (t) =>
      !query ||
      [
        t.bullet.html,
        t.customerName,
        t.pageTitle,
        ...t.information.map((i) => i.bullet.html),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const dates = [
    ...new Set([
      ...filtered.map((t) => t.bullet.dueDate).filter((d): d is string => !!d),
      ...(!readOnly ? extraDates : []),
    ]),
  ].sort();
  const section = page
    ? db.sections.find((s) => s.id === page.sectionId)
    : undefined;
  const customer = section
    ? db.customers.find((c) => c.id === section.customerId)
    : undefined;
  const toggle = (b: Bullet) => patch(b.id, toggleBullet);
  const selectedCell = () => {
    const anchor = window.getSelection()?.anchorNode;
    return (
      anchor instanceof Element ? anchor : anchor?.parentElement
    )?.closest("td,th");
  };
  const keys = (
    b: Bullet,
    e: React.KeyboardEvent<HTMLDivElement>,
    pageId?: string,
  ) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      toggle(b);
    } else if (
      pageId &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !((e.target as Element).closest("td,th") || selectedCell())
    ) {
      e.preventDefault();
      addBullet(pageId, b);
    } else if (pageId && e.key === "Tab") {
      e.preventDefault();
      indent(pageId, b, e.shiftKey);
    }
  };
  const renderBullet = (b: Bullet, pageId?: string) => (
    <div
      className={`bullet-row ${b.completed ? "completed" : ""}`}
      key={b.id}
      data-bullet={b.id}
    >
      {b.kind === "task" ? (
        <input
          className="task-check"
          aria-label="Complete task"
          type="checkbox"
          checked={b.completed}
          disabled={readOnly}
          onChange={(e) =>
            patch(b.id, (x) => ({ ...x, completed: e.target.checked }))
          }
        />
      ) : (
        <span className="info-dot" title="Information">
          •
        </span>
      )}
      <Editor
        html={b.html}
        label={b.kind === "task" ? "Task text" : "Information text"}
        readOnly={readOnly}
        onChange={(html) => {
          if (!readOnly) patch(b.id, (x) => editBullet(x, html));
        }}
        onFocus={(el) => focusEditor(b.id, el)}
        onKey={(e) => keys(b, e, pageId)}
      />
      {!readOnly && (
        <div className="bullet-actions">
          <Tool
            label={
              b.kind === "task" ? "Convert to information" : "Convert to task"
            }
            onClick={() => toggle(b)}
          >
            {b.kind === "task" ? <Info size={16} /> : <CheckSquare size={16} />}
          </Tool>
          {pageId && (
            <>
              <Tool label="Indent bullet" onClick={() => indent(pageId, b)}>
                <IndentIncrease size={16} />
              </Tool>
              <Tool
                label="Outdent bullet"
                onClick={() => indent(pageId, b, true)}
              >
                <IndentDecrease size={16} />
              </Tool>
              <Tool label="Delete bullet" onClick={() => remove(pageId, b)}>
                <Trash2 size={15} />
              </Tool>
            </>
          )}
        </div>
      )}
    </div>
  );
  const renderNotes = () =>
    page &&
    orderedBullets(page).map(({ bullet, depth }) => (
      <div
        key={bullet.id}
        className="note-node"
        style={{ marginLeft: depth * 24 }}
      >
        {renderBullet(bullet, page.id)}
      </div>
    ));
  const taskCard = (task: Task) => (
    <article
      key={task.bullet.id}
      className="task-card"
      data-task={task.bullet.id}
    >
      <div className="task-source">
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData("text/plain", task.bullet.id)
            }
            className="drag-handle"
            title="Drag to a date group or Unassigned"
          >
            <GripVertical size={16} />
          </span>
        )}
        <span>{task.customerName}</span>
        <button
          onClick={() => {
            setView({ type: "page", id: task.pageId });
            setQuery("");
            setTimeout(
              () =>
                document
                  .querySelector<HTMLElement>(
                    `[data-bullet="${task.bullet.id}"]`,
                  )
                  ?.scrollIntoView({ behavior: "smooth", block: "center" }),
              50,
            );
          }}
        >
          {task.pageTitle}
          <ArrowUpRight size={13} />
        </button>
      </div>
      {renderBullet(task.bullet)}
      {task.information.length > 0 && (
        <div className="attached-info">
          {task.information.map((i) => (
            <div key={i.bullet.id} style={{ marginLeft: i.depth * 18 }}>
              {renderBullet(i.bullet)}
            </div>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="schedule-control">
          <label>
            Due date
            <input
              type="date"
              aria-label="Task due date"
              value={task.bullet.dueDate ?? ""}
              onChange={(e) =>
                patch(task.bullet.id, (b) =>
                  moveDate(b, e.target.value || null),
                )
              }
            />
          </label>
          {task.bullet.dueDate && (
            <button
              onClick={() => patch(task.bullet.id, (b) => moveDate(b, null))}
            >
              Unassign
            </button>
          )}
        </div>
      )}
    </article>
  );
  const drop = (e: React.DragEvent, date: string | null) => {
    e.preventDefault();
    if (readOnly) return;
    const id = e.dataTransfer.getData("text/plain");
    if (!tasksOf(db).some((t) => t.bullet.id === id)) return;
    patch(id, (b) => moveDate(b, date));
  };
  return (
    <div className={`app ${sidebar ? "" : "sidebar-hidden"}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={23} />
          </div>
          <div>
            Task Notebook<small>A little more organized.</small>
          </div>
        </div>
        <div className="sidebar-label">
          WORKSPACE <span className="local-badge">LOCAL</span>
        </div>
        <button
          className={`nav-primary ${view.type === "tasks" && view.id === db.activeListId ? "selected" : ""}`}
          onClick={() => setView({ type: "tasks", id: db.activeListId })}
        >
          <ListTodo size={18} />
          Current task list
          <span className="count">
            {tasksOf(db).filter((t) => !t.bullet.completed).length}
          </span>
        </button>
        <div className="sidebar-heading">
          SECTIONS
          <Tool label="New section" onClick={createCustomer}>
            <Plus size={16} />
          </Tool>
        </div>
        <SidebarTree
          db={db}
          view={view}
          change={change}
          ask={ask}
          createPage={createPage}
          openPage={(id) => {
            setView({ type: "page", id });
            setQuery("");
          }}
        />
        <div className="sidebar-heading history-heading">TASK LIST PAGES</div>
        <div className="history-list">
          {[...db.taskLists].reverse().map((l) => (
            <button
              key={l.id}
              className={`page-link ${view.type === "tasks" && view.id === l.id ? "selected" : ""}`}
              onClick={() => {
                setView({ type: "tasks", id: l.id });
                setQuery("");
              }}
            >
              {l.snapshot ? <Archive size={14} /> : <ListTodo size={14} />}
              <span>{l.title}</span>
              {l.id === db.activeListId && <span className="live-dot" />}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <span>
            <span className="save-dot" />
            {status}
          </span>
          <div>
            <Tool
              label="Open data folder"
              onClick={() =>
                window.notebookDesktop
                  ?.openDataFolder()
                  .catch((e) => setError(e.message))
              }
            >
              <FolderOpen size={16} />
            </Tool>
            <Tool label="Export backup" onClick={exportBackup}>
              <Download size={16} />
            </Tool>
            <Tool
              label="Restore backup"
              onClick={() => backupInput.current?.click()}
            >
              <Upload size={16} />
            </Tool>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <Tool label="Toggle sidebar" onClick={() => setSidebar(!sidebar)}>
              <PanelLeftClose size={18} />
            </Tool>
            <span>{page ? customer?.name : "Workspace"}</span>
            <ChevronRight size={14} />
            <span>{page ? section?.name : "Task lists"}</span>
            {page ? (
              pagePath(db, page).map((p) => (
                <span className="breadcrumb-item" key={p.id}>
                  <ChevronRight size={14} />
                  <button
                    aria-current={p.id === page.id ? "page" : undefined}
                    onClick={() => setView({ type: "page", id: p.id })}
                  >
                    {p.title}
                  </button>
                </span>
              ))
            ) : (
              <span className="breadcrumb-item">
                <ChevronRight size={14} />
                <span>{list?.title}</span>
              </span>
            )}
          </div>
          <span className="privacy">
            <span className="save-dot" />
            Private · on this device
          </span>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              {readOnly && <div className="eyebrow">HISTORICAL SNAPSHOT</div>}
              <h1>{page?.title ?? list?.title}</h1>
              {readOnly && (
                <p>
                  A read-only record of this list before the next page was
                  created.
                </p>
              )}
            </div>
            <div className="heading-actions">
              {page ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      ask("Rename page", "Page title", page.title, (title) =>
                        change((d) => ({
                          ...d,
                          pages: d.pages.map((p) =>
                            p.id === page.id ? { ...p, title } : p,
                          ),
                        })),
                      )
                    }
                  >
                    Rename
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => createPage(page.sectionId, page.id)}
                  >
                    <Plus size={16} />
                    Subpage
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button secondary"
                    onClick={() =>
                      ask(
                        "Rename task list",
                        "Page title",
                        list!.title,
                        (title) =>
                          change((d) => ({
                            ...d,
                            taskLists: d.taskLists.map((l) =>
                              l.id === list!.id ? { ...l, title } : l,
                            ),
                          })),
                      )
                    }
                  >
                    Rename
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      ask(
                        "New task-list page",
                        "Page title",
                        todayTitle(),
                        (title) => {
                          const next = rollover(db, title);
                          setDb(next);
                          setView({ type: "tasks", id: next.activeListId });
                          setExtraDates([]);
                        },
                      )
                    }
                  >
                    <Plus size={16} />
                    New task-list page
                  </button>
                </>
              )}
            </div>
          </div>
          {page ? (
            <>
              <div className="editor-toolbar">
                <Tool
                  label="Bold"
                  onClick={() => {
                    editor.current?.focus();
                    document.execCommand("bold");
                  }}
                >
                  <strong>B</strong>
                </Tool>
                <Tool
                  label="Italic"
                  onClick={() => {
                    editor.current?.focus();
                    document.execCommand("italic");
                  }}
                >
                  <em>I</em>
                </Tool>
                <Tool
                  label="Insert hyperlink"
                  onClick={() => {
                    if (!editor.current || !focusedId.current) {
                      setError("Click inside a bullet first.");
                      return;
                    }
                    ask("Insert hyperlink", "Web address", "", (url) => {
                      try {
                        const href = new URL(
                          /^(https?:|mailto:)/i.test(url)
                            ? url
                            : "https://" + url,
                        );
                        if (
                          !["http:", "https:", "mailto:"].includes(
                            href.protocol,
                          )
                        )
                          throw Error("Use an http, https, or mailto link.");
                        const anchor = document.createElement("a");
                        anchor.href = href.href;
                        anchor.textContent =
                          selection.current?.toString() || url;
                        anchor.target = "_blank";
                        anchor.rel = "noopener noreferrer";
                        insert(anchor.outerHTML);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    });
                  }}
                >
                  <Link size={18} />
                </Tool>
                <span className="toolbar-divider" />
                <Tool
                  label="Insert image"
                  onClick={() => imageInput.current?.click()}
                >
                  <ImagePlus size={18} />
                </Tool>
                <Tool
                  label="Insert table"
                  onClick={() => insert(tableHtml(3, 3))}
                >
                  <Table2 size={18} />
                </Tool>
                <Tool label="Add table row" onClick={() => tableAction("row")}>
                  <span>+ row</span>
                </Tool>
                <Tool
                  label="Add table column"
                  onClick={() => tableAction("column")}
                >
                  <span>+ col</span>
                </Tool>
                <Tool
                  label="Remove table row"
                  onClick={() => tableAction("removeRow")}
                >
                  <span>− row</span>
                </Tool>
                <Tool
                  label="Remove table column"
                  onClick={() => tableAction("removeColumn")}
                >
                  <span>− col</span>
                </Tool>
                <span className="toolbar-font">Calibri · 12 pt</span>
              </div>
              <div className="notes-sheet">
                {renderNotes()}
                <button className="add-note" onClick={() => addBullet(page.id)}>
                  <Plus size={16} />
                  Add information bullet
                </button>
              </div>
              <div className="editor-help">
                <span>
                  <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> toggle
                  task
                </span>
                <span>
                  <kbd>Tab</kbd> indent · <kbd>Shift Tab</kbd> outdent
                </span>
                <span>Enter adds a bullet · Shift Enter adds a line</span>
              </div>
            </>
          ) : (
            <>
              <div className="task-overview">
                <div>
                  <span className="metric">
                    {allTasks.filter((t) => !t.bullet.completed).length}
                  </span>
                  open tasks
                </div>
                <div>
                  <span className="metric">
                    {
                      allTasks.filter(
                        (t) => t.bullet.dueDate && !t.bullet.completed,
                      ).length
                    }
                  </span>
                  scheduled
                </div>
                <div>
                  <span className="metric">
                    {allTasks.filter((t) => t.bullet.completed).length}
                  </span>
                  completed
                </div>
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search tasks"
                    placeholder="Search tasks or sections…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              {readOnly && (
                <div className="snapshot-banner">
                  <Archive size={16} />
                  Frozen snapshot ·{" "}
                  {new Date(list!.createdAt).toLocaleDateString()} · Edits in
                  source notes will not change this page.
                </div>
              )}
              <div className="task-columns">
                <section
                  className="task-column"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, null)}
                >
                  <div className="column-heading">
                    <div>
                      <span className="column-dot unassigned" />
                      <h2>Unassigned</h2>
                      <span className="column-count">
                        {filtered.filter((t) => !t.bullet.dueDate).length}
                      </span>
                    </div>
                    <span>No due date</span>
                  </div>
                  {filtered.filter((t) => !t.bullet.dueDate).map(taskCard)}
                  {!filtered.some((t) => !t.bullet.dueDate) && (
                    <div className="empty-column">
                      <ListTodo size={25} />
                      <h3>A place for the next step</h3>
                      <p>
                        Tasks without dates appear here. Add one in your section
                        notes.
                      </p>
                    </div>
                  )}
                </section>
                <section className="task-column">
                  <div className="column-heading">
                    <div>
                      <span className="column-dot priority" />
                      <h2>Priority list</h2>
                      <span className="column-count">
                        {filtered.filter((t) => !!t.bullet.dueDate).length}
                      </span>
                    </div>
                    {!readOnly && (
                      <label className="add-date">
                        Add date
                        <input
                          type="date"
                          aria-label="Add date group"
                          onChange={(e) => {
                            if (e.target.value)
                              setExtraDates((ds) => [...ds, e.target.value]);
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {dates.map((date) => (
                    <div
                      key={date}
                      className="date-group"
                      data-date={date}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => drop(e, date)}
                    >
                      <h3>
                        {fullDate(date)}
                        <span>
                          {
                            filtered.filter((t) => t.bullet.dueDate === date)
                              .length
                          }{" "}
                          tasks
                        </span>
                      </h3>
                      {filtered
                        .filter((t) => t.bullet.dueDate === date)
                        .map(taskCard)}
                      {!filtered.some((t) => t.bullet.dueDate === date) && (
                        <div className="drop-hint">
                          Drop a task here to schedule it
                        </div>
                      )}
                    </div>
                  ))}
                  {!dates.length && (
                    <div className="empty-column">
                      <CheckSquare size={25} />
                      <h3>Make room for what matters</h3>
                      <p>
                        Add a date group, then drag a task here. Dates in task
                        text also schedule it automatically.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
        <footer
          className="main-footer"
          title={
            dataLocation
              ? `Database: ${dataLocation.database}\nBackups: ${dataLocation.backups}`
              : undefined
          }
        >
          <BookOpen size={14} />
          Task Notebook<span>Local notes. Clear next steps.</span>
        </footer>
      </main>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f)
            try {
              insert(await imageHtml(f));
            } catch (err) {
              setError((err as Error).message);
            }
          e.target.value = "";
        }}
      />
      <input
        ref={backupInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importBackup(f);
          e.target.value = "";
        }}
      />
      {dialog && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDialog(null);
          }}
        >
          <form
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            onSubmit={(e) => {
              e.preventDefault();
              const value = dialog.value.trim();
              if (!value) return;
              dialog.submit(value);
              setDialog(null);
            }}
          >
            <h2>{dialog.title}</h2>
            <label>
              {dialog.label}
              <input
                autoFocus
                required
                maxLength={120}
                value={dialog.value}
                onChange={(e) =>
                  setDialog({ ...dialog, value: e.target.value })
                }
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Check size={16} />
                Create / save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
