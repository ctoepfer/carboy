// Migration check page (test only; run by tools/migration_check.sh).
//
// The library's real version 1 -> 2 upgrade (the draft table), through the
// Tauri shell: @carboy/recipe-library's own openSqliteStore and migrate()
// (backup with VACUUM INTO, one transaction, rollback on failure) over the
// shell's single rusqlite connection.
//
// - populate builds an old library: only the production version-1 step, as an
//   app from before drafts would have.
// - migrate passes no `migrations` option, so the library uses its own
//   LIBRARY_MIGRATIONS: exactly the path the app takes. Nothing is injected.
// - fail, barrier, and spill need a point inside the transaction, so they pass
//   LIBRARY_MIGRATIONS with the production version-2 step wrapped: its own
//   `up` runs unchanged, and the test hook runs after it (spill: also before
//   it), before migrate() sets the version and commits.
//
// $SPIKE_MIGRATE selects the mode:
//   populate  production 0 -> 1 bootstrap, then representative recipes and revisions
//   migrate   the production upgrade, unmodified (backup to $SPIKE_MIGRATE_BACKUP)
//   fail      the production step, then a thrown error, before the commit
//   barrier   the production step, then "migration: barrier reached" and a
//             wait forever, so the harness can kill the shell at that point
//             (the step's changes are small and stay in the page cache)
//   spill     as barrier, but first: a "step start" barrier before any DDL,
//             released by the harness creating migrate.go in $SPIKE_DATA_DIR
//             (so it can read the WAL before the step writes anything); then,
//             after the production DDL, this connection's cache is shrunk and
//             a fixed volume of rows goes into a test-only table, so SQLite
//             must spill uncommitted pages to the WAL before the "spill barrier"
//   verify    reopen as the app would: at version 2, the production
//             openSqliteStore with no options (nothing left to migrate); at
//             version 1, the version-1 steps only (an unmigrated library needs
//             a backup path to upgrade). Then read everything, and at version 2
//             list drafts through the library
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

const DRAFT_TABLE = "draft"; // what the production version-2 step creates
const SPILL_TABLE = "test_migration_spill";
const V1_ONLY = LIBRARY_MIGRATIONS.filter((m) => m.version === 1);
const PRODUCTION_V2 = LIBRARY_MIGRATIONS.find((m) => m.version === 2);
if (!PRODUCTION_V2 || LIBRARY_MIGRATIONS.at(-1).version !== 2) throw new Error("this check expects the library's latest version to be 2");
// Spill mode: a 16-page cache against about 1 MB of new rows (256 rows of
// 4,000 characters) can't hold the transaction, so pages must reach the WAL.
const SPILL_CACHE_PAGES = 16;
const SPILL_ROWS = 256;

// The production step, wrapped: its own `up` runs unchanged between the hooks.
const wrapped = (hook, before = async () => {}) =>
  LIBRARY_MIGRATIONS.map((m) =>
    m.version !== 2 ? m : {
      version: 2,
      up: async (run) => {
        await before();
        await PRODUCTION_V2.up(run);
        await hook(run);
      },
    });
