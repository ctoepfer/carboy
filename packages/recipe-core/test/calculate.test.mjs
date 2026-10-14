// calculateStatistics: content in, calculated layer out (RECIPE_SCHEMA §8-9).
// It never writes content; every value carries its formula; missing inputs
// are reported, never zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateStatistics, validateContent } from "../dist/index.js";

const q = (value, unit) => ({ value, unit });
const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

export function beerContent() {
  return {
    name: "Calculator test pale ale",
    beverage: { type: "beer" },
    targets: { batch_volume: q("20", "L"), efficiency: q("0.72", "fraction") },
    ingredients: [
      { id: U(10), kind: "fermentable", name: "Pale malt", properties: { color: q("3", "degL"), extract_yield: q("0.8", "fraction"), moisture: q("0.04", "fraction") } },
      { id: U(11), kind: "fermentable", name: "Crystal 60", properties: { color: q("60", "degL"), extract_yield: q("0.74", "fraction"), moisture: q("0.05", "fraction") } },
      { id: U(12), kind: "sugar", name: "Cane sugar", properties: { color: q("0", "degL"), extract_yield: q("1", "fraction"), moisture: q("0", "fraction") } },
      { id: U(13), kind: "hop", name: "Bittering hop", properties: {} },
    ],
    process: {
      stages: [
        { id: U(20), kind: "mash", parameters: {}, steps: [] },
        { id: U(21), kind: "boil", parameters: {}, steps: [] },
        { id: U(22), kind: "fermentation", parameters: {}, steps: [] },
      ],
      flows: [
        { id: U(25), kind: "transfer", from: U(20), to: U(21) },
        { id: U(26), kind: "transfer", from: U(21), to: U(22) },
      ],
    },
    additions: [
      { id: U(30), ingredient: U(10), stage: U(20), amount: q("4", "kg"), timing: { basis: "at_start" } },
      { id: U(31), ingredient: U(11), stage: U(20), amount: q("250", "g"), timing: { basis: "at_start" } },
      { id: U(32), ingredient: U(10), stage: U(20), amount: q("500", "g"), timing: { basis: "at_start" } },
      { id: U(33), ingredient: U(12), stage: U(21), amount: q("200", "g"), timing: { basis: "before_end", offset: q("10", "min") } },
      { id: U(34), ingredient: U(13), stage: U(21), amount: q("30", "g"), timing: { basis: "before_end", offset: q("60", "min") } },
      { id: U(35), ingredient: U(12), stage: U(22), amount: q("100", "g"), timing: { basis: "after_start", offset: q("3", "day") } },
    ],
    statistics: { og: { declared: { value: "1.05", unit: "SG", provenance: { origin: "declared" } }, display: "declared" } },
    calculation_settings: {},
    notes: [],
  };
}

test("the test recipe is valid content", () => {
  assert.deepEqual(validateContent(beerContent()), []);
});

test("extract, OG, and MCU from content; additions after the hot side excluded", () => {
  const { statistics, diagnostics } = calculateStatistics(beerContent());
  // extract = (4.5 kg x 0.8 x 0.96 + 0.25 x 0.74 x 0.95 + 0.2 x 1 x 1) x 0.72
  //         = (3.456 + 0.17575 + 0.2) x 0.72 = 2.75886 kg (exact)
  assert.deepEqual(statistics.extract, {
    value: "2.75886", unit: "kg",
    provenance: { origin: "calculated", formula: { id: "extract.mass", version: "1" } },
  });
  assert.equal(statistics.og.unit, "SG");
  assert.deepEqual(statistics.og.provenance.formula, { id: "gravity.og.mass-method", version: "2" });
  assert.equal(statistics.og_plato.unit, "Plato");
  // MCU = (4.5 kg x 3 + 0.25 kg x 60 + 0.2 kg x 0) in lb·°L ÷ 20 L in US gal
  assert.deepEqual(statistics.mcu.provenance.formula, { id: "color.mcu", version: "1" });
  assert.ok(diagnostics.some((d) => d.code === "addition-after-og-point" && d.path === "/additions/5"));
});

test("independent check of the OG figure", async () => {
  // 2.75886 kg in 20 L: P x d(P) = 100 x 2.75886 / 20 = 13.7943. With Plato's
  // densities (Table 113: 13.1 -> 1.051087, 13.2 -> 1.051510), by hand:
  // 13.12 x 1.051172 = 13.7914 and 13.13 x 1.051214 = 13.8024, so P = 13.12.
  const { statistics } = calculateStatistics(beerContent());
  assert.equal(statistics.og_plato.value, "13.12");
});

test("missing inputs: unavailable with the exact path, never zero", () => {
  const c = beerContent();
  delete c.ingredients[1].properties.moisture;
  delete c.ingredients[1].properties.color;
  const { statistics } = calculateStatistics(c);
  assert.equal(statistics.extract.unavailable.reason, "missing-input");
  assert.deepEqual(statistics.extract.unavailable.details, ["/ingredients/1/properties/moisture"]);
  assert.equal(statistics.og.unavailable.reason, "missing-input");
  assert.deepEqual(statistics.mcu.unavailable.details, ["/ingredients/1/properties/color"]);
  delete c.targets.batch_volume;
  assert.deepEqual(calculateStatistics(c).statistics.mcu.unavailable.details.includes("/targets/batch_volume"), true);
});

test("fruit or honey in a beer: OG unavailable rather than understated", () => {
  const c = beerContent();
  c.ingredients.push({ id: U(14), kind: "fruit", name: "Raspberries", properties: {} });
  c.additions.push({ id: U(36), ingredient: U(14), stage: U(21), amount: q("1", "kg"), timing: { basis: "at_end" } });
  const { statistics } = calculateStatistics(c);
  // No cited formula for fruit or honey extract in a mash: say so.
  assert.equal(statistics.og.unavailable.reason, "formula-unavailable");
  assert.deepEqual(statistics.og.unavailable.details, ["/ingredients/4"]);
});

test("non-beer: no beer statistics, each reported unsupported", () => {
  const c = beerContent();
  c.beverage.type = "mead";
  const { statistics } = calculateStatistics(c);
  for (const k of ["extract", "og", "mcu"]) assert.equal(statistics[k].unavailable.reason, "unsupported-beverage", k);
});

test("never writes content", () => {
  const c = beerContent();
  const before = JSON.stringify(c);
  calculateStatistics(c);
  assert.equal(JSON.stringify(c), before);
});
