// A test-only driver over Node's built-in SQLite (Node 22 and later). The
// package itself has no Node dependency: a host supplies its own driver.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let sqlite;
try {
  sqlite = require("node:sqlite");
} catch {
  sqlite = undefined;
}
export const available = sqlite !== undefined;

const opened = new Set();

// Windows can't delete a file that is still open, so tests close these first.
export function closeAllDrivers() {
  for (const db of opened) if (db.isOpen) db.close();
  opened.clear();
}

export function nodeDriver(path) {
  const db = new sqlite.DatabaseSync(path);
  opened.add(db);
  return {
    run: async (sql, params = []) => void db.prepare(sql).run(...params),
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    close: () => db.close(),
  };
}
