// Deterministic exp, ln, pow (math.ts). Expected values: Python decimal,
// correctly rounded to 34 significant digits (exp and ln at precision 34;
// pow computed at 80 digits and rounded once).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal, expDecimal, lnDecimal, powDecimal } from "../dist/index.js";

const d = Decimal.parse;

test("exp", () => {
  for (const [x, e] of [
    ["1", "2.718281828459045235360287471352662"],
    ["-2.4", "0.09071795328941250337517222007969147"],
    ["10", "22026.46579480671651695790064528424"],
    ["-50", "0.0000000000000000000001928749847963917783017342816527013"],
    ["0.001", "1.001000500166708341668055753993058"],
    ["0", "1"],
  ]) assert.equal(expDecimal(d(x)).toString(), e, `exp(${x})`);
});

test("ln", () => {
  for (const [x, e] of [
    ["2", "0.6931471805599453094172321214581766"],
    ["10", "2.302585092994045684017991454684364"],
    ["0.000125", "-8.987196820661972980305670728427622"],
    ["52.799607853352164", "3.966503763664789961867978694713345"],
    ["1.054", "0.05259245011917058354195669982056769"],
    ["1", "0"],
  ]) assert.equal(lnDecimal(d(x)).toString(), e, `ln(${x})`);
  assert.throws(() => lnDecimal(d("0")));
  assert.throws(() => lnDecimal(d("-1")));
});

test("pow", () => {
  for (const [x, y, e] of [
    ["0.000125", "0.054", "0.6155072044954429401126459557884473"],
    ["0.000125", "0.057", "0.5991338687480221654725701727393733"],
    ["52.799607853352164", "0.6859", "15.18981187134406826489717211725192"],
    ["4.322721731789074", "0.6859", "2.729392023168765903782772446010311"],
  ]) assert.equal(powDecimal(d(x), d(y)).toString(), e, `${x}^${y}`);
});
