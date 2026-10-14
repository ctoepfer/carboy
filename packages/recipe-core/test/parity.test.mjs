// Parity with Lumina on the owner's real recipes (fixtures/parity/lumina/).
// Lumina's values are Python floats, so agreement is checked to 1e-9
// relative; OG at Lumina's three display places.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { Decimal, maltColorUnits, originalGravityPointsLumina } from "../dist/index.js";

const dir = new URL("../../../fixtures/parity/lumina/", import.meta.url);
const fixtures = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")));
const closeRel = (actual, expectedFloat, label) => {
  const e = Decimal.parse(String(expectedFloat));
  const tol = e.abs().mul(Decimal.parse("0.000000001"));
  assert.ok(actual.sub(e).abs().compare(tol) <= 0, `${label}: ${actual} vs ${expectedFloat}`);
};

test("parity fixtures present", () => {
  assert.ok(fixtures.length >= 2);
});

for (const fx of fixtures) {
  test(`${fx.fixture}: MCU matches Lumina`, () => {
    const grains = fx.input.fermentables.map((f) => ({ mass: f.mass, color: f.color }));
    const r = maltColorUnits("beer", grains, fx.input.batch_volume);
    assert.equal(r.status, "computed");
    closeRel(r.value, fx.expected_lumina["color.mcu"], "MCU");
  });
  test(`${fx.fixture}: points OG matches Lumina (parity reference)`, () => {
    const sources = fx.input.fermentables.map((f) => ({ mass: f.mass, ppg: f.ppg, efficiency: f.efficiency }));
    const r = originalGravityPointsLumina("beer", sources, fx.input.batch_volume, { parity: true });
    assert.equal(r.status, "computed");
    closeRel(r.points, fx.expected_lumina["gravity.points"], "points");
    assert.equal(r.value.round(3).toString(), String(fx.expected_lumina["gravity.og"]));
  });
}
