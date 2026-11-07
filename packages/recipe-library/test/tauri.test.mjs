// The Tauri driver passes SQL to the shell's one connection. `invoke` is
// injected, so this package stays free of Tauri; the real path is exercised by
// the shell's repository page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tauriDriver } from "../dist/index.js";

test("run and all go to the shell's commands, with their parameters", async () => {
  const calls = [];
  const invoke = async (cmd, args) => (calls.push([cmd, args]), cmd === "library_all" ? [{ a: 1 }] : null);
  const d = tauriDriver(invoke);
  await d.run("DELETE FROM x WHERE y = ?", ["z"]);
  assert.deepEqual(await d.all("SELECT 1"), [{ a: 1 }]);
  assert.deepEqual(calls, [
    ["library_run", { sql: "DELETE FROM x WHERE y = ?", params: ["z"] }],
    ["library_all", { sql: "SELECT 1", params: [] }],
  ]);
});

test("a failure from the shell reaches the caller as an error", async () => {
  const d = tauriDriver(async () => { throw "database is locked"; });
  await assert.rejects(d.run("BEGIN IMMEDIATE"), /database is locked/);
});
