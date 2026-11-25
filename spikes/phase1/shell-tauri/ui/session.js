// Session check page (test only). Two launches of the app, with a restart in
// between, exercise the first Recipe Library workflow through the real shell:
//
//   SPIKE_SESSION=start   needs a new session.db: create a recipe, save it,
//                         make unsaved edits (three notes, then typing in the
//                         name field), flush them as the recipe's draft, report,
//                         and exit without saving.
//   SPIKE_SESSION=reopen  the next run: the draft must be offered (not
//                         restored), then resumed with its content and undo
//                         history, saved, and the recipe reopened clean.
//
// Its own database file, session.db, in the app's data folder; nothing else is
// read or written. Refuses to run without SPIKE_AUTO=1.
import { createLibrary, newRecipe, openRecipe, openSqliteStore, recoverable, tauriDriver } from "./recipe-library/index.js";
import { uuidv7 } from "./core/index.js";

const { invoke } = window.__TAURI__.core;
const log = (m) => invoke("log", { message: `/session.html: ${m}` });
const SAVED = "Device test ale, saved";
const UNSAVED = "Device test ale, unsaved";
const result = { page: "session", checks: [] };
const check = (name, ok, detail) => result.checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });

try {
  if (!(await invoke("auto_mode"))) throw new Error("test-only page: needs SPIKE_AUTO=1");
  const mode = await invoke("spike_env", { name: "SPIKE_SESSION" });
  result.mode = mode;
  const { apple } = await invoke("library_open", { name: "session.db" });
  const driver = tauriDriver(invoke);
  const store = await openSqliteStore(driver, { apple });
  const library = createLibrary(store);
  const host = { library, newId: () => uuidv7(Date.now()), now: () => Date.now() };
  const pragma = async (name) => Object.values((await driver.all(`PRAGMA ${name}`))[0])[0];
  Object.assign(result, { apple, user_version: await store.schemaVersion(), journal_mode: await pragma("journal_mode"), synchronous: await pragma("synchronous"), fullfsync: await pragma("fullfsync") });

  if (mode === "start") {
    const fresh = (await library.list({ deleted: "include" })).length === 0 && (await recoverable(library)).length === 0;
    check("fresh-database", fresh);
    if (!fresh) throw new Error("session.db isn't new; the start run needs a fresh one");
    const s = newRecipe(host, "beer", "Device test ale");
    s.edit([{ op: "set_name", name: SAVED }]);
    const saved = await s.save();
    check("saved", saved.status === "saved" && s.state === "clean");
    for (let i = 1; i <= 3; i++) s.edit([{ op: "add_note", id: uuidv7(Date.now()), text: `unsaved note ${i}` }]);
    for (const name of ["Device test ale, u", "Device test ale, uns", UNSAVED]) s.edit([{ op: "set_name", name }], { field: "name" });
    const status = await s.flush(); // as on blur
    check("draft-written", status === "saved", status);
    const drafts = await recoverable(library);
    check("one-draft", drafts.length === 1 && drafts[0].name === UNSAVED, drafts);
    check("revision-unchanged", (await library.open(s.recipeId)).revision.content.name === SAVED);
    Object.assign(result, { recipe_id: s.recipeId, saved_head: saved.head, draft_sequence: drafts[0]?.sequence, undo_steps: drafts[0]?.applied });
  } else if (mode === "reopen") {
    const drafts = await recoverable(library);
    check("draft-listed-for-recovery", drafts.length === 1, drafts);
    const recipeId = drafts[0].recipe_id;
    result.recipe_id = recipeId;
    const offer = await openRecipe(host, recipeId);
    check("offered-not-restored", offer.status === "draft-found", offer.status);
    check("not-stale", offer.draft.stale === false && offer.draft.unreadable === undefined, offer.draft);
    const s = await offer.resume();
    check("resumed-content", s.content.name === UNSAVED && s.content.notes.length === 3, { name: s.content.name, notes: s.content.notes.length });
    check("unsaved-state", s.state === "unsaved");
    check("undo-survived-restart", s.undo() && s.content.name === SAVED && s.content.notes.length === 3, { name: s.content.name });
    check("redo", s.redo() && s.content.name === UNSAVED);
    const saved = await s.save();
    check("saved-after-resume", saved.status === "saved" && s.state === "clean");
    check("draft-removed", (await recoverable(library)).length === 0);
    const again = await openRecipe(host, recipeId);
    check("reopened-clean", again.status === "opened" && again.session.state === "clean" && again.session.content.name === UNSAVED && again.session.content.notes.length === 3);
    const history = await library.revisions(recipeId);
    check("two-revisions", history.length === 2 && history[1].parents[0] === history[0].revision_id, history.map((r) => r.revision_id));
    result.head = saved.head;
  } else {
    throw new Error(`unknown SPIKE_SESSION: ${mode}`);
  }
  result.integrity = await store.integrityCheck();
  check("integrity", result.integrity === "ok", result.integrity);
  result.ok = result.checks.every((c) => c.ok);
} catch (e) {
  result.ok = false;
  result.error = String(e?.message ?? e);
}
const passed = result.checks.filter((c) => c.ok).length;
document.getElementById("summary").textContent = `${result.mode}: ${passed}/${result.checks.length} checks passed${result.error ? `; ${result.error}` : ""}`;
await log(`${result.mode}: ${passed}/${result.checks.length} checks, ok ${result.ok}`);
await invoke("report", { json: JSON.stringify(result, null, 2) });
