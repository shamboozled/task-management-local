const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { NotebookDatabase } = require("./database.cjs");
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "task-notebook-db-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const sample = {
  version: 1,
  customers: [{ id: "section", name: "Acme" }],
  pages: [
    {
      id: "p",
      bullets: [
        {
          html: '<table><tr><td>Notes</td></tr></table><img src="data:image/png;base64,AA==">',
        },
      ],
    },
  ],
  taskLists: [{ title: "10/10/2026", snapshot: [] }],
  activeListId: "list",
};
test("notebook data survives closing and reopening from its own file", (t) => {
  const dir = temp(t);
  let db = new NotebookDatabase(dir);
  assert.equal(db.load(), null);
  db.save(sample);
  db.close();
  db = new NotebookDatabase(dir);
  assert.deepEqual(db.load(), sample);
  db.close();
});
test("automatic daily backup holds the prior notebook before writing changes", (t) => {
  const db = new NotebookDatabase(temp(t));
  db.save(sample);
  db.save({ ...sample, activeListId: "next" });
  db.save({ ...sample, activeListId: "latest" });
  const files = fs.readdirSync(db.backupDirectory);
  assert.equal(files.length, 1);
  const backup = new DatabaseSync(path.join(db.backupDirectory, files[0]), {
    readOnly: true,
  });
  assert.deepEqual(
    JSON.parse(backup.prepare("SELECT contents FROM notebook").get().contents),
    sample,
  );
  backup.close();
  db.close();
});
test("failed serialization does not replace the last saved notebook", (t) => {
  const db = new NotebookDatabase(temp(t));
  db.save(sample);
  const invalid = {};
  invalid.self = invalid;
  assert.throws(() => db.save(invalid));
  assert.deepEqual(db.load(), sample);
  db.close();
});
test("manual backup is a restorable standalone SQLite database", (t) => {
  const dir = temp(t),
    db = new NotebookDatabase(dir);
  db.save(sample);
  const backup = db.backup("restore");
  db.save({ ...sample, pages: [] });
  db.close();
  fs.copyFileSync(backup, path.join(dir, "notebook.sqlite"));
  const restored = new NotebookDatabase(dir);
  assert.deepEqual(restored.load(), sample);
  restored.close();
});
test("corrupt databases are preserved and never replaced with an empty notebook", (t) => {
  const dir = temp(t),
    file = path.join(dir, "notebook.sqlite");
  fs.writeFileSync(file, "damaged original");
  assert.throws(() => new NotebookDatabase(dir));
  assert.equal(fs.readFileSync(file, "utf8"), "damaged original");
});
test("automatic backups retain the newest 30 copies", (t) => {
  const db = new NotebookDatabase(temp(t));
  db.save(sample);
  for (let i = 0; i < 33; i++) db.backup("manual");
  assert.equal(fs.readdirSync(db.backupDirectory).length, 30);
  db.close();
});
