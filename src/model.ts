export type Bullet = {
  id: string;
  parentId: string | null;
  kind: "information" | "task";
  html: string;
  completed: boolean;
  dueDate: string | null;
  sharedId?: string;
  lastEditedPageId?: string;
  // Information siblings created from a task card stay visible on that card.
  taskListContextId?: string;
};
export type Page = {
  id: string;
  sectionId: string;
  parentId: string | null;
  title: string;
  bullets: Bullet[];
};
export type Customer = { id: string; name: string };
export type Section = { id: string; customerId: string; name: string };
export type Task = {
  bullet: Bullet;
  pageId: string;
  pageTitle: string;
  customerName: string;
  information: {
    bullet: Bullet;
    depth: number;
    sibling?: "before" | "after";
  }[];
};
export type TaskList = {
  id: string;
  title: string;
  createdAt: string;
  snapshot: Task[] | null;
  taskIds: string[];
};
export type Notebook = {
  version: 1;
  customers: Customer[];
  sections: Section[];
  pages: Page[];
  taskLists: TaskList[];
  activeListId: string;
  notebookId?: string;
  ui?: {
    collapsedSections: string[];
    collapsedSubsections: string[];
    collapsedBullets?: string[];
  };
};
export const todayTitle = (date = new Date()) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
export const uid = () => crypto.randomUUID();
export const newBullet = (parentId: string | null = null): Bullet => ({
  id: uid(),
  parentId,
  kind: "information",
  html: "",
  completed: false,
  dueDate: null,
});
export function emptyNotebook(): Notebook {
  const id = uid();
  return {
    version: 1,
    notebookId: uid(),
    customers: [],
    sections: [],
    pages: [],
    taskLists: [
      {
        id,
        title: todayTitle(),
        createdAt: new Date().toISOString(),
        snapshot: null,
        taskIds: [],
      },
    ],
    activeListId: id,
  };
}
export function textOf(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}
const pattern = /(?<![\d/])\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b(?![\d/])/g;
export function dateMatch(
  text: string,
  year = new Date().getFullYear(),
): { date: string; token: string; index: number } | null {
  for (const m of text.matchAll(pattern)) {
    const month = +m[1],
      day = +m[2],
      y = m[3] ? +m[3] : year;
    const d = new Date(y, month - 1, day);
    if (
      y >= 1000 &&
      d.getFullYear() === y &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    )
      return {
        date: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        token: m[0],
        index: m.index!,
      };
  }
  return null;
}
export function editBullet(b: Bullet, html: string): Bullet {
  return {
    ...b,
    html,
    dueDate: b.kind === "task" ? (dateMatch(textOf(html))?.date ?? null) : null,
  };
}
export function moveDate(
  b: Bullet,
  date: string | null,
  year = new Date().getFullYear(),
): Bullet {
  const el = document.createElement("div");
  el.innerHTML = b.html;
  const text = el.textContent ?? "";
  const match = dateMatch(text, year);
  const format = date
    ? `${date.slice(5, 7)}/${date.slice(8, 10)}${+date.slice(0, 4) !== year ? "/" + date.slice(0, 4) : ""}`
    : "";
  if (match) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null,
      offset = 0;
    const nodes: { node: Node; start: number; end: number }[] = [];
    while ((n = walker.nextNode())) {
      const len = n.textContent?.length ?? 0;
      nodes.push({ node: n, start: offset, end: offset + len });
      offset += len;
    }
    let inserted = false;
    for (const { node, start, end } of nodes) {
      if (end <= match.index || start >= match.index + match.token.length)
        continue;
      const v = node.textContent ?? "";
      const a = Math.max(0, match.index - start),
        z = Math.min(v.length, match.index + match.token.length - start);
      node.textContent = v.slice(0, a) + (inserted ? "" : format) + v.slice(z);
      inserted = true;
    }
  } else if (date) {
    el.append(document.createTextNode(" " + format));
  }
  // Remove any other valid date when moving to Unassigned, so none can reassign it.
  if (!date) {
    let extra = dateMatch(el.textContent ?? "", year);
    while (extra) {
      const tmp = { ...b, html: el.innerHTML };
      return moveDate(tmp, null, year);
    }
  }
  return { ...b, html: el.innerHTML, dueDate: date };
}
export function tasksOf(db: Notebook): Task[] {
  const active = db.taskLists.find((l) => l.id === db.activeListId)!;
  const contextSources = new Map<string, Set<Page>>();
  for (const page of db.pages) {
    for (const b of page.bullets) {
      if (b.kind !== "information" || !b.taskListContextId) continue;
      const sources =
        contextSources.get(b.taskListContextId) ?? new Set<Page>();
      sources.add(page);
      contextSources.set(b.taskListContextId, sources);
    }
  }
  const orderedPages = new Map<string, ReturnType<typeof orderedBullets>>();
  const orderedPage = (p: Page) => {
    if (!orderedPages.has(p.id)) orderedPages.set(p.id, orderedBullets(p));
    return orderedPages.get(p.id)!;
  };
  const seen = new Set<string>();
  return db.pages
    .flatMap((page) =>
      page.bullets
        .filter((b) => {
          const include =
            b.kind === "task" &&
            active.taskIds.includes(identity(b)) &&
            !seen.has(identity(b)) &&
            (!b.lastEditedPageId ||
              !db.pages.some(
                (p) =>
                  p.id === b.lastEditedPageId &&
                  p.bullets.some((x) => identity(x) === identity(b)),
              ) ||
              page.id === b.lastEditedPageId);
          if (include) seen.add(identity(b));
          return include;
        })
        .map((bullet) => {
          const section = db.sections.find((s) => s.id === page.sectionId);
          const customerName =
            db.customers.find((c) => c.id === section?.customerId)?.name ?? "";
          const information: Task["information"] = [];
          function walk(parent: string, depth: number) {
            for (const b of page.bullets.filter((x) => x.parentId === parent)) {
              information.push({ bullet: b, depth });
              walk(b.id, depth + 1);
            }
          }
          walk(bullet.id, 0);
          const included = new Set(information.map((i) => identity(i.bullet)));
          const sources = [...(contextSources.get(identity(bullet)) ?? [])];
          sources.sort((a, b) => Number(b === page) - Number(a === page));
          for (const source of sources) {
            const ordered = orderedPage(source);
            for (const context of ordered) {
              const b = context.bullet;
              if (
                b.kind !== "information" ||
                b.taskListContextId !== identity(bullet) ||
                included.has(identity(b)) ||
                source.bullets.find((x) => x.id === b.parentId)
                  ?.taskListContextId === identity(bullet)
              )
                continue;
              const anchor = source.bullets.find(
                (x) => identity(x) === identity(bullet),
              );
              const sibling =
                anchor &&
                ordered.findIndex((x) => x.bullet.id === b.id) <
                  ordered.findIndex((x) => x.bullet.id === anchor.id)
                  ? "before"
                  : "after";
              const children = descendants(source, b.id);
              // Reorganizing notes can turn a former sibling into an ancestor;
              // a task card must not pull itself or its ancestors back in.
              if (children.some((x) => identity(x) === identity(bullet)))
                continue;
              const family = new Set([b.id, ...children.map((x) => x.id)]);
              for (const child of ordered.filter((x) =>
                family.has(x.bullet.id),
              )) {
                if (included.has(identity(child.bullet))) continue;
                information.push({
                  bullet: child.bullet,
                  depth: child.depth - context.depth,
                  sibling,
                });
                included.add(identity(child.bullet));
              }
            }
          }
          return {
            bullet,
            pageId: page.id,
            pageTitle: page.title,
            customerName,
            information,
          };
        }),
    )
    .sort(
      (a, b) =>
        active.taskIds.indexOf(identity(a.bullet)) -
        active.taskIds.indexOf(identity(b.bullet)),
    );
}
export const identity = (b: Bullet) => b.sharedId ?? b.id;
export function updateBullet(
  db: Notebook,
  id: string,
  fn: (b: Bullet) => Bullet,
  pageId?: string,
): Notebook {
  const source = db.pages
    .flatMap((p) => p.bullets)
    .find((b) => b.id === id || identity(b) === id);
  if (!source) return db;
  const key = identity(source);
  const next = fn(source);
  if (next.completed && !source.completed && !canComplete(db, source))
    return db;
  const ancestors = new Set<string>();
  for (const page of db.pages)
    for (const placement of page.bullets.filter((b) => identity(b) === key)) {
      let parent = placement.parentId;
      while (parent) {
        const b = page.bullets.find((b) => b.id === parent);
        if (!b) break;
        if (b.kind === "task") ancestors.add(identity(b));
        parent = b.parentId;
      }
    }
  const reopened = new Set<string>();
  let add = false;
  const pages = db.pages.map((p) => ({
    ...p,
    bullets: p.bullets.map((b) => {
      if (identity(b) !== key) {
        if (!ancestors.has(identity(b))) return b;
        const reopen = next.kind === "task" && !next.completed && b.completed;
        if (reopen) reopened.add(identity(b));
        return {
          ...b,
          lastEditedPageId: pageId ?? b.lastEditedPageId,
          completed: reopen ? false : b.completed,
        };
      }
      add =
        next.kind === "task" &&
        (b.kind !== "task" || (b.completed && !next.completed));
      return {
        ...b,
        html: next.html,
        kind: next.kind,
        completed: next.completed,
        dueDate: next.dueDate,
        lastEditedPageId: pageId ?? next.lastEditedPageId,
      };
    }),
  }));
  return {
    ...db,
    pages,
    taskLists:
      add || reopened.size
        ? db.taskLists.map((l) =>
            l.id === db.activeListId
              ? {
                  ...l,
                  taskIds: [
                    ...new Set([
                      ...l.taskIds,
                      ...(add ? [key] : []),
                      ...reopened,
                    ]),
                  ],
                }
              : l,
          )
        : db.taskLists,
  };
}
export function rollover(db: Notebook, title: string): Notebook {
  const id = uid();
  return {
    ...db,
    activeListId: id,
    taskLists: [
      ...db.taskLists.map((l) =>
        l.id === db.activeListId
          ? { ...l, snapshot: structuredClone(tasksOf(db)) }
          : l,
      ),
      {
        id,
        title,
        createdAt: new Date().toISOString(),
        snapshot: null,
        taskIds: tasksOf(db)
          .filter((t) => !t.bullet.completed)
          .map((t) => identity(t.bullet)),
      },
    ],
  };
}
export function toggleBullet(b: Bullet): Bullet {
  const kind = b.kind === "task" ? "information" : "task";
  return {
    ...b,
    kind,
    completed: false,
    dueDate: kind === "task" ? (dateMatch(textOf(b.html))?.date ?? null) : null,
  };
}
export function validateBackup(value: unknown): Notebook {
  if (!value || typeof value !== "object")
    throw Error("Not a notebook backup.");
  const d = value as Notebook;
  if (
    d.version !== 1 ||
    !Array.isArray(d.customers) ||
    !Array.isArray(d.sections) ||
    !Array.isArray(d.pages) ||
    !Array.isArray(d.taskLists) ||
    typeof d.activeListId !== "string"
  )
    throw Error("Unsupported or damaged backup.");
  if (
    d.ui &&
    (!Array.isArray(d.ui.collapsedSections) ||
      !Array.isArray(d.ui.collapsedSubsections) ||
      (d.ui.collapsedBullets !== undefined &&
        !Array.isArray(d.ui.collapsedBullets)) ||
      [
        ...d.ui.collapsedSections,
        ...d.ui.collapsedSubsections,
        ...(d.ui.collapsedBullets ?? []),
      ].some((id) => typeof id !== "string"))
  )
    throw Error("Invalid sidebar settings.");
  const ids = new Set<string>();
  const check = (v: { id: string }) => {
    if (!v || typeof v.id !== "string" || ids.has(v.id))
      throw Error("Invalid or duplicate identifiers.");
    ids.add(v.id);
  };
  const bullet = (b: Bullet) => {
    if (
      !b ||
      typeof b.id !== "string" ||
      !["information", "task"].includes(b.kind) ||
      typeof b.html !== "string" ||
      typeof b.completed !== "boolean" ||
      !(b.parentId === null || typeof b.parentId === "string") ||
      (b.sharedId !== undefined && typeof b.sharedId !== "string") ||
      (b.lastEditedPageId !== undefined &&
        typeof b.lastEditedPageId !== "string") ||
      (b.taskListContextId !== undefined &&
        typeof b.taskListContextId !== "string") ||
      !(
        b.dueDate === null ||
        (typeof b.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate))
      )
    )
      throw Error("Invalid bullet.");
  };
  d.customers.forEach((c) => {
    check(c);
    if (typeof c.name !== "string") throw Error("Invalid customer.");
  });
  d.sections.forEach((s) => {
    check(s);
    if (
      typeof s.name !== "string" ||
      !d.customers.some((c) => c.id === s.customerId)
    )
      throw Error("Invalid section.");
  });
  d.pages.forEach((p) => {
    check(p);
    if (
      typeof p.title !== "string" ||
      !(p.parentId === null || typeof p.parentId === "string") ||
      !Array.isArray(p.bullets) ||
      !d.sections.some((s) => s.id === p.sectionId)
    )
      throw Error("Invalid page.");
    p.bullets.forEach((b) => {
      check(b);
      bullet(b);
    });
    for (const b of p.bullets) {
      const seen = new Set([b.id]);
      let parent = b.parentId;
      while (parent) {
        if (seen.has(parent)) throw Error("Cyclic bullets.");
        seen.add(parent);
        const found = p.bullets.find((x) => x.id === parent);
        if (!found) throw Error("Missing parent bullet.");
        parent = found.parentId;
      }
      const ancestors = new Set([identity(b)]);
      let ancestor = p.bullets.find((x) => x.id === b.parentId);
      while (ancestor) {
        if (ancestors.has(identity(ancestor)))
          throw Error("Cyclic shared bullets.");
        ancestors.add(identity(ancestor));
        ancestor = p.bullets.find((x) => x.id === ancestor!.parentId);
      }
    }
  });
  for (const p of d.pages) {
    const seen = new Set([p.id]);
    let parent = p.parentId;
    while (parent) {
      if (seen.has(parent)) throw Error("Cyclic pages.");
      seen.add(parent);
      const found = d.pages.find(
        (x) => x.id === parent && x.sectionId === p.sectionId,
      );
      if (!found) throw Error("Invalid parent page.");
      parent = found.parentId;
    }
  }
  d.taskLists.forEach((l) => {
    check(l);
    if (
      typeof l.title !== "string" ||
      typeof l.createdAt !== "string" ||
      !Array.isArray(l.taskIds) ||
      l.taskIds.some((id) => typeof id !== "string") ||
      !(l.snapshot === null || Array.isArray(l.snapshot))
    )
      throw Error("Invalid task list.");
    l.snapshot?.forEach((t) => {
      if (
        !t ||
        typeof t.pageId !== "string" ||
        typeof t.pageTitle !== "string" ||
        typeof t.customerName !== "string" ||
        !Array.isArray(t.information)
      )
        throw Error("Invalid snapshot.");
      bullet(t.bullet);
      t.information.forEach((i) => {
        bullet(i.bullet);
        if (
          !Number.isInteger(i.depth) ||
          i.depth < 0 ||
          (i.sibling !== undefined && !["before", "after"].includes(i.sibling))
        )
          throw Error("Invalid information depth.");
      });
    });
  });
  if (
    !d.taskLists.some((l) => l.id === d.activeListId && l.snapshot === null) ||
    d.taskLists.filter((l) => l.snapshot === null).length !== 1
  )
    throw Error("Invalid current task list.");
  return d;
}

