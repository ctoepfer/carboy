// Equipment profiles (OVERVIEW §2): versioned, named sets of equipment values
// that a recipe copies. Revising a profile never reaches a saved recipe, and
// what nobody measured stays absent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal, EQUIPMENT_FIELDS, calculateStatistics, createRevision, validateContent, verifyRevision } from "@carboy/recipe-core";
import { applyCommands, emptyTemplate } from "@carboy/editor-commands";
import { readNative, writeNative } from "@carboy/recipe-format";
import { changedFields, createProfile, reviseProfile, snapshotProfile, validateProfile } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const entered = (value, unit) => ({ value, unit, provenance: { origin: "manually_entered" } });
const measured = (value, unit, measured_on = "2026-10-01") => ({ value, unit, provenance: { origin: "measured", note: "filled with a jug" }, measured_on });
const AT = "2026-11-05T00:00:00.000Z";
const first = () => createProfile({
  id: U(1), name: "Garage system", created_at: AT,
  fields: { boil_capacity: entered("40", "L"), mash_tun_deadspace: measured("1.5", "L"), brewhouse_efficiency: entered("72", "%") },
});
const issues = (p) => validateProfile(p).map((i) => `${i.code} ${i.path}`);

test("a new profile is version 1 and holds only what was stated", () => {
  const p = first();
  assert.deepEqual([p.format, p.schema_version, p.version], ["equipment-profile", "0.1", "1"]);
  assert.deepEqual(issues(p), []);
  assert.deepEqual(Object.keys(p.fields).sort(), ["boil_capacity", "brewhouse_efficiency", "mash_tun_deadspace"]);
});

test("an empty profile is fine: nothing is assumed about equipment no one has described", () => {
  const p = createProfile({ id: U(2), name: "New kettle", created_at: AT, fields: {} });
  assert.deepEqual(p.fields, {});
  assert.deepEqual(snapshotProfile(p).fields, {});
});

// A real profile from the owner, every line of it. Stated zeros are values;
// they aren't the same as absent. Cooling loss is stated as 4.00 with no unit,
// and the percentage reading is checked below.
const OWNER_SYSTEM = {
  batch_size: entered("5.5", "US gal"),
  mash_capacity: entered("10", "US gal"),
  mash_tun_weight: entered("12", "lb"),
  mash_tun_specific_heat: entered("0.12", "fraction"),
  mash_tun_deadspace: entered("0", "US gal"),
  pre_boil_volume: entered("7", "US gal"),
  boil_time: entered("60", "min"),
  evaporation_rate: entered("10.7", "%"),
  kettle_top_up: entered("0", "US gal"),
  hop_utilization_adjustment: entered("100", "%"),
  trub_chiller_loss: entered("0.5", "US gal"),
  cooling_loss: entered("4", "%"),
  fermenter_top_up: entered("0", "US gal"),
};

test("the owner's system fits, in the units it was stated in, and survives a snapshot unchanged", () => {
  const p = createProfile({ id: U(2), name: "Ten-gallon three-vessel", created_at: AT, fields: OWNER_SYSTEM });
  assert.deepEqual(validateProfile(p), []);
  assert.deepEqual(snapshotProfile(p).fields, OWNER_SYSTEM);
  const r = applyCommands(emptyTemplate("beer", "Helles"), [{ op: "apply_equipment_snapshot", snapshot: snapshotProfile(p) }], { channel: "editor" });
  assert.equal(r.status, "applied", JSON.stringify(r.diagnostics));
  assert.equal(r.content.equipment.fields.kettle_top_up.value, "0");
  assert.equal(r.content.equipment.fields.batch_capacity, undefined); // not stated, so not there
});

test("the stated numbers agree with each other only if cooling loss is a percentage", () => {
  // Arithmetic on the owner's own figures, exact in decimal: a check on reading
  // cooling loss, not a Carboy formula. No volume calculation exists yet. The
  // 0.107 is applied once for this 60-minute boil, which says nothing about
  // evaporation_rate's time basis: per hour and per boil give the same answer.
  const d = Decimal.parse;
  const left = d("7").mul(d("1").sub(d("0.107"))).mul(d("1").sub(d("0.04"))).sub(d("0.5"));
  assert.equal(left.toString(), "5.50096");
});

test("evaporation_rate is stored as stated and claims no time basis", () => {
  const eq = EQUIPMENT_FIELDS.find((f) => f.name === "evaporation_rate");
  assert.equal(eq.dimension, "fraction");
  assert.equal(EQUIPMENT_FIELDS.some((f) => f.name === "boil_off_fraction_per_hour"), false);
});

test("a profile that isn't valid is refused, not repaired", () => {
  assert.throws(() => createProfile({ id: "x", name: "A", created_at: AT, fields: {} }), /invalid-id/);
  assert.throws(() => createProfile({ id: U(2), name: " ", created_at: AT, fields: {} }), /invalid-profile/);
  assert.throws(() => createProfile({ id: U(2), name: "A", created_at: AT, fields: { boil_capacity: { value: "40", unit: "L" } } }), /missing-provenance/);
  assert.throws(() => createProfile({ id: U(2), name: "A", created_at: AT, fields: { boil_capacity: entered("40", "kg") } }), /equipment-unit-not-allowed/);
  assert.throws(() => createProfile({ id: U(2), name: "A", created_at: "yesterday", fields: {} }), /invalid-profile/);
});

