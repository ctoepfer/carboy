// Schema 0.3: recipe language (UQ5), the equipment snapshot, and ingredient
// attribute requirements. Additive: 0.1 and 0.2 content stays valid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQUIPMENT_FIELDS, INGREDIENT_TRAITS, SCHEMA_VERSION, calculateStatistics, checkSchemaVersion, requiredSchemaVersion, validateContent } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const base = () => ({
  name: "Pale ale",
  beverage: { type: "beer" },
  targets: {},
  ingredients: [
    { id: U(1), kind: "fermentable", name: "Pilsner malt", properties: {} },
    { id: U(2), kind: "culture", name: "Ale yeast", properties: {} },
  ],
  process: { stages: [], flows: [] },
  additions: [],
  statistics: {},
  calculation_settings: {},
  notes: [],
});
const codes = (c) => validateContent(c).map((i) => `${i.code} ${i.path}`);
const measured = (value, unit) => ({ value, unit, provenance: { origin: "measured" }, measured_on: "2026-10-01" });
const entered = (value, unit) => ({ value, unit, provenance: { origin: "manually_entered" } });

test("the schema is at 0.3 and older content still writes at its own version", () => {
  assert.deepEqual([SCHEMA_VERSION.major, SCHEMA_VERSION.minor], [0, 3]);
  assert.equal(requiredSchemaVersion(base()).version, "0.1");
  assert.deepEqual(checkSchemaVersion(base(), "0.1"), []);
});

test("each 0.3 member needs 0.3", () => {
  const cases = [
    [(c) => (c.language = "en"), "/content/language"],
    [(c) => (c.equipment = { fields: {} }), "/content/equipment"],
    [(c) => (c.ingredients[0].requirements = [{ attribute: "color", level: "required", max: { value: "4", unit: "EBC" } }]), "/content/ingredients/0/requirements"],
  ];
  for (const [mutate, path] of cases) {
    const c = base();
    mutate(c);
    assert.equal(requiredSchemaVersion(c).version, "0.3");
    assert.deepEqual(checkSchemaVersion(c, "0.2").map((i) => [i.code, i.path]), [["member-newer-than-schema", path]]);
    assert.deepEqual(checkSchemaVersion(c, "0.3"), []);
  }
});

test("UQ5: language is an optional, well-formed BCP 47 tag", () => {
  for (const ok of ["en", "de-DE", "zh-Hans-CN", "pt-BR"]) assert.deepEqual(codes({ ...base(), language: ok }), []);
  for (const bad of ["", "e", "english language", "de_DE", 5]) assert.deepEqual(codes({ ...base(), language: bad }), ["invalid-language /content/language"]);
});

test("the equipment field table is closed, with no default values anywhere", () => {
  assert.deepEqual(EQUIPMENT_FIELDS.map((f) => f.name), [
    "batch_size", "batch_capacity", "mash_capacity", "boil_capacity", "pre_boil_volume", "boil_time",
    "mash_tun_weight", "mash_tun_specific_heat", "mash_tun_deadspace",
    "boil_off_per_hour", "boil_off_fraction_per_hour", "kettle_top_up", "hop_utilization_adjustment",
    "trub_chiller_loss", "cooling_loss", "fermenter_top_up", "brewhouse_efficiency",
  ]);
  for (const f of EQUIPMENT_FIELDS) assert.equal("default" in f, false);
});

test("an equipment snapshot: values carry provenance, and what isn't known is simply absent", () => {
  const c = base();
  c.equipment = {
    based_on: { profile: U(9), version: "3", name: "Garage system" },
    fields: { boil_capacity: entered("40", "L"), mash_tun_deadspace: measured("1.5", "L"), brewhouse_efficiency: entered("72", "%") },
    notes: "Measured with a jug",
  };
  assert.deepEqual(codes(c), []);
  c.equipment = { fields: {} };
  assert.deepEqual(codes(c), []);
});

const BAD_EQUIPMENT = [
  ["unknown field", { fields: { kettle_colour: entered("1", "L") } }, "unknown-equipment-field /content/equipment/fields/kettle_colour"],
  ["wrong dimension", { fields: { boil_capacity: entered("40", "kg") } }, "equipment-unit-not-allowed /content/equipment/fields/boil_capacity/unit"],
  ["no provenance", { fields: { boil_capacity: { value: "40", unit: "L" } } }, "missing-provenance /content/equipment/fields/boil_capacity/provenance"],
  ["bad provenance", { fields: { boil_capacity: { value: "40", unit: "L", provenance: { origin: "nope" } } } }, "unknown-origin /content/equipment/fields/boil_capacity/provenance/origin"],
  ["zero capacity", { fields: { boil_capacity: entered("0", "L") } }, "equipment-value-out-of-range /content/equipment/fields/boil_capacity/value"],
  ["negative loss", { fields: { trub_chiller_loss: entered("-1", "L") } }, "negative-quantity /content/equipment/fields/trub_chiller_loss/value"],
  ["a weight in litres", { fields: { mash_tun_weight: entered("12", "L") } }, "equipment-unit-not-allowed /content/equipment/fields/mash_tun_weight/unit"],
  ["a boil time in litres", { fields: { boil_time: entered("60", "L") } }, "equipment-unit-not-allowed /content/equipment/fields/boil_time/unit"],
  ["no boil time", { fields: { boil_time: entered("0", "min") } }, "equipment-value-out-of-range /content/equipment/fields/boil_time/value"],
  ["cooling loss above 100 %", { fields: { cooling_loss: entered("101", "%") } }, "equipment-value-out-of-range /content/equipment/fields/cooling_loss/value"],
  ["efficiency above 100 %", { fields: { brewhouse_efficiency: entered("110", "%") } }, "equipment-value-out-of-range /content/equipment/fields/brewhouse_efficiency/value"],
  ["measured_on without a measurement", { fields: { boil_capacity: { ...entered("40", "L"), measured_on: "2026-10-01" } } }, "measured-on-not-measured /content/equipment/fields/boil_capacity/measured_on"],
  ["impossible date", { fields: { boil_capacity: { ...measured("40", "L"), measured_on: "2026-02-30" } } }, "invalid-date /content/equipment/fields/boil_capacity/measured_on"],
  ["fields missing", {}, "invalid-equipment /content/equipment/fields"],
  ["unknown member", { fields: {}, x: 1 }, "unknown-member /content/equipment/x"],
  ["based_on without a version", { fields: {}, based_on: { profile: U(9), name: "x" } }, "invalid-equipment /content/equipment/based_on/version"],
  ["based_on with a bad profile id", { fields: {}, based_on: { profile: "x", version: "1", name: "x" } }, "invalid-id /content/equipment/based_on/profile"],
];
for (const [name, equipment, expected] of BAD_EQUIPMENT) {
  test(`equipment refused: ${name}`, () => {
    const got = codes({ ...base(), equipment });
    assert.ok(got.includes(expected), JSON.stringify(got));
  });
}

