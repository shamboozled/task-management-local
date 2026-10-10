const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class NotebookDatabase {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.directory = directory;
    this.file = path.join(directory, "notebook.sqlite");
    this.backupDirectory = path.join(directory, "backups");
    this.db = new DatabaseSync(this.file);
    this.db.exec(
      "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS notebook (id INTEGER PRIMARY KEY CHECK(id=1), contents TEXT NOT NULL, updated_at TEXT NOT NULL);",
    );
    const integrity = this.db.prepare("PRAGMA quick_check").get();
    if (integrity.quick_check !== "ok")
      throw new Error(
        "Notebook database needs recovery. Your original database and backups have been preserved.",
      );
  }
  load() {
    const row = this.db
      .prepare("SELECT contents FROM notebook WHERE id=1")
      .get();
    return row ? JSON.parse(row.contents) : null;
  }
  backup(reason = "daily") {
    if (!this.load()) return null;
    fs.mkdirSync(this.backupDirectory, { recursive: true });
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (
      reason === "daily" &&
      fs
        .readdirSync(this.backupDirectory)
        .some((f) => f.startsWith(day + "-daily-"))
    )
      return null;
    const filename = `${day}-${reason}-${Date.now()}-${randomUUID()}.sqlite`;
    const target = path.join(this.backupDirectory, filename);
    this.db.prepare("VACUUM INTO ?").run(target);
    const backups = fs
      .readdirSync(this.backupDirectory)
      .filter((f) =>
        /^\d{4}-\d{2}-\d{2}-(daily|manual|restore)-\d+-[a-f0-9-]+\.sqlite$/.test(
          f,
        ),
      )
      .sort(
        (a, b) =>
          fs.statSync(path.join(this.backupDirectory, b)).mtimeMs -
          fs.statSync(path.join(this.backupDirectory, a)).mtimeMs,
      );
    for (const old of backups.slice(30))
      fs.unlinkSync(path.join(this.backupDirectory, old));
    return target;
  }
  save(value) {
    // The entire notebook is committed atomically. Failed writes leave the prior record intact.
    const contents = JSON.stringify(value);
    this.backup("daily");
    this.db
      .prepare(
        "INSERT INTO notebook (id,contents,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET contents=excluded.contents,updated_at=excluded.updated_at",
      )
      .run(contents, new Date().toISOString());
  }
  close() {
    this.db.close();
  }
}
module.exports = { NotebookDatabase };
