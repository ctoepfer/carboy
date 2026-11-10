// Migration check page (test only; run by tools/migration_check.sh).
//
// Real migration machinery exercised through the Tauri shell using a
// test-defined migration step; this is not a real product schema migration.
// The page uses @carboy/recipe-library's own openSqliteStore and migrate()
// (backup with VACUUM INTO, one transaction, rollback on failure) over the
// shell's single rusqlite connection. Only the version 1 -> 2 step below is
// test-defined, passed in through the existing `migrations` option; the
// library has no product step after version 1 yet. Repeat this check against
// the first real schema upgrade when one exists.
//
// $SPIKE_MIGRATE selects the mode:
//   populate  real 0 -> 1 bootstrap, then representative recipes and revisions
//   migrate   run the test step (backup to $SPIKE_MIGRATE_BACKUP)
//   fail      the test step throws after its DDL, before the commit
//   barrier   the test step logs "migration: barrier reached" after its DDL and
//             waits forever, so the harness can kill the shell at that point
//   verify    reopen as the app would (openSqliteStore with the steps matching
//             the file's version, so nothing migrates), then read everything
//   inspect   raw reads only, without openSqliteStore (for backups, which
//             must not be changed by opening them through the library)
// $SPIKE_MIGRATE_DB names the file to open (default migrate.db). The page
// refuses to run without $SPIKE_DATA_DIR and SPIKE_AUTO=1, so it can't touch
// the app's normal data.
import { LIBRARY_MIGRATIONS, createLibrary, createRevision, openSqliteStore, readNative, tauriDriver } from "./recipe-library/index.js";
import { uuidv7 } from "./core/index.js";

const { invoke } = window.__TAURI__.core;
const log = (m) => invoke("log", { message: `/migrate.html: ${m}` });
const env = (name) => invoke("spike_env", { name });
const report = (data) => invoke("report", { json: JSON.stringify(data, null, 2) });

const MARKER_COLUMN = "test_migration_note";
const MARKER_TABLE = "test_migration_marker";

