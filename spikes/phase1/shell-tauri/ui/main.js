// Runs the unchanged track A build (./core) inside the webview and checks the
// same vectors as the Node tests, plus SQLite save/reopen and native file
// export/import through the Rust side.
import * as core from "./core/index.js";
import { renderNav } from "./shared/nav.js";

const { invoke } = window.__TAURI__.core;
renderNav(document.getElementById("header"), "checks");

const auto = await invoke("auto_mode");
const results = [];
const log = (m) => invoke("log", { message: `${location.pathname}${location.search}: ${m}` });
const check = async (name, fn) => {
  await log(`check: ${name}`);
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail ?? null });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e && e.stack ? e.stack : e) });
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const text = async (name) => (await fetch(`./fixtures/${name}`)).text();

await check("RFC 8785 sample: canonical text and 118 UTF-8 bytes", async () => {
  const input = JSON.parse(await text("rfc8785-sample-input.json"));
  assert(core.canonicalize(input) === (await text("rfc8785-sample-canonical.txt")), "canonical text differs");
  const hex = (await text("rfc8785-sample-utf8.hex")).trim().split(" ");
  const got = Array.from(core.canonicalBytes(input), (b) => b.toString(16).padStart(2, "0"));
  assert(got.join(" ") === hex.join(" "), "UTF-8 bytes differ");
});

await check("RFC 8785 Appendix B: number samples", () => {
  const samples = [
    ["0000000000000001", "5e-324"], ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["4430000000000000", "295147905179352830000"], ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"], ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
    ["41b3de4355555554", "333333333.33333325"], ["becbf647612f3696", "-0.0000033333333333333333"],
  ];
  for (const [ieee, expected] of samples) {
    const v = new DataView(new ArrayBuffer(8));
    v.setBigUint64(0, BigInt(`0x${ieee}`));
    const got = core.canonicalize(v.getFloat64(0));
    assert(got === expected, `${ieee}: ${got} != ${expected}`);
  }
});

await check("Lumina parity: Verdant Reverie OG", async () => {
  const fx = JSON.parse(await text("verdant-reverie-og.json"));
  const r = core.originalGravity(fx.input.sources, fx.input.batch_volume);
  assert(r.status === "computed", "not computed");
  const lumina = fx.expected_lumina["gravity.points"];
  assert(Math.abs(Number(r.points.toString()) - lumina) / lumina < 1e-9, `points ${r.points} vs ${lumina}`);
  assert(r.og.round(3).toString() === String(fx.expected_lumina["gravity.og"]), `og ${r.og}`);
  return { points: r.points.toString(), og: r.og.toString() };
});

const fixedRevision = () =>
  core.createRevision(
    {
      schema_version: "0.1",
      recipe_id: core.uuidv7(1791763200000, new Uint8Array(10).fill(1)),
      revision_id: core.uuidv7(1791763200001, new Uint8Array(10).fill(2)),
      parents: [],
      created_at: "2026-10-12T00:00:00.000Z",
      origin: "user_edit",
    },
    { name: "Verdant Reverie Saison", beverage: { type: "beer" }, targets: { batch_volume: { value: "20.8198", unit: "L" } }, notes: [] },
  );

await check("Native file: export via Rust, import, verify hash", async () => {
  const rev = await fixedRevision();
  const path = await invoke("export_native", { name: "spike-revision.json", text: core.exportNative(rev) });
  const back = await core.importNative(await invoke("import_native", { name: "spike-revision.json" }));
  assert(back.status === "editable", `import status ${back.status} ${back.reason ?? ""}`);
  return { path, content_hash: rev.envelope.content_hash };
});

await check("SQLite: save, or reopen and verify from a previous launch", async () => {
  const db = "sqlite:spike.db";
  await invoke("plugin:sql|load", { db });
  await invoke("plugin:sql|execute", {
    db,
    query: "CREATE TABLE IF NOT EXISTS revision (revision_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL, document TEXT NOT NULL)",
    values: [],
  });
  const rev = await fixedRevision();
  const rows = await invoke("plugin:sql|select", {
    db,
    query: "SELECT content_hash, document FROM revision WHERE revision_id = $1",
    values: [rev.envelope.revision_id],
  });
  if (rows.length === 0) {
    await invoke("plugin:sql|execute", {
      db,
      query: "INSERT INTO revision (revision_id, content_hash, document) VALUES ($1, $2, $3)",
      values: [rev.envelope.revision_id, rev.envelope.content_hash, core.exportNative(rev)],
    });
    return { mode: "saved" };
  }
  const opened = await core.importNative(rows[0].document);
  assert(opened.status === "editable", `reopened status ${opened.status}`);
  assert(rows[0].content_hash === rev.envelope.content_hash, "stored hash differs from recomputed");
  return { mode: "reopened", content_hash: rows[0].content_hash };
});

const passed = results.filter((r) => r.ok).length;
document.getElementById("summary").textContent = `${passed}/${results.length} checks passed`;
for (const r of results) {
  const li = document.createElement("li");
  li.textContent = `${r.ok ? "PASS" : "FAIL"}: ${r.name}`;
  document.getElementById("results").append(li);
}
await log(`done, auto=${auto}`);
if (auto) await invoke("report", { json: JSON.stringify({ userAgent: navigator.userAgent, passed, total: results.length, results }, null, 2) });

// Navigation test: click a nav link like a user would, after the checks finish.
const navTarget = await invoke("nav_test");
if (navTarget) {
  const link = [...document.querySelectorAll("nav a")].find((a) => a.textContent === navTarget);
  await log(`nav test: clicking ${link ? link.getAttribute("href") : "(not found)"}`);
  link?.click();
}
