// Lumina ⇄ Carboy round trips (PROJECT_PLAN Phase 2) on the owner's two real
// recipes, as Lumina's own importer produced them
// (fixtures/parity/lumina-dicts/, tools/parity/lumina_dicts.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { Decimal, calculateStatistics, canonicalize, checkSchemaVersion, createRevision, validateContent } from "@carboy/recipe-core";
import { decimalFromNumber, fromLumina, readNative, toLumina, writeNative } from "../dist/index.js";

const root = new URL("../../../fixtures/parity/", import.meta.url);
const dicts = readdirSync(new URL("lumina-dicts/", root)).filter((f) => f.endsWith(".json")).map((f) => [f, JSON.parse(readFileSync(new URL(`lumina-dicts/${f}`, root), "utf8"))]);
const ids = () => {
  let n = 0;
  return () => `0192f3a0-0000-7000-8000-${String(++n).padStart(12, "0")}`;
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const DEC = /^-?\d+(\.\d+)?$/;

/** Equal, with floats within 1e-9 relative and decimal strings compared as numbers; returns differing paths. */
function diff(a, b, path = "", out = []) {
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 1e-9 * Math.max(Math.abs(a), Math.abs(b))) out.push(`${path}: ${a} vs ${b}`);
  } else if (typeof a === "string" && typeof b === "string" && DEC.test(a) && DEC.test(b)) {
    if (!Decimal.parse(a).equals(Decimal.parse(b))) out.push(`${path}: ${a} vs ${b}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} vs ${b.length}`);
    else a.forEach((x, i) => diff(x, b[i], `${path}/${i}`, out));
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in a) || !(k in b)) out.push(`${path}/${k}: ${k in a ? "missing after round trip" : "added by round trip"}`);
      else diff(a[k], b[k], `${path}/${k}`, out);
    }
  } else if (a !== b) out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return out;
}
function removeAt(doc, pointer) {
  const parts = pointer.split("/").slice(1);
  const last = parts.pop();
  let o = doc;
  for (const p of parts) o = o?.[p];
  if (o && typeof o === "object") delete o[last];
}

test("Lumina dict fixtures present", () => assert.equal(dicts.length, 2));

for (const [file, fx] of dicts) {
  const lumina = fx.lumina;
  const parity = JSON.parse(readFileSync(new URL(`lumina/${file}`, root), "utf8"));

  test(`${file}: Lumina → Carboy gives valid schema 0.2 content that saves and reopens editable`, () => {
    const r = fromLumina(lumina, { newId: ids() });
    assert.equal(r.status, "mapped");
    assert.deepEqual(validateContent(r.content), []);
    assert.deepEqual(checkSchemaVersion(r.content, "0.2"), []);
    const rev = createRevision({ schema_version: "0.2", recipe_id: ids()(), revision_id: "0192f3a0-0000-7000-8000-999999999999", parents: [], created_at: "2026-10-14T12:00:00.000Z", origin: "import" }, r.content);
    const back = readNative(writeNative(rev));
    assert.equal(back.status, "editable");
    assert.equal(canonicalize(back.revision.content), canonicalize(rev.content));
  });

  test(`${file}: Carboy's MCU on the mapped recipe matches Lumina's own`, () => {
    const { content } = fromLumina(lumina, { newId: ids() });
    const mcu = calculateStatistics(content).statistics.mcu;
    const expected = parity.expected_lumina["color.mcu"];
    assert.ok(Math.abs(Number(mcu.value) - expected) <= 1e-9 * expected, `${mcu.value} vs ${expected}`);
  });

  test(`${file}: Lumina → Carboy → Lumina keeps every field the report doesn't list`, () => {
    const r = fromLumina(lumina, { newId: ids() });
    const back = toLumina(r.content);
    const original = clone(lumina);
    const exported = clone(back);
    for (const e of r.report) {
      if (e.reason === "derived") continue; // recomputed on export and compared below
      removeAt(original, e.path);
      removeAt(exported, e.path);
    }
    assert.deepEqual(diff(original, exported), []);
    // The comparison is sensitive: a changed amount or legacy float is caught.
    exported.hops[0].weight_oz *= 1.000001;
    exported.fermentables[0].quantity.value = "3.1";
    assert.equal(diff(original, exported).length, 2);
  });

  test(`${file}: Carboy → Lumina → Carboy is byte-identical`, () => {
    const once = fromLumina(lumina, { newId: ids() }).content;
    const twice = fromLumina(toLumina(once), { newId: ids() }).content;
    assert.equal(canonicalize(twice), canonicalize(once));
  });
}

test("the report names what has no Carboy home, and why", () => {
  const r = fromLumina(dicts.find(([f]) => f.startsWith("verdant"))[1].lumina, { newId: ids() });
  const has = (path, reason) => r.report.some((e) => e.path === path && e.reason === reason);
  assert.ok(has("/status", "workflow-state"));
  assert.ok(has("/source_import", "import-metadata"));
  assert.ok(has("/water/mash_volume", "not-mapped"));
  assert.ok(has("/process/mash_steps/0/type", "not-mapped"));
  assert.ok(has("/fermentables/0/quantity/provenance/source_filename", "file-name-not-stored"));
  assert.ok(has("/batch_size_gal", "derived"));
  // Lumina-only item fields are kept, verbatim, in unmapped.
  assert.deepEqual(r.content.ingredients[0].unmapped, { ppg: "36.8", efficiency: "0.75" });
});

test("unsupported beverages are refused, not mapped to beer", () => {
  assert.deepEqual(fromLumina({ name: "Ginger beer soda", beverage_type: "soda" }, { newId: ids() }), { status: "unsupported", reason: "unsupported-beverage", path: "/beverage_type" });
});

test("floats become exact decimal strings of their shortest form", () => {
  assert.equal(decimalFromNumber(6.690000098546631), "6.690000098546631");
  assert.equal(decimalFromNumber(60), "60");
  assert.equal(decimalFromNumber(1e-7), "0.0000001");
  assert.equal(decimalFromNumber(1.25e-7), "0.000000125");
  assert.equal(decimalFromNumber(1.5e21), "1500000000000000000000");
});
