// Recipe page: surfaces the capabilities the core has today: calculated OG,
// one editor command with preview and diff, child revisions, the SQLite
// library, and the native file. No framework until D-010 is decided.
import * as core from "./core/index.js";
import { renderNav } from "./shared/nav.js";

const { invoke } = window.__TAURI__.core;
renderNav(document.getElementById("header"), "recipe");
const $ = (id) => document.getElementById(id);
const db = "sqlite:spike.db";
const exec = (query, values = []) => invoke("plugin:sql|execute", { db, query, values });
const select = (query, values = []) => invoke("plugin:sql|select", { db, query, values });

const fx = JSON.parse(await (await fetch("./fixtures/verdant-reverie-og.json")).text());
const name = fx.provenance.recipe.split(",")[0];
// Spike content: one ingredient and one mash addition per gravity source (as in recipe-core/test/commands.test.mjs).
let content = {
  name,
  beverage: { type: "beer" },
  targets: { batch_volume: fx.input.batch_volume },
  ingredients: fx.input.sources.map((s, i) => ({ id: `i${i}`, kind: "fermentable", name: s.name, properties: { ppg: s.ppg, efficiency: s.efficiency } })),
  additions: fx.input.sources.map((s, i) => ({ id: `a${i}`, ingredient: `i${i}`, stage: "mash", amount: s.amount })),
  notes: [],
};
const recipeId = core.uuidv7(1791763200000, new Uint8Array(10).fill(1));
const newRevision = (c, parents) =>
  core.createRevision(
    { schema_version: "0.1", recipe_id: recipeId, revision_id: core.uuidv7(Date.now()), parents, created_at: new Date().toISOString(), origin: "user_edit" },
    c,
  );
let revision = await newRevision(content, []);
let pending = null; // { content, diff } awaiting "Save as new revision"

await invoke("plugin:sql|load", { db });
await exec("CREATE TABLE IF NOT EXISTS revision (revision_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, document TEXT NOT NULL)");
const store = (rev) =>
  exec("INSERT OR IGNORE INTO revision (revision_id, content_hash, document) VALUES ($1, $2, $3)", [
    rev.envelope.revision_id, rev.envelope.content_hash, core.exportNative(rev),
  ]);

function render() {
  $("recipe-name").textContent = content.name;
  $("current-rev").textContent = `${revision.envelope.revision_id} (parents: ${revision.envelope.parents.length ? revision.envelope.parents.join(", ") : "none"})`;
  const tbody = $("sources");
  tbody.replaceChildren();
  const ing = new Map(content.ingredients.map((i) => [i.id, i]));
  for (const a of content.additions) {
    const i = ing.get(a.ingredient);
    const tr = document.createElement("tr");
    for (const v of [i.name, `${a.amount.value} ${a.amount.unit}`, i.properties.ppg, i.properties.efficiency]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  }
  $("volume").textContent = `${content.targets.batch_volume.value} ${content.targets.batch_volume.unit}`;
  const sel = $("edit-addition");
  const keep = sel.value;
  sel.replaceChildren(...content.additions.map((a) => new Option(`${ing.get(a.ingredient).name} (${a.amount.value} ${a.amount.unit})`, a.id)));
  if (keep) sel.value = keep;
  const stats = $("stats");
  stats.replaceChildren();
  const stat = (term, value) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    stats.append(dt, dd);
  };
  const og = core.contentOg(content);
  stat("Original gravity (calculated)", og ? `${og} SG` : "Cannot compute");
  stat("Formula", "gravity.og.points-lumina-parity, version spike-1: Lumina parity variant, not approved for users");
  stat("FG, ABV, IBU, color", "Not shown: no approved formula yet (FORMULA_COVERAGE)");
}
render();

