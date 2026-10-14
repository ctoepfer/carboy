import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalBytes, type Json } from "./canonical.js";

// SHA-256 comes from @noble/hashes (audited, zero dependencies; owner
// decision 2026-10-13: never implemented here). The content hash is an
// integrity check, not authentication: anyone can recompute it.

export function sha256Hex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of sha256(bytes)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** `sha256:<hex>` of the RFC 8785 canonical bytes of `value`. */
export function canonicalSha256(value: Json): string {
  return `sha256:${sha256Hex(canonicalBytes(value))}`;
}