// The test-defined step. Everything before the hook is ordinary migration
// work inside migrate()'s transaction: two DDL statements, one row, and the
// version. The hook decides what happens before the commit.
const testStep = (hook) => ({
  version: 2,
  up: async (run) => {
    await run(`ALTER TABLE recipe ADD COLUMN ${MARKER_COLUMN} TEXT`);
    await run(`CREATE TABLE ${MARKER_TABLE} (id INTEGER PRIMARY KEY, note TEXT NOT NULL)`);
    await run(`INSERT INTO ${MARKER_TABLE} (id, note) VALUES (1, 'test step ran')`);
    await run("PRAGMA user_version = 2");
    await hook();
  },
});
// What the open transaction holds at the hook, read on the same connection:
// evidence that the step's changes exist before the failure or the kill.
let connection;
const inTransaction = async () => {
  const columns = (await connection.all("PRAGMA table_info(recipe)")).map((r) => r.name);
  const tables = (await connection.all("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name);
  return { user_version: Number(first(await connection.all("PRAGMA user_version"))), column: columns.includes(MARKER_COLUMN), table: tables.includes(MARKER_TABLE) };
};
const hooks = {
  migrate: async () => {},
  fail: async () => {
    result.in_transaction = await inTransaction();
    throw new Error("injected test failure after the step's DDL");
  },
  barrier: async () => {
    const t = await inTransaction();
    await log(`migration: barrier reached (in transaction: version ${t.user_version}, column ${t.column}, table ${t.table})`);
    await new Promise(() => {}); // the harness kills the shell here
  },
};

const first = (rows) => (rows[0] ? Object.values(rows[0])[0] : undefined);

// Everything the harness compares, read straight from the connection.
async function snapshot(driver) {
  const user_version = Number(first(await driver.all("PRAGMA user_version")));
  const integrity = String(first(await driver.all("PRAGMA integrity_check")));
  const journal_mode = String(first(await driver.all("PRAGMA journal_mode")));
  const tables = (await driver.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);
  const recipe_columns = tables.includes("recipe") ? (await driver.all("PRAGMA table_info(recipe)")).map((r) => r.name) : [];
  const marker_rows = tables.includes(MARKER_TABLE) ? Number(first(await driver.all(`SELECT COUNT(*) FROM ${MARKER_TABLE}`))) : null;
  const recipes = tables.includes("recipe") ? await driver.all("SELECT recipe_id, name, beverage, head, updated_at, deleted_at FROM recipe ORDER BY recipe_id") : [];
  const revisions = [];
  if (tables.includes("revision")) {
    for (const r of await driver.all("SELECT seq, revision_id, recipe_id, parents, content_hash, document FROM revision ORDER BY seq")) {
      const read = readNative(r.document);
      const verified = read.status === "editable" && read.revision.envelope.content_hash === r.content_hash && read.revision.envelope.revision_id === r.revision_id;
      revisions.push({ seq: r.seq, revision_id: r.revision_id, recipe_id: r.recipe_id, parents: r.parents, content_hash: r.content_hash, verified });
    }
  }
  return { user_version, integrity, journal_mode, tables, recipe_columns, marker_rows, recipes, revisions };
}

// Representative data: several recipes with linear histories of different
// lengths, two beverages, and one recipe deleted (recoverable) with history.
const content = (name, type, i) => ({
  name, beverage: { type }, targets: {}, ingredients: [], process: { stages: [], flows: [] }, additions: [], statistics: {}, calculation_settings: {},
  notes: [{ id: uuidv7(Date.now()), text: `Revision ${i} of ${name}. ${"x".repeat(400 + i * 37)}` }],
});
async function populate(library) {
  const plan = [["Test Pale Ale", "beer", 12], ["Test Dry Stout", "beer", 7], ["Test Cider", "cider", 4], ["Test Deleted Lager", "beer", 3]];
  for (const [name, type, count] of plan) {
    const recipe_id = uuidv7(Date.now());
    let parent;
    for (let i = 0; i < count; i++) {
      const revision_id = uuidv7(Date.now());
      await library.save(createRevision({ schema_version: "0.3", recipe_id, revision_id, parents: parent ? [parent] : [], created_at: new Date(Date.UTC(2026, 10, 1, 12, 0, i)).toISOString(), origin: "user_edit" }, content(name, type, i)));
      parent = revision_id;
    }
    if (name.includes("Deleted")) await library.remove(recipe_id, "2026-11-02T12:00:00.000Z");
  }
}

const result = { page: "migrate" };
try {
  const mode = await env("SPIKE_MIGRATE");
  const dataDir = await env("SPIKE_DATA_DIR");
  result.mode = mode;
  if (!(await invoke("auto_mode")) || !dataDir) throw new Error("test-only page: needs SPIKE_AUTO=1 and SPIKE_DATA_DIR");
  if (!["populate", "migrate", "fail", "barrier", "verify", "inspect"].includes(mode)) throw new Error(`unknown SPIKE_MIGRATE: ${mode}`);
  const name = (await env("SPIKE_MIGRATE_DB")) ?? "migrate.db";
  result.db = name;
  const { apple } = await invoke("library_open", { name });
  const driver = tauriDriver(invoke);
  connection = driver;
  result.before = await snapshot(driver);
  await log(`${mode}: opened ${name} at version ${result.before.user_version}`);

  if (mode === "populate") {
    if (result.before.user_version !== 0 || result.before.tables.length) throw new Error("populate needs a new database");
    const store = await openSqliteStore(driver, { apple }); // the real 0 -> 1 bootstrap
    await populate(createLibrary(store));
    await driver.run("PRAGMA wal_checkpoint(TRUNCATE)"); // a self-contained fixture file
  } else if (mode === "verify") {
    // Open as the app would, with the steps matching what's on disk, so
    // nothing migrates; then read every live recipe's head through the library.
    const migrations = result.before.user_version >= 2 ? [...LIBRARY_MIGRATIONS, testStep(hooks.migrate)] : LIBRARY_MIGRATIONS;
    const library = createLibrary(await openSqliteStore(driver, { apple, migrations }));
    const heads = [];
    for (const r of await library.list()) heads.push({ recipe_id: r.recipe_id, head: r.head, status: (await library.open(r.recipe_id)).status });
    result.library_heads = heads;
  } else if (mode === "inspect") {
    // Nothing beyond the snapshots.
  } else {
    const backup = await env("SPIKE_MIGRATE_BACKUP");
    if (!backup) throw new Error("SPIKE_MIGRATE_BACKUP is required");
    const sep = dataDir.includes("\\") && !dataDir.includes("/") ? "\\" : "/";
    result.backup = `${dataDir.replace(/[\\/]+$/, "")}${sep}${backup}`;
    await log(`${mode}: migrating, backup ${result.backup}`);
    try {
      await openSqliteStore(driver, { apple, backupPath: result.backup, migrations: [...LIBRARY_MIGRATIONS, testStep(hooks[mode])] });
      result.migration = { status: "migrated" };
    } catch (e) {
      result.migration = { status: "error", code: e.code ?? null, message: String(e.message ?? e), details: e.details ?? null };
    }
  }
  result.after = await snapshot(driver);
  result.ok = true;
} catch (e) {
  result.ok = false;
  result.error = String(e?.message ?? e);
}
document.getElementById("summary").textContent = result.ok ? `${result.mode}: done` : `failed: ${result.error}`;
await log(`${result.mode}: report`);
await report(result);
