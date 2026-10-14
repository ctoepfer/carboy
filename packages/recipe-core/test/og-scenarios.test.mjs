// Mass-method OG and SG <-> degrees Plato across real use cases, independent
// of Lumina parity. Each mass-method case is built backwards from the
// definition: extract = volume x true density(P) x P/100, with Plato's true
// densities (NBS C440 Table 113) at whole degrees; the formula must recover
// P exactly and give Table 114's SG. SG values marked "page" were read from
// the scanned pages (pp. 633-636).
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMass, originalGravityMassMethod, platoFromSg, sgFromPlato } from "../dist/index.js";

const q = (value, unit) => ({ value, unit });
const og = (beverage, kg, litres) => originalGravityMassMethod(beverage, q(kg, "kg"), q(litres, "L"));

test("ordinary beer wort: 8 and 12 °P recovered from their own extract", () => {
  // 20 L x 1.029942 x 0.08 = 1.6479072 kg; 20 L x 1.046462 x 0.12 = 2.5115088 kg
  const light = og("beer", "1.6479072", "20");
  assert.deepEqual([light.plato.toString(), light.value.toString()], ["8", "1.0318"]); // page 633: 8.0 -> 1.03180
  const normal = og("beer", "2.5115088", "20");
  assert.deepEqual([normal.plato.toString(), normal.value.toString()], ["12", "1.04837"]); // page 633
});

test("high-gravity wort: 25, 35, and 40 °P", () => {
  const strong = og("beer", "5.517785", "20"); // 20 x 1.103557 x 0.25
  assert.deepEqual([strong.plato.toString(), strong.value.toString()], ["25", "1.10564"]); // page 635
  const barleywine = og("beer", "8.058925", "20"); // 20 x 1.151275 x 0.35
  assert.deepEqual([barleywine.plato.toString(), barleywine.value.toString()], ["35", "1.1535"]); // page 636
  const edge = og("beer", "9.411576", "20"); // 20 x 1.176447 x 0.40, the table's end
  assert.deepEqual([edge.plato.toString(), edge.value.toString()], ["40", "1.17874"]); // page 636
});

test("beyond the table: unavailable, never extrapolated", () => {
  assert.equal(og("beer", "9.42", "20").reason, "out-of-range");
  assert.equal(sgFromPlato("wine", q("41", "Brix")).reason, "out-of-range");
});

test("non-beer: Brix musts convert; grain-based formulas don't apply", () => {
  // Wine must at 24 °Brix, strong mead must at 30 °Brix (page 635).
  assert.equal(sgFromPlato("wine", q("24", "Brix")).value.toString(), "1.10104");
  assert.equal(sgFromPlato("mead", q("30", "Brix")).value.toString(), "1.12913");
  assert.equal(platoFromSg("cider", q("1.05", "SG"), "Brix").value.toString(), "12.39");
  // The mass method and extract.mass are grain-mash formulas: unavailable for
  // wine, mead, cider, and sake rather than a plausible-looking estimate.
  for (const b of ["wine", "mead", "cider", "sake"]) {
    assert.equal(og(b, "2.5", "20").reason, "unsupported-beverage", b);
    assert.equal(extractMass(b, [], q("0.7", "fraction")).reason, "unsupported-beverage", b);
  }
  assert.equal(sgFromPlato("sake", q("10", "Plato")).reason, "unsupported-beverage");
});

test("every result says what it assumes", () => {
  const r = og("beer", "2.5115088", "20");
  const text = r.assumptions.join(" ");
  assert.match(text, /20 °C/);
  assert.match(text, /sucrose/);
  const s = sgFromPlato("beer", q("12", "Plato"));
  assert.match(s.assumptions.join(" "), /not the accuracy of a measurement/);
});