// Spill mode's first barrier: the transaction has begun, nothing is written
// yet. Waits for the harness's go-file (an event, not a timed delay).
const stepStart = async () => {
  await log("migration: step start");
  for (;;) {
    try {
      await invoke("import_native", { name: "migrate.go" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
};
// What the open transaction holds at the hook, read on the same connection:
// evidence that the step's changes exist before the failure or the kill.
let connection;
// migrate() sets the version after the step returns, so inside the hook it is still 1.
const inTransaction = async () => {
  const tables = (await connection.all("SELECT name FROM sqlite_master WHERE type = 'table'")).map((r) => r.name);
  return { user_version: Number(first(await connection.all("PRAGMA user_version"))), draft_table: tables.includes(DRAFT_TABLE) };
};
const hooks = {
  fail: async () => {
    result.in_transaction = await inTransaction();
    throw new Error("injected test failure after the production step's DDL");
  },
  barrier: async () => {
    const t = await inTransaction();
    await log(`migration: barrier reached (in transaction: version ${t.user_version}, draft table ${t.draft_table})`);
    await new Promise(() => {}); // the harness kills the shell here
  },
  spill: async (run) => {
    await run(`PRAGMA cache_size = ${SPILL_CACHE_PAGES}`); // this test connection only
    await run(`CREATE TABLE ${SPILL_TABLE} (id INTEGER PRIMARY KEY, filler TEXT NOT NULL)`);
    await run(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${SPILL_ROWS}) INSERT INTO ${SPILL_TABLE} (id, filler) SELECT i, substr(replace(hex(zeroblob(2000)), '0', 'x'), 1, 4000) FROM n`);
    const t = await inTransaction();
    const rows = Number(first(await connection.all(`SELECT COUNT(*) FROM ${SPILL_TABLE}`)));
    await log(`migration: spill barrier reached (in transaction: version ${t.user_version}, draft table ${t.draft_table}, spill rows ${rows})`);
    await new Promise(() => {}); // the harness checks the WAL, then kills the shell here
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
  const revision_columns = tables.includes("revision") ? (await driver.all("PRAGMA table_info(revision)")).map((r) => r.name) : [];
  const draft_columns = tables.includes(DRAFT_TABLE) ? (await driver.all(`PRAGMA table_info(${DRAFT_TABLE})`)).map((r) => r.name) : [];
  const draft_rows = tables.includes(DRAFT_TABLE) ? Number(first(await driver.all(`SELECT COUNT(*) FROM ${DRAFT_TABLE}`))) : null;
  const recipes = tables.includes("recipe") ? await driver.all("SELECT recipe_id, name, beverage, head, updated_at, deleted_at FROM recipe ORDER BY recipe_id") : [];
  const revisions = [];
  if (tables.includes("revision")) {
    for (const r of await driver.all("SELECT seq, revision_id, recipe_id, parents, content_hash, document FROM revision ORDER BY seq")) {
      const read = readNative(r.document);
      const verified = read.status === "editable" && read.revision.envelope.content_hash === r.content_hash && read.revision.envelope.revision_id === r.revision_id;
      revisions.push({ seq: r.seq, revision_id: r.revision_id, recipe_id: r.recipe_id, parents: r.parents, content_hash: r.content_hash, verified });
    }
  }
  return { user_version, integrity, journal_mode, tables, recipe_columns, revision_columns, draft_columns, draft_rows, recipes, revisions };
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
  if (!["populate", "migrate", "fail", "barrier", "spill", "verify", "inspect"].includes(mode)) throw new Error(`unknown SPIKE_MIGRATE: ${mode}`);
  const name = (await env("SPIKE_MIGRATE_DB")) ?? "migrate.db";
  result.db = name;
  const { apple } = await invoke("library_open", { name });
  const driver = tauriDriver(invoke);
  connection = driver;
  result.before = await snapshot(driver);
  await log(`${mode}: opened ${name} at version ${result.before.user_version}`);

  if (mode === "populate") {
    if (result.before.user_version !== 0 || result.before.tables.length) throw new Error("populate needs a new database");
    const store = await openSqliteStore(driver, { apple, migrations: V1_ONLY }); // an old library: the production 0 -> 1 step only
    await populate(createLibrary(store));
    await driver.run("PRAGMA wal_checkpoint(TRUNCATE)"); // a self-contained fixture file
  } else if (mode === "verify") {
    // Open as the app would, without migrating; then read every live recipe's
    // head, and at version 2 the drafts, through the library.
    const v2 = result.before.user_version === 2;
    result.verify_path = v2 ? "production-default" : "version-1-steps";
    const library = createLibrary(await openSqliteStore(driver, v2 ? { apple } : { apple, migrations: V1_ONLY }));
    const heads = [];
    for (const r of await library.list()) heads.push({ recipe_id: r.recipe_id, head: r.head, status: (await library.open(r.recipe_id)).status });
    result.library_heads = heads;
    if (v2) result.library_drafts = (await library.drafts()).length;
  } else if (mode === "inspect") {
    // Nothing beyond the snapshots.
  } else {
    const backup = await env("SPIKE_MIGRATE_BACKUP");
    if (!backup) throw new Error("SPIKE_MIGRATE_BACKUP is required");
    const sep = dataDir.includes("\\") && !dataDir.includes("/") ? "\\" : "/";
    result.backup = `${dataDir.replace(/[\\/]+$/, "")}${sep}${backup}`;
    await log(`${mode}: migrating, backup ${result.backup}`);
    try {
      if (mode === "migrate") {
        result.migration_path = "production-default"; // no `migrations` option: the library's own LIBRARY_MIGRATIONS
        await openSqliteStore(driver, { apple, backupPath: result.backup });
      } else {
        result.migration_path = "production-step-with-test-hook";
        await openSqliteStore(driver, { apple, backupPath: result.backup, migrations: wrapped(hooks[mode], mode === "spill" ? stepStart : undefined) });
      }
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
