import { CanonicalError, checkSurrogates, pointerToken, type Json } from "./canonical.js";
import { canonicalSha256 } from "./hash.js";
import { validateQuantity } from "./quantity.js";

// Revision envelope and content hash (RECIPE_SCHEMA §2–§3).
//
// Hash input: the canonical JSON of { envelope: <envelope without
// content_hash>, content }. `derived` and every sidecar are outside it.
// Writers (createRevision) normalize what the rules allow them to: parents
// sorted, strings NFC. Readers (verifyRevision) never repair: they report.

export const FORMAT = "recipe-revision";

export const ORIGINS = ["user_edit", "import", "ai_proposal_accepted", "ai_created", "merge", "migration"] as const;
export type Origin = (typeof ORIGINS)[number];

export interface Envelope {
  readonly format: typeof FORMAT;
  readonly schema_version: string;
  readonly recipe_id: string;
  readonly revision_id: string;
  readonly parents: readonly string[];
  readonly created_at: string;
  readonly origin: Origin;
  readonly content_hash: string;
}

export type Content = { readonly [key: string]: Json };

export interface Revision {
  readonly envelope: Envelope;
  readonly content: Content;
  /** Calculated statistics and other derived data; never hashed (§3). */
  readonly derived?: { readonly [key: string]: Json };
}

export type RevisionIssueCode =
  | "invalid-envelope"
  | "parents-not-sorted"
  | "duplicate-parent"
  | "null-value"
  | "non-integer-number"
  | "string-not-nfc"
  | "duplicate-key-after-nfc"
  | "lone-surrogate"
  | "non-finite-number"
  | "unsupported-value"
  | "invalid-decimal"
  | "non-normalized-decimal"
  | "unknown-unit"
  | "negative-quantity"
  | "hash-mismatch";

export interface RevisionIssue {
  readonly code: RevisionIssueCode;
  /** JSON Pointer into the revision document. */
  readonly path: string;
  readonly message: string;
}

export class RevisionError extends Error {
  constructor(readonly issues: readonly RevisionIssue[]) {
    super(issues.map((i) => `${i.code} at ${i.path || "/"}: ${i.message}`).join("; "));
    this.name = "RevisionError";
  }
}

export interface NewRevision {
  readonly schema_version: string;
  readonly recipe_id: string;
  readonly revision_id: string;
  readonly parents: readonly string[];
  readonly created_at: string;
  readonly origin: Origin;
}

/**
 * Writer: build a revision with its content hash. Sorts `parents`,
 * NFC-normalizes every string (keys included), then checks the document
 * rules. Throws RevisionError listing every violation.
 */
export function createRevision(meta: NewRevision, content: Content): Revision {
  const envelope = {
    format: FORMAT as typeof FORMAT,
    schema_version: meta.schema_version,
    recipe_id: meta.recipe_id,
    revision_id: meta.revision_id,
    parents: [...meta.parents].sort(byteOrder),
    created_at: meta.created_at,
    origin: meta.origin,
  };
  const collisions: RevisionIssue[] = [];
  const normalizedContent = nfcDeep(content, "/content", collisions) as Content;
  const issues = [...collisions, ...envelopeIssues(envelope), ...hashedPartIssues(normalizedContent, "/content")];
  if (issues.length > 0) throw new RevisionError(issues);
  return {
    envelope: { ...envelope, content_hash: contentHash(envelope, normalizedContent) },
    content: normalizedContent,
  };
}

export type VerifyResult =
  | { readonly status: "valid"; readonly issues: readonly [] }
  | { readonly status: "hash-mismatch" | "invalid"; readonly issues: readonly RevisionIssue[] };

/**
 * Reader: check a revision document against the envelope and hashing rules
 * and recompute its hash. Never repairs. "hash-mismatch" means the document
 * was altered or written incorrectly; the caller opens it read-only (§3).
 */
export function verifyRevision(doc: unknown): VerifyResult {
  if (!isObject(doc) || !isObject(doc["envelope"]) || !isObject(doc["content"])) {
    return { status: "invalid", issues: [issue("invalid-envelope", "", "not a revision document: needs envelope and content objects")] };
  }
  const envelope = doc["envelope"];
  const content = doc["content"] as Content;
  const issues = [...envelopeIssues(envelope), ...hashedPartIssues(content, "/content")];
  const { content_hash: stated, ...unhashed } = envelope;
  if (typeof stated !== "string" || !/^sha256:[0-9a-f]{64}$/.test(stated)) {
    issues.push(issue("invalid-envelope", "/envelope/content_hash", 'content_hash must be "sha256:" and 64 lowercase hex digits'));
  }
  if (issues.length > 0) return { status: "invalid", issues };
  // Every envelope member except content_hash is hashed, including members
  // a newer MINOR version added, so they are protected too.
  const actual = contentHash(unhashed as { [key: string]: Json }, content);
  if (actual !== stated) {
    return { status: "hash-mismatch", issues: [issue("hash-mismatch", "/envelope/content_hash", `stated ${String(stated)}, computed ${actual}`)] };
  }
  return { status: "valid", issues: [] };
}

/** The content hash of an envelope (content_hash excluded) and content. */
export function contentHash(envelope: { readonly [key: string]: Json }, content: Content): string {
  const { content_hash: _ignored, ...rest } = envelope;
  return canonicalSha256({ envelope: rest, content });
}

// ---- rules -------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL = "00000000-0000-0000-0000-000000000000";
const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";

