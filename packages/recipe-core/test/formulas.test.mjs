// Formula registry: MCU, extract mass (enabled), OG mass method (registered,
// unavailable), Lumina points method (parity reference).
// Expected values: Python decimal at 80 digits (independent), or exact.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  Decimal,
  FORMULAS,
  extractMass,
  formulasFor,
  getFormula,
  maltColorUnits,
  originalGravityMassMethod,
  originalGravityPointsLumina,
} from "../dist/index.js";

const q = (value, unit) => ({ value, unit });
const d = Decimal.parse;
const near = (actual, expected, tol = "1e-30") => {
  const diff = actual.sub(d(expected)).abs();
  assert.ok(diff.compare(d(Number(tol).toFixed(40).replace(/0+$/, ""))) <= 0, `${actual} vs ${expected}`);
};

test("every registered formula documents source, assumptions, inputs, applicability, rounding", () => {
  assert.ok(FORMULAS.size >= 4);
  for (const f of FORMULAS.values()) {
    assert.match(f.id, /^[a-z]+(\.[a-z0-9-]+)+$/, f.id);
    assert.ok(Number.isInteger(f.version) && f.version >= 1, f.id);
    assert.ok(f.source.citations.length > 0, `${f.id} citations`);
    assert.ok(f.assumptions.length > 0, `${f.id} assumptions`);
    assert.ok(f.inputs.length > 0, `${f.id} inputs`);
    assert.ok(f.applicability.beverages.length > 0, `${f.id} applicability`);
    assert.ok(f.rounding.length > 0, `${f.id} rounding`);
    if (f.status !== "enabled") assert.ok(f.status === "parity-reference" || f.limitation, `${f.id} says why`);
  }
});

test("only enabled formulas are offered to users; sake has none yet", () => {
  assert.deepEqual(formulasFor("beer", { enabledOnly: true }).map((f) => f.id).sort(), ["color.mcu", "extract.mass", "gravity.og.mass-method", "gravity.sg-plato"]);
  for (const b of ["wine", "mead", "cider"]) {
    assert.deepEqual(formulasFor(b).map((f) => f.id).sort(), ["gravity.sg-plato", "nutrient.yan-from-dap", "sulfite.so2-from-metabisulfite"], b);
  }
  assert.deepEqual(formulasFor("sake"), []);
  assert.equal(getFormula("gravity.og.points-lumina").status, "parity-reference");
});

test("MCU: imperial and metric", () => {
  const r = maltColorUnits("beer", [{ mass: q("10", "lb"), color: q("2", "degL") }, { mass: q("1", "lb"), color: q("60", "degL") }], q("5", "US gal"));
  assert.equal(r.status, "computed");
  assert.equal(r.value.toString(), "16");
  assert.equal(r.unit, "MCU");
  assert.deepEqual(r.formula, { id: "color.mcu", version: 1 });
  const m = maltColorUnits("beer", [{ mass: q("4.5", "kg"), color: q("3.5", "degL") }, { mass: q("250", "g"), color: q("120", "degL") }], q("23", "L"));
  near(m.value, "16.60009798608193174585941270496277");
});

test("MCU: unavailable instead of a guess", () => {
  const grain = { mass: q("5", "kg"), color: q("3", "degL") };
  const r1 = maltColorUnits("mead", [grain], q("20", "L"));
  assert.deepEqual([r1.status, r1.reason], ["unavailable", "unsupported-beverage"]);
  const r2 = maltColorUnits("beer", [{ mass: q("5", "kg"), color: q("6", "EBC") }], q("20", "L"));
  assert.deepEqual([r2.reason, r2.details], ["invalid-input", ["grains[0].color"]]); // EBC is not converted here
  const r3 = maltColorUnits("beer", [{ mass: q("5", "kg") }], undefined);
  assert.deepEqual([r3.reason, r3.details], ["missing-input", ["grains[0].color", "volume"]]);
  const r4 = maltColorUnits("beer", [grain], q("0", "L"));
  assert.equal(r4.reason, "invalid-input");
  const r5 = maltColorUnits("beer", [], q("20", "L"));
  assert.deepEqual(r5.details, ["grains"]);
});

