// Complete content validation (RECIPE_SCHEMA §7): required members are there,
// every member has its documented type, and nothing undocumented is accepted.
// Each case is a malformed recipe the first validation slices let through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContent } from "../dist/index.js";

const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const base = () => ({
  name: "Pale ale",
  beverage: { type: "beer" },
  targets: {},
  ingredients: [{ id: U(1), kind: "hop", name: "Cascade", properties: {} }],
  process: { stages: [{ id: U(2), kind: "boil", name: "Boil", parameters: {}, steps: [] }, { id: U(3), kind: "fermentation" }], flows: [{ id: U(4), kind: "transfer", from: U(2), to: U(3) }] },
  additions: [{ id: U(5), ingredient: U(1), stage: U(2), amount: { value: "10", unit: "g" }, timing: { basis: "at_start" } }],
  statistics: {},
  calculation_settings: {},
  notes: [{ id: U(6), text: "note" }],
});
const codes = (c) => validateContent(c).map((i) => `${i.code} ${i.path}`);

test("a complete recipe is valid", () => assert.deepEqual(codes(base()), []));

const CASES = [
  ["recipe name missing", (c) => delete c.name, "invalid-content /content/name"],
  ["recipe name not a string", (c) => (c.name = 5), "invalid-content /content/name"],
  ["recipe name blank", (c) => (c.name = "  "), "invalid-content /content/name"],
  ["unknown top-level member", (c) => (c.foo = 1), "unknown-member /content/foo"],
  ["equipment not an object", (c) => (c.equipment = "x"), "invalid-content /content/equipment"],
  ["water not an object", (c) => (c.water = 3), "invalid-content /content/water"],
  ["presentation not an object", (c) => (c.presentation = 3), "invalid-content /content/presentation"],
  ["calculation_settings not an object", (c) => (c.calculation_settings = "x"), "invalid-content /content/calculation_settings"],
  ["lineage not an object", (c) => (c.lineage = 3), "invalid-content /content/lineage"],
  ["lineage without a copied revision", (c) => (c.lineage = { copied_from: { recipe_id: U(7) } }), "invalid-id /content/lineage/copied_from/revision_id"],
  ["lineage unknown member", (c) => (c.lineage = { copied_from: { recipe_id: U(7), revision_id: U(8) }, x: 1 }), "unknown-member /content/lineage/x"],
  ["beverage unknown member", (c) => (c.beverage.zzz = 1), "unknown-member /content/beverage/zzz"],
  ["style not an object", (c) => (c.beverage.style = 3), "invalid-content /content/beverage/style"],
  ["style without a code", (c) => (c.beverage.style = { system: "s" }), "invalid-content /content/beverage/style/code"],
  ["style unknown member", (c) => (c.beverage.style = { system: "s", code: "1A", z: 1 }), "unknown-member /content/beverage/style/z"],
  ["note without text", (c) => delete c.notes[0].text, "invalid-content /content/notes/0/text"],
  ["note text not a string", (c) => (c.notes[0].text = 4), "invalid-content /content/notes/0/text"],
  ["note unknown member", (c) => (c.notes[0].z = 1), "unknown-member /content/notes/0/z"],
  ["ingredient without a name", (c) => delete c.ingredients[0].name, "invalid-ingredient /content/ingredients/0/name"],
  ["ingredient blank name", (c) => (c.ingredients[0].name = ""), "invalid-ingredient /content/ingredients/0/name"],
  ["ingredient unknown member", (c) => (c.ingredients[0].z = 1), "unknown-member /content/ingredients/0/z"],
  ["stage name not a string", (c) => (c.process.stages[0].name = 1), "invalid-stage /content/process/stages/0/name"],
  ["stage unknown member", (c) => (c.process.stages[0].z = 1), "unknown-member /content/process/stages/0/z"],
  ["step unknown member", (c) => (c.process.stages[0].steps = [{ id: U(9), z: 1 }]), "unknown-member /content/process/stages/0/steps/0/z"],
  ["process unknown member", (c) => (c.process.z = 1), "unknown-member /content/process/z"],
  ["flow unknown member", (c) => (c.process.flows[0].z = 1), "unknown-member /content/process/flows/0/z"],
  ["flow amount not a quantity", (c) => (c.process.flows[0].amount = 3), "invalid-quantity /content/process/flows/0/amount"],
  ["addition unknown member", (c) => (c.additions[0].z = 1), "unknown-member /content/additions/0/z"],
  ["timing unknown member", (c) => (c.additions[0].timing.z = 1), "unknown-member /content/additions/0/timing/z"],
  ["quantity unknown member", (c) => (c.additions[0].amount.z = 1), "unknown-member /content/additions/0/amount/z"],
  ["target provenance checked", (c) => (c.targets.batch_volume = { value: "20", unit: "L", provenance: { origin: "nope" } }), "unknown-origin /content/targets/batch_volume/provenance/origin"],
  ["flow amount provenance checked", (c) => (c.process.flows[0].amount = { value: "2", unit: "L", provenance: { origin: "nope" } }), "unknown-origin /content/process/flows/0/amount/provenance/origin"],
  ["entity provenance checked", (c) => (c.ingredients[0].provenance = { origin: "nope" }), "unknown-origin /content/ingredients/0/provenance/origin"],
];
for (const [name, mutate, expected] of CASES) {
  test(`refused: ${name}`, () => {
    const c = base();
    mutate(c);
    assert.ok(codes(c).includes(expected), `expected ${expected}, got ${JSON.stringify(codes(c))}`);
  });
}

test("documented optional members stay valid", () => {
  const c = base();
  c.beverage.style = { system: "s", code: "1A", name: "Name" };
  c.lineage = { copied_from: { recipe_id: U(7), revision_id: U(8) } };
  c.water = {};
  c.presentation = {};
  c.ingredients[0].unmapped = { X: "1" };
  c.ingredients[0].provenance = { origin: "imported" };
  c.process.flows[0].amount = { value: "2", unit: "L", provenance: { origin: "declared" } };
  assert.deepEqual(codes(c), []);
});
