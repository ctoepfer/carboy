import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Decimal, originalGravity } from "../dist/index.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/verdant-reverie-og.json", import.meta.url), "utf8"));

test("points-method OG matches Lumina on Verdant Reverie", () => {
  const r = originalGravity(fx.input.sources, fx.input.batch_volume);
  assert.equal(r.status, "computed");
  // Exact decimal vs. Python float: agree to 1e-9 relative.
  const lumina = fx.expected_lumina["gravity.points"];
  assert.ok(Math.abs(Number(r.points.toString()) - lumina) / lumina < 1e-9, `${r.points} vs ${lumina}`);
  // Lumina rounds OG to 3 places mid-pipeline (port note 3); the core rounds only for comparison.
  assert.equal(r.og.round(3).toString(), String(fx.expected_lumina["gravity.og"]));
});

test("unknown inputs give cannot-compute, never zero", () => {
  const sources = structuredClone(fx.input.sources);
  delete sources[0].ppg;
  const r = originalGravity(sources, undefined);
  assert.equal(r.status, "cannot-compute");
  assert.deepEqual(r.missing, ["targets.batch_volume", "sources[0].ppg"]);
});

test("decimal: normalized strings, half-even rounding, division", () => {
  assert.equal(Decimal.parse("5.0").toString(), "5");
  assert.equal(Decimal.parse("0.50").toString(), "0.5");
  assert.equal(Decimal.parse("-0.0").toString(), "0");
  assert.equal(Decimal.parse("1.0625").round(3).toString(), "1.062");
  assert.equal(Decimal.parse("1.0635").round(3).toString(), "1.064");
  assert.equal(Decimal.fromInt(1).div(Decimal.fromInt(3)).toString(), "0.3333333333333333333333333333333333");
  assert.equal(Decimal.fromInt(2).div(Decimal.fromInt(3)).toString(), "0.6666666666666666666666666666666667");
  assert.throws(() => Decimal.parse("1e3"));
});
