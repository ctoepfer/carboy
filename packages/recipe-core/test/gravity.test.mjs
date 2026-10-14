// gravity.sg-plato: Plato's sucrose densities via NBS Circular C440.
// Expected values come from three places independent of the OCR pipeline
// that built the table: values read directly from the scanned pages,
// hand-computed interpolation, and the documented errata.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Decimal, densityAtPlato, platoFromSg, sgFromPlato } from "../dist/index.js";

const q = (value, unit) => ({ value, unit });
const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/reference-tables/nbs-c440-sucrose-20c.json", import.meta.url), "utf8"));

test("embedded table equals the published fixture", async () => {
  const { SG_20_20, DENSITY_20 } = await import("../dist/formulas/data/sucrose-20c.js");
  assert.equal(SG_20_20.length, 401);
  fixture.rows.forEach((r, i) => {
    assert.equal(SG_20_20[i], r.sg_20_20, `SG at ${r.plato}`);
    assert.equal(DENSITY_20[i], r.density_20, `density at ${r.plato}`);
  });
});

test("values read from the scanned pages (pp. 633, 634, 636)", () => {
  const pages = {
    "4": "1.01569", "9": "1.0359", "12": "1.04837", "13.9": "1.05641", "14": "1.05683", "18.9": "1.07809",
    "20": "1.08297", "23.9": "1.10058", "34": "1.14855", "36.2": "1.15947", "36.4": "1.16047", "39.9": "1.17823", "40": "1.17874",
  };
  for (const [p, sg] of Object.entries(pages)) {
    const r = sgFromPlato("beer", q(p, "Plato"));
    assert.equal(r.status, "computed");
    assert.equal(r.value.toString(), sg, `${p} °P`);
  }
});

test("errata: printed misprints are corrected", () => {
  // Printed ".20936" at 7.4 and ".15597" at 36.3; neighbours and Table 113 agree.
  assert.equal(sgFromPlato("beer", q("7.4", "Plato")).value.toString(), "1.02936");
  assert.equal(sgFromPlato("beer", q("36.3", "Plato")).value.toString(), "1.15997");
  assert.deepEqual(Object.keys(fixture.errata).sort(), ["36.3", "7.4"]);
});

test("interpolation between steps", () => {
  assert.equal(sgFromPlato("beer", q("12.05", "Plato")).value.toString(), "1.04858"); // (1.04837 + 1.04879) / 2
  assert.equal(sgFromPlato("beer", q("0", "Plato")).value.toString(), "1");
  // SG 1.05 lies between 12.3 (1.04963) and 12.4 (1.05005): 12.3 + 0.1 * 37/42 = 12.388...
  assert.equal(platoFromSg("beer", q("1.05", "SG")).value.toString(), "12.39");
  // SG 1.04 lies between 9.9 (1.03961) and 10.0 (1.04003): 9.9 + 0.1 * 39/42 = 9.9928...
  assert.equal(platoFromSg("beer", q("1.04", "SG")).value.toString(), "9.99");
  assert.equal(platoFromSg("beer", q("1.17874", "SG")).value.toString(), "40");
  assert.equal(platoFromSg("beer", q("1", "SG")).value.toString(), "0");
});

test("round trip stays within the table's precision", () => {
  for (const p of ["1.23", "7.77", "12.5", "18.25", "25", "33.33", "39.95"]) {
    const sg = sgFromPlato("beer", q(p, "Plato")).value;
    const back = platoFromSg("beer", q(sg.toString(), "SG")).value;
    assert.ok(back.sub(Decimal.parse(p)).abs().compare(Decimal.parse("0.01")) <= 0, `${p} -> ${sg} -> ${back}`);
  }
});

test("Brix in and out; wine, mead, cider allowed; sake not", () => {
  assert.equal(sgFromPlato("wine", q("22", "Brix")).value.toString(), "1.09194");
  const r = platoFromSg("cider", q("1.05", "SG"), "Brix");
  assert.deepEqual([r.value.toString(), r.unit], ["12.39", "Brix"]);
  assert.equal(sgFromPlato("mead", q("30", "Brix")).status, "computed");
  assert.equal(sgFromPlato("sake", q("10", "Plato")).reason, "unsupported-beverage");
});

test("outside the table: unavailable, never extrapolated", () => {
  assert.equal(sgFromPlato("beer", q("40.1", "Plato")).reason, "out-of-range");
  assert.equal(platoFromSg("beer", q("1.17875", "SG")).reason, "out-of-range");
  assert.equal(platoFromSg("beer", q("0.998", "SG")).reason, "out-of-range");
  assert.equal(sgFromPlato("beer", q("-1", "Plato")).reason, "invalid-input"); // negative scale value
  assert.equal(sgFromPlato("beer", q("12.0", "Plato")).reason, "invalid-input"); // not normalized
  assert.equal(sgFromPlato("beer", q("1.05", "SG")).reason, "invalid-input"); // wrong direction
  assert.equal(sgFromPlato("beer", undefined).reason, "missing-input");
});

test("true density (Table 113) for the mass method", () => {
  assert.equal(densityAtPlato(Decimal.parse("0")).toString(), "0.998234");
  assert.equal(densityAtPlato(Decimal.parse("12")).toString(), "1.046462");
  assert.equal(densityAtPlato(Decimal.parse("12.05")).toString(), "1.0466715"); // midway 1.046462 / 1.046881
});
