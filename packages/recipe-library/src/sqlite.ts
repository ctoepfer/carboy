import { LibraryError, type LibraryStore, type RecipeRow, type RevisionRow, type StoreTransaction } from "./contract.js";

// SQLite store (ADR 0006, still Proposed): revisions as whole documents with a
// few index columns, ordinary tables around them. It takes a driver, so this
// package needs no Node, Tauri, or Rust; a host supplies one connection.
//
// A driver must be ONE connection: `PRAGMA`s and transactions are per
// connection, so a pooled driver would silently lose both.

export interface SqlDriver {
  run(sql: string, params?: readonly (string | number | null)[]): Promise<unknown>;
  all(sql: string, params?: readonly (string | number | null)[]): Promise<{ readonly [column: string]: unknown }[]>;
}

export interface LibraryMigration {
  /** The database version this step produces. Consecutive from 1. */
  readonly version: number;
  /** Runs inside the single migration transaction; a thrown error rolls everything back. */
  readonly up: (run: (sql: string) => Promise<unknown>) => Promise<void>;
}

/** The database's own version (`user_version`), separate from document schema versions. */
export const LIBRARY_MIGRATIONS: readonly LibraryMigration[] = [
  {
    version: 1,
    up: async (run) => {
      await run("CREATE TABLE recipe (recipe_id TEXT PRIMARY KEY, name TEXT NOT NULL, beverage TEXT NOT NULL, head TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT)");
      await run("CREATE TABLE revision (seq INTEGER PRIMARY KEY AUTOINCREMENT, revision_id TEXT NOT NULL UNIQUE, recipe_id TEXT NOT NULL, parents TEXT NOT NULL, created_at TEXT NOT NULL, origin TEXT NOT NULL, content_hash TEXT NOT NULL, document TEXT NOT NULL)");
      await run("CREATE INDEX revision_by_recipe ON revision (recipe_id, seq)");
    },
  },
];

export interface SqliteOptions {
  /** Where to back up before migrating data. Must not exist yet. */
  readonly backupPath?: string;
  /** macOS and iOS: fsync alone doesn't reach stable storage (ADR 0006). */
  readonly apple?: boolean;
  /** How long to wait for a lock before failing. A stuck database must not hang the app. */
  readonly busyTimeoutMs?: number;
  readonly migrations?: readonly LibraryMigration[];
}

export interface SqliteStore extends LibraryStore {
  schemaVersion(): Promise<number>;
  integrityCheck(): Promise<string>;
}

const first = (rows: { readonly [column: string]: unknown }[]): unknown => (rows[0] ? Object.values(rows[0])[0] : undefined);

export async function openSqliteStore(driver: SqlDriver, options: SqliteOptions = {}): Promise<SqliteStore> {
  const migrations = options.migrations ?? LIBRARY_MIGRATIONS;
  await driver.run(`PRAGMA busy_timeout = ${Math.trunc(options.busyTimeoutMs ?? 5000)}`);
  await applyDurability(driver, options.apple === true);
  await migrate(driver, migrations, options.backupPath);

  let queue: Promise<unknown> = Promise.resolve();
  return {
    transaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        await driver.run("BEGIN IMMEDIATE");
        try {
          const result = await fn(transaction(driver));
          await driver.run("COMMIT");
          return result;
        } catch (e) {
          await driver.run("ROLLBACK");
          throw e;
        }
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
    schemaVersion: async () => Number(first(await driver.all("PRAGMA user_version"))),
    integrityCheck: async () => String(first(await driver.all("PRAGMA integrity_check"))),
  };
}

/** Sets the durability default, then reads it back: what counts is what the connection actually uses. */
async function applyDurability(driver: SqlDriver, apple: boolean): Promise<void> {
  const mode = String(first(await driver.all("PRAGMA journal_mode = WAL"))).toLowerCase();
  await driver.run("PRAGMA synchronous = FULL");
  if (apple) {
    await driver.run("PRAGMA fullfsync = ON");
    await driver.run("PRAGMA checkpoint_fullfsync = ON");
  }
  const synchronous = Number(first(await driver.all("PRAGMA synchronous")));
  if (mode !== "wal" || synchronous !== 2) throw new LibraryError("durability-not-met", "this storage can't give WAL with synchronous FULL", { journal_mode: mode, synchronous });
}

