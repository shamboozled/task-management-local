import { emptyNotebook, validateBackup, type Notebook } from "./model";
let queue: Promise<void> = Promise.resolve();
export async function load() {
  if (!window.notebookDesktop)
    throw Error(
      "Open this app with the desktop executable or npm start. Browser storage is not used.",
    );
  const saved = await window.notebookDesktop.load();
  return saved ? validateBackup(saved) : emptyNotebook();
}
export function save(state: Notebook) {
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (!window.notebookDesktop)
        throw Error("Desktop storage is unavailable.");
      await window.notebookDesktop.save(state);
    });
  return queue;
}
export function flush() {
  return queue;
}
