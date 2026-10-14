// Published vectors in fixtures/canonical-hash/ were produced by an
// independent implementation (Trail of Bits rfc8785 + hashlib, see
// tools/canonical-hash/). Recipe Core must reproduce them byte for byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CanonicalError, canonicalBytes, canonicalize, canonicalSha256, contentHash } from "../dist/index.js";

const dir = new URL("../../../fixtures/canonical-hash/", import.meta.url);
const vectors = JSON.parse(readFileSync(new URL("vectors.json", dir), "utf8")).vectors;
const hex = (bytes) => Buffer.from(bytes).toString("hex");

test("vector file covers every case", () => {
  assert.ok(vectors.length >= 7);
  for (const k of ["jcs", "revision"]) assert.ok(vectors.some((v) => v.kind === k), k);
});

for (const v of vectors) {
  test(`vector ${v.name}: canonical bytes and SHA-256`, () => {
    const doc = JSON.parse(readFileSync(new URL(v.input, dir), "utf8"));
    const input = v.kind === "revision" ? hashInput(doc) : doc;
    assert.equal(hex(canonicalBytes(input)), v.canonical_utf8_hex);
    assert.equal(canonicalSha256(input), v.sha256);
    if (v.kind === "revision") assert.equal(contentHash(doc.envelope, doc.content), v.sha256);
  });
}

test("RFC 8785 sample: canonical text from the RFC", () => {
  const doc = JSON.parse(readFileSync(new URL("cases/rfc8785-sample.input.json", dir), "utf8"));
  const expected = readFileSync(new URL("cases/rfc8785-sample.canonical.txt", dir), "utf8").replace(/\n$/, "");
  assert.equal(canonicalize(doc), expected);
});

test("not I-JSON: refused with a code", () => {
  const code = (v) => {
    try {
      canonicalize(v);
    } catch (e) {
      assert.ok(e instanceof CanonicalError);
      return e.code;
    }
    return "accepted";
  };
  assert.equal(code({ a: NaN }), "non-finite-number");
  assert.equal(code([Infinity]), "non-finite-number");
  assert.equal(code({ a: String.fromCharCode(0xd800) }), "lone-surrogate");
  assert.equal(code({ [String.fromCharCode(0xdc00)]: 1 }), "lone-surrogate");
  assert.equal(code({ a: undefined }), "unsupported-value");
  assert.equal(code({ d: new Date(0) }), "unsupported-value");
});

test("-0 serializes as 0 (RFC 8785 §3.2.2.3)", () => {
  assert.equal(canonicalize([-0]), "[0]");
});

function hashInput(doc) {
  const { content_hash: _h, ...envelope } = doc.envelope;
  return { envelope, content: doc.content };
}
