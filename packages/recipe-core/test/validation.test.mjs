// Remaining content validation (RECIPE_SCHEMA §5, §7.2, §7.3; Q9): quantities
// wherever they appear, stage parameters and steps, process topology, the
// closed ingredient property table, known targets; plus advisory beverage
// checks ported from Lumina, which never make a recipe invalid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INGREDIENT_PROPERTIES, beverageAdvisories, validateContent } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const q = (value, unit) => ({ value, unit });
function beer() {
  return {
    name: "Pale",
    beverage: { type: "beer" },
    targets: { batch_volume: q("20", "L"), efficiency: q("0.72", "fraction") },
    ingredients: [
      { id: U(10), kind: "fermentable", name: "Pale malt", properties: { color: q("3", "degL"), extract_yield: q("0.8", "fraction"), moisture: q("4", "%") } },
      { id: U(11), kind: "hop", name: "Hop", properties: {} },
      { id: U(12), kind: "culture", name: "Ale yeast", properties: {} },
    ],
    process: {
      stages: [
        { id: U(20), kind: "mash", parameters: { temperature: q("66", "C") }, steps: [{ id: U(30), name: "Rest", parameters: { duration: q("60", "min") } }] },
        { id: U(21), kind: "boil", parameters: {}, steps: [] },
        { id: U(22), kind: "fermentation", parameters: {}, steps: [] },
      ],
      flows: [
        { id: U(40), kind: "transfer", from: U(20), to: U(21) },
        { id: U(41), kind: "transfer", from: U(21), to: U(22) },
      ],
    },
    additions: [
      { id: U(50), ingredient: U(10), stage: U(20), amount: q("4.5", "kg"), timing: { basis: "at_start" } },
      { id: U(51), ingredient: U(11), stage: U(21), amount: q("30", "g"), timing: { basis: "before_end", offset: q("60", "min") } },
      { id: U(52), ingredient: U(12), stage: U(22), amount: q("1", "package"), timing: { basis: "at_start" } },
    ],
    statistics: {},
    calculation_settings: {},
    notes: [],
  };
}
const codes = (c) => validateContent(c).map((i) => [i.code, i.path]);

test("a complete beer validates and has no advisories", () => {
  assert.deepEqual(codes(beer()), []);
  assert.deepEqual(beverageAdvisories(beer()), []);
});

test("quantities are checked wherever they appear", () => {
  const c = beer();
  c.additions[0].amount = q("4.50", "kg");
  c.additions[1].amount = q("-30", "g");
  c.process.stages[0].parameters.temperature = q("66", "Celsius");
  c.process.stages[0].steps[0].parameters.duration = "60 min";
  c.ingredients[0].properties.color = q("abc", "degL");
  c.targets.boil_volume = q("25", "furlong");
  assert.deepEqual(codes(c), [
    ["invalid-decimal", "/content/ingredients/0/properties/color/value"],
    ["unknown-unit", "/content/process/stages/0/parameters/temperature/unit"],
    ["invalid-quantity", "/content/process/stages/0/steps/0/parameters/duration"],
    ["non-normalized-decimal", "/content/additions/0/amount/value"],
    ["negative-quantity", "/content/additions/1/amount/value"],
    ["unknown-unit", "/content/targets/boil_volume/unit"],
  ]);
});

test("stage parameters and steps: object of quantities; steps an array of { id, name?, parameters }", () => {
  const c = beer();
  c.process.stages[1].parameters = [];
  c.process.stages[2].steps = {};
  c.process.stages[0].steps.push({ id: U(31), name: 7, parameters: {} });
  assert.deepEqual(codes(c), [
    ["invalid-stage", "/content/process/stages/0/steps/1/name"],
    ["invalid-stage", "/content/process/stages/1/parameters"],
    ["invalid-stage", "/content/process/stages/2/steps"],
  ]);
});

