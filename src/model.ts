export type Bullet = {
  id: string;
  parentId: string | null;
  kind: "information" | "task";
  html: string;
  completed: boolean;
  dueDate: string | null;
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
  information: { bullet: Bullet; depth: number }[];
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
  ui?: { collapsedSections: string[]; collapsedSubsections: string[] };
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
  return db.pages.flatMap((page) =>
    page.bullets
      .filter(
        (b) =>
          b.kind === "task" &&
          db.taskLists
            .find((l) => l.id === db.activeListId)!
            .taskIds.includes(b.id),
      )
      .map((bullet) => {
        const section = db.sections.find((s) => s.id === page.sectionId);
        const customerName =
          db.customers.find((c) => c.id === section?.customerId)?.name ?? "";
        const information: Task["information"] = [];
        function walk(parent: string, depth: number) {
          for (const b of page.bullets.filter((x) => x.parentId === parent)) {
            if (b.kind === "task") continue;
            information.push({ bullet: b, depth });
            walk(b.id, depth + 1);
          }
        }
        walk(bullet.id, 0);
        return {
          bullet,
          pageId: page.id,
          pageTitle: page.title,
          customerName,
          information,
        };
      }),
  );
}
export function updateBullet(
  db: Notebook,
  id: string,
  fn: (b: Bullet) => Bullet,
): Notebook {
  let add = false;
  const pages = db.pages.map((p) => ({
    ...p,
    bullets: p.bullets.map((b) => {
      if (b.id !== id) return b;
      const next = fn(b);
      add =
        next.kind === "task" &&
        (b.kind !== "task" || (b.completed && !next.completed));
      return next;
    }),
  }));
  return {
    ...db,
    pages,
    taskLists: add
      ? db.taskLists.map((l) =>
          l.id === db.activeListId
            ? { ...l, taskIds: [...new Set([...l.taskIds, id])] }
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
          .map((t) => t.bullet.id),
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
      [...d.ui.collapsedSections, ...d.ui.collapsedSubsections].some(
        (id) => typeof id !== "string",
      ))
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
        if (!Number.isInteger(i.depth) || i.depth < 0)
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