// Edit: one editor command, previewed with its diff before anything is stored.
$("edit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const out = $("edit-result");
  pending = null;
  $("edit-save").disabled = true;
  let value;
  try {
    value = core.Decimal.parse($("edit-amount").value.trim()).toString(); // the UI normalizes what the user typed
  } catch {
    out.textContent = "Enter a plain decimal number such as 4.5.";
    return;
  }
  const r = core.applyCommands(content, [{ op: "set_addition_amount", addition: $("edit-addition").value, amount: { value, unit: "kg" } }]);
  if (r.status === "rejected") {
    out.textContent = `Not applied: ${r.diagnostics.map((d) => d.message).join(" ")}`;
    return;
  }
  const f = r.diff.entities[0];
  const s = r.diff.statistics[0];
  out.textContent = `${f.label.ingredient}: ${f.fields[0].before.value} ${f.fields[0].before.unit} → ${f.fields[0].after.value} ${f.fields[0].after.unit}. OG ${s.before ?? "cannot compute"} → ${s.after ?? "cannot compute"}. Nothing is saved until you choose Save.`;
  pending = r;
  $("edit-save").disabled = false;
});
$("edit-save").addEventListener("click", async () => {
  if (!pending) return;
  await store(revision); // make sure the parent is in the library
  const child = await newRevision(pending.content, [revision.envelope.revision_id]);
  await store(child);
  content = pending.content;
  revision = child;
  pending = null;
  $("edit-save").disabled = true;
  $("edit-result").textContent = `Saved revision ${child.envelope.revision_id} as a child of the previous revision.`;
  render();
});

const status = $("file-status");
$("save").addEventListener("click", async () => {
  await store(revision);
  const [{ n }] = await select("SELECT count(*) AS n FROM revision");
  status.textContent = `Saved revision ${revision.envelope.revision_id}. The library holds ${n} revision${n === 1 ? "" : "s"}.`;
});
$("export").addEventListener("click", async () => {
  const path = await invoke("export_native", { name: "recipe-export.json", text: core.exportNative(revision) });
  status.textContent = `Exported to ${path} (${revision.envelope.content_hash}).`;
});
$("import").addEventListener("click", async () => {
  try {
    const r = await core.importNative(await invoke("import_native", { name: "recipe-export.json" }));
    status.textContent = r.status === "rejected" ? `Rejected: ${r.reason}` : `Imported: ${r.status}${r.reason ? ` (${r.reason})` : ""}, hash verified.`;
  } catch (e) {
    status.textContent = `Nothing to import yet: export first. (${e})`;
  }
});

// Automated run: an invalid edit, a valid edit with save, then the file buttons.
if (await invoke("auto_mode")) {
  const wait = async (el, before) => {
    const t0 = performance.now();
    while (el.textContent === before && performance.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
    return el.textContent;
  };
  const results = [];
  const ogBefore = core.contentOg(content);
  $("edit-addition").value = "a0";
  $("edit-amount").value = "abc";
  $("edit-form").requestSubmit();
  results.push({ step: "invalid amount", text: $("edit-result").textContent });
  $("edit-amount").value = "5.0";
  $("edit-form").requestSubmit();
  results.push({ step: "preview", text: $("edit-result").textContent, saveEnabled: !$("edit-save").disabled });
  const parent = revision.envelope.revision_id;
  let before = $("edit-result").textContent;
  $("edit-save").click();
  results.push({ step: "save child", text: await wait($("edit-result"), before), parents: revision.envelope.parents, expectedParent: parent });
  for (const id of ["save", "export", "import"]) {
    before = status.textContent;
    $(id).click();
    results.push({ step: id, text: await wait(status, before) });
  }
  const stored = await select("SELECT document FROM revision WHERE revision_id = $1", [revision.envelope.revision_id]);
  const reopened = stored.length ? await core.importNative(stored[0].document) : null;
  const ok =
    /^Enter a plain decimal/.test(results[0].text) &&
    /4\.30913 kg → 5 kg/.test(results[1].text) && results[1].saveEnabled &&
    results[2].parents.length === 1 && results[2].parents[0] === parent &&
    reopened?.status === "editable" && reopened.revision.content.additions[0].amount.value === "5" &&
    /^Imported: editable/.test(results[5].text);
  await invoke("report", { json: JSON.stringify({ page: "recipe", ok, ogBefore, ogAfter: core.contentOg(content), results }, null, 2) });
}
