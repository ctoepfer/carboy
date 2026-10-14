// Stoichiometric pieces of CQ3/CQ4 (IUPAC/CIAAW Abridged Standard Atomic
// Weights 2024): SO2 released by potassium metabisulfite, nitrogen supplied
// by diammonium phosphate. Expected values: exact products with the
// four-significant-figure factors 0.5763 and 0.2121.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getFormula, so2FromMetabisulfite, yanFromDap } from "../dist/index.js";

const q = (value, unit) => ({ value, unit });

test("factors follow from the cited atomic weights", () => {
  // K2S2O5 = 2(39.098) + 2(32.06) + 5(15.999) = 222.311; 2 SO2 = 128.116
  // (NH4)2HPO4 = 2(14.007) + 9(1.0080) + 30.974 + 4(15.999) = 132.056; 2 N = 28.014
  assert.equal((128.116 / 222.311).toFixed(4), "0.5763");
  assert.equal((28.014 / 132.056).toFixed(4), "0.2121");
  for (const id of ["sulfite.so2-from-metabisulfite", "nutrient.yan-from-dap"]) {
    const f = getFormula(id);
    assert.equal(f.status, "enabled", id);
    assert.equal(f.source.status, "primary-checked", id);
  }
});

test("metabisulfite: SO2 released, and its concentration when a volume is given", () => {
  const r = so2FromMetabisulfite("wine", q("1", "g"));
  assert.deepEqual([r.value.toString(), r.unit], ["0.5763", "g"]);
  const c = so2FromMetabisulfite("wine", q("1", "g"), q("20", "L"));
  assert.equal(c.concentration.toString(), "28.815"); // mg/L: 576.3 mg / 20 L
  const pure98 = so2FromMetabisulfite("cider", q("10", "g"), undefined, q("0.98", "fraction"));
  assert.equal(pure98.value.toString(), "5.64774"); // 10 x 0.98 x 0.5763
  assert.equal(so2FromMetabisulfite("mead", q("2", "g")).value.toString(), "1.1526");
  assert.match(r.assumptions.join(" "), /not the free SO₂/);
});

test("DAP: nitrogen supplied, and YAN added when a volume is given", () => {
  const r = yanFromDap("mead", q("1", "g"));
  assert.deepEqual([r.value.toString(), r.unit], ["0.2121", "g"]);
  const c = yanFromDap("mead", q("2", "g"), q("20", "L"));
  assert.equal(c.concentration.toString(), "21.21"); // mg N/L: 424.2 mg / 20 L
  assert.equal(yanFromDap("wine", q("0.5", "g"), q("5", "L")).concentration.toString(), "21.21");
  assert.equal(yanFromDap("wine", q("500", "mg")).reason, "invalid-input"); // mg is not a unit token (yet)
});

test("unavailable: tablets without a stated mass, wrong beverage, bad inputs", () => {
  assert.equal(so2FromMetabisulfite("wine", q("1", "tablet")).reason, "invalid-input"); // Campden tablet mass unknown
  assert.equal(so2FromMetabisulfite("beer", q("1", "g")).reason, "unsupported-beverage");
  assert.equal(yanFromDap("sake", q("1", "g")).reason, "unsupported-beverage");
  assert.equal(yanFromDap("mead", q("-1", "g")).reason, "invalid-input");
  assert.equal(yanFromDap("mead", undefined).reason, "missing-input");
  assert.equal(so2FromMetabisulfite("wine", q("1", "g"), q("0", "L")).reason, "invalid-input");
  assert.equal(so2FromMetabisulfite("wine", q("1", "g"), undefined, q("1.2", "fraction")).reason, "invalid-input");
});