test("validation finds what a hand-made document gets wrong", () => {
  assert.ok(issues({ ...first(), version: "1.1" }).includes("invalid-profile /version"));
  assert.ok(issues({ ...first(), format: "x" }).includes("invalid-profile /format"));
  assert.ok(issues({ ...first(), schema_version: "9.0" }).includes("unsupported-profile-schema /schema_version"));
  assert.ok(issues({ ...first(), brand: "x" }).includes("unknown-member /brand"));
  assert.ok(issues({ ...first(), notes: 3 }).includes("invalid-profile /notes"));
});

test("a revision is a new version; the old one is unchanged", () => {
  const v1 = first();
  const frozen = JSON.stringify(v1);
  const v2 = reviseProfile(v1, { set: { mash_tun_deadspace: measured("1.8", "L", "2026-11-01") }, clear: ["brewhouse_efficiency"], created_at: AT });
  assert.equal(JSON.stringify(v1), frozen);
  assert.deepEqual([v2.id, v2.version], [v1.id, "2"]);
  assert.equal(v2.fields.mash_tun_deadspace.value, "1.8");
  assert.equal(v2.fields.brewhouse_efficiency, undefined);
  assert.equal(reviseProfile(v2, { name: "Garage, new valve", created_at: AT }).version, "3");
});

test("revisions refuse a field that isn't there to clear, and values that aren't valid", () => {
  assert.throws(() => reviseProfile(first(), { clear: ["batch_capacity"], created_at: AT }), /unknown-reference/);
  assert.throws(() => reviseProfile(first(), { set: { boil_capacity: entered("0", "L") }, created_at: AT }), /equipment-value-out-of-range/);
});

test("calibration history: what changed between two versions, measurement dates included", () => {
  const v1 = first();
  const v2 = reviseProfile(v1, { set: { mash_tun_deadspace: measured("1.8", "L", "2026-11-01"), batch_capacity: entered("23", "L") }, clear: ["brewhouse_efficiency"], created_at: AT });
  assert.deepEqual(changedFields(v1, v2).map((c) => [c.field, c.change]), [["batch_capacity", "added"], ["brewhouse_efficiency", "removed"], ["mash_tun_deadspace", "changed"]]);
  assert.deepEqual(changedFields(v1, v1), []);
});

test("a snapshot names the version it came from, and shares nothing with the profile", () => {
  const p = first();
  const s = snapshotProfile(p);
  assert.deepEqual(s.based_on, { profile: U(1), version: "1", name: "Garage system" });
  assert.deepEqual(s.fields, p.fields);
  assert.notEqual(s.fields.boil_capacity, p.fields.boil_capacity);
  assert.equal(snapshotProfile({ ...p, notes: "Stainless" }).notes, "Stainless");
});

const meta = { schema_version: "0.3", recipe_id: U(3), revision_id: U(4), parents: [], created_at: AT, origin: "user_edit" };
const recipe = () => {
  const r = applyCommands(emptyTemplate("beer", "Helles"), [
    { op: "apply_equipment_snapshot", snapshot: snapshotProfile(first()) },
    { op: "set_target", name: "batch_volume", quantity: { value: "20", unit: "L" } },
    { op: "set_target", name: "efficiency", quantity: { value: "0.72", unit: "fraction" } },
    { op: "add_ingredient", id: U(5), kind: "fermentable", name: "Malt", properties: { color: { value: "2", unit: "degL" }, extract_yield: { value: "0.8", unit: "fraction" }, moisture: { value: "0.04", unit: "fraction" } } },
    { op: "add_stage", id: U(6), kind: "mash" },
    { op: "add_addition", id: U(7), ingredient: U(5), stage: U(6), amount: { value: "4", unit: "kg" }, timing: { basis: "at_start" } },
  ], { channel: "editor" });
  assert.equal(r.status, "applied", JSON.stringify(r.diagnostics));
  return r.content;
};

test("a snapshot in a recipe validates, hashes, saves, and reopens with its provenance intact", () => {
  const rev = createRevision(meta, recipe());
  assert.equal(verifyRevision(rev).status, "valid");
  const back = readNative(writeNative(rev));
  assert.equal(back.status, "editable");
  const eq = back.revision.content.equipment;
  assert.equal(eq.fields.mash_tun_deadspace.provenance.origin, "measured");
  assert.equal(eq.fields.mash_tun_deadspace.measured_on, "2026-10-01");
  assert.deepEqual(eq.based_on, { profile: U(1), version: "1", name: "Garage system" });
});

test("revising a profile never reaches a saved recipe: same bytes, same numbers", () => {
  const rev = createRevision(meta, recipe());
  const bytes = writeNative(rev);
  const before = calculateStatistics(rev.content);
  reviseProfile(first(), { set: { boil_capacity: entered("60", "L"), brewhouse_efficiency: entered("50", "%") }, created_at: AT });
  const back = readNative(bytes);
  assert.equal(writeNative(back.revision), bytes);
  assert.deepEqual(calculateStatistics(back.revision.content), before);
  assert.equal(back.revision.content.equipment.fields.boil_capacity.value, "40");
});

test("applying a newer profile version is an explicit, reviewed edit with a diff", () => {
  const v2 = reviseProfile(first(), { set: { boil_capacity: entered("60", "L") }, created_at: AT });
  const r = applyCommands(recipe(), [{ op: "apply_equipment_snapshot", snapshot: snapshotProfile(v2) }], { channel: "editor" });
  assert.equal(r.status, "applied");
  assert.deepEqual(r.diff.entities.map((e) => [e.type, e.id]).sort(), [["equipment", "based_on"], ["equipment", "boil_capacity"]]);
  assert.deepEqual(r.diff.statistics, []); // equipment is not yet read by any formula
  assert.deepEqual(validateContent(r.content), []);
});
