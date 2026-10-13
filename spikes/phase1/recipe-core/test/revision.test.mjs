import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevision, exportNative, importNative, uuidv7 } from "../dist/index.js";

const ids = {
  recipe_id: uuidv7(1791763200000, new Uint8Array(10).fill(1)),
  revision_id: uuidv7(1791763200001, new Uint8Array(10).fill(2)),
};
const content = {
  name: "Verdant Reverie Saison",
  beverage: { type: "beer" },
  targets: { batch_volume: { value: "20.8198", unit: "L" } },
  notes: [],
};

async function make() {
  return createRevision(
    { schema_version: "0.1", ...ids, parents: [], created_at: "2026-10-12T00:00:00.000Z", origin: "user_edit" },
    content,
  );
}

test("uuidv7 layout (1791763200000 ms = 2026-10-12 UTC = 0x1a12d68b800)", () => {
  assert.match(ids.recipe_id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(ids.recipe_id.slice(0, 13), "01a12d68-b800");
});

test("export, import, verify: editable and hash-stable across formatting", async () => {
  const rev = await make();
  assert.match(rev.envelope.content_hash, /^sha256:[0-9a-f]{64}$/);
  const r = await importNative(exportNative(rev));
  assert.equal(r.status, "editable");
  const compact = await importNative(JSON.stringify(rev));
  assert.equal(compact.status, "editable");
  assert.equal((await make()).envelope.content_hash, rev.envelope.content_hash, "deterministic");
});

test("tampered content opens read-only; newer MINOR read-only; newer MAJOR rejected", async () => {
  const rev = await make();
  const tampered = structuredClone(rev);
  tampered.content.name = "Changed";
  assert.deepEqual(
    [(await importNative(JSON.stringify(tampered))).status, (await importNative(JSON.stringify(tampered))).reason],
    ["read-only", "hash-mismatch"],
  );
  const newerMinor = await createRevision({ ...rev.envelope, schema_version: "0.2" }, content);
  assert.equal((await importNative(JSON.stringify(newerMinor))).reason, "newer-minor");
  const newerMajor = await createRevision({ ...rev.envelope, schema_version: "1.0" }, content);
  assert.deepEqual(await importNative(JSON.stringify(newerMajor)), { status: "rejected", reason: "newer-major" });
});

test("writer rules: floats, null, and non-NFC strings are refused", async () => {
  const base = { schema_version: "0.1", ...ids, parents: [], created_at: "2026-10-12T00:00:00.000Z", origin: "user_edit" };
  await assert.rejects(createRevision(base, { ...content, abv: 5.5 }), /decimal string/);
  await assert.rejects(createRevision(base, { ...content, style: null }), /null/);
  await assert.rejects(createRevision(base, { ...content, name: "Cafe" + String.fromCharCode(0x301) }), /NFC/);
});
