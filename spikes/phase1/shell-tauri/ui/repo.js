// Repository page: @carboy/recipe-library through tauriDriver, on the shell's
// one connection. Modes as on the Library page: SPIKE_STRESS=N saves a chain of
// revisions (the harness kills the process part-way); SPIKE_AUTO=1 alone opens
// every revision and reports. The report keeps the Library page's shape, so
// tools/kill_recovery.sh reads both.
import { createLibrary, createRevision, openSqliteStore, tauriDriver } from "./recipe-library/index.js";
import { uuidv7 } from "./core/index.js";
import { renderNav } from "./shared/nav.js";

const { invoke } = window.__TAURI__.core;
renderNav(document.getElementById("header"), "repo");
const log = (m) => invoke("log", { message: `/repo.html: ${m}` });
const started = performance.now();
const mark = (name) => log(`step ${name} at ${Math.round(performance.now() - started)} ms`);

await mark("database-load");
const { apple } = await invoke("library_open", { name: "repo.db" });
const driver = tauriDriver(invoke);
const store = await openSqliteStore(driver, { apple });
const library = createLibrary(store);
const pragma = async (name) => Object.values((await driver.all(`PRAGMA ${name}`))[0])[0];
const content = (name) => ({ name, beverage: { type: "beer" }, targets: {}, ingredients: [], process: { stages: [], flows: [] }, additions: [], statistics: {}, calculation_settings: {}, notes: [{ id: uuidv7(Date.now()), text: "x".repeat(2000) }] });

const stress = Number((await invoke("spike_env", { name: "SPIKE_STRESS" })) ?? 0);
if (stress > 0) {
  const recipe = (await library.list())[0];
  const recipe_id = recipe?.recipe_id ?? uuidv7(Date.now());
  let parent = recipe?.head;
  for (let i = 0; i < stress; i++) {
    const revision_id = uuidv7(Date.now());
    await library.save(createRevision({ schema_version: "0.3", recipe_id, revision_id, parents: parent ? [parent] : [], created_at: new Date().toISOString(), origin: "user_edit" }, content(`Stress ${i}`)));
    parent = revision_id;
    if (i % 100 === 0) await log(`stress: ${i} written`);
  }
}

await mark("integrity-check");
const integrity = await store.integrityCheck();
const journal_mode = await pragma("journal_mode");
const synchronous = await pragma("synchronous");
const fullfsync = await pragma("fullfsync");
await mark("read-rows");
const failures = [];
let revisions = 0;
let verified = 0;
let lastIsHead = true;
for (const recipe of await library.list()) {
  const history = await library.revisions(recipe.recipe_id);
  lastIsHead &&= history.at(-1)?.revision_id === recipe.head;
  await mark(`verify-${history.length}-rows`);
  for (const r of history) {
    revisions++;
    const opened = await library.open(recipe.recipe_id, r.revision_id);
    if (opened.status === "editable") verified++;
    else failures.push({ revision_id: r.revision_id, status: opened.status });
  }
}
if (!lastIsHead) failures.push({ head: "not the last saved revision" });
document.getElementById("summary").textContent = `${revisions} revisions; ${verified} verified; integrity ${integrity}`;
await mark("report");
if (await invoke("auto_mode")) {
  await invoke("report", { json: JSON.stringify({ page: "repo", integrity, journal_mode, synchronous, fullfsync, apple, revisions, verified, failures }, null, 2) });
}