test("extract mass: exact", () => {
  const r = extractMass(
    "beer",
    [
      { mass: q("5", "kg"), extract_yield: q("0.8", "fraction"), moisture: q("0.04", "fraction") },
      { mass: q("500", "g"), extract_yield: q("78", "%"), moisture: q("5", "%") },
    ],
    q("72", "%"),
  );
  assert.equal(r.status, "computed");
  assert.equal(r.value.toString(), "3.03156");
  assert.equal(r.unit, "kg");
});

test("extract mass: missing moisture or efficiency is never defaulted", () => {
  const r = extractMass("beer", [{ mass: q("5", "kg"), extract_yield: q("0.8", "fraction") }], undefined);
  assert.deepEqual([r.reason, r.details], ["missing-input", ["fermentables[0].moisture", "brewhouse_efficiency"]]);
  const r2 = extractMass("beer", [{ mass: q("5", "kg"), extract_yield: q("1.2", "fraction"), moisture: q("0.04", "fraction") }], q("0.7", "fraction"));
  assert.deepEqual([r2.reason, r2.details], ["invalid-input", ["fermentables[0].extract_yield"]]);
  assert.equal(extractMass("wine", [], q("0.7", "fraction")).reason, "unsupported-beverage");
});

test("OG mass method v2: extract and volume give °P and SG (Python decimal, independent)", () => {
  const cases = [
    // extract kg, volume L, °P (2 dp), SG (5 dp, from the unrounded °P)
    ["2.88", "20", "13.67", "1.05543"],
    ["3.03156", "23", "12.57", "1.05076"],
    ["5", "20", "22.86", "1.09582"],
    ["0.5", "25", "1.99", "1.00775"],
  ];
  for (const [e, v, p, sg] of cases) {
    const r = originalGravityMassMethod("beer", q(e, "kg"), q(v, "L"));
    assert.equal(r.status, "computed", `${e} kg in ${v} L`);
    assert.equal(r.plato.toString(), p, `°P for ${e} kg in ${v} L`);
    assert.equal(r.value.toString(), sg, `SG for ${e} kg in ${v} L`);
    assert.deepEqual(r.formula, { id: "gravity.og.mass-method", version: 2 });
  }
  // Same wort in US units: 2.88 kg in 20 L expressed as lb and US gal.
  const imperial = originalGravityMassMethod("beer", q("6.349313150924", "lb"), q("5.283441047163", "US gal"));
  assert.equal(imperial.value.toString(), "1.05543");
});

test("OG mass method v2: missing, invalid, and out-of-range inputs are unavailable", () => {
  assert.deepEqual(originalGravityMassMethod("beer", undefined, q("20", "L")).details, ["extract"]);
  assert.equal(originalGravityMassMethod("beer", q("3", "kg"), q("0", "L")).reason, "invalid-input");
  assert.equal(originalGravityMassMethod("beer", q("3", "L"), q("20", "L")).reason, "invalid-input");
  assert.equal(originalGravityMassMethod("beer", q("10", "kg"), q("20", "L")).reason, "out-of-range"); // ~43 °P
  assert.equal(originalGravityMassMethod("cider", q("3", "kg"), q("20", "L")).reason, "unsupported-beverage");
});

test("points method: parity with Lumina on Verdant Reverie (opt-in only)", () => {
  const f = JSON.parse(readFileSync(new URL("../../../fixtures/parity/verdant-reverie-og-points.json", import.meta.url), "utf8"));
  const sources = f.input.sources.map((s) => ({ mass: s.amount, ppg: s.ppg.replace(/\.0$/, ""), efficiency: s.efficiency }));
  assert.equal(originalGravityPointsLumina("beer", sources, f.input.batch_volume).reason, "not-enabled");
  const r = originalGravityPointsLumina("beer", sources, f.input.batch_volume, { parity: true });
  assert.equal(r.status, "computed");
  // Lumina's float points value, within 1e-9 relative.
  const lumina = d("349.5713938265761");
  assert.ok(r.points.sub(lumina).abs().compare(lumina.mul(d("0.000000001"))) <= 0, r.points.toString());
  assert.equal(r.value.round(3).toString(), "1.064"); // Lumina displays 3 places
  near(r.value, "1.063558327819692112132457119041190", "1e-30"); // Python decimal, independent
});