// Keep legacy customers/sections keys so browser-version backup files remain importable.
export function reorderSections(
  db: Notebook,
  id: string,
  beforeId: string,
): Notebook {
  if (
    id === beforeId ||
    !db.customers.some((c) => c.id === id) ||
    !db.customers.some((c) => c.id === beforeId)
  )
    return db;
  const items = db.customers.filter((c) => c.id !== id);
  items.splice(
    items.findIndex((c) => c.id === beforeId),
    0,
    db.customers.find((c) => c.id === id)!,
  );
  return { ...db, customers: items };
}
export function moveSubsection(
  db: Notebook,
  id: string,
  parentId: string,
  beforeId: string | null = null,
): Notebook {
  const item = db.sections.find((s) => s.id === id);
  if (!item || !db.customers.some((c) => c.id === parentId) || id === beforeId)
    return db;
  if (
    beforeId &&
    !db.sections.some((s) => s.id === beforeId && s.customerId === parentId)
  )
    return db;
  const items = db.sections.filter((s) => s.id !== id);
  let index = beforeId
    ? items.findIndex((s) => s.id === beforeId)
    : items.reduce(
        (last, s, i) => (s.customerId === parentId ? i + 1 : last),
        items.length,
      );
  items.splice(index, 0, { ...item, customerId: parentId });
  return { ...db, sections: items };
}
export function orderedBullets(page: Page) {
  const result: { bullet: Bullet; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const bullet of page.bullets.filter((b) => b.parentId === parentId)) {
      result.push({ bullet, depth });
      walk(bullet.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}
export function pagePath(db: Notebook, page: Page): Page[] {
  const path: Page[] = [page];
  let parent = page.parentId;
  const seen = new Set([page.id]);
  while (parent && !seen.has(parent)) {
    const found = db.pages.find((p) => p.id === parent);
    if (!found) break;
    path.unshift(found);
    seen.add(parent);
    parent = found.parentId;
  }
  return path;
}

export function descendants(page: Page, id: string): Bullet[] {
  const out: Bullet[] = [];
  const walk = (parent: string) =>
    page.bullets
      .filter((b) => b.parentId === parent)
      .forEach((b) => {
        out.push(b);
        walk(b.id);
      });
  walk(id);
  return out;
}
export function canComplete(db: Notebook, bullet: Bullet): boolean {
  return !db.pages.some((p) =>
    p.bullets.some(
      (b) =>
        identity(b) === identity(bullet) &&
        descendants(p, b.id).some(
          (child) => child.kind === "task" && !child.completed,
        ),
    ),
  );
}

// Each placement has a unique ID. Linked placements share content identity; page
// edits also mirror the full child tree, preserving existing placement IDs.
export function editPage(
  db: Notebook,
  pageId: string,
  fn: (p: Page) => Page,
): Notebook {
  const before = db.pages.find((p) => p.id === pageId);
  let next = {
    ...db,
    pages: db.pages.map((p) => (p.id === pageId ? fn(p) : p)),
  };
  const source = next.pages.find((p) => p.id === pageId);
  if (!source) return next;
  if (source === before) return db;
  for (const b of source.bullets) {
    const seen = new Set([identity(b)]);
    let parent = b.parentId;
    while (parent) {
      const ancestor = source.bullets.find((x) => x.id === parent);
      if (!ancestor) throw Error("Missing parent bullet.");
      if (seen.has(identity(ancestor)))
        throw Error("Linked tasks cannot be nested inside themselves.");
      seen.add(identity(ancestor));
      parent = ancestor.parentId;
    }
  }
  const signature = (p: Page, root: Bullet) =>
    JSON.stringify(
      [root, ...descendants(p, root.id)].map((b) => [
        identity(b),
        b.id === root.id
          ? null
          : identity(p.bullets.find((x) => x.id === b.parentId)!),
        b.html,
        b.kind,
        b.completed,
        b.dueDate,
      ]),
    );
  const roots = orderedBullets(source)
    .map((x) => x.bullet)
    .filter((b) => {
      const prior = before?.bullets.find((x) => x.id === b.id);
      return !prior || signature(before!, prior) !== signature(source, b);
    })
    .reverse();
  const synchronized = new Set<string>();
  for (const root of roots) {
    if (synchronized.has(identity(root))) continue;
    synchronized.add(identity(root));
    const children = descendants(source, root.id);
    next = {
      ...next,
      pages: next.pages.map((p) => {
        // Snapshot targets before replacement: a page may contain multiple linked placements.
        const targets = p.bullets.filter(
          (b) => identity(b) === identity(root) && b.id !== root.id,
        );
        let bullets = p.bullets;
        for (const target of targets) {
          const prior = descendants({ ...p, bullets }, target.id);
          const mapping = new Map<string, string>([[root.id, target.id]]);
          const used = new Set<string>();
          const copies = children.map((b) => {
            const old = prior.find(
              (x) => identity(x) === identity(b) && !used.has(x.id),
            );
            const id = old?.id ?? uid();
            used.add(id);
            mapping.set(b.id, id);
            return {
              ...b,
              id,
              sharedId: identity(b),
              parentId: mapping.get(b.parentId!)!,
            };
          });
          const removed = new Set(prior.map((b) => b.id));
          const at = bullets.findIndex((b) => b.id === target.id);
          bullets = bullets.filter((b) => !removed.has(b.id));
          const index = bullets.findIndex((b) => b.id === target.id);
          if (at < 0 || index < 0) continue;
          bullets[index] = {
            ...target,
            html: root.html,
            kind: root.kind,
            completed: root.completed,
            dueDate: root.dueDate,
            lastEditedPageId: root.lastEditedPageId,
          };
          bullets.splice(index + 1, 0, ...copies);
        }
        return { ...p, bullets };
      }),
    };
  }
  const activeIds = new Set(
    next.taskLists.find((l) => l.id === next.activeListId)!.taskIds,
  );
  const blocked = new Set(
    next.pages
      .flatMap((p) => p.bullets)
      .filter((b) => b.kind === "task" && b.completed && !canComplete(next, b))
      .map(identity),
  );
  if (blocked.size) {
    next.pages = next.pages.map((p) => ({
      ...p,
      bullets: p.bullets.map((b) =>
        blocked.has(identity(b)) ? { ...b, completed: false } : b,
      ),
    }));
    blocked.forEach((id) => activeIds.add(id));
  }
  // A newly inserted/conversion task joins the current list; excluded completed
  // historical tasks do not rejoin merely because their page was edited.
  const oldTaskKeys = new Set(
    db.pages
      .flatMap((p) => p.bullets)
      .filter((b) => b.kind === "task")
      .map(identity),
  );
  next.pages
    .flatMap((p) => p.bullets)
    .filter((b) => b.kind === "task" && !oldTaskKeys.has(identity(b)))
    .forEach((b) => activeIds.add(identity(b)));
  next.taskLists = next.taskLists.map((l) =>
    l.id === next.activeListId ? { ...l, taskIds: [...activeIds] } : l,
  );
  return next;
}

export function deleteBullets(
  db: Notebook,
  pageId: string,
  ids: string[],
  includeChildren = false,
): Notebook {
  return editPage(db, pageId, (p) => {
    const removed = new Set(ids);
    if (includeChildren)
      ids.forEach((id) => descendants(p, id).forEach((b) => removed.add(b.id)));
    const parentOf = (b: Bullet): string | null => {
      let parent = b.parentId;
      while (parent && removed.has(parent))
        parent = p.bullets.find((x) => x.id === parent)?.parentId ?? null;
      return parent;
    };
    return {
      ...p,
      bullets: p.bullets
        .filter((b) => !removed.has(b.id))
        .map((b) => ({ ...b, parentId: parentOf(b) })),
    };
  });
}

export function removeNavigation(
  db: Notebook,
  kind: "section" | "subsection" | "page",
  id: string,
): Notebook {
  const subsections = new Set(
    kind === "section"
      ? db.sections.filter((s) => s.customerId === id).map((s) => s.id)
      : kind === "subsection"
        ? [id]
        : [],
  );
  const pages = new Set(
    kind === "page"
      ? [id]
      : db.pages.filter((p) => subsections.has(p.sectionId)).map((p) => p.id),
  );
  let count = -1;
  while (count !== pages.size) {
    count = pages.size;
    db.pages
      .filter((p) => p.parentId && pages.has(p.parentId))
      .forEach((p) => pages.add(p.id));
  }
  return {
    ...db,
    customers:
      kind === "section"
        ? db.customers.filter((c) => c.id !== id)
        : db.customers,
    sections: db.sections.filter((s) => !subsections.has(s.id)),
    pages: db.pages.filter((p) => !pages.has(p.id)),
  };
}

export function movePage(
  db: Notebook,
  id: string,
  sectionId: string,
  parentId: string | null,
  beforeId: string | null = null,
): Notebook {
  const page = db.pages.find((p) => p.id === id);
  if (!page || id === beforeId || !db.sections.some((s) => s.id === sectionId))
    return db;
  const family = new Set([id]);
  let size = -1;
  while (size !== family.size) {
    size = family.size;
    db.pages
      .filter((p) => p.parentId && family.has(p.parentId))
      .forEach((p) => family.add(p.id));
  }
  if (parentId && family.has(parentId)) return db;
  if (
    parentId &&
    !db.pages.some((p) => p.id === parentId && p.sectionId === sectionId)
  )
    return db;
  const pages = db.pages
    .filter((p) => p.id !== id)
    .map((p) => (family.has(p.id) ? { ...p, sectionId } : p));
  const index = beforeId
    ? pages.findIndex((p) => p.id === beforeId)
    : pages.length;
  if (index < 0) return db;
  pages.splice(index, 0, { ...page, sectionId, parentId });
  return { ...db, pages };
}

export function reorderTask(
  db: Notebook,
  id: string,
  before: string,
  after = false,
): Notebook {
  if (id === before) return db;
  return {
    ...db,
    taskLists: db.taskLists.map((l) => {
      if (
        l.id !== db.activeListId ||
        !l.taskIds.includes(id) ||
        !l.taskIds.includes(before)
      )
        return l;
      const ids = l.taskIds.filter((x) => x !== id);
      ids.splice(ids.indexOf(before) + (after ? 1 : 0), 0, id);
      return { ...l, taskIds: ids };
    }),
  };
}

export function quickDate(
  which: "today" | "tomorrow" | "eow",
  now = new Date(),
): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (which === "tomorrow") date.setDate(date.getDate() + 1);
  if (which === "eow")
    date.setDate(date.getDate() + ((5 - date.getDay() + 7) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
