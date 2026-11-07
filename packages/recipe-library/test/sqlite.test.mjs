// The SQLite store: the same contract as memory, then what only a real
// database adds: durability settings, schema migrations, backups, and real
// process kills. Needs Node's built-in SQLite, so it skips on Node 20; CI runs
// Node 22 and 24.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";
import { LIBRARY_MIGRATIONS, LibraryError, createLibrary, openSqliteStore } from "../dist/index.js";
import { U, conformance, rev } from "./conformance.mjs";
import { failing } from "./helpers.mjs";
import { available, closeAllDrivers, nodeDriver } from "./node-driver.mjs";

const skip = available ? false : "needs Node's built-in SQLite (Node 22+)";
if (!available) test("SQLite store", { skip }, () => {});

const dir = mkdtempSync(join(tmpdir(), "recipe-library-"));
after(() => {
  closeAllDrivers();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});
let n = 0;
const file = () => join(dir, `db-${n++}.sqlite`);
const code = async (p) => p.then(() => "no error", (e) => { assert.ok(e instanceof LibraryError, String(e)); return e.code; });
const R = U(1);

if (available) {
  const makeStore = async () => openSqliteStore(nodeDriver(file()));
  makeStore.faulty = async (op, count = 0) => failing(await openSqliteStore(nodeDriver(file())), op, count);
  conformance("sqlite", makeStore);

  const pragma = async (d, name) => Object.values((await d.all(`PRAGMA ${name}`))[0])[0];
  const open = (path, options) => openSqliteStore(nodeDriver(path), options);
  const seeded = async (path) => {
    const lib = createLibrary(await open(path));
    await lib.save(rev(R, U(10), []));
    return lib;
  };

  test("saved recipes survive closing and reopening the file", async () => {
    const path = file();
    await seeded(path);
    const reopened = createLibrary(await open(path));
    assert.equal((await reopened.open(R)).status, "editable");
  });

  test("durability: WAL and synchronous FULL are checked, not assumed (ADR 0006)", async () => {
    const d = nodeDriver(file());
    await openSqliteStore(d);
    assert.equal(await pragma(d, "journal_mode"), "wal");
    assert.equal(await pragma(d, "synchronous"), 2);
    assert.equal(await pragma(d, "fullfsync"), 0);
  });

  test("durability: Apple platforms also get fullfsync on the connection", async () => {
    const d = nodeDriver(file());
    await openSqliteStore(d, { apple: true });
    assert.equal(await pragma(d, "fullfsync"), 1);
    assert.equal(await pragma(d, "checkpoint_fullfsync"), 1);
  });

  test("storage that can't give WAL is refused rather than silently less durable", async () => {
    assert.equal(await code(openSqliteStore(nodeDriver(":memory:"))), "durability-not-met");
  });

  test("the database has its own version, separate from document schema versions", async () => {
    const d = nodeDriver(file());
    const store = await openSqliteStore(d);
    assert.equal(await store.schemaVersion(), LIBRARY_MIGRATIONS.at(-1).version);
    assert.equal(await store.integrityCheck(), "ok");
  });

  test("a database from a newer build is refused and left untouched", async () => {
    const path = file();
    await seeded(path);
    const d = nodeDriver(path);
    await d.run("PRAGMA user_version = 99");
    assert.equal(await code(openSqliteStore(d)), "library-newer");
    assert.equal(await pragma(d, "user_version"), 99);
  });

  const V2 = { version: 2, up: async (run) => { await run("ALTER TABLE recipe ADD COLUMN extra TEXT"); } };
  const V3 = { version: 3, up: async (run) => { await run("ALTER TABLE recipe ADD COLUMN more TEXT"); } };
  const BAD = { version: 3, up: async (run) => { await run("ALTER TABLE recipe ADD COLUMN more TEXT"); throw new Error("step failed"); } };

  test("a migration runs after a backup, and the data comes through", async () => {
    const path = file();
    await seeded(path);
    const backupPath = `${path}.backup`;
    const store = await open(path, { backupPath, migrations: [...LIBRARY_MIGRATIONS, V2] });
    assert.equal(await store.schemaVersion(), 2);
    assert.equal((await createLibrary(store).open(R)).status, "editable");
    assert.ok(existsSync(backupPath));
    assert.equal(await (await open(backupPath)).schemaVersion(), 1);
  });

  test("a failed migration rolls back completely: version, schema, and data stay as they were", async () => {
    const path = file();
    await seeded(path);
    const backupPath = `${path}.backup`;
    const d = nodeDriver(path);
    const err = await openSqliteStore(d, { backupPath, migrations: [...LIBRARY_MIGRATIONS, V2, BAD] }).catch((e) => e);
    assert.equal(err.code, "migration-failed");
    assert.equal(err.details.version, 3);
    assert.equal(await pragma(d, "user_version"), 1);
    assert.deepEqual((await d.all("SELECT name FROM pragma_table_info('recipe')")).map((c) => c.name).filter((c) => c === "extra" || c === "more"), []);
    assert.equal((await createLibrary(await open(path)).open(R)).status, "editable");
    assert.ok(existsSync(backupPath), "the backup stays for recovery");
    assert.equal((await createLibrary(await open(backupPath)).open(R)).status, "editable");
  });

  test("a migration needs a backup path once there is data to protect", async () => {
    const path = file();
    await seeded(path);
    assert.equal(await code(open(path, { migrations: [...LIBRARY_MIGRATIONS, V2] })), "backup-required");
    assert.equal(await (await open(path)).schemaVersion(), 1);
  });

  test("if the backup can't be made, the migration doesn't start", async () => {
    const path = file();
    await seeded(path);
    const taken = `${path}.backup`;
    await open(path, { backupPath: taken, migrations: [...LIBRARY_MIGRATIONS, V2] }); // leaves a file there
    assert.equal(await code(open(path, { backupPath: taken, migrations: [...LIBRARY_MIGRATIONS, V2, V3] })), "backup-failed");
    assert.equal(await (await open(path, { migrations: [...LIBRARY_MIGRATIONS, V2] })).schemaVersion(), 2);
  });

  test("the lock timeout is set on the connection, with a default", async () => {
    const d = nodeDriver(file());
    await openSqliteStore(d);
    assert.equal(await pragma(d, "busy_timeout"), 5000);
    const quick = nodeDriver(file());
    await openSqliteStore(quick, { busyTimeoutMs: 250 });
    assert.equal(await pragma(quick, "busy_timeout"), 250);
  });

  test("a locked database fails within its bound instead of hanging", async () => {
    const path = file();
    await seeded(path);
    const holder = nodeDriver(path);
    await holder.run("BEGIN IMMEDIATE");
    const lib = createLibrary(await open(path, { busyTimeoutMs: 100 }));
    const started = performance.now();
    await assert.rejects(lib.save(rev(R, U(11), [U(10)])), /locked|busy/i);
    assert.ok(performance.now() - started < 3000);
    await holder.run("ROLLBACK");
    assert.equal((await lib.save(rev(R, U(11), [U(10)]))).status, "saved");
  });

  const child = (args) => spawn(process.execPath, ["--no-warnings", fileURLToPath(new URL("./child.mjs", import.meta.url)), ...args], { stdio: ["ignore", "pipe", "inherit"] });
  const ended = (p) => new Promise((resolve) => p.on("close", (_, signal) => resolve(signal)));
  // The child runs to its kill point, then the parent kills it there. A child
  // that fails before that point ends without a signal, and the test fails.
  const killedAtPoint = (args) => {
    const p = child(args);
    p.stdout.on("data", (b) => {
      if (String(b).includes("kill-me")) p.kill("SIGKILL");
    });
    return ended(p);
  };

  test("killed mid-transaction: nothing of it survives, and the head stays where it was", async () => {
    const path = file();
    await seeded(path);
    assert.equal(await killedAtPoint(["die-in-transaction", path, R]), "SIGKILL");
    const store = await open(path);
    assert.equal(await store.integrityCheck(), "ok");
    const lib = createLibrary(store);
    assert.equal((await lib.list())[0].head, U(10));
    assert.deepEqual((await lib.revisions(R)).map((v) => v.revision_id), [U(10)]);
    assert.equal((await lib.open(R)).status, "editable");
  });

  test("killed mid-migration: the database reopens at its old version with its data", async () => {
    const path = file();
    await seeded(path);
    assert.equal(await killedAtPoint(["die-in-migration", path, R]), "SIGKILL");
    const d = nodeDriver(path);
    const store = await openSqliteStore(d);
    assert.equal(await store.schemaVersion(), 1);
    assert.equal(await store.integrityCheck(), "ok");
    assert.equal((await createLibrary(store).open(R)).status, "editable");
  });

  test("killed during saves, three rounds: every acknowledged revision is there and verifies", async () => {
    const path = file();
    await seeded(path);
    let head = U(10);
    const acknowledged = [U(10)];
    for (let round = 0; round < 3; round++) {
      const p = child(["save-loop", path, R, head]);
      let text = "";
      await new Promise((resolve) => {
        p.stdout.on("data", (b) => {
          text += b;
          if (text.split("\n").length > 40) {
            p.kill("SIGKILL");
            resolve();
          }
        });
      });
      assert.equal(await ended(p), "SIGKILL");
      acknowledged.push(...text.split("\n").filter((l) => l.length === 36));
      const store = await open(path);
      assert.equal(await store.integrityCheck(), "ok");
      const lib = createLibrary(store);
      const ids = (await lib.revisions(R)).map((v) => v.revision_id);
      for (const id of acknowledged) assert.ok(ids.includes(id), `lost ${id}`);
      for (const id of ids) assert.equal((await lib.open(R, id)).status, "editable");
      head = (await lib.list())[0].head;
      assert.equal(head, ids.at(-1));
    }
    assert.ok(acknowledged.length > 100);
  });
}
