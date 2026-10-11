import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  ChevronDown,
} from "lucide-react";
import {
  type Notebook,
  type Page,
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
  identity,
  editPage,
  deleteBullets,
  descendants,
  canComplete,
  removeNavigation,
  reorderTask,
  quickDate,
  textOf,
} from "./model";
import { load, save, flush } from "./storage";
import { sanitize, tableHtml, imageHtml, plainHtml, linkify } from "./rich";
import {
  copyBullets,
  pasteBullets,
  readBulletClipboard,
  clipboardHtml,
  bulletMime,
} from "./clipboard";
import {
  editorAt,
  currentRange,
  caretOffset,
  setCaret,
  selectedEditors,
  wholeEditorSelected,
  splitHtml,
  isBlank,
  insertHtml,
} from "./selection";
import Editor from "./Editor";
import SidebarTree from "./SidebarTree";
import PageSearchPanel from "./PageSearchPanel";
import { highlightRanges, type SearchMatch } from "./pageSearch";
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
      contentEditable={false}
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
  const [pageSearchOpen, setPageSearchOpen] = useState(false);
  const pageSearchInput = useRef<HTMLInputElement>(null);
  const [searchTarget, setSearchTarget] = useState<{
    pageId: string;
    bulletId: string | null;
    terms: string[];
  } | null>(null);
  const launchPageSearch = () => {
    if (!latest.current) return;
    setPageSearchOpen(true);
    pageSearchInput.current?.focus();
    pageSearchInput.current?.select();
  };
  const closePageSearch = () => {
    setPageSearchOpen(false);
    setSearchTarget(null);
  };
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
  type History = {
    db: Notebook;
    view: { type: "page" | "tasks"; id: string } | null;
    id: string | null;
    offset: number;
  };
  const history = useRef<{
    past: History[];
    future: History[];
    group: string;
    time: number;
  }>({ past: [], future: [], group: "", time: 0 });
  const notesHost = useRef<HTMLDivElement>(null);
  const pendingDates = useRef(new Set<string>());
  const previousEnter = useRef<string | null>(null);
  const focusCard = useRef<string | null>(null);
  const pendingFocus = useRef<{
    id: string;
    offset: number | "end";
    card: string | null;
  } | null>(null);
  const remember = (): History | null =>
    latest.current
      ? {
          db: latest.current,
          view,
          id: focusedId.current,
          offset: editor.current ? caretOffset(editor.current) : 0,
        }
      : null;
  const restoreFocus = () => {
    const target = pendingFocus.current;
    if (!target) return;
    const selector = `[data-bullet="${target.id}"] .rich-editor`;
    const el =
      (target.card
        ? document.querySelector<HTMLDivElement>(
            `[data-task-context="${target.card}"] ${selector}`,
          )
        : null) ?? document.querySelector<HTMLDivElement>(selector);
    if (!el) {
      pendingFocus.current = null;
      return;
    }
    if (el) {
      pendingFocus.current = null;
      focusedId.current = target.id;
      editor.current = el;
      setCaret(el, target.offset);
    }
  };
  const focus = (id: string | null, offset: number | "end" = "end") => {
    if (!id) {
      pendingFocus.current = null;
      return;
    }
    pendingFocus.current = { id, offset, card: focusCard.current };
    requestAnimationFrame(restoreFocus);
  };
  useLayoutEffect(restoreFocus);
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
      let state = latest.current;
      if (state)
        for (const id of pendingDates.current)
          state = updateBullet(state, id, (b) => editBullet(b, b.html));
      pendingDates.current.clear();
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
  const change = (fn: (d: Notebook) => Notebook, group = "") => {
    const prior = remember();
    if (!prior) return;
    let next: Notebook;
    try {
      next = fn(prior.db);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    if (next === prior.db) return;
    const now = Date.now();
    if (
      !group ||
      history.current.group !== group ||
      now - history.current.time > 700
    ) {
      history.current.past.push(prior);
      if (history.current.past.length > 100) history.current.past.shift();
    }
    history.current.future = [];
    history.current.group = group;
    history.current.time = now;
    latest.current = next;
    setDb(next);
  };
  const undo = (redo = false) => {
    const current = remember();
    if (!current) return;
    const from = redo ? history.current.future : history.current.past;
    const to = redo ? history.current.past : history.current.future;
    const prior = from.pop();
    if (!prior) return;
    to.push(current);
    history.current.group = "";
    pendingDates.current.clear();
    latest.current = prior.db;
    setDb(prior.db);
    if (prior.view) setView(prior.view);
    focus(prior.id, prior.offset);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (dialog || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "f" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        launchPageSearch();
        return;
      }
      if ((e.target as Element).closest(".page-search-panel")) return;
      if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") {
        e.preventDefault();
        e.stopPropagation();
        undo(e.shiftKey || e.key.toLowerCase() === "y");
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  });
  useEffect(() => {
    CSS.highlights.delete("page-search-match");
    if (
      !searchTarget ||
      view?.type !== "page" ||
      view.id !== searchTarget.pageId
    )
      return;
    const target =
      searchTarget.bulletId !== null
        ? notesHost.current?.querySelector<HTMLElement>(
            `[data-bullet="${CSS.escape(searchTarget.bulletId)}"] .rich-editor`,
          )
        : document.querySelector<HTMLElement>(".page-heading h1");
    if (!target) return;
    const ranges = highlightRanges(target, searchTarget.terms);
    CSS.highlights.set("page-search-match", new Highlight(...ranges));
    const matchRect = ranges[0]?.getBoundingClientRect();
    if (matchRect?.height) {
      window.scrollBy({
        top: matchRect.top + matchRect.height / 2 - window.innerHeight / 2,
        behavior: "smooth",
      });
    } else target.scrollIntoView({ block: "center", behavior: "smooth" });
    const clear = () => {
      CSS.highlights.delete("page-search-match");
      setSearchTarget(null);
    };
    const timer = window.setTimeout(clear, 8000);
    const before = (e: Event) => {
      if ((e.target as Element).closest(".notes-sheet")) clear();
    };
    document.addEventListener("beforeinput", before);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("beforeinput", before);
      CSS.highlights.delete("page-search-match");
    };
  }, [searchTarget, view?.id]);
  const openSearchResult = (
    pageId: string,
    match: SearchMatch,
    terms: string[],
  ) => {
    const state = latest.current;
    const page = state?.pages.find((p) => p.id === pageId);
    if (!state || !page) return;
    const subsection = state.sections.find((s) => s.id === page.sectionId)!;
    const ancestors = new Set<string>();
    let parent = page.bullets.find((b) => b.id === match.bulletId)?.parentId;
    while (parent) {
      const bullet = page.bullets.find((b) => b.id === parent)!;
      ancestors.add(identity(bullet));
      parent = bullet.parentId;
    }
    const ui = state.ui;
    if (
      ui &&
      (ui.collapsedSections.includes(subsection.customerId) ||
        ui.collapsedSubsections.includes(subsection.id) ||
        ui.collapsedBullets?.some((id) => ancestors.has(id)))
    ) {
      // Revealing a search result changes view preferences, without adding a
      // notebook edit to the undo history or changing linked task provenance.
      const next = {
        ...state,
        ui: {
          ...ui,
          collapsedSections: ui.collapsedSections.filter(
            (id) => id !== subsection.customerId,
          ),
          collapsedSubsections: ui.collapsedSubsections.filter(
            (id) => id !== subsection.id,
          ),
          collapsedBullets: (ui.collapsedBullets ?? []).filter(
            (id) => !ancestors.has(id),
          ),
        },
      };
      latest.current = next;
      setDb(next);
    }
    setView({ type: "page", id: pageId });
    setQuery("");
    setSearchTarget({ pageId, bulletId: match.bulletId, terms });
  };
  const patch = (
    id: string,
    fn: (b: Bullet) => Bullet,
    pageId?: string,
    group = "",
  ) => change((d) => updateBullet(d, id, fn, pageId), group);
  const commit = (id: string, html: string) => {
    if (!pendingDates.current.has(id)) return;
    pendingDates.current.delete(id);
    const state = latest.current;
    if (!state) return;
    const source = state.pages
      .flatMap((p) => p.bullets)
      .find((b) => b.id === id);
    if (!source) return;
    const edited = editBullet(source, html);
    if (edited.html === source.html && edited.dueDate === source.dueDate)
      return;
    const next = updateBullet(state, id, () => edited);
    latest.current = next;
    setDb(next);
  };
  const editText = (id: string, html: string, pageId?: string) => {
    if (
      latest.current?.pages.flatMap((p) => p.bullets).find((b) => b.id === id)
        ?.html === html
    )
      return;
    pendingDates.current.add(id);
    patch(id, (b) => ({ ...b, html }), pageId, `text:${id}`);
  };
  useEffect(() => {
    const capture = () => {
      const el = editorAt(window.getSelection()?.focusNode ?? null);
      const id = el?.closest<HTMLElement>("[data-bullet]")?.dataset.bullet;
      if (!el || !id) return;
      if (focusedId.current && focusedId.current !== id && editor.current)
        commit(focusedId.current, linkify(sanitize(editor.current.innerHTML)));
      focusedId.current = id;
      editor.current = el;
      const r = currentRange();
      if (r) selection.current = r.cloneRange();
    };
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  });
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
    change((d) =>
      editPage(d, pageId, (p) => {
        const bullets = [...p.bullets];
        const family = after ? descendants(p, after.id) : [];
        const index = after
          ? Math.max(
              bullets.findIndex((b) => b.id === after.id),
              ...family.map((b) => bullets.findIndex((x) => x.id === b.id)),
            ) + 1
          : bullets.length;
        bullets.splice(index, 0, bullet);
        return { ...p, bullets };
      }),
    );
    focus(bullet.id, 0);
    previousEnter.current = null;
  };
  const indent = (
    pageId: string,
    b: Bullet,
    out = false,
    activeEditor?: HTMLDivElement,
    contextId?: string,
  ) => {
    const el =
      activeEditor ??
      document.querySelector<HTMLDivElement>(
        `[data-bullet="${b.id}"] .rich-editor`,
      );
    const offset = el ? caretOffset(el) : 0;
    change((d) => {
      const next = editPage(d, pageId, (p) => {
        let parentId = b.parentId;
        if (out)
          parentId =
            p.bullets.find((x) => x.id === b.parentId)?.parentId ?? null;
        else {
          const siblings = p.bullets.filter((x) => x.parentId === b.parentId);
          const index = siblings.findIndex((x) => x.id === b.id);
          if (index > 0) parentId = siblings[index - 1].id;
        }
        if (parentId === b.parentId) return p;
        return {
          ...p,
          bullets: p.bullets.map((x) =>
            x.id === b.id
              ? {
                  ...x,
                  parentId,
                  taskListContextId: contextId ?? x.taskListContextId,
                }
              : x,
          ),
        };
      });
      if (!contextId || next === d) return next;
      const source = next.pages.find((p) => p.id === pageId)!;
      const ancestors = new Set<string>();
      let parent = source.bullets.find((x) => x.id === b.id)?.parentId;
      while (parent) {
        const ancestor = source.bullets.find((x) => x.id === parent)!;
        ancestors.add(identity(ancestor));
        parent = ancestor.parentId;
      }
      const hidden = next.ui?.collapsedBullets ?? [];
      if (!hidden.some((id) => ancestors.has(id))) return next;
      return {
        ...next,
        ui: {
          collapsedSections: next.ui?.collapsedSections ?? [],
          collapsedSubsections: next.ui?.collapsedSubsections ?? [],
          collapsedBullets: hidden.filter((id) => !ancestors.has(id)),
        },
      };
    });
    if (contextId) focus(b.id, offset);
    else if (el) setCaret(el, offset);
  };
  const remove = (pageId: string, b: Bullet) => {
    const p = latest.current?.pages.find((p) => p.id === pageId);
    if (!p) return;
    const ordered = notesHost.current
      ? [...notesHost.current.querySelectorAll<HTMLDivElement>(".rich-editor")]
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            bullet: p.bullets.find(
              (b) =>
                b.id ===
                el.closest<HTMLElement>("[data-bullet]")?.dataset.bullet,
            )!,
          }))
          .filter((x) => x.bullet)
      : orderedBullets(p);
    const at = ordered.findIndex((x) => x.bullet.id === b.id);
    const prior = ordered[at - 1]?.bullet.id;
    let fallback: string | null = prior ?? ordered[at + 1]?.bullet.id ?? null;
    change((d) => {
      let next = deleteBullets(d, pageId, [b.id]);
      if (!next.pages.find((p) => p.id === pageId)!.bullets.length) {
        const empty = newBullet();
        fallback = empty.id;
        next = editPage(next, pageId, (p) => ({ ...p, bullets: [empty] }));
      }
      return next;
    });
    pendingDates.current.delete(b.id);
    focus(fallback);
  };
  const selectedIds = () => {
    const host =
      notesHost.current ?? document.querySelector<HTMLElement>(".task-columns");
    return host
      ? selectedEditors(host).map(
          (el) => el.closest<HTMLElement>("[data-bullet]")!.dataset.bullet!,
        )
      : [];
  };
  const deleteSelection = (replacement = "") => {
    const state = latest.current;
    const p = state?.pages.find((p) => p.id === view?.id);
    const range = currentRange();
    const elements = notesHost.current
      ? selectedEditors(notesHost.current)
      : [];
    if (!state || !p || !range || range.collapsed || !elements.length)
      return false;
    const ids = elements.map(
      (el) => el.closest<HTMLElement>("[data-bullet]")!.dataset.bullet!,
    );
    if (elements.length === 1 && !wholeEditorSelected(elements[0]))
      return false;
    const first = elements[0],
      last = elements.at(-1)!;
    const before = document.createElement("div"),
      after = document.createElement("div");
    const a = document.createRange();
    a.selectNodeContents(first);
    if (first.contains(range.startContainer)) {
      a.setEnd(range.startContainer, range.startOffset);
      before.append(a.cloneContents());
    }
    const z = document.createRange();
    z.selectNodeContents(last);
    if (last.contains(range.endContainer)) {
      z.setStart(range.endContainer, range.endOffset);
      after.append(z.cloneContents());
    }
    const html = sanitize(
      before.innerHTML + plainHtml(replacement) + after.innerHTML,
    );
    if (isBlank(html)) {
      const ordered = orderedBullets(p),
        index = ordered.findIndex((x) => x.bullet.id === ids[0]);
      let target: string | null = ordered[index - 1]?.bullet.id ?? null;
      change((d) => {
        let next = deleteBullets(d, p.id, ids);
        const updated = next.pages.find((x) => x.id === p.id)!;
        if (!updated.bullets.length) {
          const empty = newBullet();
          target = empty.id;
          next = editPage(next, p.id, (x) => ({ ...x, bullets: [empty] }));
        } else target ??= updated.bullets[0].id;
        return next;
      });
      focus(target);
    } else {
      change((d) => {
        const next = deleteBullets(d, p.id, ids.slice(1));
        return updateBullet(next, ids[0], (b) => editBullet(b, html), p.id);
      });
      focus(ids[0], (before.textContent?.length ?? 0) + replacement.length);
    }
    return true;
  };
  const enterBullet = (
    p: Page,
    b: Bullet,
    el: HTMLDivElement,
    contextId = b.taskListContextId,
  ) => {
    if (isBlank(el.innerHTML) && previousEnter.current === b.id) {
      if (b.parentId) indent(p.id, b, true);
      else {
        const bullet = { ...newBullet(b.id), taskListContextId: contextId };
        change((d) =>
          editPage(d, p.id, (x) => {
            const bullets = [...x.bullets];
            bullets.splice(
              bullets.findIndex((x) => x.id === b.id) + 1,
              0,
              bullet,
            );
            return { ...x, bullets };
          }),
        );
        focus(bullet.id, 0);
        previousEnter.current = bullet.id;
      }
      return;
    }
    const { before, after } = splitHtml(el);
    const atStart = isBlank(before) && !isBlank(el.innerHTML);
    const middle = !atStart && !isBlank(after);
    const bullet = {
      ...newBullet(b.parentId),
      taskListContextId: contextId,
      html: middle ? sanitize(after) : "",
    };
    change((d) =>
      editPage(d, p.id, (x) => {
        let bullets = [...x.bullets];
        const index = bullets.findIndex((x) => x.id === b.id);
        if (atStart) bullets.splice(index, 0, bullet);
        else if (middle) {
          bullets = bullets.map((x) =>
            x.id === b.id
              ? editBullet(x, sanitize(before))
              : x.parentId === b.id
                ? { ...x, parentId: bullet.id }
                : x,
          );
          bullets.splice(index + 1, 0, bullet);
        } else {
          const end =
            Math.max(
              index,
              ...descendants(x, b.id).map((child) =>
                bullets.findIndex((x) => x.id === child.id),
              ),
            ) + 1;
          bullets.splice(end, 0, bullet);
        }
        return { ...x, bullets };
      }),
    );
    focus(bullet.id, 0);
    previousEnter.current = bullet.id;
  };
  const notesKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el =
      editorAt(window.getSelection()?.focusNode ?? null) ?? editor.current;
    const id = el?.closest<HTMLElement>("[data-bullet]")?.dataset.bullet;
    const p = latest.current?.pages.find((p) => p.id === view?.id);
    const b = p?.bullets.find((b) => b.id === id);
    if (!el || !b || !p) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key !== "Enter" || e.shiftKey || mod) previousEnter.current = null;
    if (mod && e.key.toLowerCase() === "t") {
      e.preventDefault();
      const ids = selectedIds();
      const keys = new Set<string>();
      change((d) =>
        (ids.length ? ids : [b.id]).reduce((next, id) => {
          const bullet = p.bullets.find((b) => b.id === id)!;
          const key = identity(bullet);
          if (keys.has(key)) return next;
          keys.add(key);
          return updateBullet(next, id, toggleBullet, p.id);
        }, d),
      );
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      const range = document.createRange();
      if (wholeEditorSelected(el) || selectedIds().length > 1) {
        const editors = [
          ...notesHost.current!.querySelectorAll<HTMLDivElement>(
            ".rich-editor",
          ),
        ].filter((x) => x.getClientRects().length);
        range.setStart(editors[0], 0);
        range.setEnd(editors.at(-1)!, editors.at(-1)!.childNodes.length);
      } else range.selectNodeContents(el);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      indent(p.id, b, e.shiftKey);
      return;
    }
    const range = currentRange();
    if (
      ["Backspace", "Delete"].includes(e.key) &&
      range &&
      !range.collapsed &&
      deleteSelection()
    ) {
      e.preventDefault();
      return;
    }
    if (["Backspace", "Delete"].includes(e.key) && isBlank(el.innerHTML)) {
      e.preventDefault();
      remove(p.id, b);
      return;
    }
    if (
      ["Backspace", "Delete"].includes(e.key) &&
      range?.collapsed &&
      !el.querySelector("table")
    ) {
      const offset = caretOffset(el),
        length = el.textContent?.length ?? 0;
      const ordered = orderedBullets(p),
        index = ordered.findIndex((x) => x.bullet.id === b.id);
      const other =
        e.key === "Backspace" && offset === 0
          ? ordered[index - 1]?.bullet
          : e.key === "Delete" && offset === length
            ? ordered[index + 1]?.bullet
            : undefined;
      if (other) {
        e.preventDefault();
        const keep = e.key === "Backspace" ? other : b,
          removed = e.key === "Backspace" ? b : other;
        const caret = textOf(keep.html).length;
        change((d) =>
          updateBullet(
            deleteBullets(d, p.id, [removed.id]),
            keep.id,
            (x) => editBullet(x, keep.html + removed.html),
            p.id,
          ),
        );
        focus(keep.id, caret);
        return;
      }
    }
    if (["ArrowUp", "ArrowDown"].includes(e.key) && !mod && !e.altKey) {
      const editors = [
        ...notesHost.current!.querySelectorAll<HTMLDivElement>(".rich-editor"),
      ].filter((x) => x.getClientRects().length);
      const index = editors.indexOf(el),
        down = e.key === "ArrowDown";
      const caret = range?.cloneRange();
      caret?.collapse(!down);
      const rect = caret?.getClientRects()[0],
        box = el.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(el).lineHeight) || 25;
      const boundary =
        isBlank(el.innerHTML) ||
        !rect ||
        (down
          ? rect.bottom >= box.bottom - line / 2
          : rect.top <= box.top + line / 2);
      const target = editors[index + (down ? 1 : -1)];
      if (boundary && target) {
        e.preventDefault();
        setCaret(
          target,
          Math.min(caretOffset(el), target.textContent?.length ?? 0),
          e.shiftKey,
        );
      }
      return;
    }
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !mod &&
      !(
        window.getSelection()?.anchorNode instanceof Element
          ? (window.getSelection()!.anchorNode as Element)
          : window.getSelection()?.anchorNode?.parentElement
      )?.closest("td,th")
    ) {
      e.preventDefault();
      if (selectedIds().length > 1) {
        deleteSelection();
        return;
      }
      enterBullet(p, b, el);
    }
  };
  const notesInput = (e: React.FormEvent<HTMLDivElement>) => {
    const el =
      editorAt(window.getSelection()?.focusNode ?? null) ??
      editorAt(e.target as Node);
    const id = el?.closest<HTMLElement>("[data-bullet]")?.dataset.bullet;
    const p = latest.current?.pages.find((p) => p.id === view?.id);
    const b = p?.bullets.find((b) => b.id === id);
    if (!el || !id || !b || !p) return;
    if (isBlank(el.innerHTML) && !isBlank(b.html)) remove(p.id, b);
    else editText(id, el.innerHTML, p.id);
  };
  const clipboardCopy = (
    e: React.ClipboardEvent<HTMLDivElement>,
    cut = false,
  ) => {
    const state = latest.current,
      p = state?.pages.find((p) => p.id === view?.id);
    const els = notesHost.current ? selectedEditors(notesHost.current) : [];
    const range = currentRange();
    if (
      !state ||
      !p ||
      !els.length ||
      (els.length === 1 && !range?.collapsed && !wholeEditorSelected(els[0]))
    )
      return;
    e.preventDefault();
    const ids = els.map(
      (el) => el.closest<HTMLElement>("[data-bullet]")!.dataset.bullet!,
    );
    const payload = copyBullets(state, p, ids);
    e.clipboardData.setData(bulletMime, JSON.stringify(payload));
    e.clipboardData.setData("text/html", clipboardHtml(payload));
    e.clipboardData.setData(
      "text/plain",
      payload.entries
        .map((e) => "\t".repeat(e.depth) + "• " + textOf(e.bullet.html))
        .join("\n"),
    );
    if (cut) {
      let focusId: string | null = null;
      change((d) => {
        let next = deleteBullets(d, p.id, ids, true);
        const updated = next.pages.find((x) => x.id === p.id)!;
        const prior = orderedBullets(p).findIndex(
          (x) => x.bullet.id === ids[0],
        );
        focusId =
          orderedBullets(p)
            .slice(0, prior)
            .reverse()
            .find((x) => updated.bullets.some((b) => b.id === x.bullet.id))
            ?.bullet.id ??
          updated.bullets[0]?.id ??
          null;
        if (!updated.bullets.length) {
          const empty = newBullet();
          focusId = empty.id;
          next = editPage(next, p.id, (x) => ({ ...x, bullets: [empty] }));
        }
        return next;
      });
      focus(focusId);
    }
  };
  const notesPaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const clipboard = e.clipboardData;
    const p = latest.current?.pages.find((p) => p.id === view?.id);
    if (!p) return;
    const payload = readBulletClipboard(clipboard);
    try {
      if (payload) {
        let id = "";
        change((d) => {
          const result = pasteBullets(d, p.id, focusedId.current, payload);
          id = result.focus;
          return result.db;
        });
        focus(id);
        return;
      }
      let html = "";
      for (const file of Array.from(clipboard.files))
        html += await imageHtml(file);
      if (!html)
        html = clipboard.getData("text/html")
          ? sanitize(clipboard.getData("text/html"))
          : plainHtml(clipboard.getData("text/plain"));
      const range = currentRange();
      if (range && selectedIds().length > 1) deleteSelection();
      if (editor.current) insertHtml(editor.current, html);
      if (editor.current && focusedId.current)
        editText(focusedId.current, editor.current.innerHTML, p.id);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  useEffect(() => {
    const host = notesHost.current;
    if (!host) return;
    const confineCaret = () => {
      if (document.activeElement?.closest(".page-search-panel")) return null;
      const range = currentRange();
      if (
        !range?.collapsed ||
        !host.contains(range.startContainer) ||
        editorAt(range.startContainer)
      )
        return null;
      const node =
        range.startContainer instanceof Element
          ? range.startContainer
          : range.startContainer.parentElement;
      const row = node?.closest("[data-bullet]");
      const adjacent =
        range.startContainer.childNodes[range.startOffset] ??
        range.startContainer.childNodes[range.startOffset - 1];
      const el =
        row?.querySelector<HTMLDivElement>(".rich-editor") ??
        (adjacent instanceof Element
          ? adjacent.querySelector<HTMLDivElement>(".rich-editor")
          : null) ??
        host.querySelector<HTMLDivElement>(".rich-editor");
      if (!el) return null;
      setCaret(el, 0);
      focusEditor(
        el.closest<HTMLElement>("[data-bullet]")!.dataset.bullet!,
        el,
      );
      return el;
    };
    const before = (e: InputEvent) => {
      const confined = confineCaret();
      if (confined) {
        e.preventDefault();
        if (e.inputType === "insertText" && e.data) {
          insertHtml(confined, plainHtml(e.data));
          editText(focusedId.current!, confined.innerHTML, view?.id);
        }
      } else if (
        e.inputType === "historyUndo" ||
        e.inputType === "historyRedo"
      ) {
        e.preventDefault();
        undo(e.inputType === "historyRedo");
      } else if (e.inputType === "insertText" && selectedIds().length > 1) {
        e.preventDefault();
        deleteSelection(e.data ?? "");
      } else if (e.inputType.startsWith("delete") && deleteSelection())
        e.preventDefault();
    };
    host.addEventListener("beforeinput", before);
    document.addEventListener("selectionchange", confineCaret);
    return () => {
      host.removeEventListener("beforeinput", before);
      document.removeEventListener("selectionchange", confineCaret);
    };
  });
  const focusEditor = (id: string, el: HTMLDivElement) => {
    focusedId.current = id;
    editor.current = el;
    focusCard.current =
      el.closest<HTMLElement>("[data-task-context]")?.dataset.taskContext ??
      null;
  };
  const deleteNavigation = (
    kind: "section" | "subsection" | "page",
    id: string,
  ) => {
    if (
      !confirm(
        `Delete this ${kind} and its contained pages? Linked tasks remain in their other locations. You can undo this change.`,
      )
    )
      return;
    change((d) => {
      const next = removeNavigation(d, kind, id);
      if (view?.type === "page" && !next.pages.some((p) => p.id === view.id))
        setView({ type: "tasks", id: next.activeListId });
      return next;
    });
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
    insertHtml(editor.current, html, selection.current);
    editText(
      focusedId.current,
      editor.current!.innerHTML,
      view?.type === "page" ? view.id : undefined,
    );
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
      editText(
        focusedId.current,
        editor.current!.innerHTML,
        view?.type === "page" ? view.id : undefined,
      );
  };
  const exportBackup = async () => {
    if (!db) return;
    try {
      await flush();
      await window.notebookDesktop?.export(latest.current!);
    } catch (e) {
      setError("Could not export backup: " + (e as Error).message);
    }
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 100 * 1024 * 1024) throw Error("Backup exceeds 100 MB.");
      const data = validateBackup(JSON.parse(await file.text()));
      data.notebookId ??= uid();
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
      history.current = { past: [], future: [], group: "", time: 0 };
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
  const toggle = (b: Bullet) => {
    const ids = selectedIds();
    const seen = new Set<string>();
    change((d) =>
      (ids.length > 1 ? ids : [b.id]).reduce((next, id) => {
        const source = d.pages
          .flatMap((p) => p.bullets)
          .find((b) => b.id === id)!;
        if (seen.has(identity(source))) return next;
        seen.add(identity(source));
        return updateBullet(next, id, toggleBullet, page?.id);
      }, d),
    );
  };
  const collapsed = new Set(db.ui?.collapsedBullets ?? []);
  const collapseBullet = (b: Bullet) =>
    change((d) => ({
      ...d,
      ui: {
        collapsedSections: d.ui?.collapsedSections ?? [],
        collapsedSubsections: d.ui?.collapsedSubsections ?? [],
        collapsedBullets: collapsed.has(identity(b))
          ? [...collapsed].filter((id) => id !== identity(b))
          : [...collapsed, identity(b)],
      },
    }));
  const hasChildren = (b: Bullet) =>
    db.pages.some((p) =>
      p.bullets.some(
        (x) =>
          identity(x) === identity(b) &&
          p.bullets.some((child) => child.parentId === x.id),
      ),
    ) ||
    allTasks.some(
      (t) =>
        (identity(t.bullet) === identity(b) &&
          t.information.some((i) => !i.sibling)) ||
        t.information.some(
          (i, n) =>
            identity(i.bullet) === identity(b) &&
            (t.information[n + 1]?.depth ?? -1) > i.depth,
        ),
    );
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
    if (readOnly) return;
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey)
      previousEnter.current = null;
    if (["Backspace", "Delete"].includes(e.key) && !pageId) {
      const range = currentRange();
      if (
        (range &&
          !range.collapsed &&
          (selectedIds().length > 1 || wholeEditorSelected(e.currentTarget))) ||
        isBlank(e.currentTarget.innerHTML)
      ) {
        e.preventDefault();
        removeTaskSelection();
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
      e.preventDefault();
      toggle(b);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      const el = e.currentTarget;
      const range = document.createRange();
      if (wholeEditorSelected(el) || selectedIds().length > 1) {
        const editors = [
          ...document.querySelectorAll<HTMLDivElement>(
            ".task-columns .rich-editor",
          ),
        ];
        range.setStart(editors[0], 0);
        range.setEnd(editors.at(-1)!, editors.at(-1)!.childNodes.length);
      } else range.selectNodeContents(el);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
    } else if (
      ["ArrowUp", "ArrowDown"].includes(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const el = e.currentTarget;
      const editors = [
        ...document.querySelectorAll<HTMLDivElement>(
          ".task-columns .rich-editor",
        ),
      ];
      const index = editors.indexOf(el),
        down = e.key === "ArrowDown";
      const r = currentRange()?.cloneRange();
      r?.collapse(!down);
      const rect = r?.getClientRects()[0],
        box = el.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(el).lineHeight) || 25;
      const boundary =
        isBlank(el.innerHTML) ||
        !rect ||
        (down
          ? rect.bottom >= box.bottom - line / 2
          : rect.top <= box.top + line / 2);
      const target = editors[index + (down ? 1 : -1)];
      if (boundary && target) {
        e.preventDefault();
        setCaret(
          target,
          Math.min(caretOffset(el), target.textContent?.length ?? 0),
          e.shiftKey,
        );
      }
    } else if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !((e.target as Element).closest("td,th") || selectedCell())
    ) {
      e.preventDefault();
      const source = latest.current?.pages.find((p) =>
        p.bullets.some((x) => x.id === b.id),
      );
      const context = e.currentTarget.closest<HTMLElement>(
        "[data-task-context]",
      )?.dataset.taskContext;
      if (source) enterBullet(source, b, e.currentTarget, context);
    } else if (
      e.key === "Tab" &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !selectedCell()
    ) {
      e.preventDefault();
      const source = latest.current?.pages.find((p) =>
        p.bullets.some((x) => x.id === b.id),
      );
      const context = e.currentTarget.closest<HTMLElement>(
        "[data-task-context]",
      )?.dataset.taskContext;
      if (source) indent(source.id, b, e.shiftKey, e.currentTarget, context);
    }
  };
  const renderBullet = (b: Bullet, pageId?: string, inherited = false) => (
    <div
      className={`bullet-row ${b.completed ? "completed" : ""}`}
      key={b.id}
      data-bullet={b.id}
      onMouseDown={(e) => {
        if (readOnly || (e.target as Element).closest(".rich-editor")) return;
        // Keep markers and controls outside the text insertion area while the
        // page remains one editing host for selections across bullet rows.
        e.preventDefault();
        if ((e.target as Element).closest("button")) return;
        const el =
          e.currentTarget.querySelector<HTMLDivElement>(".rich-editor");
        if (el) {
          setCaret(el, e.clientX < el.getBoundingClientRect().left ? 0 : "end");
          focusEditor(b.id, el);
        }
      }}
    >
      {b.kind === "task" && hasChildren(b) && (
        <button
          contentEditable={false}
          className="bullet-collapse"
          aria-label={
            collapsed.has(identity(b))
              ? "Expand task children"
              : "Collapse task children"
          }
          aria-expanded={!collapsed.has(identity(b))}
          onClick={() => collapseBullet(b)}
        >
          {collapsed.has(identity(b)) ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
      )}
      {b.kind === "task" ? (
        <input
          className="task-check"
          aria-label="Complete task"
          type="checkbox"
          checked={b.completed}
          contentEditable={false}
          disabled={readOnly || (!b.completed && !canComplete(db, b))}
          title={
            !b.completed && !canComplete(db, b)
              ? "Complete child tasks first"
              : "Complete task"
          }
          onChange={(e) =>
            patch(b.id, (x) => ({ ...x, completed: e.target.checked }), pageId)
          }
        />
      ) : (
        <span className="info-dot" title="Information" contentEditable={false}>
          •
        </span>
      )}
      <Editor
        html={b.html}
        label={b.kind === "task" ? "Task text" : "Information text"}
        readOnly={readOnly}
        inherited={inherited}
        onChange={(html) => {
          if (!readOnly && !inherited) {
            if (isBlank(html) && !isBlank(b.html)) {
              const source = db.pages.find((p) =>
                p.bullets.some((x) => x.id === b.id),
              );
              if (source) remove(source.id, b);
            } else editText(b.id, html, pageId);
          }
        }}
        onCommit={(html) => {
          if (!readOnly) commit(b.id, html);
        }}
        onFocus={(el) => focusEditor(b.id, el)}
        onKey={(e) => keys(b, e, pageId)}
      />
      {!readOnly && (
        <div className="bullet-actions" contentEditable={false}>
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
    orderedBullets(page)
      .filter(({ bullet }) => {
        let parent = bullet.parentId;
        while (parent) {
          const b = page.bullets.find((b) => b.id === parent)!;
          if (collapsed.has(identity(b))) return false;
          parent = b.parentId;
        }
        return true;
      })
      .map(({ bullet, depth }) => (
        <div
          key={bullet.id}
          className="note-node"
          style={{ marginLeft: depth * 24 }}
        >
          {renderBullet(bullet, page.id, true)}
        </div>
      ));
  const renderTaskInformation = (task: Task, sibling?: "before" | "after") => {
    const items = task.information.filter((i) => i.sibling === sibling);
    if (!items.length) return null;
    return (
      <div className={sibling ? "task-continuations" : "attached-info"}>
        {items
          .filter((i, index) => {
            for (let n = index - 1, level = i.depth; n >= 0; n--) {
              const ancestor = items[n];
              if (ancestor.depth < level) {
                if (collapsed.has(identity(ancestor.bullet))) return false;
                level = ancestor.depth;
              }
            }
            return true;
          })
          .map((i) => (
            <div key={i.bullet.id} style={{ marginLeft: i.depth * 18 }}>
              {renderBullet(i.bullet)}
            </div>
          ))}
      </div>
    );
  };
  const taskCard = (task: Task) => (
    <article
      key={task.bullet.id}
      className="task-card"
      data-task={task.bullet.id}
      data-task-context={identity(task.bullet)}
      onDragOver={(e) => {
        if (!readOnly) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData("text/plain");
        const source = tasksOf(db).find((t) => identity(t.bullet) === id);
        if (!source) return;
        change((d) =>
          reorderTask(
            updateBullet(d, id, (b) => moveDate(b, task.bullet.dueDate)),
            id,
            identity(task.bullet),
            e.clientY >
              e.currentTarget.getBoundingClientRect().top +
                e.currentTarget.getBoundingClientRect().height / 2,
          ),
        );
      }}
    >
      <div className="task-source">
        {!readOnly && (
          <span
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData("text/plain", identity(task.bullet))
            }
            className="drag-handle"
            title="Drag to a date group or Unassigned"
          >
            <GripVertical size={16} />
          </span>
        )}
        <span>{task.customerName}</span>
        <button
          disabled={!db.pages.some((p) => p.id === task.pageId)}
          title={
            !db.pages.some((p) => p.id === task.pageId)
              ? "This source page was deleted; the historical snapshot is preserved."
              : "Open source page"
          }
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
      {renderTaskInformation(task, "before")}
      {renderBullet(task.bullet)}
      {!collapsed.has(identity(task.bullet)) && renderTaskInformation(task)}
      {renderTaskInformation(task, "after")}
      {!readOnly && (
        <div className="schedule-control">
          <div className="quick-dates">
            {(
              [
                ["today", "Today"],
                ["tomorrow", "Tomorrow"],
                ["eow", "EOW"],
              ] as const
            ).map(([which, label]) => (
              <button
                key={which}
                onClick={() =>
                  patch(task.bullet.id, (b) => moveDate(b, quickDate(which)))
                }
              >
                {label}
              </button>
            ))}
          </div>
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
    if (!tasksOf(db).some((t) => identity(t.bullet) === id)) return;
    patch(id, (b) => moveDate(b, date));
  };
  const taskSelectionGroups = (els: HTMLDivElement[]) => {
    const groups = new Map<string, Set<string>>();
    for (const el of els) {
      const id = el.closest<HTMLElement>("[data-bullet]")!.dataset.bullet!;
      const source = db.pages.find((p) => p.bullets.some((b) => b.id === id));
      if (!source) continue;
      const ids = groups.get(source.id) ?? new Set<string>();
      ids.add(id);
      groups.set(source.id, ids);
    }
    return groups;
  };
  const removeTaskSelection = (
    groups?: Map<string, Set<string>>,
    cut = false,
  ) => {
    const host = document.querySelector<HTMLElement>(".task-columns");
    if (!host || readOnly) return;
    const selected = groups ?? taskSelectionGroups(selectedEditors(host));
    let nextFocus: string | null = null;
    change((d) => {
      let next = d;
      for (const [pageId, ids] of selected) {
        next = deleteBullets(next, pageId, [...ids], cut);
        if (!next.pages.find((p) => p.id === pageId)!.bullets.length)
          next = editPage(next, pageId, (p) => ({
            ...p,
            bullets: [newBullet()],
          }));
      }
      nextFocus = tasksOf(next)[0]?.bullet.id ?? null;
      return next;
    });
    focus(nextFocus);
  };
  const copyTaskSelection = (
    e: React.ClipboardEvent<HTMLDivElement>,
    cut = false,
  ) => {
    if (readOnly) return;
    const els = selectedEditors(e.currentTarget),
      range = currentRange();
    if (
      !els.length ||
      (els.length === 1 && !range?.collapsed && !wholeEditorSelected(els[0]))
    )
      return;
    const groups = taskSelectionGroups(els);
    const payload = {
      format: "task-notebook/bullets" as const,
      version: 1 as const,
      notebookId: db.notebookId,
      entries: [...groups].flatMap(
        ([id, ids]) =>
          copyBullets(
            db,
            db.pages.find((p) => p.id === id)!,
            [...ids],
          ).entries,
      ),
    };
    if (!payload.entries.length) return;
    e.preventDefault();
    e.clipboardData.setData(bulletMime, JSON.stringify(payload));
    e.clipboardData.setData("text/html", clipboardHtml(payload));
    e.clipboardData.setData(
      "text/plain",
      payload.entries
        .map((e) => "\t".repeat(e.depth) + "• " + textOf(e.bullet.html))
        .join("\n"),
    );
    if (cut) removeTaskSelection(groups, true);
  };
  return (
    <div
      className={`app ${sidebar ? "" : "sidebar-hidden"} ${pageSearchOpen ? "page-search-open" : ""}`}
    >
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
        <button
          type="button"
          className={`nav-primary ${pageSearchOpen ? "selected" : ""}`}
          aria-label="Search pages"
          onClick={launchPageSearch}
          aria-expanded={pageSearchOpen}
          aria-keyshortcuts="Control+F"
          title="Search pages (Ctrl+F)"
        >
          <Search size={18} />
          Search pages
          <kbd className="search-shortcut">Ctrl+F</kbd>
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
          remove={deleteNavigation}
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
                          change(() => next);
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
              <div
                className="notes-sheet"
                ref={notesHost}
                contentEditable
                suppressContentEditableWarning
                tabIndex={0}
                role="textbox"
                aria-label="Notes page"
                aria-multiline="true"
                onKeyDown={notesKeys}
                onInput={notesInput}
                onCopy={(e) => clipboardCopy(e)}
                onCut={(e) => clipboardCopy(e, true)}
                onPaste={notesPaste}
                onBlur={() => {
                  if (focusedId.current && editor.current)
                    commit(
                      focusedId.current,
                      linkify(sanitize(editor.current.innerHTML)),
                    );
                }}
              >
                {renderNotes()}
                <button
                  className="add-note"
                  contentEditable={false}
                  onClick={() => addBullet(page.id)}
                >
                  <Plus size={16} />
                  Add information bullet
                </button>
              </div>
              <div className="editor-help">
                <span>
                  <kbd>Ctrl</kbd> + <kbd>T</kbd> toggle task
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
              <div
                className="task-columns"
                onCopy={(e) => copyTaskSelection(e)}
                onCut={(e) => copyTaskSelection(e, true)}
              >
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
      {pageSearchOpen && (
        <PageSearchPanel
          db={db}
          currentPageId={page?.id ?? null}
          inputRef={pageSearchInput}
          onClose={closePageSearch}
          onQueryChange={() => setSearchTarget(null)}
          onOpenResult={openSearchResult}
        />
      )}
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
