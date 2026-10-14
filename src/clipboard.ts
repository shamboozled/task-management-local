import {
  contentContainers,
  type Notebook,
  type Page,
  type Bullet,
  orderedBullets,
  descendants,
  identity,
  uid,
  editPage,
  updateBullet,
  tasksOf,
} from "./model";
import { sanitize } from "./rich";

export const bulletMime = "application/x-task-notebook-bullets";
export type BulletClipboard = {
  format: "task-notebook/bullets";
  version: 1;
  notebookId?: string;
  entries: { bullet: Bullet; depth: number; linked: boolean }[];
};

export function copyBullets(
  db: Notebook,
  page: Page,
  ids: string[],
): BulletClipboard {
  const selected = new Set(ids);
  const roots = orderedBullets(page).filter(({ bullet }) => {
    if (!selected.has(bullet.id)) return false;
    let parent = bullet.parentId;
    while (parent) {
      if (selected.has(parent)) return false;
      parent = page.bullets.find((b) => b.id === parent)?.parentId ?? null;
    }
    return true;
  });
  const entries: BulletClipboard["entries"] = [];
  for (const { bullet: root } of roots) {
    const family = new Set([
      root.id,
      ...descendants(page, root.id).map((b) => b.id),
    ]);
    const depth = new Map<string, number>();
    const linked = new Map<string, boolean>();
    for (const { bullet } of orderedBullets(page).filter((x) =>
      family.has(x.bullet.id),
    )) {
      const level =
        bullet.id === root.id ? 0 : (depth.get(bullet.parentId!) ?? 0) + 1;
      const share =
        bullet.kind === "task" || (linked.get(bullet.parentId!) ?? false);
      depth.set(bullet.id, level);
      linked.set(bullet.id, share);
      entries.push({ bullet: { ...bullet }, depth: level, linked: share });
    }
  }
  return {
    format: "task-notebook/bullets",
    version: 1,
    notebookId: db.notebookId,
    entries,
  };
}

// Copy selected logical roots in display order, without copying a selected
// descendant again when it is already included in another selected subtree.
export function copyTasks(db: Notebook, ids: string[]): BulletClipboard {
  const live = tasksOf(db);
  const selected = [...new Set(ids)]
    .map((id) => live.find((t) => identity(t.bullet) === id))
    .filter((t) => t !== undefined);
  const roots = selected.filter(
    (task) =>
      !selected.some(
        (parent) =>
          parent !== task &&
          parent.information.some(
            (i) => !i.sibling && identity(i.bullet) === identity(task.bullet),
          ),
      ),
  );
  return {
    format: "task-notebook/bullets",
    version: 1,
    notebookId: db.notebookId,
    entries: roots.flatMap((task) => {
      const source = contentContainers(db).find((p) =>
        p.bullets.some((b) => b.id === task.bullet.id),
      )!;
      return copyBullets(db, source, [task.bullet.id]).entries;
    }),
  };
}

export function clipboardHtml(payload: BulletClipboard): string {
  const container = document.createElement("div");
  container.setAttribute(
    "data-task-notebook",
    encodeURIComponent(JSON.stringify(payload)),
  );
  const roots = document.createElement("ul");
  container.append(roots);
  const lists = [roots];
  for (const { bullet, depth } of payload.entries) {
    while (lists.length > depth + 1) lists.pop();
    while (lists.length < depth + 1) {
      const list = document.createElement("ul");
      const parent = lists.at(-1)!;
      const li =
        parent.lastElementChild ??
        parent.appendChild(document.createElement("li"));
      li.append(list);
      lists.push(list);
    }
    const li = document.createElement("li");
    li.innerHTML = sanitize(bullet.html);
    lists.at(-1)!.append(li);
  }
  return container.outerHTML;
}

