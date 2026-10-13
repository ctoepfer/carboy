import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyCommands, contentOg } from "../dist/index.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/verdant-reverie-og.json", import.meta.url), "utf8"));
// Spike content built from the parity fixture: one ingredient and one mash addition per source.
const content = {
  name: "Verdant Reverie Saison",
  beverage: { type: "beer" },
  targets: { batch_volume: fx.input.batch_volume },
  ingredients: fx.input.sources.map((s, i) => ({ id: `i${i}`, kind: "fermentable", name: s.name, properties: { ppg: s.ppg, efficiency: s.efficiency } })),
  additions: fx.input.sources.map((s, i) => ({ id: `a${i}`, ingredient: `i${i}`, stage: "mash", amount: s.amount })),
};

test("content OG equals the parity fixture", () => {
  assert.equal(contentOg(content), String(fx.expected_lumina["gravity.og"]));
});

test("set_addition_amount applies, diffs, recalculates; base untouched", () => {
  const r = applyCommands(content, [{ op: "set_addition_amount", addition: "a0", amount: { value: "5", unit: "kg" } }]);
  assert.equal(r.status, "applied");
  assert.deepEqual(r.diff.entities[0].fields[0], { path: "amount", before: { value: "4.30913", unit: "kg" }, after: { value: "5", unit: "kg" } });
  assert.equal(r.diff.statistics[0].before, "1.064");
  assert.ok(Number(r.diff.statistics[0].after) > 1.064);
  assert.equal(content.additions[0].amount.value, "4.30913");
});

test("all or nothing: a bad second command rejects the whole list", () => {
  const r = applyCommands(content, [
    { op: "set_addition_amount", addition: "a0", amount: { value: "5", unit: "kg" } },
    { op: "set_addition_amount", addition: "nope", amount: { value: "1", unit: "kg" } },
  ]);
  assert.deepEqual([r.status, r.diagnostics[0].code, r.diagnostics[0].command_index], ["rejected", "unknown-reference", 1]);
});

test("encoding rules: numbers, wrong units, unknown members, unknown ops are rejected", () => {
  const code = (cmd) => applyCommands(content, [cmd]).diagnostics[0]?.code;
  assert.equal(code({ op: "set_addition_amount", addition: "a0", amount: { value: 5, unit: "kg" } }), "invalid-quantity");
  assert.equal(code({ op: "set_addition_amount", addition: "a0", amount: { value: "5", unit: "L" } }), "unit-dimension-mismatch");
  assert.equal(code({ op: "set_addition_amount", addition: "a0", amount: { value: "5", unit: "kg" }, extra: 1 }), "unknown-member");
  assert.equal(code({ op: "delete_everything" }), "unknown-op");
  assert.equal(code({ op: "set_addition_amount", addition: "a0", amount: { value: "-1", unit: "kg" } }), "invalid-quantity");
  // EDITOR_COMMANDS §2 rule 3: commands carry normalized decimal strings; the UI normalizes what the user typed.
  assert.equal(code({ op: "set_addition_amount", addition: "a0", amount: { value: "5.0", unit: "kg" } }), "invalid-quantity");
});
