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

export function nodeDriver(path) {
  const db = new sqlite.DatabaseSync(path);
  return {
    run: async (sql, params = []) => void db.prepare(sql).run(...params),
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    close: () => db.close(),
  };
}
