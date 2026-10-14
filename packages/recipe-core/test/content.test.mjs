// Content validation, statistics layers, and provenance (RECIPE_SCHEMA §6–§9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MCU,
  displayedStatistic,
  isCalculatedCurrent,
  maltColorUnits,
  originalGravityMassMethod,
  toCalculatedStatistic,
  validateContent,
  validateProvenance,
} from "../dist/index.js";

const dir = new URL("../../../fixtures/canonical-hash/cases/", import.meta.url);
const load = (n) => JSON.parse(readFileSync(new URL(`${n}.input.json`, dir), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const issues = (c) => validateContent(c).map((i) => [i.code, i.path]);
const typical = () => clone(load("revision-typical").content);

test("published revision vectors are valid content", () => {
  for (const n of ["revision-minimal", "revision-typical", "revision-merge"]) assert.deepEqual(issues(load(n).content), [], n);
});

test("beverage: no fallback to beer", () => {
  const c = typical();
  c.beverage.type = "other";
  assert.deepEqual(issues(c), [["unknown-beverage", "/content/beverage/type"]]);
  delete c.beverage;
  assert.deepEqual(issues(c), [["unknown-beverage", "/content/beverage/type"]]);
});

test("identifiers: valid and unique across the document", () => {
  const c = typical();
  c.additions[1].id = c.ingredients[0].id;
  c.notes[0].id = "not-a-uuid";
  assert.deepEqual(issues(c), [
    ["duplicate-id", "/content/additions/1/id"],
    ["invalid-id", "/content/notes/0/id"],
  ]);
});

test("references: additions and flows must name existing entities", () => {
  const c = typical();
  c.additions[0].ingredient = "0192f3a0-0000-7000-8000-000000000999";
  c.additions[1].stage = "0192f3a0-0000-7000-8000-000000000998";
  c.process.flows[0].to = "0192f3a0-0000-7000-8000-000000000997";
  delete c.additions[2].amount;
  assert.deepEqual(issues(c), [
    ["unknown-reference", "/content/process/flows/0/to"],
    ["unknown-reference", "/content/additions/0/ingredient"],
    ["unknown-reference", "/content/additions/1/stage"],
    ["missing-amount", "/content/additions/2/amount"],
  ]);
});

test("kinds come from the tables", () => {
  const c = typical();
  c.ingredients[0].kind = "grain";
  c.process.stages[0].kind = "first_wort"; // a timing point, not a stage kind (Q5)
  c.process.flows[0].kind = "pump";
  assert.deepEqual(issues(c), [
    ["unknown-ingredient-kind", "/content/ingredients/0/kind"],
    ["unknown-stage-kind", "/content/process/stages/0/kind"],
    ["unknown-flow-kind", "/content/process/flows/0/kind"],
  ]);
});

test("timing: offsets, points per stage kind, point basis", () => {
  const c = typical();
  delete c.additions[1].timing.offset; // before_end needs an offset
  c.additions[0].timing = { basis: "at_start", offset: { value: "5", unit: "min" } };
  c.additions[2].timing = { basis: "after_start", offset: { value: "3", unit: "day" }, point: "dry_hop", contact: { value: "4", unit: "kg" } };
  assert.deepEqual(issues(c), [
    ["invalid-timing", "/content/additions/0/timing/offset"],
    ["invalid-timing", "/content/additions/1/timing/offset"],
    ["invalid-timing", "/content/additions/2/timing/contact"],
  ]);
  const d = typical();
  d.additions[1].timing = { basis: "before_end", offset: { value: "0", unit: "min" }, point: "dry_hop" }; // boil
  d.additions[0].timing = { basis: "at_start", point: "first_wort" }; // mash stage
  assert.deepEqual(issues(d), [
    ["timing-point-not-allowed", "/content/additions/0/timing/point"],
    ["timing-point-not-allowed", "/content/additions/1/timing/point"],
  ]);
  const e = typical();
  e.additions[1].timing = { basis: "before_end", offset: { value: "60", unit: "min" }, point: "first_wort" };
  assert.deepEqual(issues(e), [["invalid-timing", "/content/additions/1/timing/basis"]]);
  e.additions[1].timing = { basis: "at_start", point: "first_wort" };
  assert.deepEqual(issues(e), []);
});

test("statistics: calculated never in content; layers hold only matching origins", () => {
  const c = typical();
  c.statistics.og.calculated = { value: "1.055", unit: "SG" };
  c.statistics.fg = { measured: { value: "1.012", unit: "SG", provenance: { origin: "inferred", confidence: "estimated" } } };
  c.statistics.ibu = { imported_estimate: { value: "24", unit: "IBU", provenance: { origin: "declared" } }, display: "measured" };
  c.statistics.abv = { declared: { value: "5.4", unit: "%", provenance: { origin: "calculated", formula: { id: "x.y", version: "1" } } } };
  assert.deepEqual(issues(c), [
    ["calculated-in-content", "/content/statistics/og/calculated"],
    ["origin-layer-mismatch", "/content/statistics/fg/measured/provenance/origin"],
    ["origin-layer-mismatch", "/content/statistics/ibu/imported_estimate/provenance/origin"],
    ["display-layer-missing", "/content/statistics/ibu/display"],
    ["calculated-in-content", "/content/statistics/abv/declared/provenance/origin"],
  ]);
});

test("statistics: layer values are valid quantities", () => {
  const c = typical();
  c.statistics.og.declared.value = "1.0560";
  c.statistics.og.declared.unit = "points";
  assert.deepEqual(issues(c).map((x) => x[0]), ["non-normalized-decimal", "unknown-unit"]);
});

test("provenance: origins, formula for calculated, no file names in source", () => {
  const codes = (p) => validateProvenance(p, "/p").map((i) => i.code);
  assert.deepEqual(codes({ origin: "imported", confidence: "estimated", source: { format: "beerxml", field: "AMOUNT", original_display: "1 tablet" } }), []);
  assert.deepEqual(codes({ origin: "guessed" }), ["unknown-origin"]);
  assert.deepEqual(codes({ origin: "calculated" }), ["calculated-without-formula"]);
  assert.deepEqual(codes({ origin: "calculated", formula: { id: "color.mcu", version: 1 } }), ["calculated-without-formula"]); // version is a string
  assert.deepEqual(codes({ origin: "imported", source: { format: "beerxml", file_name: "my recipe.xml" } }), ["source-member-not-allowed"]);
  assert.deepEqual(codes({ origin: "measured", confidence: "sure" }), ["unknown-confidence"]);
  assert.deepEqual(codes({ origin: "declared", author: "x" }), ["invalid-provenance"]);
  const c = typical();
  c.ingredients[0].properties.color.provenance = { origin: "imported", source: { path: "/home/x/recipe.xml" } };
  assert.deepEqual(issues(c), [["source-member-not-allowed", "/content/ingredients/0/properties/color/provenance/source/path"]]);
});

test("display rule: declared, then imported estimate, then calculated; measured only when chosen; unknown is unknown", () => {
  const calc = { value: "1.055", unit: "SG", provenance: { origin: "calculated", formula: { id: "f", version: "1" } } };
  const decl = { value: "1.056", unit: "SG", provenance: { origin: "declared" } };
  const imp = { value: "1.054", unit: "SG", provenance: { origin: "imported" } };
  const meas = { value: "1.057", unit: "SG", provenance: { origin: "measured" } };
  assert.equal(displayedStatistic({ declared: decl, imported_estimate: imp }, calc).layer, "declared");
  assert.equal(displayedStatistic({ imported_estimate: imp, measured: meas }, calc).layer, "imported_estimate");
  assert.equal(displayedStatistic({ measured: meas }, calc).layer, "calculated"); // measured never shown by default
  assert.equal(displayedStatistic({ measured: meas, display: "measured" }, calc).value, "1.057");
  assert.equal(displayedStatistic({ declared: decl, display: "calculated" }, calc).layer, "calculated");
  assert.deepEqual(displayedStatistic(undefined, undefined), { status: "unknown" });
  const unavailable = toCalculatedStatistic(originalGravityMassMethod("beer"));
  assert.deepEqual(displayedStatistic({}, unavailable), { status: "unknown" }); // never zero, never a guess
});

test("calculated layer: formula identity recorded; stale versions detected", () => {
  const r = maltColorUnits("beer", [{ mass: { value: "10", unit: "lb" }, color: { value: "2", unit: "degL" } }], { value: "5", unit: "US gal" });
  const entry = toCalculatedStatistic(r);
  assert.deepEqual(entry, { value: "4", unit: "MCU", provenance: { origin: "calculated", formula: { id: "color.mcu", version: "1" } } });
  assert.ok(isCalculatedCurrent(entry, MCU));
  assert.ok(!isCalculatedCurrent(entry, { ...MCU, version: 2 }));
  const u = toCalculatedStatistic(originalGravityMassMethod("beer"));
  assert.equal(u.unavailable.reason, "formula-unavailable");
  assert.deepEqual(u.unavailable.details, ["gravity.sg-plato"]);
});
