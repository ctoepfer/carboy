// Vectors from RFC 8785 (https://www.rfc-editor.org/rfc/rfc8785.txt). The
// fixtures/rfc8785-sample-* files were extracted verbatim from the RFC text:
// the §3.2.2 sample input, the §3.2.3 canonical form (display line wrap
// removed), and the §3.2.4 UTF-8 bytes. This file deliberately contains no
// string escapes, so the vectors can't be altered by editing tools.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalize, canonicalBytes } from "../dist/index.js";

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

test("RFC 8785 sections 3.2.2-3.2.4: sample canonical text and UTF-8 bytes", () => {
  const input = JSON.parse(fixture("rfc8785-sample-input.json"));
  assert.equal(canonicalize(input), fixture("rfc8785-sample-canonical.txt"));
  const hex = fixture("rfc8785-sample-utf8.hex").trim().split(" ");
  assert.equal(hex.length, 118);
  assert.deepEqual(Array.from(canonicalBytes(input), (b) => b.toString(16).padStart(2, "0")), hex);
});

test("RFC 8785 section 3.2.3: property sorting by UTF-16 code units", () => {
  const c = String.fromCharCode;
  const input = {
    [c(0x20ac)]: "Euro Sign",
    [c(0x0d)]: "Carriage Return",
    [c(0xfb33)]: "Hebrew Letter Dalet With Dagesh",
    1: "One",
    [c(0xd83d, 0xde00)]: "Emoji: Grinning Face",
    [c(0x80)]: "Control",
    [c(0xf6)]: "Latin Small Letter O With Diaeresis",
  };
  // Read the order from the canonical text: JS objects list integer-like keys first.
  const order = [...canonicalize(input).matchAll(/:"([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [
    "Carriage Return", "One", "Control", "Latin Small Letter O With Diaeresis",
    "Euro Sign", "Emoji: Grinning Face", "Hebrew Letter Dalet With Dagesh",
  ]);
});

test("RFC 8785 Appendix B: number serialization samples", () => {
  const samples = [
    ["0000000000000000", "0"], ["8000000000000000", "0"], ["0000000000000001", "5e-324"],
    ["8000000000000001", "-5e-324"], ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["ffefffffffffffff", "-1.7976931348623157e+308"], ["4340000000000000", "9007199254740992"],
    ["c340000000000000", "-9007199254740992"], ["4430000000000000", "295147905179352830000"],
    ["44b52d02c7e14af5", "9.999999999999997e+22"], ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"], ["444b1ae4d6e2ef4e", "999999999999999700000"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"], ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"], ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555553", "333333333.3333332"], ["41b3de4355555554", "333333333.33333325"],
    ["41b3de4355555555", "333333333.3333333"], ["41b3de4355555556", "333333333.3333334"],
    ["41b3de4355555557", "333333333.33333343"], ["becbf647612f3696", "-0.0000033333333333333333"],
  ];
  const toDouble = (hex) => {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigUint64(0, BigInt(`0x${hex}`));
    return view.getFloat64(0);
  };
  for (const [ieee, expected] of samples) assert.equal(canonicalize(toDouble(ieee)), expected, ieee);
  for (const bad of ["7fffffffffffffff", "7ff0000000000000"]) assert.throws(() => canonicalize(toDouble(bad)));
});
