// Crash recovery on real SQLite: a process editing a recipe is killed with
// SIGKILL; the next run is offered the draft, never given it silently, and
// resuming restores every acknowledged edit with its undo history.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLibrary, openSqliteStore } from "@carboy/recipe-library";
import { available, closeAllDrivers, nodeDriver } from "../../recipe-library/test/node-driver.mjs";
import { openRecipe, recoverable } from "../dist/index.js";
import { host } from "./helpers.mjs";

const skip = available ? false : "needs Node's built-in SQLite (Node 22+)";
const dir = mkdtempSync(join(tmpdir(), "recipe-session-"));
after(() => {
  closeAllDrivers();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
});

test("killed while editing, three rounds: the draft is offered, and resuming restores every acknowledged edit", { skip }, async () => {
  const child = fileURLToPath(new URL("./child.mjs", import.meta.url));
  for (let round = 1; round <= 3; round++) {
    const path = join(dir, `round-${round}.sqlite`);
    const p = spawn(process.execPath, [child, path], { stdio: ["ignore", "pipe", "inherit"] });
    let text = "";
    await new Promise((resolve) => {
      p.stdout.on("data", (b) => {
        text += b;
        if ((text.match(/^flushed /gm) ?? []).length >= 20 + round * 10) {
          p.kill("SIGKILL");
          resolve();
        }
      });
    });
    const signal = await new Promise((r) => p.on("exit", (_code, sig) => r(sig)));
    assert.equal(signal, "SIGKILL");
    const recipeId = /^recipe (\S+)$/m.exec(text)[1];
    const acked = Math.max(...[...text.matchAll(/^flushed (\d+)$/gm)].map((m) => Number(m[1])));

    const store = await openSqliteStore(nodeDriver(path));
    assert.equal(await store.integrityCheck(), "ok");
    const library = createLibrary(store);
    const [summary] = await recoverable(library);
    assert.equal(summary.recipe_id, recipeId, "the unsaved work is listed for recovery");
    assert.equal((await library.open(recipeId)).revision.content.notes.length, 0, "the saved revision is untouched");

    const offer = await openRecipe(host(library), recipeId);
    assert.equal(offer.status, "draft-found", "offered, not restored");
    const s = await offer.resume();
    const notes = s.content.notes.length;
    // An edit can be written before its line is printed, so the draft may be one ahead.
    assert.ok(notes === acked || notes === acked + 1, `round ${round}: ${notes} notes after ${acked} acknowledged`);
    assert.ok(s.undo(), "undo history survived the crash");
    assert.equal(s.content.notes.length, notes - 1);
    assert.ok(s.redo());
    assert.equal((await s.save()).status, "saved");
    assert.deepEqual(await recoverable(library), []);
    const reopened = await openRecipe(host(library), recipeId);
    assert.equal(reopened.status, "opened");
    assert.equal(reopened.session.content.notes.length, notes);
  }
});