test("hop utilization may exceed 100 %, because it adjusts rather than limits", () => {
  assert.deepEqual(codes({ ...base(), equipment: { fields: { hop_utilization_adjustment: entered("110", "%") } } }), []);
});

test("ingredient requirements: required versus preferred, on properties and traits", () => {
  assert.ok(INGREDIENT_TRAITS.some((t) => t.name === "diastatic"));
  const c = base();
  c.ingredients[0].requirements = [
    { attribute: "color", level: "required", max: { value: "4.5", unit: "EBC" } },
    { attribute: "extract_yield", level: "preferred", min: { value: "0.8", unit: "fraction" } },
  ];
  c.ingredients[1].requirements = [{ attribute: "diastatic", level: "required", equals: false }];
  assert.deepEqual(codes(c), []);
});

const BAD_REQUIREMENTS = [
  ["not a list", "x", "invalid-requirements /content/ingredients/0/requirements"],
  ["unknown attribute", [{ attribute: "flavour", level: "required", min: { value: "1", unit: "%" } }], "unknown-attribute /content/ingredients/0/requirements/0/attribute"],
  ["attribute of another kind", [{ attribute: "alpha_acid", level: "required", min: { value: "1", unit: "%" } }], "unknown-attribute /content/ingredients/0/requirements/0/attribute"],
  ["bad level", [{ attribute: "color", level: "nice", max: { value: "4", unit: "EBC" } }], "invalid-requirements /content/ingredients/0/requirements/0/level"],
  ["no bound", [{ attribute: "color", level: "required" }], "invalid-requirements /content/ingredients/0/requirements/0"],
  ["unit not allowed", [{ attribute: "color", level: "required", max: { value: "4", unit: "kg" } }], "property-unit-not-allowed /content/ingredients/0/requirements/0/max/unit"],
  ["min above max", [{ attribute: "moisture", level: "required", min: { value: "0.5", unit: "fraction" }, max: { value: "0.1", unit: "fraction" } }], "invalid-requirements /content/ingredients/0/requirements/0"],
  ["repeated attribute and level", [{ attribute: "color", level: "required", max: { value: "4", unit: "EBC" } }, { attribute: "color", level: "required", min: { value: "1", unit: "EBC" } }], "duplicate-requirement /content/ingredients/0/requirements/1"],
  ["unknown member", [{ attribute: "color", level: "required", max: { value: "4", unit: "EBC" }, z: 1 }], "unknown-member /content/ingredients/0/requirements/0/z"],
];
for (const [name, requirements, expected] of BAD_REQUIREMENTS) {
  test(`requirements refused: ${name}`, () => {
    const c = base();
    c.ingredients[0].requirements = requirements;
    assert.ok(codes(c).includes(expected), JSON.stringify(codes(c)));
  });
}

test("a trait requirement states a boolean, not a range", () => {
  const c = base();
  c.ingredients[1].requirements = [{ attribute: "diastatic", level: "required", equals: "no" }];
  assert.ok(codes(c).includes("invalid-requirements /content/ingredients/1/requirements/0/equals"));
});

test("neither equipment nor requirements changes a calculated result", () => {
  const c = {
    ...base(),
    targets: { batch_volume: { value: "20", unit: "L" }, efficiency: { value: "0.72", unit: "fraction" } },
    ingredients: [{ id: U(1), kind: "fermentable", name: "Pilsner malt", properties: { color: { value: "2", unit: "degL" }, extract_yield: { value: "0.8", unit: "fraction" }, moisture: { value: "0.04", unit: "fraction" } } }],
    process: { stages: [{ id: U(3), kind: "mash" }], flows: [] },
    additions: [{ id: U(4), ingredient: U(1), stage: U(3), amount: { value: "4", unit: "kg" } }],
  };
  const before = calculateStatistics(c);
  const after = calculateStatistics({
    ...c,
    equipment: { fields: { brewhouse_efficiency: entered("50", "%") } },
    ingredients: [{ ...c.ingredients[0], requirements: [{ attribute: "color", level: "required", max: { value: "1", unit: "degL" } }] }],
  });
  assert.deepEqual(after, before);
});
