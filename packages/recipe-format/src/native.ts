import { duplicateMembers } from "./duplicates.js";
import { FORMAT, SCHEMA_VERSION, canonicalize, checkSchemaVersion, validateContent, verifyRevision, type Content, type Envelope, type Json, type Revision } from "@carboy/recipe-core";

// The native file format (RECIPE_SCHEMA §1–§4, §9): one revision document,
// written as RFC 8785 canonical JSON so the same revision always has the same
// bytes. The content hash covers envelope (without content_hash) and content;
// `derived` is stored for convenience, never trusted on open.

/** The schema version this build writes and reads fully. */
export const SUPPORTED_SCHEMA = SCHEMA_VERSION;

export interface NativeIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ReadResult =
  | {
      readonly status: "editable";
      readonly revision: Revision;
      /** Stored calculated data as found in the file. Recompute it; never trust it. */
      readonly storedDerived?: { readonly [key: string]: Json };
      readonly derivedTrusted: false;
      readonly issues: readonly [];
    }
  | {
      readonly status: "read-only";
      readonly reason: "hash-mismatch" | "newer-minor" | "invalid-content";
      readonly revision: Revision;
      readonly storedDerived?: { readonly [key: string]: Json };
      readonly derivedTrusted: false;
      readonly issues: readonly NativeIssue[];
    }
  | {
      readonly status: "rejected";
      readonly reason: "not-json" | "not-a-revision" | "newer-major" | "invalid";
      readonly issues: readonly NativeIssue[];
    };

/** Canonical JSON of the revision document, with a final newline. */
export function writeNative(rev: Revision & { readonly derived?: { readonly [key: string]: Json } | undefined }): string {
  const doc: { [key: string]: Json } = { envelope: rev.envelope as unknown as Json, content: rev.content };
  if (rev.derived !== undefined) doc["derived"] = rev.derived;
  return `${canonicalize(doc)}\n`;
}

/**
 * Open a native file. Never repairs: a hash mismatch, a newer MINOR schema,
 * or invalid content opens read-only with its issues; a newer MAJOR schema,
 * broken envelope rules, or something that isn't a revision is rejected.
 */
export function readNative(text: string): ReadResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { status: "rejected", reason: "not-json", issues: [{ code: "not-json", path: "", message: "the file is not valid JSON" }] };
  }
  if (!isObject(doc) || !isObject(doc["envelope"]) || doc["envelope"]["format"] !== FORMAT || !isObject(doc["content"])) {
    return { status: "rejected", reason: "not-a-revision", issues: [{ code: "not-a-revision", path: "", message: `not a ${FORMAT} document` }] };
  }
  const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(doc["envelope"]["schema_version"]));
  if (version && Number(version[1]) > SUPPORTED_SCHEMA.major) {
    return {
      status: "rejected",
      reason: "newer-major",
      issues: [{ code: "newer-major", path: "/envelope/schema_version", message: `schema ${version[0]} is newer than this version reads (${SUPPORTED_SCHEMA.major}.x)` }],
    };
  }

  const duplicates = duplicateMembers(text);
  if (duplicates.length > 0) {
    return {
      status: "rejected",
      reason: "invalid",
      issues: duplicates.map((path) => ({ code: "duplicate-member", path, message: "member name appears more than once in one object (not I-JSON); readers could disagree on its value" })),
    };
  }

  const verified = verifyRevision(doc);
  if (verified.status === "invalid") return { status: "rejected", reason: "invalid", issues: verified.issues };

  const revision: Revision = { envelope: doc["envelope"] as unknown as Envelope, content: doc["content"] as Content };
  const storedDerived = isObject(doc["derived"]) ? (doc["derived"] as { [key: string]: Json }) : undefined;
  const base = { revision, ...(storedDerived ? { storedDerived } : {}), derivedTrusted: false as const };

  if (verified.status === "hash-mismatch") return { status: "read-only", reason: "hash-mismatch", ...base, issues: verified.issues };
  if (version && Number(version[1]) === SUPPORTED_SCHEMA.major && Number(version[2]) > SUPPORTED_SCHEMA.minor) {
    return {
      status: "read-only",
      reason: "newer-minor",
      ...base,
      issues: [{ code: "newer-minor", path: "/envelope/schema_version", message: `schema ${version[0]} has members this version doesn't know; opened read-only` }],
    };
  }
  // A member newer than the declared version means the writer stamped it wrongly.
  const versionIssues = checkSchemaVersion(revision.content, revision.envelope.schema_version).filter((i) => i.code === "member-newer-than-schema");
  const contentIssues = [...validateContent(revision.content), ...versionIssues];
  if (contentIssues.length > 0) return { status: "read-only", reason: "invalid-content", ...base, issues: contentIssues };
  return { status: "editable", ...base, issues: [] };
}

function isObject(v: unknown): v is { [key: string]: unknown } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
