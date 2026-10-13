import { jcsSha256 } from "./hash.js";
import type { Json } from "./jcs.js";

// Revision envelope and native file round trip (RECIPE_SCHEMA §1–§4), spike
// subset: no JSON Schema validation of `content`.

export const FORMAT = "recipe-revision";
export const SUPPORTED_SCHEMA = { major: 0, minor: 1 } as const;

export interface Envelope {
  format: typeof FORMAT;
  schema_version: string;
  recipe_id: string;
  revision_id: string;
  parents: string[];
  created_at: string;
  origin: "user_edit" | "import" | "ai_proposal_accepted" | "ai_created" | "merge" | "migration";
  content_hash: string;
}

export interface Revision {
  envelope: Envelope;
  content: { [key: string]: Json };
  derived?: { [key: string]: Json };
}

/** Writer rules for hashed parts (§3 rules 1, 2, 5). Returns JSON Pointers of violations. */
export function hashedPartViolations(value: Json, path = ""): string[] {
  if (value === null) return [`${path}: null is not allowed (unknown is absent)`];
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? [] : [`${path}: non-integer number; use a decimal string`];
  }
  if (typeof value === "string") {
    return value === value.normalize("NFC") ? [] : [`${path}: string is not NFC-normalized`];
  }
  if (typeof value === "boolean") return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => hashedPartViolations(v, `${path}/${i}`));
  return Object.entries(value).flatMap(([k, v]) =>
    hashedPartViolations(v, `${path}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`),
  );
}

function hashInput(envelope: Omit<Envelope, "content_hash">, content: Revision["content"]): Json {
  return { envelope: { ...envelope } as unknown as Json, content };
}

export async function createRevision(
  envelope: Omit<Envelope, "content_hash" | "format">,
  content: Revision["content"],
): Promise<Revision> {
  // Copy only envelope members, so a stale content_hash or an unknown member
  // can never enter the hash input.
  const env: Omit<Envelope, "content_hash"> = {
    format: FORMAT,
    schema_version: envelope.schema_version,
    recipe_id: envelope.recipe_id,
    revision_id: envelope.revision_id,
    parents: [...envelope.parents].sort(),
    created_at: envelope.created_at,
    origin: envelope.origin,
  };
  const violations = hashedPartViolations(hashInput(env, content));
  if (violations.length > 0) throw new Error(`invalid revision: ${violations.join("; ")}`);
  return { envelope: { ...env, content_hash: await jcsSha256(hashInput(env, content)) }, content };
}

export function exportNative(rev: Revision): string {
  // Formatting is free: the hash is over canonical bytes, not file bytes.
  return `${JSON.stringify(rev, null, 2)}\n`;
}

export type ImportResult =
  | { status: "editable"; revision: Revision }
  | { status: "read-only"; reason: "hash-mismatch" | "newer-minor"; revision: Revision }
  | { status: "rejected"; reason: "not-a-revision" | "newer-major" | "invalid" };

export async function importNative(text: string): Promise<ImportResult> {
  let doc: Revision;
  try {
    doc = JSON.parse(text) as Revision;
  } catch {
    return { status: "rejected", reason: "invalid" };
  }
  const env = doc?.envelope;
  if (!env || env.format !== FORMAT || typeof env.content_hash !== "string") {
    return { status: "rejected", reason: "not-a-revision" };
  }
  const m = /^(\d+)\.(\d+)$/.exec(env.schema_version ?? "");
  if (!m) return { status: "rejected", reason: "invalid" };
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > SUPPORTED_SCHEMA.major) return { status: "rejected", reason: "newer-major" };
  const { content_hash, ...rest } = env;
  const actual = await jcsSha256(hashInput(rest, doc.content));
  if (actual !== content_hash) return { status: "read-only", reason: "hash-mismatch", revision: doc };
  if (major === SUPPORTED_SCHEMA.major && minor > SUPPORTED_SCHEMA.minor) {
    return { status: "read-only", reason: "newer-minor", revision: doc };
  }
  return { status: "editable", revision: doc };
}
