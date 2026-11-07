// Runs in a separate process, which the parent kills.
import { writeSync } from "node:fs";
import { openSqliteStore, LIBRARY_MIGRATIONS, createLibrary } from "../dist/index.js";
import { nodeDriver } from "./node-driver.mjs";
import { U, rev } from "./conformance.mjs";

const [mode, path, recipe, firstParent] = process.argv.slice(2);
// Asks the parent for the kill and waits for it, holding everything open: a
// process that kills itself on Windows reports an exit code, not a signal.
const die = () => {
  writeSync(1, "kill-me\n");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
};

if (mode === "save-loop") {
  const lib = createLibrary(await openSqliteStore(nodeDriver(path)));
  let parent = firstParent === "none" ? undefined : firstParent;
  for (let i = 0; ; i++) {
    const id = `0192f3a1-${String(process.pid % 10000).padStart(4, "0")}-7000-8000-${String(i).padStart(12, "0")}`;
    await lib.save(rev(recipe, id, parent ? [parent] : []));
    parent = id;
    process.stdout.write(`${id}\n`); // written only after the save has committed
  }
}
if (mode === "die-in-transaction") {
  const store = await openSqliteStore(nodeDriver(path));
  const head = (await createLibrary(store).list())[0].head;
  await store.transaction(async (tx) => {
    await tx.insertRevision({ revision_id: U(99), recipe_id: recipe, parents: [head], created_at: "2026-11-06T00:00:00.000Z", origin: "user_edit", content_hash: "x", document: "x" });
    await tx.putRecipe({ ...(await tx.getRecipe(recipe)), head: U(99) });
    die();
  });
}
if (mode === "die-in-migration") {
  await openSqliteStore(nodeDriver(path), {
    backupPath: `${path}.backup`,
    migrations: [...LIBRARY_MIGRATIONS, { version: 2, up: async (run) => { await run("ALTER TABLE recipe ADD COLUMN extra TEXT"); await run("PRAGMA user_version = 2"); die(); } }],
  });
}
