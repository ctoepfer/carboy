// Scaling policy v1 (EDITOR_COMMANDS §5.8 scale_recipe), ported from Lumina
// (brains/recipes/state.py _scale_batch): weighed fermentables, fruit, honey,
// sugar, hops, and adjuncts scale linearly by new/old batch volume; cultures
// are not scaled (pitch rate is the brewer's call); counts, dosed agents, and
// equipment volumes are listed for review, never guessed. Output is the
// macro's expansion: primitive commands, never edited content.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleRecipe } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const q = (value, unit) => ({ value, unit });
const KINDS = ["fermentable", "hop", "culture", "sugar", "honey", "fruit", "adjunct", "water_agent", "nutrient", "acid", "fining", "other"];
function recipe() {
  return {
    name: "Scale me",
    beverage: { type: "beer" },
    targets: { batch_volume: q("20", "L"), boil_volume: q("25", "L"), efficiency: q("0.72", "fraction") },
    ingredients: KINDS.map((kind, i) => ({ id: U(10 + i), kind, name: kind, properties: {} })),
    process: { stages: [{ id: U(30), kind: "boil", parameters: {}, steps: [] }], flows: [] },
    additions: [
      { id: U(50), ingredient: U(10), stage: U(30), amount: q("4.5", "kg") },
      { id: U(51), ingredient: U(11), stage: U(30), amount: q("30", "g") },
      { id: U(52), ingredient: U(12), stage: U(30), amount: q("1", "package") },
      { id: U(53), ingredient: U(13), stage: U(30), amount: q("0.5", "lb") },
      { id: U(54), ingredient: U(14), stage: U(30), amount: q("1", "kg") },
      { id: U(55), ingredient: U(15), stage: U(30), amount: q("2", "kg") },
      { id: U(56), ingredient: U(16), stage: U(30), amount: q("100", "g") },
      { id: U(57), ingredient: U(17), stage: U(30), amount: q("5", "g") },
      { id: U(58), ingredient: U(18), stage: U(30), amount: q("2", "tablet") },
      { id: U(59), ingredient: U(19), stage: U(30), amount: q("3", "mL") },
      { id: U(60), ingredient: U(20), stage: U(30), amount: q("1", "g") },
      { id: U(61), ingredient: U(21), stage: U(30), amount: q("10", "g") },
      { id: U(62), ingredient: U(15), stage: U(30), amount: q("1.5", "L") }, // fruit by volume (juice)
      { id: U(63), ingredient: U(10), stage: U(30), amount: q("2", "package") }, // a counted fermentable (extract cans)
    ],
    statistics: {},
    calculation_settings: {},
    notes: [],
  };
}

test("20 L → 23 L: linear kinds scale exactly; batch volume set in the caller's unit", () => {
  const r = scaleRecipe(recipe(), q("23", "L"));
  assert.equal(r.status, "scaled");
  assert.equal(r.ratio.toString(), "1.15");
  assert.deepEqual(r.commands[0], { op: "set_target", name: "batch_volume", quantity: q("23", "L") });
  assert.deepEqual(
    r.commands.slice(1).map((c) => [c.op, c.addition, c.amount.value, c.amount.unit]),
    [
      ["set_addition_amount", U(50), "5.175", "kg"],
      ["set_addition_amount", U(51), "34.5", "g"],
      ["set_addition_amount", U(53), "0.575", "lb"],
      ["set_addition_amount", U(54), "1.15", "kg"],
      ["set_addition_amount", U(55), "2.3", "kg"],
      ["set_addition_amount", U(56), "115", "g"],
      ["set_addition_amount", U(62), "1.725", "L"],
    ],
  );
  assert.deepEqual(
    r.notScaled.map((n) => [n.path, n.reason]),
    [
      ["/content/additions/2/amount", "culture"],
      ["/content/additions/7/amount", "review-dose"],
      ["/content/additions/8/amount", "count"],
      ["/content/additions/9/amount", "review-dose"],
      ["/content/additions/10/amount", "review-dose"],
      ["/content/additions/11/amount", "review-dose"],
      ["/content/additions/13/amount", "count"],
      ["/content/targets/boil_volume", "equipment-volume"],
    ],
  );
  // Hops scale like Lumina, with a note that utilization isn't modelled.
  assert.deepEqual(r.notes.map((n) => [n.path, n.code]), [["/content/additions/1/amount", "hop-utilization-not-modelled"]]);
});

test("units: a new volume in another unit converts exactly; a repeating ratio rounds once to 34 digits", () => {
  const r = scaleRecipe(recipe(), q("5", "US gal")); // 5 US gal = 18.92705892 L exactly
  assert.equal(r.ratio.toString(), "0.946352946");
  assert.deepEqual(r.commands[0].quantity, q("5", "US gal"));
  assert.equal(r.commands[1].amount.value, "4.258588257"); // 4.5 kg × 0.946352946
  const third = scaleRecipe(recipe(), q("60", "L")); // 3×
  assert.equal(third.commands[1].amount.value, "13.5");
  const odd = scaleRecipe(recipe(), q("7", "L")); // 7/20 exact; then 30 g × 7 / 20
  assert.equal(odd.commands[2].amount.value, "10.5");
  const rep = scaleRecipe({ ...recipe(), targets: { batch_volume: q("3", "L") } }, q("1", "L"));
  assert.equal(rep.commands[1].amount.value, "1.5"); // 4.5 × 1/3, computed as 4.5 × 1 ÷ 3
  assert.equal(rep.commands[2].amount.value, "10");
  assert.equal(scaleRecipe({ ...recipe(), targets: { batch_volume: q("3", "L") } }, q("2", "L")).commands[3].amount.value, "0.3333333333333333333333333333333333"); // 0.5 lb × 2 ÷ 3
});

test("unavailable instead of a guess", () => {
  const noVol = { ...recipe(), targets: {} };
  assert.deepEqual([scaleRecipe(noVol, q("23", "L")).status, scaleRecipe(noVol, q("23", "L")).reason], ["unavailable", "missing-batch-volume"]);
  assert.equal(scaleRecipe(recipe(), q("23", "kg")).reason, "invalid-batch-volume");
  assert.equal(scaleRecipe(recipe(), q("0", "L")).reason, "invalid-batch-volume");
  assert.equal(scaleRecipe({ ...recipe(), targets: { batch_volume: q("0", "L") } }, q("23", "L")).reason, "invalid-batch-volume");
});

test("same volume: no amount commands, nothing changes", () => {
  const r = scaleRecipe(recipe(), q("20", "L"));
  assert.equal(r.ratio.toString(), "1");
  assert.deepEqual(r.commands, [{ op: "set_target", name: "batch_volume", quantity: q("20", "L") }]);
});
