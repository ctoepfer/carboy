// Envelope and hashing rules (RECIPE_SCHEMA §2–§3), positive and negative.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RevisionError, createRevision, isUuid, verifyRevision } from "../dist/index.js";

const dir = new URL("../../../fixtures/canonical-hash/", import.meta.url);
const vectors = JSON.parse(readFileSync(new URL("vectors.json", dir), "utf8")).vectors;
const load = (name) => JSON.parse(readFileSync(new URL(`cases/${name}.input.json`, dir), "utf8"));
const vector = (name) => vectors.find((v) => v.name === name);
const clone = (x) => JSON.parse(JSON.stringify(x));

// A valid stored document for a vector case: its envelope plus the published hash.
function stored(name) {
  const doc = load(name);
  return { ...doc, envelope: { ...doc.envelope, content_hash: vector(name).sha256 } };
}
function meta(env) {
  const { format: _f, content_hash: _h, ...rest } = env;
  return rest;
}
const codes = (r) => r.issues.map((i) => i.code);
function writerCodes(m, content) {
  try {
    createRevision(m, content);
  } catch (e) {
    assert.ok(e instanceof RevisionError);
    return e.issues.map((i) => i.code);
  }
  return [];
}

test("writer reproduces every published revision hash", () => {
  for (const name of ["revision-minimal", "revision-typical", "revision-merge"]) {
    const doc = load(name);
    const rev = createRevision(meta(doc.envelope), doc.content);
    assert.equal(rev.envelope.content_hash, vector(name).sha256, name);
    assert.equal(verifyRevision(rev).status, "valid", name);
  }
});

test("stored documents with the published hash verify", () => {
  for (const name of ["revision-minimal", "revision-typical", "revision-merge"]) {
    assert.deepEqual(verifyRevision(stored(name)), { status: "valid", issues: [] }, name);
  }
});

test("derived data is excluded from the hash", () => {
  const doc = stored("revision-typical");
  doc.derived.statistics.og.value = "1.099";
  assert.equal(verifyRevision(doc).status, "valid");
  delete doc.derived;
  assert.equal(verifyRevision(doc).status, "valid");
});

test("modified content is detected", () => {
  const doc = stored("revision-typical");
  doc.content.additions[0].quantity.value = "4.6";
  const r = verifyRevision(doc);
  assert.equal(r.status, "hash-mismatch");
  assert.deepEqual(codes(r), ["hash-mismatch"]);
});

test("modified envelope is detected", () => {
  const doc = stored("revision-typical");
  doc.envelope.created_at = "2026-10-13T12:00:00.001Z";
  assert.equal(verifyRevision(doc).status, "hash-mismatch");
});

test("array order is meaningful: reordering changes the hash", () => {
  const doc = stored("revision-typical");
  doc.content.ingredients.reverse();
  assert.equal(verifyRevision(doc).status, "hash-mismatch");
  const rev = createRevision(meta(doc.envelope), doc.content);
  assert.notEqual(rev.envelope.content_hash, vector("revision-typical").sha256);
});

test("parents: writer sorts, reader requires sorted and unique", () => {
  const doc = load("revision-merge");
  const m = { ...meta(doc.envelope), parents: [...doc.envelope.parents].reverse() };
  assert.equal(createRevision(m, doc.content).envelope.content_hash, vector("revision-merge").sha256);
  const unsorted = stored("revision-merge");
  unsorted.envelope.parents.reverse();
  assert.deepEqual(codes(verifyRevision(unsorted)), ["parents-not-sorted"]);
  const dup = { ...meta(doc.envelope), parents: [doc.envelope.parents[0], doc.envelope.parents[0]] };
  assert.deepEqual(writerCodes(dup, doc.content), ["duplicate-parent"]);
});

test("Unicode: writer NFC-normalizes; reader rejects non-NFC", () => {
  const doc = load("revision-typical");
  const nfd = clone(doc.content);
  nfd.name = nfd.name.normalize("NFD");
  nfd.ingredients[1].name = nfd.ingredients[1].name.normalize("NFD");
  assert.notEqual(nfd.name, doc.content.name);
  const rev = createRevision(meta(doc.envelope), nfd);
  assert.equal(rev.envelope.content_hash, vector("revision-typical").sha256);

  const bad = stored("revision-typical");
  bad.content.name = bad.content.name.normalize("NFD");
  const r = verifyRevision(bad);
  assert.equal(r.status, "invalid");
  assert.deepEqual(r.issues.map((i) => [i.code, i.path]), [["string-not-nfc", "/content/name"]]);
});

