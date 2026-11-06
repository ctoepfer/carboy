// Schema 0.3 commands (EDITOR_COMMANDS §5.1, §5.3, §5.7) and what
// replace_ingredient keeps when the product changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateStatistics } from "@carboy/recipe-core";
import { applyCommands, emptyTemplate } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const q = (value, unit) => ({ value, unit });
const editor = { channel: "editor" };
const ai = { channel: "ai_proposal" };
const codeOf = (r) => r.diagnostics.map((d) => [d.code, d.command_index]);
const apply = (base, cmds, opts = editor) => {
  const r = applyCommands(base, cmds, opts);
  assert.equal(r.status, "applied", JSON.stringify(r.diagnostics));
  return r;
};
const SNAPSHOT = {
  based_on: { profile: U(90), version: "2", name: "Garage system" },
  fields: {
    boil_capacity: { value: "40", unit: "L", provenance: { origin: "manually_entered" } },
    mash_tun_deadspace: { value: "1.5", unit: "L", provenance: { origin: "measured" }, measured_on: "2026-10-01" },
  },
};

test("language: set, clear, and validated; 0.3 ops need a 0.3 list", () => {
  const base = emptyTemplate("beer", "Pale ale");
  const r = apply(base, [{ op: "set_language", language: "de-DE" }]);
  assert.equal(r.content.language, "de-DE");
  assert.deepEqual(r.diff.entities.map((e) => [e.type, e.change]), [["recipe", "changed"]]);
  assert.equal(apply(r.content, [{ op: "clear_language" }]).content.language, undefined);
  assert.equal(applyCommands(base, [{ op: "set_language", language: "not a tag" }], editor).status, "rejected");
  assert.deepEqual(codeOf(applyCommands(base, [{ op: "set_language", language: "en" }], { ...editor, schema_version: "0.2" })), [["unsupported-version", 0]]);
});

test("apply_equipment_snapshot copies data: measured values stay measured, unknown fields stay absent", () => {
  const r = apply(emptyTemplate("beer", "Pale ale"), [{ op: "apply_equipment_snapshot", snapshot: SNAPSHOT }]);
  assert.deepEqual(r.content.equipment, SNAPSHOT);
  assert.notEqual(r.content.equipment, SNAPSHOT);
  assert.deepEqual(r.diff.entities.map((e) => [e.type, e.id, e.change]).sort(), [
    ["equipment", "based_on", "added"],
    ["equipment", "boil_capacity", "added"],
    ["equipment", "mash_tun_deadspace", "added"],
  ]);
});

test("an invalid snapshot rejects the whole list", () => {
  const bad = { fields: { boil_capacity: { value: "40", unit: "kg", provenance: { origin: "manually_entered" } } } };
  const r = applyCommands(emptyTemplate("beer", "Pale ale"), [{ op: "apply_equipment_snapshot", snapshot: bad }], editor);
  assert.equal(r.status, "rejected");
  assert.deepEqual(r.diagnostics.map((d) => d.details.issue), ["equipment-unit-not-allowed"]);
});

test("an AI can't supply a snapshot: it could label its own numbers measured (C7)", () => {
  const r = applyCommands(emptyTemplate("beer", "Pale ale"), [{ op: "apply_equipment_snapshot", snapshot: SNAPSHOT }], ai);
  assert.deepEqual(codeOf(r), [["op-not-permitted", 0]]);
});

test("set_equipment_field: the channel sets the origin, a stale measurement date goes with the old value", () => {
  const base = apply(emptyTemplate("beer", "Pale ale"), [{ op: "apply_equipment_snapshot", snapshot: SNAPSHOT }]).content;
  const r = apply(base, [{ op: "set_equipment_field", field: "mash_tun_deadspace", quantity: q("2", "L") }]);
  assert.deepEqual(r.content.equipment.fields.mash_tun_deadspace, { value: "2", unit: "L", provenance: { origin: "manually_entered" } });
  assert.deepEqual(r.diff.entities.map((e) => [e.type, e.id, e.change]), [["equipment", "mash_tun_deadspace", "changed"]]);
  const fromAi = apply(base, [{ op: "set_equipment_field", field: "boil_capacity", quantity: q("38", "L") }], ai);
  assert.equal(fromAi.content.equipment.fields.boil_capacity.provenance.origin, "ai_proposed");
  const first = apply(emptyTemplate("beer", "Pale ale"), [{ op: "set_equipment_field", field: "batch_capacity", quantity: q("23", "L") }]);
  assert.deepEqual(Object.keys(first.content.equipment), ["fields"]);
});

test("equipment field errors: closed list, typed, nothing coerced", () => {
  const base = emptyTemplate("beer", "Pale ale");
  assert.deepEqual(codeOf(applyCommands(base, [{ op: "set_equipment_field", field: "kettle_colour", quantity: q("1", "L") }], editor)), [["invalid-argument", 0]]);
  assert.deepEqual(codeOf(applyCommands(base, [{ op: "set_equipment_field", field: "boil_capacity", quantity: { value: 40, unit: "L" } }], editor)), [["invalid-quantity", 0]]);
  assert.deepEqual(codeOf(applyCommands(base, [{ op: "clear_equipment_field", field: "boil_capacity" }], editor)), [["unknown-reference", 0]]);
  assert.deepEqual(codeOf(applyCommands(base, [{ op: "clear_equipment" }], editor)), [["unknown-reference", 0]]);
});

