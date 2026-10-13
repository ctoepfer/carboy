import { canonicalBytes, type Json } from "./jcs.js";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function jcsSha256(value: Json): Promise<string> {
  return `sha256:${await sha256Hex(canonicalBytes(value))}`;
}