test("topology: flows may branch and merge, but never loop back", () => {
  const c = beer();
  c.process.flows.push({ id: U(42), kind: "transfer", from: U(22), to: U(20) });
  assert.deepEqual(codes(c), [["process-cycle", "/content/process/flows/2"]]);
  const s = beer();
  s.process.flows.push({ id: U(42), kind: "loss", from: U(21), to: U(21) });
  assert.deepEqual(codes(s), [["process-cycle", "/content/process/flows/2"]]);
  // A branch (split to two vessels) is valid; calculations may still call it unsupported.
  const b = beer();
  b.process.stages.push({ id: U(23), kind: "fermentation", parameters: {}, steps: [] });
  b.process.flows.push({ id: U(43), kind: "transfer", from: U(21), to: U(23) });
  assert.deepEqual(codes(b), []);
});

test("closed property table (Q9): only rows may appear in properties; unmapped holds the rest", () => {
  assert.deepEqual(
    INGREDIENT_PROPERTIES.map((r) => [r.name, r.kinds.join("+"), r.units.join("+")]),
    [
      ["color", "fermentable+sugar", "degL+SRM+EBC"],
      ["extract_yield", "fermentable+sugar", "fraction+%"],
      ["moisture", "fermentable+sugar", "fraction+%"],
      ["alpha_acid", "hop", "fraction+%"],
    ],
  );
  const c = beer();
  c.ingredients[0].properties.potential = q("1.037", "SG");
  c.ingredients[0].properties.moisture = q("4", "g");
  c.ingredients[1].properties.alpha_acid = q("5", "%");
  c.ingredients[1].properties.cohumulone = q("0.3", "fraction");
  c.ingredients[1].unmapped = { ALPHA: "5.0", FORM: "Pellet" }; // imported verbatim, never calculated from
  assert.deepEqual(codes(c), [
    ["property-unit-not-allowed", "/content/ingredients/0/properties/moisture/unit"],
    ["unknown-property", "/content/ingredients/0/properties/potential"],
    ["unknown-property", "/content/ingredients/1/properties/cohumulone"],
  ]);
  const u = beer();
  u.ingredients[1].unmapped = "ALPHA=5";
  assert.deepEqual(codes(u), [["invalid-unmapped", "/content/ingredients/1/unmapped"]]);
});

test("known targets: batch volume is a positive volume, efficiency dimensionless", () => {
  const c = beer();
  c.targets.batch_volume = q("0", "L");
  c.targets.efficiency = q("72", "kg");
  assert.deepEqual(codes(c), [
    ["invalid-target", "/content/targets/batch_volume"],
    ["invalid-target", "/content/targets/efficiency"],
  ]);
  const m = beer();
  m.targets.batch_volume = q("5", "kg");
  assert.deepEqual(codes(m), [["invalid-target", "/content/targets/batch_volume"]]);
});

test("beverage advisories (ported from Lumina validation.py): reported, never invalid", () => {
  const c = beer();
  c.ingredients = c.ingredients.filter((i) => i.kind === "fermentable");
  c.additions = c.additions.slice(0, 1);
  assert.deepEqual(codes(c), []);
  assert.deepEqual(beverageAdvisories(c).map((a) => a.code), ["beer-without-hops", "no-culture"]);
  const mead = { ...beer(), beverage: { type: "mead" }, ingredients: [{ id: U(12), kind: "culture", name: "Yeast", properties: {} }], additions: [] };
  assert.deepEqual(beverageAdvisories(mead).map((a) => a.code), ["mead-without-honey"]);
  const cider = { ...mead, beverage: { type: "cider" } };
  assert.deepEqual(beverageAdvisories(cider).map((a) => a.code), ["cider-without-fruit"]);
  const wine = { ...mead, beverage: { type: "wine" } };
  assert.deepEqual(beverageAdvisories(wine).map((a) => a.code), ["wine-without-fruit-or-sugar"]);
  wine.ingredients = [...wine.ingredients, { id: U(13), kind: "sugar", name: "Sugar", properties: {} }];
  assert.deepEqual(beverageAdvisories(wine), []);
  // Sake: no rule without a source.
  assert.deepEqual(beverageAdvisories({ ...mead, beverage: { type: "sake" }, ingredients: [] }), []);
  const noFerm = beer();
  noFerm.ingredients = noFerm.ingredients.filter((i) => i.kind !== "fermentable");
  assert.deepEqual(beverageAdvisories(noFerm).map((a) => [a.code, a.path]), [["beer-without-fermentable", "/content/ingredients"]]);
});