/** Any RFC 9562 UUID (lowercase, hyphenated): versions 1–8 with the RFC variant, Nil, or Max. */
export function isUuid(s: unknown): boolean {
  if (typeof s !== "string" || !UUID.test(s)) return false;
  if (s === NIL || s === MAX) return true;
  const version = s[14]!;
  const variant = s[19]!;
  return "12345678".includes(version) && "89ab".includes(variant);
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d{3}Z$/;

function isTimestamp(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const m = TIMESTAMP.exec(s);
  if (!m) return false;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi, se));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && h < 24 && mi < 60 && se < 60;
}

function envelopeIssues(env: { readonly [key: string]: unknown }): RevisionIssue[] {
  const out: RevisionIssue[] = [];
  const bad = (member: string, message: string) => out.push(issue("invalid-envelope", `/envelope/${member}`, message));
  if (env["format"] !== FORMAT) bad("format", `format must be "${FORMAT}"`);
  if (typeof env["schema_version"] !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(env["schema_version"])) {
    bad("schema_version", 'schema_version must be "MAJOR.MINOR"');
  }
  for (const m of ["recipe_id", "revision_id"]) if (!isUuid(env[m])) bad(m, `${m} must be a lowercase RFC 9562 UUID`);
  const parents = env["parents"];
  if (!Array.isArray(parents) || !parents.every(isUuid)) {
    bad("parents", "parents must be an array of lowercase RFC 9562 UUIDs");
  } else {
    const p = parents as string[];
    if (new Set(p).size !== p.length) out.push(issue("duplicate-parent", "/envelope/parents", "a parent is listed twice"));
    if (p.some((x, i) => i > 0 && byteOrder(p[i - 1]!, x) > 0)) {
      out.push(issue("parents-not-sorted", "/envelope/parents", "parents must be sorted ascending (byte order)"));
    }
  }
  if (!isTimestamp(env["created_at"])) bad("created_at", "created_at must be RFC 3339 UTC with milliseconds, e.g. 2026-10-13T12:00:00.000Z");
  if (!(ORIGINS as readonly unknown[]).includes(env["origin"])) bad("origin", `origin must be one of ${ORIGINS.join(", ")}`);
  out.push(...hashedPartIssues(stripHash(env) as Json, "/envelope"));
  return out;
}

/** Rules for hashed parts (§3 rules 1, 2, 5) plus quantity rules (§5). */
function hashedPartIssues(value: Json, path: string): RevisionIssue[] {
  if (value === null) return [issue("null-value", path, "null is not allowed; omit unknown members")];
  if (typeof value === "boolean") return [];
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? [] : [issue("non-integer-number", path, "numbers must be integers below 2^53; write decimals as strings")];
  }
  if (typeof value === "string") return stringIssues(value, path);
  if (Array.isArray(value)) return (value as readonly Json[]).flatMap((v, i) => hashedPartIssues(v, `${path}/${i}`));
  if (!isObject(value)) return [issue("unsupported-value", path, "not a JSON value")];
  const obj = value as { readonly [key: string]: Json };
  const out: RevisionIssue[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = `${path}/${pointerToken(k)}`;
    out.push(...stringIssues(k, p), ...hashedPartIssues(v, p));
  }
  // A quantity is an object with string `value` and `unit` (§5).
  if (typeof obj["value"] === "string" && typeof obj["unit"] === "string") {
    for (const q of validateQuantity({ value: obj["value"], unit: obj["unit"] })) out.push(issue(q.code, path, q.message));
  }
  return out;
}

function stringIssues(s: string, path: string): RevisionIssue[] {
  try {
    // Throws on lone surrogates before normalize() would hide them.
    checkSurrogates(s, path);
  } catch (e) {
    if (e instanceof CanonicalError) return [issue(e.code, path, e.message)];
    throw e;
  }
  return s === s.normalize("NFC") ? [] : [issue("string-not-nfc", path, "string is not NFC-normalized")];
}

// ---- helpers -----------------------------------------------------------

function issue(code: RevisionIssueCode, path: string, message: string): RevisionIssue {
  return { code, path, message };
}

function isObject(v: unknown): v is { [key: string]: unknown } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stripHash(env: { readonly [key: string]: unknown }): { [key: string]: unknown } {
  const { content_hash: _ignored, ...rest } = env;
  return rest;
}

// UUID strings are ASCII, so UTF-16 comparison is byte order.
function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// NFC-normalize every string. Two keys that differ only in normalization
// would collide; that is reported, never resolved by dropping one.
function nfcDeep(v: Json, path: string, collisions: RevisionIssue[]): Json {
  if (typeof v === "string") return safeNfc(v);
  if (Array.isArray(v)) return (v as readonly Json[]).map((x, i) => nfcDeep(x, `${path}/${i}`, collisions));
  if (isObject(v)) {
    const out: { [key: string]: Json } = {};
    for (const [k, x] of Object.entries(v)) {
      const nk = safeNfc(k);
      const p = `${path}/${pointerToken(nk)}`;
      if (Object.prototype.hasOwnProperty.call(out, nk)) {
        collisions.push(issue("duplicate-key-after-nfc", p, "two keys are equal after NFC normalization"));
        continue;
      }
      out[nk] = nfcDeep(x as Json, p, collisions);
    }
    return out;
  }
  return v;
}

// Leave strings with lone surrogates as they are so the rule check reports
// them instead of normalize() masking them.
function safeNfc(s: string): string {
  try {
    checkSurrogates(s, "");
    return s.normalize("NFC");
  } catch {
    return s;
  }
}
