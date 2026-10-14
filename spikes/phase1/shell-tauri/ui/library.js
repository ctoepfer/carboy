// Library page: lists the SQLite library and re-verifies every revision.
// Automated modes: SPIKE_STRESS=N writes N revisions one by one (the harness
// kills the process part-way); SPIKE_AUTO=1 alone verifies and reports.
import * as core from "./core/index.js";
import { renderNav } from "./shared/nav.js";
import { axeSummary } from "./shared/axe-run.js";

const { invoke } = window.__TAURI__.core;
renderNav(document.getElementById("header"), "library");
const log = (m) => invoke("log", { message: `/library.html: ${m}` });
const db = "sqlite:spike.db";
const sql = (query, values = []) => invoke("plugin:sql|select", { db, query, values });
const exec = (query, values = []) => invoke("plugin:sql|execute", { db, query, values });

await invoke("plugin:sql|load", { db });
await exec("CREATE TABLE IF NOT EXISTS revision (revision_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, document TEXT NOT NULL)");

const stress = Number((await invoke("spike_env", { name: "SPIKE_STRESS" })) ?? 0);
if (stress > 0) {
  const recipe_id = core.uuidv7(Date.now());
  for (let i = 0; i < stress; i++) {
    const rev = await core.createRevision(
      { schema_version: "0.1", recipe_id, revision_id: core.uuidv7(Date.now()), parents: [], created_at: new Date().toISOString(), origin: "user_edit" },
      { name: `Stress revision ${i}`, beverage: { type: "beer" }, notes: [{ id: core.uuidv7(Date.now()), text: "x".repeat(2000) }] },
    );
    await exec("INSERT INTO revision (revision_id, content_hash, document) VALUES ($1, $2, $3)", [
      rev.envelope.revision_id, rev.envelope.content_hash, core.exportNative(rev),
    ]);
    if (i % 100 === 0) await log(`stress: ${i} written`);
  }
  await log(`stress: all ${stress} written`);
}

const [{ integrity }] = await sql("PRAGMA integrity_check").then((r) => r.map((x) => ({ integrity: Object.values(x)[0] })));
const [{ mode }] = await sql("PRAGMA journal_mode").then((r) => r.map((x) => ({ mode: Object.values(x)[0] })));
// ADR 0006 durability default: FULL (2). Read from the pool's connection, so
// it shows what the plugin actually uses, not what was requested.
const [{ synchronous }] = await sql("PRAGMA synchronous").then((r) => r.map((x) => ({ synchronous: Object.values(x)[0] })));
const rows = await sql("SELECT revision_id, content_hash, document FROM revision ORDER BY revision_id");
let verified = 0;
const failures = [];
const tbody = document.getElementById("rows");
for (const row of rows) {
  const r = await core.importNative(row.document);
  const ok = r.status === "editable" && r.revision.envelope.content_hash === row.content_hash;
  if (ok) verified++;
  else failures.push({ revision_id: row.revision_id, status: r.status, reason: r.reason ?? null });
  if (tbody.childElementCount < 200) {
    const tr = document.createElement("tr");
    for (const v of [row.revision_id, ok ? r.revision.content.name : "(unreadable)", ok ? "Yes" : `No: ${r.reason ?? r.status}`]) {
      const td = document.createElement("td");
      td.textContent = v;
      tr.append(td);
    }
    tbody.append(tr);
  }
}
const health = document.getElementById("health");
for (const [k, v] of [["SQLite integrity check", integrity], ["Journal mode", mode]]) {
  const dt = document.createElement("dt");
  dt.textContent = k;
  const dd = document.createElement("dd");
  dd.textContent = v;
  health.append(dt, dd);
}
document.getElementById("summary").textContent =
  `${rows.length} revision${rows.length === 1 ? "" : "s"}; ${verified} verified${failures.length ? `; ${failures.length} failed` : ""}.` +
  (rows.length > 200 ? " Showing the first 200." : "");

if (await invoke("auto_mode")) {
  await invoke("report", { json: JSON.stringify({ page: "library", integrity, journal_mode: mode, synchronous, revisions: rows.length, verified, failures, axe: await axeSummary("./") }, null, 2) });
}
