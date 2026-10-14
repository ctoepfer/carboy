// Integration milestone (owner, 2026-10-14): a complete recipe is created,
// validated, calculated, canonically serialized, hashed, saved, reopened, and
// verified without changing its identity or numerical meaning, and
// calculated values never enter the hashed content.
//
// Recipe: the owner's Ultimate Coffee Schwarzbier grain bill and batch volume
// (fixtures/parity/lumina). Extract yield and moisture are not in that
// source; the values below are stated test inputs, not catalog data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calculateStatistics, createRevision, validateContent } from "@carboy/recipe-core";
import { SUPPORTED_SCHEMA, readNative, writeNative } from "../dist/index.js";

const q = (value, unit) => ({ value, unit });
const U = (n) => `0192f3a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const fx = JSON.parse(readFileSync(new URL("../../../fixtures/parity/lumina/ultimate-coffee-schwarzbier.json", import.meta.url), "utf8"));

function schwarzbier() {
  const yields = { "German Pilsner Malt": ["0.81", "0.04"], "Weyermann Munich I": ["0.8", "0.045"], "Vienna Malt": ["0.8", "0.045"], "Weyermann Carafa Special II": ["0.7", "0.035"], "Weyermann Caramunich I": ["0.74", "0.05"] };
  const ingredients = fx.input.fermentables.map((f, i) => ({
    id: U(100 + i),
    kind: "fermentable",
    name: f.name,
    properties: { color: f.color, extract_yield: q(yields[f.name][0], "fraction"), moisture: q(yields[f.name][1], "fraction") },
  }));
  return {
    name: "Ultimate Coffee Schwarzbier",
    beverage: { type: "beer", style: { system: "bjcp-2021", code: "8B", name: "Schwarzbier" } },
    targets: { batch_volume: fx.input.batch_volume, efficiency: q("0.72", "fraction") },
    ingredients,
    process: {
      stages: [
        { id: U(200), kind: "mash", parameters: { temperature: q("66", "C") }, steps: [] },
        { id: U(201), kind: "boil", parameters: { duration: q("60", "min") }, steps: [] },
        { id: U(202), kind: "fermentation", parameters: { temperature: q("10", "C") }, steps: [] },
      ],
      flows: [
        { id: U(250), kind: "transfer", from: U(200), to: U(201) },
        { id: U(251), kind: "transfer", from: U(201), to: U(202) },
      ],
    },
    additions: fx.input.fermentables.map((f, i) => ({ id: U(300 + i), ingredient: U(100 + i), stage: U(200), amount: f.mass, timing: { basis: "at_start" } })),
    statistics: { og: { declared: { value: "1.054", unit: "SG", provenance: { origin: "declared" } }, display: "declared" } },
    calculation_settings: {},
    notes: [{ id: U(400), text: "Kaffee am Kaltende – coffee added cold" }],
  };
}
const meta = { schema_version: "0.1", recipe_id: U(1), revision_id: U(2), parents: [], created_at: "2026-10-14T09:00:00.000Z", origin: "user_edit" };

test("create → validate → calculate → serialize → save → reopen → verify", () => {
  // Create and validate.
  const content = schwarzbier();
  assert.deepEqual(validateContent(content), []);

  // Calculate: results go to derived, never into content.
  const calc = calculateStatistics(content);
  for (const k of ["extract", "og", "og_plato", "mcu"]) assert.ok("value" in calc.statistics[k], `${k} computed`);
  const contentBefore = JSON.stringify(content);

  // Hash (createRevision) and canonically serialize with derived attached.
  const rev = createRevision(meta, content);
  assert.equal(JSON.stringify(content), contentBefore, "calculation and hashing left content untouched");
  const text = writeNative({ ...rev, derived: { statistics: calc.statistics, diagnostics: calc.diagnostics } });

  // Save and reopen through the file system.
  const dir = mkdtempSync(join(tmpdir(), "carboy-e2e-"));
  const file = join(dir, "schwarzbier.json");
  writeFileSync(file, text, "utf8");
  const opened = readNative(readFileSync(file, "utf8"));

  // Identity unchanged.
  assert.equal(opened.status, "editable", JSON.stringify(opened.issues));
  assert.deepEqual(opened.revision.envelope, rev.envelope);
  assert.deepEqual(opened.revision.content, rev.content);

  // Canonical: re-serializing the reopened document gives identical bytes.
  assert.equal(writeNative({ ...opened.revision, derived: opened.storedDerived }), text);

  // Numerical meaning unchanged: recalculating from the reopened content gives
  // the same values, unit by unit, formula by formula.
  assert.deepEqual(calculateStatistics(opened.revision.content), calc);
  assert.deepEqual(opened.storedDerived.statistics, calc.statistics);
});

test("calculated values never enter hashed content", () => {
  const rev = createRevision(meta, schwarzbier());
  const text = writeNative({ ...rev, derived: { statistics: calculateStatistics(rev.content).statistics } });
  const doc = JSON.parse(text);
  // Nothing in content claims to be calculated.
  assert.ok(!JSON.stringify(doc.content).includes('"calculated"'));
  // Changing derived doesn't change identity; the stored derived is reported
  // as untrusted so callers recompute it.
  doc.derived.statistics.og.value = "1.999";
  const opened = readNative(JSON.stringify(doc));
  assert.equal(opened.status, "editable");
  assert.equal(opened.revision.envelope.content_hash, rev.envelope.content_hash);
  assert.equal(opened.derivedTrusted, false);
  // Putting a calculated value into content is caught.
  const bad = createRevisionSafe({ ...schwarzbier(), statistics: { og: { calculated: { value: "1.05", unit: "SG" } } } });
  assert.equal(bad.status, "read-only");
  assert.ok(bad.issues.some((i) => i.code === "calculated-in-content"));
});

function createRevisionSafe(content) {
  const rev = createRevision(meta, content); // hashing rules pass; content rules are checked on open
  return readNative(writeNative(rev));
}

test("tampering, versions, and malformed files", () => {
  const rev = createRevision(meta, schwarzbier());
  const text = writeNative(rev);
  const tampered = JSON.parse(text);
  tampered.content.additions[0].amount.value = "4";
  assert.deepEqual([readNative(JSON.stringify(tampered)).status, readNative(JSON.stringify(tampered)).reason], ["read-only", "hash-mismatch"]);
  const newerMinor = createRevision({ ...meta, schema_version: `0.${SUPPORTED_SCHEMA.minor + 1}` }, schwarzbier());
  assert.deepEqual([readNative(writeNative(newerMinor)).status, readNative(writeNative(newerMinor)).reason], ["read-only", "newer-minor"]);
  const newerMajor = createRevision({ ...meta, schema_version: "1.0" }, schwarzbier());
  assert.deepEqual([readNative(writeNative(newerMajor)).status, readNative(writeNative(newerMajor)).reason], ["rejected", "newer-major"]);
  assert.equal(readNative("{not json").reason, "not-json");
  assert.equal(readNative(JSON.stringify({ envelope: { format: "something-else" }, content: {} })).reason, "not-a-revision");
});

test("a mead recipe round-trips with its statistics honestly unavailable", () => {
  const c = schwarzbier();
  c.name = "Orange blossom mead";
  c.beverage = { type: "mead" };
  c.ingredients = [{ id: U(500), kind: "honey", name: "Orange blossom honey", properties: {} }];
  c.additions = [{ id: U(501), ingredient: U(500), stage: U(202), amount: q("6.8", "kg"), timing: { basis: "at_start" } }];
  c.statistics = {};
  assert.deepEqual(validateContent(c), []);
  const calc = calculateStatistics(c);
  for (const k of ["extract", "og", "mcu"]) assert.equal(calc.statistics[k].unavailable.reason, "unsupported-beverage", k);
  const rev = createRevision(meta, c);
  const opened = readNative(writeNative({ ...rev, derived: { statistics: calc.statistics } }));
  assert.equal(opened.status, "editable");
  assert.deepEqual(calculateStatistics(opened.revision.content), calc);
});
