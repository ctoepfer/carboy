// RFC 8785 JSON Canonicalization Scheme.
// Primitive serialization is exactly ECMAScript JSON.stringify (RFC 8785
// §3.2.2); property names sort by UTF-16 code units (§3.2.3), which is the
// default ordering of JavaScript string comparison.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalize(value: Json): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JCS: NaN and Infinity are not allowed");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k] as Json)}`).join(",")}}`;
}

export function canonicalBytes(value: Json): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