test("Unicode: keys equal after NFC are reported, not merged", () => {
  const doc = load("revision-minimal");
  const content = { ...doc.content, notes_meta: { ["e" + String.fromCharCode(0x301)]: "1", [String.fromCharCode(0xe9)]: "2" } };
  assert.deepEqual(writerCodes(meta(doc.envelope), content), ["duplicate-key-after-nfc"]);
});

test("malformed quantities are rejected with paths", () => {
  const doc = load("revision-typical");
  const c = clone(doc.content);
  c.additions[0].quantity.value = "4.50";
  c.additions[1].quantity.unit = "grams";
  c.targets.batch_volume.value = "-20";
  c.targets.efficiency.value = "72%";
  const issues = (() => {
    try {
      createRevision(meta(doc.envelope), c);
    } catch (e) {
      return e.issues.map((i) => [i.code, i.path]);
    }
  })();
  assert.deepEqual(issues.sort(), [
    ["invalid-decimal", "/content/targets/efficiency"],
    ["negative-quantity", "/content/targets/batch_volume"],
    ["non-normalized-decimal", "/content/additions/0/quantity"],
    ["unknown-unit", "/content/additions/1/quantity"],
  ]);
});

test("hashed parts: no null, no non-integer numbers, no lone surrogates", () => {
  const doc = load("revision-minimal");
  const m = meta(doc.envelope);
  assert.deepEqual(writerCodes(m, { ...doc.content, style: null }), ["null-value"]);
  assert.deepEqual(writerCodes(m, { ...doc.content, ratio: 1.5 }), ["non-integer-number"]);
  assert.deepEqual(writerCodes(m, { ...doc.content, big: 2 ** 53 }), ["non-integer-number"]);
  assert.deepEqual(writerCodes(m, { ...doc.content, name: "x" + String.fromCharCode(0xd83d) }), ["lone-surrogate"]);
  assert.deepEqual(writerCodes(m, { ...doc.content, step_count: 3 }), []);
});

test("envelope rules", () => {
  const doc = load("revision-minimal");
  const m = meta(doc.envelope);
  const bad = (patch) => writerCodes({ ...m, ...patch }, doc.content);
  assert.deepEqual(bad({ recipe_id: m.recipe_id.toUpperCase() }), ["invalid-envelope"]);
  assert.deepEqual(bad({ revision_id: "0192f3a0-0000-7000-c000-000000000002" }), ["invalid-envelope"]); // wrong variant
  assert.deepEqual(bad({ created_at: "2026-10-13T12:00:00Z" }), ["invalid-envelope"]);
  assert.deepEqual(bad({ created_at: "2026-02-30T12:00:00.000Z" }), ["invalid-envelope"]);
  assert.deepEqual(bad({ origin: "sync" }), ["invalid-envelope"]);
  assert.deepEqual(bad({ schema_version: "1" }), ["invalid-envelope"]);
  const s = stored("revision-minimal");
  s.envelope.content_hash = s.envelope.content_hash.toUpperCase().replace("SHA256", "sha256");
  assert.deepEqual(codes(verifyRevision(s)), ["invalid-envelope"]);
  assert.equal(verifyRevision({ content: {} }).status, "invalid");
});

test("UUIDs: any RFC 9562 version, Nil and Max; never uppercase", () => {
  assert.ok(isUuid("0192f3a0-0000-7000-8000-000000000001"));
  assert.ok(isUuid("123e4567-e89b-42d3-a456-426614174000")); // v4
  assert.ok(isUuid("00000000-0000-0000-0000-000000000000"));
  assert.ok(isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff"));
  assert.ok(!isUuid("123E4567-E89B-42D3-A456-426614174000"));
  assert.ok(!isUuid("123e4567-e89b-92d3-a456-426614174000")); // version 9
});