async function migrate(driver: SqlDriver, migrations: readonly LibraryMigration[], backupPath: string | undefined): Promise<void> {
  const current = Number(first(await driver.all("PRAGMA user_version")));
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) throw new LibraryError("library-newer", "this library was written by a newer version", { version: current, supported: latest });
  const pending = migrations.filter((m) => m.version > current);
  if (pending.length === 0) return;
  if (current > 0) {
    if (backupPath === undefined) throw new LibraryError("backup-required", "a library with data isn't migrated without a backup", { version: current });
    try {
      await driver.run("VACUUM INTO ?", [backupPath]);
    } catch (e) {
      throw new LibraryError("backup-failed", "the backup couldn't be made, so nothing was migrated", { cause: String(e) });
    }
  }
  // One transaction for every pending step, so a library is never between versions.
  await driver.run("BEGIN IMMEDIATE");
  let step = pending[0]!.version;
  try {
    for (const m of pending) {
      step = m.version;
      await m.up((sql) => driver.run(sql));
      await driver.run(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    }
    await driver.run("COMMIT");
  } catch (e) {
    await driver.run("ROLLBACK");
    throw new LibraryError("migration-failed", "the migration failed and was rolled back", { version: step, cause: String(e) });
  }
}

type Row = { readonly [column: string]: unknown };

const recipeRow = (r: Row): RecipeRow => ({
  recipe_id: String(r["recipe_id"]),
  name: String(r["name"]),
  beverage: String(r["beverage"]),
  head: String(r["head"]),
  updated_at: String(r["updated_at"]),
  deleted_at: r["deleted_at"] === null ? null : String(r["deleted_at"]),
});

const revisionRow = (r: Row): RevisionRow => ({
  revision_id: String(r["revision_id"]),
  recipe_id: String(r["recipe_id"]),
  parents: JSON.parse(String(r["parents"])) as string[],
  created_at: String(r["created_at"]),
  origin: String(r["origin"]),
  content_hash: String(r["content_hash"]),
  document: String(r["document"]),
});

function transaction(d: SqlDriver): StoreTransaction {
  return {
    async getRecipe(id) {
      const [row] = await d.all("SELECT * FROM recipe WHERE recipe_id = ?", [id]);
      return row ? recipeRow(row) : undefined;
    },
    async putRecipe(r) {
      await d.run(
        "INSERT INTO recipe (recipe_id, name, beverage, head, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (recipe_id) DO UPDATE SET name = excluded.name, beverage = excluded.beverage, head = excluded.head, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at",
        [r.recipe_id, r.name, r.beverage, r.head, r.updated_at, r.deleted_at],
      );
    },
    async listRecipes() {
      const rows = await d.all("SELECT recipe.*, (SELECT COUNT(*) FROM revision WHERE revision.recipe_id = recipe.recipe_id) AS revisions FROM recipe");
      return rows.map((r) => ({ ...recipeRow(r), revisions: Number(r["revisions"]) }));
    },
    async getRevision(id) {
      const [row] = await d.all("SELECT * FROM revision WHERE revision_id = ?", [id]);
      return row ? revisionRow(row) : undefined;
    },
    async insertRevision(r) {
      await d.run("INSERT INTO revision (revision_id, recipe_id, parents, created_at, origin, content_hash, document) VALUES (?, ?, ?, ?, ?, ?, ?)", [r.revision_id, r.recipe_id, JSON.stringify(r.parents), r.created_at, r.origin, r.content_hash, r.document]);
    },
    async listRevisions(id) {
      return (await d.all("SELECT * FROM revision WHERE recipe_id = ? ORDER BY seq", [id])).map(revisionRow);
    },
    async deleteRecipe(id) {
      await d.run("DELETE FROM revision WHERE recipe_id = ?", [id]);
      await d.run("DELETE FROM recipe WHERE recipe_id = ?", [id]);
    },
  };
}
