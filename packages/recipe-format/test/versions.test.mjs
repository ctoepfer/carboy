// Schema 0.2 members on read: a file may use only members its declared
// version has (RECIPE_SCHEMA §4). A wrongly stamped file opens read-only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRevision } from "@carboy/recipe-core";
import { SUPPORTED_SCHEMA, readNative, writeNative } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const meta = (schema_version) => ({ schema_version, recipe_id: U(1), revision_id: U(2), parents: [], created_at: "2026-10-14T09:00:00.000Z", origin: "user_edit" });
const ref = (item) => ({ catalog: "example-catalog", item, version: "2026.1" });
const content = (ingredient) => ({
  name: "Yeast choice",
  beverage: { type: "beer" },
  targets: {},
  ingredients: [{ id: U(10), kind: "culture", name: "Clean ale yeast", ...ingredient }],
  process: { stages: [], flows: [] },
  additions: [],
  statistics: {},
  calculation_settings: {},
  notes: [],
});

test("this build reads and writes schema 0.2", () => {
  assert.deepEqual(SUPPORTED_SCHEMA, { major: 0, minor: 2 });
});

test("0.2 members in a 0.2 file: editable, and they round-trip unchanged", () => {
  const c = content({ catalog_ref: ref("p1"), group_ref: ref("g1"), alternatives: [{ catalog_ref: ref("p2"), note: "split batch", provenance: { origin: "manually_entered" } }] });
  const r = readNative(writeNative(createRevision(meta("0.2"), c)));
  assert.equal(r.status, "editable");
  assert.deepEqual(r.revision.content, c);
});

test("a 0.1 file stays editable; a 0.1 file using 0.2 members opens read-only", () => {
  assert.equal(readNative(writeNative(createRevision(meta("0.1"), content({ catalog_ref: ref("p1") })))).status, "editable");
  const r = readNative(writeNative(createRevision(meta("0.1"), content({ group_ref: ref("g1") }))));
  assert.deepEqual([r.status, r.reason], ["read-only", "invalid-content"]);
  assert.deepEqual(r.issues.map((i) => [i.code, i.path]), [["member-newer-than-schema", "/content/ingredients/0/group_ref"]]);
});
