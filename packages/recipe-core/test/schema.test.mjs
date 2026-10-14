// Schema 0.2 (MINOR): optional ingredient `group_ref` and `alternatives[]`
// (INGREDIENT_CATALOG §3, IQ1 and the D-030 purchasing clarification), and the
// per-member version bookkeeping that "write at version X" needs (RECIPE_SCHEMA §4, D-022).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION, checkSchemaVersion, requiredSchemaVersion, validateContent } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const ref = (item) => ({ catalog: "example-catalog", item, version: "2026.1" });
const recipe = (ingredient) => ({
  name: "R",
  beverage: { type: "beer" },
  targets: {},
  ingredients: [{ id: U(1), kind: "culture", name: "Clean ale yeast", ...ingredient }],
  process: { stages: [], flows: [] },
  additions: [],
  statistics: {},
  calculation_settings: {},
  notes: [],
});
const codes = (c) => validateContent(c).map((i) => [i.code, i.path]);

test("current schema is 0.2", () => {
  assert.deepEqual(SCHEMA_VERSION, { major: 0, minor: 2 });
});

test("required version: 0.1 without the new members, 0.2 with them, naming each use", () => {
  assert.deepEqual(requiredSchemaVersion(recipe({ catalog_ref: ref("p1") })), { version: "0.1", uses: [] });
  const r = requiredSchemaVersion(recipe({ catalog_ref: ref("p1"), group_ref: ref("g1"), alternatives: [{ catalog_ref: ref("p2") }] }));
  assert.equal(r.version, "0.2");
  assert.deepEqual(r.uses, [
    { path: "/content/ingredients/0/group_ref", version: "0.2" },
    { path: "/content/ingredients/0/alternatives", version: "0.2" },
  ]);
});

test("write at X: content may use nothing newer than X; versions outside the supported range are refused", () => {
  const c = recipe({ group_ref: ref("g1") });
  assert.deepEqual(checkSchemaVersion(c, "0.2"), []);
  assert.deepEqual(checkSchemaVersion(c, "0.1").map((i) => [i.code, i.path]), [["member-newer-than-schema", "/content/ingredients/0/group_ref"]]);
  assert.deepEqual(checkSchemaVersion(recipe({}), "0.1"), []);
  assert.deepEqual(checkSchemaVersion(c, "0.3").map((i) => i.code), ["unsupported-schema-version"]);
  assert.deepEqual(checkSchemaVersion(c, "1.0").map((i) => i.code), ["unsupported-schema-version"]);
  assert.deepEqual(checkSchemaVersion(c, "0.0").map((i) => i.code), ["unsupported-schema-version"]);
});

test("group_ref and catalog_ref: catalog, item, version are non-empty strings", () => {
  assert.deepEqual(codes(recipe({ group_ref: ref("g1"), catalog_ref: ref("p1") })), []);
  // A group with no preferred product is allowed ("any clean ale yeast").
  assert.deepEqual(codes(recipe({ group_ref: ref("g1") })), []);
  assert.deepEqual(codes(recipe({ group_ref: { catalog: "c", item: "" , version: "1" } })), [["invalid-catalog-ref", "/content/ingredients/0/group_ref/item"]]);
  assert.deepEqual(codes(recipe({ catalog_ref: "p1" })), [["invalid-catalog-ref", "/content/ingredients/0/catalog_ref"]]);
  assert.deepEqual(codes(recipe({ catalog_ref: { catalog: "c", item: "i" } })), [["invalid-catalog-ref", "/content/ingredients/0/catalog_ref/version"]]);
});

test("alternatives: approved products, each once, never the preferred one, with user or accepted-AI provenance", () => {
  const ok = recipe({
    catalog_ref: ref("p1"),
    alternatives: [
      { catalog_ref: ref("p2"), note: "approved after a split batch", provenance: { origin: "manually_entered" } },
      { catalog_ref: ref("p3"), provenance: { origin: "ai_proposed" } },
    ],
  });
  assert.deepEqual(codes(ok), []);
  assert.deepEqual(codes(recipe({ alternatives: {} })), [["invalid-alternatives", "/content/ingredients/0/alternatives"]]);
  assert.deepEqual(codes(recipe({ alternatives: [{ note: "x" }] })), [["invalid-catalog-ref", "/content/ingredients/0/alternatives/0/catalog_ref"]]);
  assert.deepEqual(codes(recipe({ catalog_ref: ref("p1"), alternatives: [{ catalog_ref: ref("p1") }] })), [["alternative-is-preferred", "/content/ingredients/0/alternatives/0/catalog_ref"]]);
  assert.deepEqual(codes(recipe({ alternatives: [{ catalog_ref: ref("p2") }, { catalog_ref: ref("p2") }] })), [["duplicate-alternative", "/content/ingredients/0/alternatives/1/catalog_ref"]]);
  // Same item in another catalog version is still the same product for this rule.
  assert.deepEqual(codes(recipe({ alternatives: [{ catalog_ref: ref("p2") }, { catalog_ref: { ...ref("p2"), version: "2027.1" } }] })), [["duplicate-alternative", "/content/ingredients/0/alternatives/1/catalog_ref"]]);
  assert.deepEqual(codes(recipe({ alternatives: [{ catalog_ref: ref("p2"), note: 5 }] })), [["invalid-alternatives", "/content/ingredients/0/alternatives/0/note"]]);
  assert.deepEqual(codes(recipe({ alternatives: [{ catalog_ref: ref("p2"), provenance: { origin: "calculated", formula: { id: "x", version: "1" } } }] })), [["alternative-origin-not-allowed", "/content/ingredients/0/alternatives/0/provenance/origin"]]);
  assert.deepEqual(codes(recipe({ alternatives: [{ catalog_ref: ref("p2"), extra: 1 }] })), [["unknown-member", "/content/ingredients/0/alternatives/0/extra"]]);
});
