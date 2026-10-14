// RFC 8785 JSON Canonicalization Scheme (JCS), RECIPE_SCHEMA §3.
//
// - Primitives serialize exactly as ECMAScript JSON.stringify (RFC 8785
//   §3.2.2): JSON.stringify is the reference serializer the RFC builds on.
// - Object members sort by UTF-16 code units (§3.2.3), which is JavaScript's
//   default string comparison.
// - Input must be I-JSON (RFC 7493): finite numbers, no lone surrogates.
//   Duplicate member names cannot occur in a JavaScript object.
//
// Schema rules on top of JCS (no null, decimal strings, NFC) live in
// revision.ts; this module is the generic serializer.

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export class CanonicalError extends Error {
  constructor(
    readonly code: "non-finite-number" | "lone-surrogate" | "unsupported-value",
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "CanonicalError";
  }
}

/** Canonical JSON text (RFC 8785). Throws CanonicalError on non-I-JSON input. */
export function canonicalize(value: Json): string {
  return serialize(value, "");
}

/** Canonical JSON as UTF-8 bytes: the exact input to the content hash. */
export function canonicalBytes(value: Json): Uint8Array {
  return utf8(canonicalize(value));
}

function serialize(value: Json, path: string): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CanonicalError("non-finite-number", path, `${path || "/"}: NaN and Infinity are not JSON`);
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    checkSurrogates(value, path);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${(value as readonly Json[]).map((v, i) => serialize(v, `${path}/${i}`)).join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const obj = value as { readonly [key: string]: Json };
    const keys = Object.keys(obj).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const members = keys.map((k) => {
      const p = `${path}/${pointerToken(k)}`;
      checkSurrogates(k, p);
      return `${JSON.stringify(k)}:${serialize(obj[k] as Json, p)}`;
    });
    return `{${members.join(",")}}`;
  }
  throw new CanonicalError("unsupported-value", path, `${path || "/"}: not a JSON value`);
}

/** Throws CanonicalError("lone-surrogate") unless `s` is well-formed UTF-16. */
export function checkSurrogates(s: string, path: string): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      throw new CanonicalError("lone-surrogate", path, `${path || "/"}: lone surrogate in string`);
    }
    if (c >= 0xdc00 && c <= 0xdfff) throw new CanonicalError("lone-surrogate", path, `${path || "/"}: lone surrogate in string`);
  }
}

/** JSON Pointer token escaping (RFC 6901). */
export function pointerToken(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}

// UTF-8 encoding of a string already checked for lone surrogates. Written
// out so Recipe Core needs no host API (TextEncoder is not in ES2022).
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}
