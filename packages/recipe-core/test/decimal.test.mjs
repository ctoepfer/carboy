// Expected values for division were computed independently with Python's
// decimal module (80-digit context, then rounded half-even to 34 significant
// digits), not with this implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Decimal, DecimalError } from "../dist/index.js";

const d = Decimal.parse;
const s = (x) => x.toString();

test("parse and normalized output (RECIPE_SCHEMA §3 rule 3)", () => {
  assert.equal(s(d("5.0")), "5");
  assert.equal(s(d("0.50")), "0.5");
  assert.equal(s(d("-0")), "0");
  assert.equal(s(d("-0.000")), "0");
  assert.equal(s(d("007.10")), "7.1");
  assert.equal(s(d("-12.340")), "-12.34");
  for (const bad of ["", "+1", "1e3", ".5", "5.", " 1", "1,5", "NaN", "--1"]) {
    assert.throws(() => d(bad), DecimalError, bad);
  }
});

test("isNormalized accepts only document form", () => {
  for (const ok of ["0", "5", "0.5", "-0.5", "10", "123.456"]) assert.ok(Decimal.isNormalized(ok), ok);
  for (const no of ["5.0", "0.50", "-0", "007", "5.", "+1", "1e3", ".5", "00"]) assert.ok(!Decimal.isNormalized(no), no);
});

test("add, sub, mul are exact", () => {
  assert.equal(s(d("0.1").add(d("0.2"))), "0.3");
  assert.equal(s(d("1").sub(d("0.999999999999999999999"))), "0.000000000000000000001");
  assert.equal(s(d("2.92").mul(d("0.028349523125"))), "0.082780607525");
  assert.equal(s(d("-1.5").mul(d("-2"))), "3");
  assert.equal(s(d("123456789012345678901234567890").mul(d("10"))), "1234567890123456789012345678900");
});

test("div rounds half-even to 34 significant digits", () => {
  assert.equal(s(d("1").div(d("3"))), "0.3333333333333333333333333333333333");
  assert.equal(s(d("2").div(d("3"))), "0.6666666666666666666666666666666667");
  assert.equal(s(d("-2").div(d("3"))), "-0.6666666666666666666666666666666667");
  assert.equal(s(d("0.001").div(d("7"))), "0.0001428571428571428571428571428571429");
  assert.equal(s(d("10000000000000000000000000000000000000000").div(d("3"))), "3333333333333333333333333333333333000000");
  assert.equal(s(d("9.9999999999999999999999999999999999").div(d("1"))), "10");
  assert.equal(s(d("6").div(d("4"))), "1.5");
  assert.equal(s(d("0").div(d("7"))), "0");
  assert.throws(() => d("1").div(d("0")), (e) => e.code === "division-by-zero");
});

test("div with a smaller precision", () => {
  assert.equal(s(d("99999").div(d("1"), 3)), "100000");
  assert.equal(s(d("2").div(d("3"), 1)), "0.7");
  assert.equal(s(d("125").div(d("1000"), 2)), "0.12"); // tie → even
  assert.equal(s(d("135").div(d("1000"), 2)), "0.14"); // tie → even
});

test("round is half-even and only on request", () => {
  assert.equal(s(d("0.125").round(2)), "0.12");
  assert.equal(s(d("0.135").round(2)), "0.14");
  assert.equal(s(d("-0.125").round(2)), "-0.12");
  assert.equal(s(d("2.5").round(0)), "2");
  assert.equal(s(d("3.5").round(0)), "4");
  assert.equal(s(d("1250").round(-2)), "1200");
  assert.equal(s(d("1.2").round(5)), "1.2");
});

test("compare and equals ignore representation", () => {
  assert.equal(d("1.50").compare(d("1.5")), 0);
  assert.ok(d("1.50").equals(d("1.5")));
  assert.equal(d("-1").compare(d("0.001")), -1);
  assert.equal(d("2").compare(d("1.9999999")), 1);
});