export function readBulletClipboard(
  data: DataTransfer,
): BulletClipboard | null {
  try {
    let raw = data.getData(bulletMime);
    if (!raw) {
      const doc = new DOMParser().parseFromString(
        data.getData("text/html"),
        "text/html",
      );
      const marker = doc
        .querySelector("[data-task-notebook]")
        ?.getAttribute("data-task-notebook");
      if (marker) raw = decodeURIComponent(marker);
    }
    if (!raw || raw.length > 100 * 1024 * 1024) return null;
    const parsed = JSON.parse(raw) as BulletClipboard;
    if (
      parsed.format !== "task-notebook/bullets" ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.length
    )
      return null;
    let previous = 0;
    for (const [i, entry] of parsed.entries.entries()) {
      const b = entry.bullet;
      if (
        !b ||
        typeof b.id !== "string" ||
        typeof b.html !== "string" ||
        !["task", "information"].includes(b.kind) ||
        typeof b.completed !== "boolean" ||
        !(
          b.dueDate === null ||
          (typeof b.dueDate === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate))
        ) ||
        typeof entry.linked !== "boolean" ||
        !Number.isInteger(entry.depth) ||
        entry.depth < 0 ||
        entry.depth > previous + 1 ||
        (i === 0 && entry.depth !== 0)
      )
        return null;
      if (b.sharedId !== undefined && typeof b.sharedId !== "string")
        return null;
      if (
        b.taskListContextId !== undefined &&
        typeof b.taskListContextId !== "string"
      )
        return null;
      previous = entry.depth;
      b.html = sanitize(b.html);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function pasteBullets(
  db: Notebook,
  pageId: string,
  targetId: string | null,
  payload: BulletClipboard,
): { db: Notebook; focus: string } {
  const page = contentContainers(db).find((p) => p.id === pageId)!;
  const target = page.bullets.find((b) => b.id === targetId);
  const same = !!db.notebookId && payload.notebookId === db.notebookId;
  let entries = payload.entries;
  // Read current linked content, including children added since copying. Cut
  // payloads remain self-contained when their last placement has been removed.
  if (same) {
    const fresh: typeof entries = [];
    for (let i = 0; i < entries.length;) {
      const entry = entries[i];
      const end = entries.findIndex((e, n) => n > i && e.depth <= entry.depth);
      const next = end < 0 ? entries.length : end;
      if (entry.linked && entry.bullet.kind === "task") {
        const sourcePage = contentContainers(db).find((p) =>
          p.bullets.some((b) => identity(b) === identity(entry.bullet)),
        );
        const source = sourcePage?.bullets.find(
          (b) => identity(b) === identity(entry.bullet),
        );
        if (source && sourcePage) {
          const current = copyBullets(db, sourcePage, [source.id]).entries;
          fresh.push(
            ...current.map((e) => ({ ...e, depth: e.depth + entry.depth })),
          );
          i = next;
          continue;
        }
      }
      fresh.push(entry);
      i++;
    }
    entries = fresh;
  }
  // A task cannot contain another placement of itself, directly or indirectly.
  const ancestors = new Set<string>();
  let ancestor = target?.parentId;
  while (ancestor) {
    const b = page.bullets.find((x) => x.id === ancestor);
    if (!b) break;
    ancestors.add(identity(b));
    ancestor = b.parentId;
  }
  if (
    same &&
    entries.some((e) => e.linked && ancestors.has(identity(e.bullet)))
  )
    throw Error(
      "A linked task cannot be pasted inside itself or its descendants.",
    );
  const parents: string[] = [];
  const inserted = entries.map(({ bullet, depth, linked }) => {
    const id = uid();
    const parentId =
      depth === 0 ? (target?.parentId ?? null) : parents[depth - 1];
    parents[depth] = id;
    const b: Bullet = {
      ...bullet,
      id,
      parentId,
      sharedId: same && linked ? identity(bullet) : undefined,
      lastEditedPageId: pageId,
      taskListContextId: undefined,
    };
    return b;
  });
  const blank =
    target &&
    !target.html.replace(/<[^>]+>/g, "").trim() &&
    !/<(img|table)\b/i.test(target.html);
  let result = editPage(db, pageId, (p) => {
    const bullets = [...p.bullets];
    const position = target
      ? bullets.findIndex((b) => b.id === target.id)
      : bullets.length;
    const after =
      target && !blank
        ? Math.max(
            position,
            ...descendants(p, target.id).map((b) =>
              bullets.findIndex((x) => x.id === b.id),
            ),
          ) + 1
        : position;
    if (blank && target) {
      bullets.splice(position, 1, ...inserted);
      for (let i = 0; i < bullets.length; i++)
        if (bullets[i].parentId === target.id)
          bullets[i] = { ...bullets[i], parentId: inserted[0].id };
    } else bullets.splice(after, 0, ...inserted);
    return { ...p, bullets };
  });
  for (const b of inserted)
    result = updateBullet(result, b.id, (x) => x, pageId);
  // Pasting a cut task that had no remaining placements restores its membership.
  const taskKeys = inserted.filter((b) => b.kind === "task").map(identity);
  return {
    db: {
      ...result,
      taskLists: result.taskLists.map((l) =>
        l.id === result.activeListId
          ? { ...l, taskIds: [...new Set([...l.taskIds, ...taskKeys])] }
          : l,
      ),
    },
    focus: inserted[0].id,
  };
}
