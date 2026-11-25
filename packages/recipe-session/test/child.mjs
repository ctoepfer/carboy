// Runs in a separate process, which the parent kills with SIGKILL. A session
// edits a recipe in a real SQLite library; each edit's number is printed only
// after its draft write has completed (flush resolved "saved").
import { createLibrary, openSqliteStore } from "@carboy/recipe-library";
import { nodeDriver } from "../../recipe-library/test/node-driver.mjs";
import { newRecipe } from "../dist/index.js";

const [path] = process.argv.slice(2);
const library = createLibrary(await openSqliteStore(nodeDriver(path)));
let n = 0;
const s = newRecipe({ library, newId: () => `0192f3a1-${String(process.pid % 10000).padStart(4, "0")}-7000-8000-${String(++n).padStart(12, "0")}`, now: () => Date.now() }, "beer", "Crash test ale");
s.edit([{ op: "set_name", name: "Crash test ale, saved" }]);
await s.save();
process.stdout.write(`recipe ${s.recipeId}\n`);
for (let i = 1; ; i++) {
  s.edit([{ op: "add_note", id: `0192f3a2-${String(process.pid % 10000).padStart(4, "0")}-7000-8000-${String(i).padStart(12, "0")}`, text: `note ${i}` }]);
  if ((await s.flush()) !== "saved") throw new Error(`draft write failed at ${i}`);
  process.stdout.write(`flushed ${i}\n`);
}
