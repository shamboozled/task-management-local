import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Pencil,
  FileText,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  type Notebook,
  reorderSections,
  moveSubsection,
  movePage,
} from "./model";
const dragType = "application/x-task-notebook-navigation";
type Props = {
  db: Notebook;
  view: { type: "page" | "tasks"; id: string };
  change: (fn: (db: Notebook) => Notebook) => void;
  ask: (
    title: string,
    label: string,
    value: string,
    submit: (s: string) => void,
  ) => void;
  createPage: (sectionId: string, parentId?: string | null) => void;
  openPage: (id: string) => void;
  remove: (kind: "section" | "subsection" | "page", id: string) => void;
};
export default function SidebarTree({
  db,
  view,
  change,
  ask,
  createPage,
  openPage,
  remove,
}: Props) {
  const ui = db.ui ?? { collapsedSections: [], collapsedSubsections: [] };
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (view.type !== "page") return;
    change((d) => {
      const page = d.pages.find((p) => p.id === view.id);
      const sub = d.sections.find((s) => s.id === page?.sectionId);
      if (!sub || !d.ui) return d;
      const current = d.ui;
      if (
        !current.collapsedSections.includes(sub.customerId) &&
        !current.collapsedSubsections.includes(sub.id)
      )
        return d;
      return {
        ...d,
        ui: {
          collapsedSections: current.collapsedSections.filter(
            (id) => id !== sub.customerId,
          ),
          collapsedSubsections: current.collapsedSubsections.filter(
            (id) => id !== sub.id,
          ),
        },
      };
    });
  }, [view.id]);
  const collapse = (
    field: "collapsedSections" | "collapsedSubsections",
    id: string,
  ) =>
    change((d) => {
      const prefs = d.ui ?? { collapsedSections: [], collapsedSubsections: [] };
      return {
        ...d,
        ui: {
          ...prefs,
          [field]: prefs[field].includes(id)
            ? prefs[field].filter((x) => x !== id)
            : [...prefs[field], id],
        },
      };
    });
  const start = (
    e: React.DragEvent,
    type: "section" | "subsection" | "page",
    id: string,
  ) => {
    e.dataTransfer.setData(dragType, JSON.stringify({ type, id }));
    e.dataTransfer.effectAllowed = "move";
  };
  const over = (e: React.DragEvent, id: string) => {
    if (!e.dataTransfer.types.includes(dragType)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setTarget(id);
  };
  const drop = (e: React.DragEvent, parent: string, before: string | null) => {
    if (!e.dataTransfer.types.includes(dragType)) return;
    e.preventDefault();
    e.stopPropagation();
    setTarget(null);
    try {
      const item = JSON.parse(e.dataTransfer.getData(dragType));
      if (item.type === "section" && !before)
        change((d) => reorderSections(d, item.id, parent));
      if (item.type === "subsection")
        change((d) => moveSubsection(d, item.id, parent, before));
      if (item.type === "page" && before)
        change((d) => movePage(d, item.id, before, null));
    } catch {}
  };
  const pages = (
    sectionId: string,
    parentId: string | null = null,
    depth = 0,
  ): React.ReactNode =>
    db.pages
      .filter((p) => p.sectionId === sectionId && p.parentId === parentId)
      .map((p) => (
        <div key={p.id} data-page={p.id}>
          <div
            className={`page-tree-row ${target === p.id ? "drop-target" : ""}`}
            style={{ paddingLeft: 16 + depth * 14 }}
            onDragOver={(e) => over(e, p.id)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTarget(null);
              try {
                const item = JSON.parse(e.dataTransfer.getData(dragType));
                if (item.type === "page")
                  change((d) =>
                    movePage(d, item.id, sectionId, parentId, p.id),
                  );
              } catch {}
            }}
          >
            <button
              className="tree-drag"
              draggable
              aria-label={`Drag page ${p.title}`}
              onDragStart={(e) => start(e, "page", p.id)}
              onDragEnd={() => setTarget(null)}
            >
              <GripVertical size={12} />
            </button>
            <button
              className={`page-link ${view.type === "page" && view.id === p.id ? "selected" : ""}`}
              onClick={() => openPage(p.id)}
            >
              <FileText size={14} />
              <span>{p.title}</span>
            </button>
            <button
              className="icon-button"
              aria-label={`Delete page ${p.title}`}
              title="Delete page"
              onClick={() => remove("page", p.id)}
            >
              <Trash2 size={12} />
            </button>
          </div>
          {pages(sectionId, p.id, depth + 1)}
        </div>
      ));
  return (
    <div className="customer-tree">
      {!db.customers.length && (
        <p className="sidebar-hint">
          Add your first section with the plus icon above.
        </p>
      )}
      {db.customers.map((c) => {
        const expanded = !ui.collapsedSections.includes(c.id);
        return (
          <div key={c.id} data-section={c.id} className="customer">
            <div
              className={`customer-name tree-row ${target === c.id ? "drop-target" : ""}`}
              onDragOver={(e) => over(e, c.id)}
              onDrop={(e) => drop(e, c.id, null)}
            >
              <button
                className="tree-drag"
                draggable
                aria-label={`Drag section ${c.name}`}
                title="Drag to reorder sections"
                onDragStart={(e) => start(e, "section", c.id)}
                onDragEnd={() => setTarget(null)}
              >
                <GripVertical size={13} />
              </button>
              <button
                className="tree-label"
                aria-expanded={expanded}
                onClick={() => collapse("collapsedSections", c.id)}
              >
                {expanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <span>{c.name}</span>
              </button>
              <button
                className="icon-button"
                aria-label={`Rename section ${c.name}`}
                title="Rename section"
                onClick={() =>
                  ask("Rename section", "Section name", c.name, (name) =>
                    change((d) => ({
                      ...d,
                      customers: d.customers.map((x) =>
                        x.id === c.id ? { ...x, name } : x,
                      ),
                    })),
                  )
                }
              >
                <Pencil size={13} />
              </button>
              <button
                className="icon-button"
                aria-label={`Delete section ${c.name}`}
                title="Delete section"
                onClick={() => remove("section", c.id)}
              >
                <Trash2 size={13} />
              </button>
              <button
                className="icon-button"
                aria-label={`New subsection for ${c.name}`}
                title="New subsection"
                onClick={() =>
                  ask("New subsection", "Subsection name", "", (name) =>
                    change((d) => ({
                      ...d,
                      sections: [
                        ...d.sections,
                        { id: crypto.randomUUID(), customerId: c.id, name },
                      ],
                      ui: {
                        ...d.ui,
                        collapsedSections: (
                          d.ui?.collapsedSections ?? []
                        ).filter((id) => id !== c.id),
                        collapsedSubsections: d.ui?.collapsedSubsections ?? [],
                      },
                    })),
                  )
                }
              >
                <Plus size={14} />
              </button>
            </div>
            {expanded &&
              db.sections
                .filter((s) => s.customerId === c.id)
                .map((s) => {
                  const open = !ui.collapsedSubsections.includes(s.id);
                  return (
                    <div key={s.id} data-subsection={s.id}>
                      <div
                        className={`section-name tree-row ${target === s.id ? "drop-target" : ""}`}
                        onDragOver={(e) => over(e, s.id)}
                        onDrop={(e) => drop(e, c.id, s.id)}
                      >
                        <button
                          className="tree-drag"
                          draggable
                          aria-label={`Drag subsection ${s.name}`}
                          title="Drag to reorder or move to another section"
                          onDragStart={(e) => start(e, "subsection", s.id)}
                          onDragEnd={() => setTarget(null)}
                        >
                          <GripVertical size={12} />
                        </button>
                        <button
                          className="tree-label"
                          aria-expanded={open}
                          onClick={() => collapse("collapsedSubsections", s.id)}
                        >
                          {open ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                          <span>{s.name}</span>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Rename subsection ${s.name}`}
                          title="Rename subsection"
                          onClick={() =>
                            ask(
                              "Rename subsection",
                              "Subsection name",
                              s.name,
                              (name) =>
                                change((d) => ({
                                  ...d,
                                  sections: d.sections.map((x) =>
                                    x.id === s.id ? { ...x, name } : x,
                                  ),
                                })),
                            )
                          }
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete subsection ${s.name}`}
                          title="Delete subsection"
                          onClick={() => remove("subsection", s.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`New page in ${s.name}`}
                          title="New page"
                          onClick={() => createPage(s.id)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      {open && pages(s.id)}
                    </div>
                  );
                })}
          </div>
        );
      })}
    </div>
  );
}