test("clear_equipment_field and clear_equipment remove values, never replace them with defaults", () => {
  const base = apply(emptyTemplate("beer", "Pale ale"), [{ op: "apply_equipment_snapshot", snapshot: SNAPSHOT }]).content;
  const one = apply(base, [{ op: "clear_equipment_field", field: "boil_capacity" }]);
  assert.deepEqual(Object.keys(one.content.equipment.fields), ["mash_tun_deadspace"]);
  assert.equal(apply(base, [{ op: "clear_equipment" }]).content.equipment, undefined);
});

test("requirements: set and clear on an ingredient, shown in the diff, no calculated change", () => {
  const base = apply(emptyTemplate("beer", "Pale ale"), [{ op: "add_ingredient", id: U(1), kind: "fermentable", name: "Pilsner malt" }]).content;
  const requirements = [{ attribute: "color", level: "required", max: q("4.5", "EBC") }];
  const r = apply(base, [{ op: "set_ingredient_requirements", ingredient: U(1), requirements }]);
  assert.deepEqual(r.content.ingredients[0].requirements, requirements);
  assert.deepEqual(r.diff.statistics, []);
  assert.deepEqual(r.diff.entities.map((e) => [e.type, e.change, e.fields[0].path]), [["ingredient", "changed", "requirements"]]);
  assert.equal(apply(r.content, [{ op: "clear_ingredient_requirements", ingredient: U(1) }]).content.ingredients[0].requirements, undefined);
  assert.equal(applyCommands(base, [{ op: "set_ingredient_requirements", ingredient: U(1), requirements: [{ attribute: "nope", level: "required" }] }], editor).status, "rejected");
});

const REF = (item) => ({ catalog: U(80), item, version: "1" });
const withRequirement = () =>
  apply(emptyTemplate("beer", "Pale ale"), [
    { op: "add_ingredient", id: U(1), kind: "fermentable", name: "Maker A Pilsner", catalog_ref: REF(U(81)), properties: { color: q("3.5", "EBC") } },
    { op: "set_ingredient_group_ref", ingredient: U(1), group_ref: REF(U(82)) },
    { op: "set_ingredient_requirements", ingredient: U(1), requirements: [{ attribute: "color", level: "required", max: q("4.5", "EBC") }] },
    { op: "set_ingredient_alternatives", ingredient: U(1), alternatives: [{ catalog_ref: REF(U(83)) }] },
    { op: "add_stage", id: U(2), kind: "mash" },
    { op: "add_addition", id: U(3), ingredient: U(1), stage: U(2), amount: q("4", "kg"), timing: { basis: "at_start" } },
  ]).content;

test("replace_ingredient keeps what the recipe needs, because that doesn't depend on the product", () => {
  const r = apply(withRequirement(), [{ op: "replace_ingredient", ingredient: U(1), with: { id: U(4), kind: "fermentable", name: "Maker B Pilsner", catalog_ref: REF(U(83)) } }]);
  const [ing] = r.content.ingredients;
  assert.equal(ing.id, U(4));
  assert.deepEqual(ing.group_ref, REF(U(82)));
  assert.deepEqual(ing.requirements, [{ attribute: "color", level: "required", max: q("4.5", "EBC") }]);
  assert.equal(r.content.additions[0].id, U(3));
  assert.equal(r.content.additions[0].ingredient, U(4));
  assert.deepEqual(ing.properties, {}); // a product's properties are not carried to another product
});

test("replace_ingredient doesn't carry approvals: they were given against the old product, and it says so", () => {
  const r = apply(withRequirement(), [{ op: "replace_ingredient", ingredient: U(1), with: { id: U(4), kind: "fermentable", name: "Maker B Pilsner", catalog_ref: REF(U(83)) } }]);
  assert.equal(r.content.ingredients[0].alternatives, undefined);
  assert.deepEqual(r.diagnostics.filter((d) => d.code === "alternatives-not-carried").map((d) => [d.severity, d.command_index]), [["warning", 0]]);
});

test("replace_ingredient across kinds drops a requirement that can't apply, and says so", () => {
  const r = apply(withRequirement(), [{ op: "replace_ingredient", ingredient: U(1), with: { id: U(4), kind: "sugar", name: "Cane sugar" } }]);
  assert.equal(r.content.ingredients[0].group_ref, undefined);
  assert.equal(r.content.ingredients[0].requirements, undefined);
  assert.ok(r.diagnostics.some((d) => d.code === "requirement-not-carried"));
});

test("replacement provenance comes from the channel, and an expansion replays to the same content", () => {
  const cmd = { op: "replace_ingredient", ingredient: U(1), with: { id: U(4), kind: "fermentable", name: "Maker B Pilsner", properties: { color: q("3", "EBC") } } };
  const base = withRequirement();
  const fromAi = apply(base, [cmd], ai);
  assert.equal(fromAi.content.ingredients[0].properties.color.provenance.origin, "ai_proposed");
  const replay = apply(base, fromAi.expanded_commands, ai);
  assert.deepEqual(replay.content, fromAi.content);
  assert.deepEqual(calculateStatistics(replay.content), calculateStatistics(fromAi.content));
});
