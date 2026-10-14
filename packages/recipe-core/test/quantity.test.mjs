// Unit factors are exact (international avoirdupois pound, US liquid gallon,
// lbf/in²). Expected values: exact products, or Python decimal at 80 digits
// rounded half-even to 34 significant digits. The three oz/lb cases are the
// exact values brewconvert's README documents as its regression oracle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { UNIT_TOKENS, convert, validateQuantity } from "../dist/index.js";

const c = (value, unit, to) => convert({ value, unit }, to).toString();
const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return "no error";
};

test("mass: brewconvert regression values, exact", () => {
  assert.equal(c("2.92", "oz", "kg"), "0.082780607525");
  assert.equal(c("5.83", "oz", "kg"), "0.16527771981875");
  assert.equal(c("29.17", "lb", "kg"), "13.2312894329");
  assert.equal(c("1", "lb", "oz"), "16");
  assert.equal(c("1", "kg", "lb"), "2.20462262184877580722973801345027");
  assert.equal(c("1500", "g", "kg"), "1.5");
});

test("volume: US liquid measures and spoons, exact", () => {
  assert.equal(c("1", "US gal", "L"), "3.785411784");
  assert.equal(c("1", "US gal", "US fl oz"), "128");
  assert.equal(c("1", "qt", "US fl oz"), "32");
  assert.equal(c("1", "US fl oz", "tsp"), "6");
  assert.equal(c("1", "tbsp", "tsp"), "3");
  assert.equal(c("1", "tsp", "mL"), "4.92892159375");
  assert.equal(c("1", "L", "US gal"), "0.2641720523581484153798999216091625");
});

test("duration, pressure, concentration, fraction", () => {
  assert.equal(c("90", "s", "min"), "1.5");
  assert.equal(c("1", "day", "h"), "24");
  assert.equal(c("2", "h", "s"), "7200");
  assert.equal(c("1", "psi", "kPa"), "6.894757293168361336722673445346891");
  assert.ok(c("1", "psi", "kPa").startsWith("6.894757293168361")); // brewconvert's stored digits
  assert.equal(c("100", "kPa", "psi"), "14.5037737730209215154241027951194");
  assert.equal(c("1", "bar", "kPa"), "100");
  assert.equal(c("2.5", "g/L", "mg/L"), "2500");
  assert.equal(c("150", "ppm", "mg/L"), "150");
  assert.equal(c("12.5", "%", "fraction"), "0.125");
});

test("temperature: affine, one division", () => {
  assert.equal(c("212", "F", "C"), "100");
  assert.equal(c("-40", "F", "C"), "-40");
  assert.equal(c("-40", "C", "F"), "-40");
  assert.equal(c("98.6", "F", "C"), "37");
  assert.equal(c("20", "C", "F"), "68");
  assert.equal(c("0", "C", "K"), "273.15");
  assert.equal(c("300", "K", "F"), "80.33");
  assert.equal(c("70", "F", "C"), "21.11111111111111111111111111111111");
  assert.equal(c("70", "F", "F"), "70");
});

test("not unit conversions: refused with a code", () => {
  assert.equal(code(() => convert({ value: "1", unit: "kg" }, "L")), "dimension-mismatch");
  assert.equal(code(() => convert({ value: "1.050", unit: "SG" }, "Plato")), "scale-needs-formula");
  assert.equal(code(() => convert({ value: "8", unit: "SRM" }, "EBC")), "scale-needs-formula");
  assert.equal(code(() => convert({ value: "1", unit: "package" }, "tablet")), "count-not-interchangeable");
  assert.equal(code(() => convert({ value: "1", unit: "package" }, "g")), "dimension-mismatch");
  assert.equal(code(() => convert({ value: "1", unit: "degF" }, "C")), "unknown-unit"); // Lumina token: mapped on import
  assert.equal(code(() => convert({ value: "1e3", unit: "g" }, "kg")), "invalid-decimal");
  assert.equal(c("1.050", "SG", "SG"), "1.05"); // same scale is fine
});

test("validateQuantity reports every issue", () => {
  assert.deepEqual(validateQuantity({ value: "20", unit: "L" }), []);
  assert.deepEqual(validateQuantity({ value: "-5", unit: "C" }), []);
  const codes = (q) => validateQuantity(q).map((i) => i.code);
  assert.deepEqual(codes({ value: "5.0", unit: "L" }), ["non-normalized-decimal"]);
  assert.deepEqual(codes({ value: "-1", unit: "kg" }), ["negative-quantity"]);
  assert.deepEqual(codes({ value: "x", unit: "gallon" }), ["invalid-decimal", "unknown-unit"]);
  assert.deepEqual(codes({ value: "-0.50", unit: "g" }), ["non-normalized-decimal", "negative-quantity"]);
});

test("unit table covers the Q2 tokens", () => {
  const q2 = ["kg", "g", "lb", "oz", "L", "mL", "US gal", "qt", "US fl oz", "s", "min", "h", "day", "C", "F", "K", "SG", "Plato", "kPa", "psi", "bar", "ppm", "mg/L", "g/L", "package", "sachet", "tablet", "count"];
  for (const t of q2) assert.ok(UNIT_TOKENS.includes(t), t);
  assert.equal(new Set(UNIT_TOKENS).size, UNIT_TOKENS.length);
});
